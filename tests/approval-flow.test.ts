/**
 * 审批流状态机单测
 * 覆盖 contract.repo.transitionApproval 的完整状态流转（单级审批）：
 *   none --submit--> pending --approve--> approved
 *   pending --reject--> rejected --submit--> pending（重新审批）
 * 以及非法流转抛错、update() 白名单防伪造审批字段。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb } from './helpers/setup'
import { getDatabase } from '../src/main/database/connection'
import { ContractRepository } from '../src/main/database/repositories/contract.repo'

let repo: ContractRepository

/** 建一张最小可用合同（新合同固定 status=draft / approval_status=none） */
function createContract(name = '测试合同'): ReturnType<ContractRepository['create']> {
  return repo.create({
    contract_name: name,
    contract_type_id: 1,
    party_a: '甲方',
    party_b_name: '乙方',
    region_id: 1,
    created_by: 'operator',
    items: [
      { item_name: '路灯', quantity: 10, unit_price: 2000 }
    ]
  })
}

beforeEach(async () => {
  await setupTestDb()
  const db = getDatabase()
  db.run("INSERT INTO contract_types (id, name) VALUES (1, '工程类')")
  db.run("INSERT INTO regions (id, name) VALUES (1, 'A区')")
  repo = new ContractRepository()
})

describe('审批状态机（单级）', () => {
  it('新建合同默认 draft/none，不经过审批不能进入执行', () => {
    const c = createContract()
    expect(c.status).toBe('draft')
    expect(c.approval_status).toBe('none')
    expect(c.approved_by).toBe('')
    expect(c.approved_at).toBeNull()
  })

  it('submit：进入待审批，不盖审批时间戳', () => {
    const c = createContract()
    const p = repo.transitionApproval(c.id, 'submit', 'operator')!

    expect(p.approval_status).toBe('pending')
    expect(p.approved_at).toBeNull() // 提交阶段不盖审批时间戳
  })

  it('审批主链路：pending → approved，记录审批人与时间', () => {
    const c = createContract()
    repo.transitionApproval(c.id, 'submit', 'operator')

    const done = repo.transitionApproval(c.id, 'approve', '部门经理')!
    expect(done.approval_status).toBe('approved')
    expect(done.approved_by).toBe('部门经理')
    expect(done.approved_at).not.toBeNull()
  })

  it('驳回回退：pending → rejected → 重新 submit 可再次审批', () => {
    const c = createContract()
    repo.transitionApproval(c.id, 'submit', 'operator')

    const rejected = repo.transitionApproval(c.id, 'reject', '法务')!
    expect(rejected.approval_status).toBe('rejected')

    // 重新提交 → 回到待审批
    const again = repo.transitionApproval(c.id, 'submit', 'operator')!
    expect(again.approval_status).toBe('pending')
    expect(again.approved_at).toBeNull()
  })

  it('已审批(approved)不可重复 approve，也不可再次 submit', () => {
    const c = createContract()
    repo.transitionApproval(c.id, 'submit', 'operator')
    repo.transitionApproval(c.id, 'approve', '部门经理')

    expect(() => repo.transitionApproval(c.id, 'approve', '财务')).toThrow('仅待审批的合同可批准')
    expect(() => repo.transitionApproval(c.id, 'submit', 'operator')).toThrow('仅草稿或已驳回的合同可提交审批')
  })

  it('草稿(none)不可直接 approve/reject，必须先 submit', () => {
    const c = createContract()
    expect(() => repo.transitionApproval(c.id, 'approve', 'admin')).toThrow('仅待审批的合同可批准')
    expect(() => repo.transitionApproval(c.id, 'reject', 'admin')).toThrow('仅待审批的合同可驳回')
  })

  it('pending 不可重复 submit', () => {
    const c = createContract()
    repo.transitionApproval(c.id, 'submit', 'operator')
    expect(() => repo.transitionApproval(c.id, 'submit', 'operator')).toThrow('仅草稿或已驳回的合同可提交审批')
  })

  it('非法审批操作抛"未知的审批操作"', () => {
    const c = createContract()
    expect(() => (repo as unknown as { transitionApproval(id: number, a: string, o: string): unknown })
      .transitionApproval(c.id, 'destroy', 'admin')).toThrow('未知的审批操作')
  })

  it('不存在的合同返回 undefined（不抛错）', () => {
    expect(repo.transitionApproval(99999, 'submit', 'operator')).toBeUndefined()
  })
})

describe('update() 白名单（P0-2 防伪造审批字段）', () => {
  it('update 透传 approval_status/approved_by 会被静默丢弃', () => {
    const c = createContract()
    repo.update(c.id, {
      contract_name: '改名',
      // 恶意/误传的审批字段--必须被白名单拦截
      approval_status: 'approved',
      approved_by: 'hacker'
    } as never)
    const after = repo.getById(c.id)!
    expect(after.contract_name).toBe('改名')
    expect(after.approval_status).toBe('none')
    expect(after.approved_by).toBe('')
    expect(after.approved_at).toBeNull()
  })

  it('update 合法业务字段正常生效（notes/total_cost）', () => {
    const c = createContract()
    repo.update(c.id, { notes: '补充说明', total_cost: 999 })
    const after = repo.getById(c.id)!
    expect(after.notes).toBe('补充说明')
    expect(after.total_cost).toBe(999)
  })
})
