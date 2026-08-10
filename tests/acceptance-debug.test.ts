import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { setupTestDb } from './helpers/setup'
import { getDatabase } from '../src/main/database/connection'
import { setSessionUser } from '../src/main/session'
import { registerContractHandlers } from '../src/main/ipc/contract.handler'
import { IPC_CHANNELS } from '../src/shared/constants'

type Handler = (...args: any[]) => unknown
function captureHandler(channel: string): Handler | null {
  const handleMock = ipcMain.handle as unknown as ReturnType<typeof vi.fn>
  const call = handleMock.mock.calls.find((c) => c[0] === channel)
  return call ? (call[1] as Handler) : null
}

beforeEach(async () => {
  await setupTestDb()
  const db = getDatabase()
  db.run("INSERT INTO contract_types (id, name) VALUES (1,'基建'),(2,'开采'),(3,'采购'),(4,'劳动力'),(5,'投资'),(6,'拨款'),(7,'销售')")
  db.run("INSERT INTO regions (id, name) VALUES (1, 'A区')")
  db.run("INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'x', 'admin')")
  db.run("INSERT INTO region_accounts (account_name, region_id, balance, is_master) VALUES ('A区主账户', 1, 1000000, 1)")
  setSessionUser({ id: 1, username: 'admin', role: 'admin' })
  ;(ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockClear()
  registerContractHandlers()
})

describe('debug', () => {
  it('create return shape', () => {
    const createH = captureHandler(IPC_CHANNELS.CONTRACT_CREATE)!
    const r = createH(null, {
      contract_name: '销售合同A', contract_type_id: 7, region_id: 1,
      party_a: '甲方', party_b_name: '乙方',
      items: [{ item_name: '商品', quantity: 2, unit_price: 100, tax_rate: 13 }]
    })
    console.log('CREATE RESULT:', JSON.stringify(r, null, 2))
    expect(true).toBe(true)
  })
})
