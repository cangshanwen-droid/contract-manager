/**
 * vitest 共享测试环境：
 *  1. mock electron（app.getPath / app.getAppPath / net / safeStorage）
 *     —— 使主进程纯逻辑模块（contract.repo / stock-sync / session）可在 Node 下加载
 *  2. setupTestDb()：在临时目录初始化 sql.js 内存库 + 跑全部迁移（v1~v19）
 */
import { afterEach, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * 可变 electron mock 状态：setupTestDb() 会把 userDataPath 指向全新临时目录，
 * 从而获得一块干净的 sql.js 内存库。（注意：vi.hoisted 变量不可导出，仅模块内使用）
 */
const electronMock = vi.hoisted(() => {
  const base = (): string => process.env.TEMP || process.env.TMP || '/tmp'
  return {
    userDataPath: '',
    getPath: (name: string): string =>
      name === 'userData' && electronMock.userDataPath ? electronMock.userDataPath : base(),
    getAppPath: (): string => process.cwd()
  }
})

// electron 主进程模块在纯 Node 下不可用（其入口导出的是二进制路径），必须 mock
vi.mock('electron', () => ({
  app: {
    getPath: (name: string): string => electronMock.getPath(name),
    getAppPath: (): string => electronMock.getAppPath()
  },
  ipcMain: { handle: vi.fn() },
  net: { fetch: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: (): boolean => false,
    encryptString: (): Buffer => Buffer.from(''),
    decryptString: (): string => ''
  }
}))

/** 初始化一块全新的 sql.js 内存库（含全部迁移），返回后即可使用 getDatabase() */
export async function setupTestDb(): Promise<void> {
  const { initDatabase } = await import('../../src/main/database/connection')
  const { runMigrations } = await import('../../src/main/database/migrations')
  electronMock.userDataPath = mkdtempSync(join(tmpdir(), 'gipfel-test-'))
  await initDatabase()
  // runMigrations 里逐条 console.log('Migration N applied')，测试时静音
  const origLog = console.log
  console.log = () => {}
  try {
    runMigrations()
  } finally {
    console.log = origLog
  }
}

/** 关闭内存库，释放资源（配合全局 afterEach 自动调用） */
export async function teardownTestDb(): Promise<void> {
  const { closeDatabase } = await import('../../src/main/database/connection')
  closeDatabase()
}

afterEach(async () => {
  await teardownTestDb()
})
