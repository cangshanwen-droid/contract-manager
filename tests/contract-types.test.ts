import { beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb } from './helpers/setup'
import { queryAll } from '../src/main/database/helpers'
import { seedDefaultData } from '../src/main/database/seed'

const expected = [
  [1, '基建合同'], [2, '开采合同'], [3, '采购合同'], [4, '劳动力雇佣合同'],
  [5, '投资合同'], [6, '拨款合同'], [7, '销售合同'], [8, '减碳合同'],
]

describe('合同类型字典', () => {
  beforeEach(async () => {
    await setupTestDb()
    seedDefaultData()
  })

  it('八种合同的编号和名称保持稳定，确保计算规则不会串型', () => {
    const rows = queryAll('SELECT id,name,description FROM contract_types ORDER BY id') as any[]
    expect(rows.map((row) => [row.id, row.name])).toEqual(expected)
    expect(rows.every((row) => String(row.description || '').trim().length > 0)).toBe(true)
  })
})
