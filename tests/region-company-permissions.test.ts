import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { setupTestDb } from './helpers/setup'
import { registerRegionHandlers } from '../src/main/ipc/region.handler'
import { registerCompanyHandlers } from '../src/main/ipc/company.handler'
import { setSessionUser } from '../src/main/session'
import { ROLE_PERMISSIONS } from '../src/shared/permissions'

beforeEach(async () => {
  vi.mocked(ipcMain.handle).mockClear()
  await setupTestDb()
  setSessionUser(null)
})

function handler(channel: string) {
  const registration = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)
  return registration?.[1] as (...args: any[]) => Promise<any> | any
}

describe('区域与公司三端权限一致性', () => {
  it('代表端不能绕过界面创建区域或公司', async () => {
    registerRegionHandlers()
    registerCompanyHandlers()
    setSessionUser({ id: 1, username: 'rep', role: 'rep', permissions: ROLE_PERMISSIONS.rep })
    expect(await handler('region:create')({}, { name: '越权区域' })).toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(await handler('company:create')({}, { name: '越权公司' })).toMatchObject({ success: false, code: 'FORBIDDEN' })
  })

  it('操作端可维护区域和公司，但不能执行管理端删除', async () => {
    registerRegionHandlers()
    registerCompanyHandlers()
    setSessionUser({ id: 2, username: 'operator', role: 'operator', permissions: ROLE_PERMISSIONS.operator })
    expect(await handler('region:delete')({}, 1)).toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(await handler('company:delete')({}, 1)).toMatchObject({ success: false, code: 'FORBIDDEN' })
  })
})
