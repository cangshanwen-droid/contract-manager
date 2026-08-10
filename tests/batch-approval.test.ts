/**
 * 批量操作（合同）单测
 * 覆盖 contract.handler 的 CONTRACT_BATCH_APPROVE IPC：
 *  - 批量 submit / approve / delete 主链路
 *  - 逐条成功/失败明细（单条非法状态不影响其他条）
 *  - 权限校验（无 contract.approve / contract.edit 时拒绝）
 *  - 事务保护：失败条目回滚，成功条目保留
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { setupTestDb } from './helpers/setup'
import { getDatabase } from '../src/main/database/connection'
import { ContractRepository } from '../src/main/database/repositories/contract.repo'
import { setSessionUser } from '../src/main/session'
import { registerContractHandlers } from '../src/main/ipc/contract.handler'
import { IPC_CHANNELS } from '../src/shared/constants'

type BatchHandler = (
  _e: unknown,
  ids: number[],
  action: 'submit' | 'approve' | 'delete',
  operator?: string,
  operatorRole?: string
) => Promise<unknown> | unknown

let repo: ContractRepository
let batchHandler: BatchHandler | null

/** 建一张最小可用合同 */
function createContract(name = '批量测试合同'): ReturnType<ContractRepository['create']> {
  return repo.create({
    contract_name: name,
    contract_type_id: 1,
    party_a: '甲方',
    party_b_name: '乙方',
    region_id: 1,
    created_by: 'operator',
    items: [{ item_name: '路灯', quantity: 10, unit_price: 2000 }]
  })
}

/** 从 ipcMain.handle mock 中取出指定通道的 handler */
function captureHandler(channel: string): BatchHandler | null {
  const handleMock = ipcMain.handle as unknown as ReturnType<typeof vi.fn>
  const call = handleMock.mock.calls.find((c) => c[0] === channel)
  return call ? (call[1] as BatchHandler) : null
}

beforeEach(async () => {
  await setupTestDb()
  const db = getDatabase()
  db.run("INSERT INTO contract_types (id, name) VALUES (1, '工程类')")
  db.run("INSERT INTO regions (id, name) VALUES (1, 'A区')")
  // 建一个 admin 用户（migration 已用 INSERT OR IGNORE 播种过 admin，此处幂等）
  db.run("INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'x', 'admin')")
  repo = new ContractRepository()
  ;(ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockClear()
  registerContractHandlers()
  batchHandler = captureHandler(IPC_CHANNELS.CONTRACT_BATCH_APPROVE)
})

describe('CONTRACT_BATCH_APPROVE 批量操作', () => {
  it('批量 submit：草稿合同全部进入待审批', async () => {
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: ['contract.approve', 'contract.edit'] })
    const c1 = createContract('合同A')
    const c2 = createContract('合同B')
    const res = (await batchHandler!({}, [c1.id, c2.id], 'submit', 'admin', 'admin')) as any
    expect(res.success).toBe(true)
    expect(res.summary).toEqual({ total: 2, ok: 2, failed: 0 })
    expect(res.results.every((r: any) => r.success)).toBe(true)
    expect(repo.getById(c1.id)!.approval_status).toBe('pending')
    expect(repo.getById(c2.id)!.approval_status).toBe('pending')
  })

  it('批量 approve：待审批合同全部通过', async () => {
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: ['contract.approve', 'contract.edit'] })
    const c1 = createContract('合同A')
    const c2 = createContract('合同B')
    repo.transitionApproval(c1.id, 'submit', 'operator')
    repo.transitionApproval(c2.id, 'submit', 'operator')
    const res = (await batchHandler!({}, [c1.id, c2.id], 'approve', 'admin', 'admin')) as any
    expect(res.summary).toEqual({ total: 2, ok: 2, failed: 0 })
    expect(repo.getById(c1.id)!.approval_status).toBe('approved')
    expect(repo.getById(c2.id)!.approval_status).toBe('approved')
  })

  it('批量 delete：合同与明细一并删除', async () => {
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: ['contract.approve', 'contract.edit'] })
    const c1 = createContract('合同A')
    const c2 = createContract('合同B')
    const res = (await batchHandler!({}, [c1.id, c2.id], 'delete', 'admin', 'admin')) as any
    expect(res.summary).toEqual({ total: 2, ok: 2, failed: 0 })
    expect(repo.getById(c1.id)).toBeUndefined()
    expect(repo.getById(c2.id)).toBeUndefined()
    const db = getDatabase()
    const items = db.exec('SELECT COUNT(*) AS cnt FROM contract_items')[0].values[0][0] as number
    expect(items).toBe(0)
  })

  it('逐条明细：草稿不可批量批准（失败），待审批可批准（成功）', async () => {
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: ['contract.approve', 'contract.edit'] })
    const draftC = createContract('草稿合同') // approval_status = none
    const pendingC = createContract('待审合同')
    repo.transitionApproval(pendingC.id, 'submit', 'operator')
    const res = (await batchHandler!({}, [draftC.id, pendingC.id], 'approve', 'admin', 'admin')) as any
    expect(res.summary).toEqual({ total: 2, ok: 1, failed: 1 })
    const draftRes = res.results.find((r: any) => r.id === draftC.id)
    const pendingRes = res.results.find((r: any) => r.id === pendingC.id)
    expect(draftRes.success).toBe(false)
    expect(draftRes.message).toContain('仅待审批的合同可批准')
    expect(pendingRes.success).toBe(true)
    // 失败条目已回滚（仍是 none），成功条目生效（approved）
    expect(repo.getById(draftC.id)!.approval_status).toBe('none')
    expect(repo.getById(pendingC.id)!.approval_status).toBe('approved')
  })

  it('空选择 / 非法操作类型 / 不存在的合同', async () => {
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: ['contract.approve', 'contract.edit'] })
    const empty = (await batchHandler!({}, [], 'submit', 'admin', 'admin')) as any
    expect(empty.success).toBe(false)
    expect(empty.message).toContain('未选择')
    const bad = (await batchHandler!({}, [1], 'destroy' as any, 'admin', 'admin')) as any
    expect(bad.success).toBe(false)
    const missing = (await batchHandler!({}, [99999], 'submit', 'admin', 'admin')) as any
    expect(missing.summary.failed).toBe(1)
    expect(missing.results[0].message).toContain('合同不存在')
  })

  it('权限校验：无 contract.approve 时批量审批被拒（rep 角色）', async () => {
    setSessionUser({ id: 1, username: 'rep', role: 'rep', permissions: ['contract.view'] })
    const c1 = createContract('合同A')
    const res = (await batchHandler!({}, [c1.id], 'submit', 'rep', 'rep')) as any
    expect(res.success).toBe(false)
    expect(res.code).toBe('FORBIDDEN')
    expect(repo.getById(c1.id)!.approval_status).toBe('none')
  })

  it('权限校验：无 contract.edit 时批量删除被拒', async () => {
    setSessionUser({ id: 1, username: 'rep', role: 'rep', permissions: ['contract.view'] })
    const c1 = createContract('合同A')
    const res = (await batchHandler!({}, [c1.id], 'delete', 'rep', 'rep')) as any
    expect(res.success).toBe(false)
    expect(res.code).toBe('FORBIDDEN')
    expect(repo.getById(c1.id)).toBeDefined()
  })

  it('审计日志：批量操作逐条留痕（action = submit/approve/delete）', async () => {
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: ['contract.approve', 'contract.edit'] })
    const c1 = createContract('合同A')
    const db = getDatabase()
    await batchHandler!({}, [c1.id], 'submit', 'admin', 'admin')
    const submitLogs = db.exec(
      "SELECT action FROM audit_logs WHERE target = 'contract' AND action = 'submit' AND target_id = " + c1.id
    )
    expect(submitLogs[0].values.length).toBe(1)
  })
})
