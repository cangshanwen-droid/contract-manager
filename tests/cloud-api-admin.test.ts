import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { registerStockHandlers } from '../src/main/ipc/stock.handler'
import { setSessionUser } from '../src/main/session'

beforeEach(() => {
  vi.mocked(ipcMain.handle).mockClear()
  setSessionUser(null)
})

describe('股票管理接口鉴权', () => {
  it('创建股票通过主进程代理执行，不把管理密钥交给渲染进程', async () => {
    const invokeMock = vi.fn().mockResolvedValue({
      success: true,
      stock: { symbol: 'TEST', name: '测试公司', price: 100 },
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        api: { invoke: invokeMock },
        fetch: vi.fn(),
      },
    })

    const { createStock } = await import('../src/renderer/src/api/cloudApi')
    await createStock({ symbol: 'TEST', name: '测试公司', price: 100 })

    expect(invokeMock).toHaveBeenCalledWith('stock:create', { symbol: 'TEST', name: '测试公司', price: 100 })
    expect(window.fetch).not.toHaveBeenCalled()
  })

  it('管理员退出后切换为操作员，主进程拒绝创建股票', async () => {
    registerStockHandlers()
    const registration = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'stock:create')
    expect(registration).toBeTruthy()
    const handler = registration![1] as (...args: any[]) => Promise<any>

    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: [] })
    setSessionUser(null)
    setSessionUser({ id: 2, username: 'operator', role: 'operator', permissions: ['stock.trade'] })

    const result = await handler({}, { symbol: 'TEST', name: '测试公司', price: 100 })
    expect(result).toMatchObject({ success: false, code: 'FORBIDDEN', rollbackSafe: true })
  })
})
