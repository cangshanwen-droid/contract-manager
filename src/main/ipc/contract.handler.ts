import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { ContractRepository } from '../database/repositories/contract.repo'
import { notificationRepo } from '../database/repositories/notification.repo'
import { getDatabase } from '../database/connection'
import { queryOne, queryAll } from '../database/helpers'
import { insertAuditLog } from '../database/repositories/audit.repo'
import { requirePermission } from '../session'

export function registerContractHandlers(): void {
  const repo = new ContractRepository()

  // ── 合同版本历史：字段快照 + 变更留痕 ──
  // 快照包含的合同字段（含联表展示名，便于前端直接渲染历史版本）
  const VERSION_SNAPSHOT_FIELDS = [
    'contract_no', 'contract_name', 'contract_type_id', 'contract_type_name',
    'party_a', 'party_b_id', 'party_b_name', 'company_name',
    'region_id', 'region_name', 'sign_date', 'status', 'notes',
    'total_cost', 'progress', 'expected_income'
  ]

  function buildSnapshot(contract: any): Record<string, unknown> {
    const snap: Record<string, unknown> = {}
    for (const f of VERSION_SNAPSHOT_FIELDS) {
      if (contract && contract[f] !== undefined) snap[f] = contract[f]
    }
    // 明细项一并快照（合同核心内容）
    if (contract?.items && Array.isArray(contract.items)) {
      snap.items = contract.items.map((it: any) => ({
        item_name: it.item_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        land_area: it.land_area,
        tax_rate: it.tax_rate,
        skill_level: it.skill_level,
        carbon_factor: it.carbon_factor,
        expected_income: it.expected_income,
        total_cost: it.total_cost
      }))
    }
    return snap
  }

  // 保存一个版本快照（version 自动 +1）
  function saveVersionSnapshot(contractId: number, contract: any, changedFields: string[], operator: string): void {
    const db = getDatabase()
    const row = queryOne(
      'SELECT COALESCE(MAX(version), 0) AS max_v FROM contract_versions WHERE contract_id = ?',
      [contractId]
    )
    const version = ((row?.max_v as number) ?? 0) + 1
    db.run(
      `INSERT INTO contract_versions (contract_id, version, snapshot, changed_fields, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [contractId, version, JSON.stringify(buildSnapshot(contract)), JSON.stringify(changedFields), operator || '']
    )
  }

  // 辅助函数：提取变更字段（过滤掉 updated_by 等元数据）
  function pickChanges(data: any): Record<string, unknown> {
    const changes: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && !k.startsWith('_') && k !== 'updated_by' && k !== 'created_by') {
        changes[k] = v
      }
    }
    return changes
  }

  // 计算本次提交实际变更的字段（对比旧值）
  function computeChangedFields(oldContract: any, data: any): string[] {
    const changed: string[] = []
    if (!oldContract) return changed
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || k.startsWith('_') || k === 'updated_by' || k === 'created_by') continue
      if (k === 'items') {
        // 明细整体替换视为一次变更（明细内容不进快照，仅记录变更标签）
        if (JSON.stringify(oldContract.items || []) !== JSON.stringify(v || [])) changed.push('items')
        continue
      }
      const oldV = oldContract[k]
      if (String(oldV ?? '') !== String(v ?? '')) changed.push(k)
    }
    return changed
  }

  // 合同金额变动 → 自动记录到对应区域的资金账户
  function syncContractCostToAccount(contractId: number, amount: number, description: string, operator: string): void {
    const db = getDatabase()
    // 找到合同所属区域的主账户
    const contract = queryOne(
      `SELECT c.region_id, c.contract_name, c.contract_no, r.name AS region_name
       FROM contracts c LEFT JOIN regions r ON r.id = c.region_id WHERE c.id = ?`,
      [contractId]
    ) as Record<string, unknown> | undefined
    if (!contract || !contract.region_id) return

    let account = queryOne(
      `SELECT id FROM region_accounts WHERE region_id = ? LIMIT 1`,
      [contract.region_id]
    ) as Record<string, unknown> | undefined

    // 区域无账户时自动创建主账户（避免静默跳过导致资金链路断裂）
    if (!account) {
      const regionName = (contract.region_name as string) || `区域${contract.region_id}`
      const accountName = `${regionName}主账户`
      db.run(
        `INSERT INTO region_accounts (name, region_id, balance, created_at, updated_at)
         VALUES (?, ?, 0, datetime('now','localtime'), datetime('now','localtime'))`,
        [accountName, contract.region_id]
      )
      account = queryOne(
        `SELECT id FROM region_accounts WHERE region_id = ? LIMIT 1`,
        [contract.region_id]
      ) as Record<string, unknown> | undefined
      console.warn(`[合同资金联动] 区域「${regionName}」无主账户，已自动创建「${accountName}」`)
    }
    if (!account) return

    const accountId = account.id as number
    const year = new Date().getFullYear()

    db.run(
      `INSERT INTO account_transactions (account_id, trans_type, category, amount, description, fiscal_year, operator, contract_id, source_type)
       VALUES (?, 'expense', '合同支出', ?, ?, ?, ?, ?, 'contract')`,
      [accountId, amount, description || `合同 ${contract.contract_name || contract.contract_no}: ${description}`, year, operator, contractId]
    )
    db.run(
      `UPDATE region_accounts SET balance = balance - ?, updated_at = datetime('now','localtime') WHERE id = ?`,
      [amount, accountId]
    )
    // 通知：合同支出入账 → 通知账户管理人员
    notificationRepo.notifyTransaction(accountId, 'expense', amount, `合同 ${contract.contract_name || contract.contract_no}：${description}`, '合同支出')
  }

  // 合同是否已审批通过
  function isContractApproved(contractId: number): boolean {
    const row = queryOne('SELECT approval_status FROM contracts WHERE id = ?', [contractId]) as { approval_status?: string } | undefined
    return row?.approval_status === 'approved'
  }

  // 该合同是否已登记过对应流水（幂等，防止重复入账）
  function hasContractTransaction(contractId: number, transType: string, category: string): boolean {
    const row = queryOne(
      `SELECT id FROM account_transactions WHERE contract_id = ? AND source_type = 'contract' AND trans_type = ? AND category = ? LIMIT 1`,
      [contractId, transType, category]
    )
    return !!row
  }

  ipcMain.handle(IPC_CHANNELS.CONTRACT_LIST, (_e, regionId?: number) => {
    try {
      const perm = requirePermission(PERMISSIONS.CONTRACT_VIEW)
      if (!perm.ok) return perm.response
      return repo.list(regionId)
    } catch (err: any) {
      console.error('CONTRACT_LIST failed:', err)
      return { success: false, message: `获取合同列表失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONTRACT_GET, (_e, id: number) => {
    try {
      const perm = requirePermission(PERMISSIONS.CONTRACT_VIEW)
      if (!perm.ok) return perm.response
      return repo.getById(id)
    } catch (err: any) {
      console.error('CONTRACT_GET failed:', err)
      return { success: false, message: `获取合同详情失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONTRACT_CREATE, (_e, data) => {
    try {
      const perm = requirePermission(PERMISSIONS.CONTRACT_CREATE, '没有新建合同的权限')
      if (!perm.ok) return perm.response
      const result = repo.create({ ...data as any, created_by: data.created_by || '' })

      // 版本历史 v1：保存创建时的初始快照（留痕起点）
      saveVersionSnapshot(result.id, result, ['创建合同'], (data as any).created_by || '')

      // 审计日志
      insertAuditLog({
        username: (data as any).created_by || 'system',
        role: (data as any)._operatorRole || 'user',
        action: 'create',
        target: 'contract',
        target_id: result.id,
        new_value: JSON.stringify({ contract_no: result.contract_no, contract_name: result.contract_name }),
        result: 'success'
      })

      // 新合同默认「草稿·未提交审批」，不进入资金流水；
      // 待审批通过并进入执行阶段后，由 CONTRACT_UPDATE 统一登记支出流水。
      return result
    } catch (err: any) {
      console.error('CONTRACT_CREATE failed:', err)
      return { success: false, message: `创建合同失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONTRACT_UPDATE, (_e, id: number, data) => {
    try {
      // 后端权限校验：编辑需要 contract.edit
      const perm = requirePermission(PERMISSIONS.CONTRACT_EDIT, '没有编辑合同的权限')
      if (!perm.ok) return perm.response
      // 状态流转（status 变更）视为审批操作：额外需要 contract.approve
      if (data?.status !== undefined) {
        const oldRow = queryOne('SELECT status FROM contracts WHERE id = ?', [id])
        if (oldRow && String(oldRow.status) !== String(data.status)) {
          const ap = requirePermission(PERMISSIONS.CONTRACT_APPROVE, '没有合同审批（状态流转）的权限')
          if (!ap.ok) return ap.response
        }
      }

      // 记录更新前旧值
      const oldContract = repo.getById(id)
      const oldSnapshot = oldContract ? JSON.stringify({
        contract_name: oldContract.contract_name,
        status: oldContract.status,
        party_a: oldContract.party_a,
        party_b_name: oldContract.party_b_name,
        notes: oldContract.notes
      }) : null

      // 状态机约束（先校验、后写库）：未审批通过的合同不可变更执行状态（草稿 → 执行中 等），
      // 防止未审批合同被直接改为 active 绕过审批并伪造资金流水
      if (data.status && oldContract && data.status !== oldContract.status && !isContractApproved(id)) {
        return { success: false, message: '合同未审批通过，无法变更执行状态' }
      }

      // 编辑留痕：先保存旧快照到 contract_versions，再执行更新
      if (oldContract) {
        saveVersionSnapshot(id, oldContract, computeChangedFields(oldContract, data), (data as any).updated_by || '')
      }

      const result = repo.update(id, { ...data as any, updated_by: data.updated_by || '' })
      if (!result) {
        return { success: false, message: '合同不存在' }
      }

      // 审计日志
      insertAuditLog({
        username: (data as any).updated_by || 'system',
        role: (data as any)._operatorRole || 'user',
        action: 'update',
        target: 'contract',
        target_id: id,
        old_value: oldSnapshot,
        new_value: JSON.stringify({
          contract_name: result.contract_name,
          status: result.status,
          ...pickChanges(data)
        }),
        result: 'success'
      })

      // ── 资金流水登记（仅已审批合同，幂等防重复入账）──
      if (isContractApproved(id)) {
        // 进入执行阶段 → 登记合同支出
        if (data.status === 'active' && !hasContractTransaction(id, 'expense', '合同支出')) {
          const items = result.items || []
          const totalCost = items.reduce((sum: number, item: any) => sum + (item.quantity || 0) * (item.unit_price || 0), 0)
          if (totalCost > 0) {
            syncContractCostToAccount(id, totalCost, '合同执行', (data as any).updated_by || '')
          }
        }
        // 完成 → 登记合同收入
        if (data.status === 'completed' && result.expected_income > 0 && !hasContractTransaction(id, 'income', '合同收入')) {
          const db = getDatabase()
          const contract = queryOne(
            `SELECT region_id, contract_name FROM contracts WHERE id = ?`,
            [id]
          ) as Record<string, unknown> | undefined
          if (contract?.region_id) {
            const account = queryOne(
              `SELECT id FROM region_accounts WHERE region_id = ? LIMIT 1`,
              [contract.region_id]
            ) as Record<string, unknown> | undefined
            if (account) {
              const year = new Date().getFullYear()
              db.run(
                `INSERT INTO account_transactions (account_id, trans_type, category, amount, description, fiscal_year, operator, contract_id, source_type)
                 VALUES (?, 'income', '合同收入', ?, ?, ?, ?, ?, 'contract')`,
                [account.id, result.expected_income, `合同 ${result.contract_name}: 已完成结算`, year, data.updated_by || '', id]
              )
              db.run(
                `UPDATE region_accounts SET balance = balance + ?, updated_at = datetime('now','localtime') WHERE id = ?`,
                [result.expected_income, account.id]
              )
              // 通知：合同收入入账 → 通知账户管理人员
              notificationRepo.notifyTransaction(account.id as number, 'income', result.expected_income, `合同 ${result.contract_name}: 已完成结算`, '合同收入')
            }
          }
        }
      }

      return result
    } catch (err: any) {
      console.error('CONTRACT_UPDATE failed:', err)
      return { success: false, message: `更新合同失败：${err.message || '未知错误'}` }
    }
  })

  // 合同审批状态机：submit(提交审批) / approve(批准) / reject(驳回)
  ipcMain.handle(IPC_CHANNELS.CONTRACT_APPROVE, (_e, id: number, action: 'submit' | 'approve' | 'reject', operator?: string, operatorRole?: string) => {
    try {
      // 后端权限校验：审批需要 contract.approve（基于主进程会话，不信任渲染进程传入的角色）
      const perm = requirePermission(PERMISSIONS.CONTRACT_APPROVE, '没有合同审批的权限')
      if (!perm.ok) return perm.response
      const before = repo.getById(id)
      const result = repo.transitionApproval(id, action, operator || '')
      if (!result) {
        return { success: false, message: '合同不存在' }
      }
      // 版本留痕：审批动作同样记录历史
      if (before) {
        saveVersionSnapshot(id, before, [action === 'submit' ? '提交审批' : action === 'approve' ? '审批通过' : '审批驳回'], operator || '')
      }
      // 审计日志
      insertAuditLog({
        username: operator || 'system',
        role: operatorRole || 'admin',
        action,
        target: 'contract',
        target_id: id,
        old_value: before ? JSON.stringify({ status: before.status, approval_status: before.approval_status }) : null,
        new_value: JSON.stringify({ status: result.status, approval_status: result.approval_status }),
        result: 'success'
      })

      // ── 通知中心触发 ──
      // 提交审批 → 通知 admin；三级全部通过 → 通知创建人；任一环节驳回 → 通知创建人
      try {
        if (action === 'submit') {
          notificationRepo.notifyContractSubmitted(result)
        } else if (action === 'reject') {
          notificationRepo.notifyContractDecision(result, 'reject')
        } else if (action === 'approve' && result.approval_status === 'approved') {
          // 仅第 3 级（财务）通过、整体已审批时才通知创建人「已批准」
          notificationRepo.notifyContractDecision(result, 'approve')
        }
      } catch (err) {
        console.error('notification trigger failed:', err)
      }

      return result
    } catch (err: any) {
      console.error('CONTRACT_APPROVE failed:', err)
      return { success: false, message: `审批失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONTRACT_DELETE, (_e, id: number, _operator?: string, _operatorRole?: string) => {
    try {
      const perm = requirePermission(PERMISSIONS.CONTRACT_EDIT, '没有删除合同的权限')
      if (!perm.ok) return perm.response
      const contract = repo.getById(id)
      const oldSnapshot = contract ? JSON.stringify({
        contract_no: contract.contract_no,
        contract_name: contract.contract_name,
        status: contract.status
      }) : null
      repo.delete(id)
      insertAuditLog({
        username: _operator || 'system',
        role: _operatorRole || 'admin',
        action: 'delete',
        target: 'contract',
        target_id: id,
        old_value: oldSnapshot,
        result: 'success'
      })
      return { success: true }
    } catch (err: any) {
      console.error('CONTRACT_DELETE failed:', err)
      return { success: false, message: `删除合同失败：${err.message || '未知错误'}` }
    }
  })

  // ── 批量操作：批量提交审批 / 批量批准 / 批量删除 ──
  // 逐条 try/catch + 事务保护：单条失败回滚该条，不影响其他条；返回每条的成功/失败明细
  ipcMain.handle(
    IPC_CHANNELS.CONTRACT_BATCH_APPROVE,
    (_e, ids: number[], action: 'submit' | 'approve' | 'delete', operator?: string, operatorRole?: string) => {
      try {
        const idList = Array.isArray(ids) ? ids.filter((n) => Number.isFinite(n)) : []
        if (idList.length === 0) return { success: false, message: '未选择任何合同' }
        if (!['submit', 'approve', 'delete'].includes(action)) {
          return { success: false, message: '无效的批量操作类型' }
        }

        // 权限校验：批量审批（submit/approve）需要 contract.approve；批量删除需要 contract.edit（rep 无权限）
        const perm = requirePermission(
          action === 'delete' ? PERMISSIONS.CONTRACT_EDIT : PERMISSIONS.CONTRACT_APPROVE,
          action === 'delete' ? '没有删除合同的权限' : '没有合同审批的权限'
        )
        if (!perm.ok) return perm.response

        const db = getDatabase()
        const results: { id: number; success: boolean; message: string }[] = []

        for (const id of idList) {
          // 每条独立事务：保证单条原子性，失败回滚不影响批次其他条目
          db.run('BEGIN TRANSACTION')
          try {
            const before = repo.getById(id)
            if (!before) {
              db.run('ROLLBACK')
              results.push({ id, success: false, message: '合同不存在' })
              continue
            }

            if (action === 'delete') {
              const oldSnapshot = JSON.stringify({
                contract_no: before.contract_no,
                contract_name: before.contract_name,
                status: before.status
              })
              repo.delete(id)
              insertAuditLog({
                username: operator || 'system',
                role: operatorRole || 'admin',
                action: 'delete',
                target: 'contract',
                target_id: id,
                old_value: oldSnapshot,
                result: 'success'
              })
              db.run('COMMIT')
              results.push({ id, success: true, message: '删除成功' })
            } else {
              const result = repo.transitionApproval(id, action, operator || '')
              // 版本留痕：批量审批同样记录历史
              saveVersionSnapshot(id, before, [action === 'submit' ? '提交审批' : '审批通过'], operator || '')
              // 审计日志
              insertAuditLog({
                username: operator || 'system',
                role: operatorRole || 'admin',
                action,
                target: 'contract',
                target_id: id,
                old_value: before ? JSON.stringify({ status: before.status, approval_status: before.approval_status }) : null,
                new_value: JSON.stringify({ status: result.status, approval_status: result.approval_status }),
                result: 'success'
              })
              // 通知中心触发（复用单条逻辑）
              try {
                if (action === 'submit') {
                  notificationRepo.notifyContractSubmitted(result)
                } else if (action === 'approve' && result.approval_status === 'approved') {
                  notificationRepo.notifyContractDecision(result, 'approve')
                }
              } catch (err) {
                console.error('batch notification trigger failed:', err)
              }
              db.run('COMMIT')
              results.push({ id, success: true, message: action === 'submit' ? '已提交审批' : '审批通过' })
            }
          } catch (err: any) {
            try { db.run('ROLLBACK') } catch { /* 回滚失败忽略（单条事务） */ }
            results.push({ id, success: false, message: err?.message || '操作失败' })
          }
        }

        const okCount = results.filter((r) => r.success).length
        return {
          success: true,
          results,
          summary: { total: results.length, ok: okCount, failed: results.length - okCount }
        }
      } catch (err: any) {
        console.error('CONTRACT_BATCH_APPROVE failed:', err)
        return { success: false, message: `批量操作失败：${err.message || '未知错误'}` }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CONTRACT_SUMMARIZE, (_e, regionId: number) => {
    try {
      const perm = requirePermission(PERMISSIONS.CONTRACT_VIEW)
      if (!perm.ok) return perm.response
      return repo.summarizeByRegion(regionId)
    } catch (err: any) {
      console.error('CONTRACT_SUMMARIZE failed:', err)
      return { success: false, message: `汇总合同失败：${err.message || '未知错误'}` }
    }
  })

  // 版本历史列表：返回按版本号升序排列的快照（含变更字段/操作人/时间）
  ipcMain.handle(IPC_CHANNELS.CONTRACT_LIST_VERSIONS, (_e, contractId: number) => {
    try {
      const perm = requirePermission(PERMISSIONS.CONTRACT_VIEW)
      if (!perm.ok) return perm.response
      const rows = queryAll(
        `SELECT id, version, snapshot, changed_fields, created_by, created_at
         FROM contract_versions
         WHERE contract_id = ?
         ORDER BY version ASC`,
        [contractId]
      )
      return rows.map((r) => {
        let snapshot: Record<string, unknown> = {}
        let changedFields: string[] = []
        try { snapshot = JSON.parse((r.snapshot as string) || '{}') } catch { /* 忽略损坏快照 */ }
        try { changedFields = JSON.parse((r.changed_fields as string) || '[]') } catch { /* 忽略 */ }
        return {
          id: r.id,
          contract_id: contractId,
          version: r.version,
          snapshot,
          changed_fields: changedFields,
          created_by: r.created_by || '',
          created_at: r.created_at || ''
        }
      })
    } catch (err: any) {
      console.error('CONTRACT_LIST_VERSIONS failed:', err)
      return { success: false, message: `获取版本历史失败：${err.message || '未知错误'}` }
    }
  })
}
