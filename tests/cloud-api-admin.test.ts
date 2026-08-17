import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain, net } from 'electron'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { registerStockHandlers } from '../src/main/ipc/stock.handler'
import { setSessionUser } from '../src/main/session'

beforeEach(() => {
  vi.mocked(ipcMain.handle).mockClear()
  vi.mocked(net.fetch).mockReset()
  delete process.env.GIPFEL_ADMIN_KEY
  setSessionUser(null)
})

describe('股票管理接口鉴权', () => {
  it('preload 仅显式放行股票创建与管理通道', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8')
    expect(source).toContain('IPC_CHANNELS.STOCK_CREATE')
    expect(source).toContain('IPC_CHANNELS.STOCK_ADMIN')
  })

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

  it('操作员不能调用市场管理控制台', async () => {
    registerStockHandlers()
    const registration = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'stock:admin')
    const handler = registration![1] as (...args: any[]) => Promise<any>
    setSessionUser({ id: 2, username: 'operator', role: 'operator', permissions: ['stock.trade'] })

    const result = await handler({}, { action: 'close' })
    expect(result).toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it('管理员轮次操作仅通过白名单路由代理，管理密钥不进入渲染进程', async () => {
    process.env.GIPFEL_ADMIN_KEY = 'test-admin-key'
    vi.mocked(net.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, state: 'closed', round: 1 }),
    } as any)
    registerStockHandlers()
    const registration = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'stock:admin')
    const handler = registration![1] as (...args: any[]) => Promise<any>
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: [] })

    const result = await handler({}, { action: 'close' })
    expect(result).toMatchObject({ success: true, data: { state: 'closed', round: 1 } })
    expect(net.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/admin\/market\/close$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Admin-Key': 'test-admin-key' }),
      }),
    )
  })

  it('管理员控制台拒绝未知动作', async () => {
    process.env.GIPFEL_ADMIN_KEY = 'test-admin-key'
    registerStockHandlers()
    const registration = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'stock:admin')
    const handler = registration![1] as (...args: any[]) => Promise<any>
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: [] })

    const result = await handler({}, { action: 'arbitrary-request' })
    expect(result).toMatchObject({ success: false, code: 'INVALID_ACTION' })
    expect(net.fetch).not.toHaveBeenCalled()
  })
})
