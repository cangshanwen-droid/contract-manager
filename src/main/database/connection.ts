import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'

let db: SqlJsDatabase | null = null
let dbPath: string = ''

export async function initDatabase(): Promise<void> {
  // sql.js 需要加载 .wasm 文件
  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      const appPath = app.getAppPath()
      const isAsar = appPath.includes('.asar')
      const basePath = isAsar ? appPath.replace('.asar', '.asar.unpacked') : appPath
      return path.join(basePath, 'node_modules', 'sql.js', 'dist', file)
    }
  })
  dbPath = path.join(app.getPath('userData'), 'contract-manager.db')

  // 如果文件存在，加载它
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }
}

export function getDatabase(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function saveDatabase(): void {
  if (!db) return
  const data = db.export()
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase()
    db.close()
    db = null
  }
}
