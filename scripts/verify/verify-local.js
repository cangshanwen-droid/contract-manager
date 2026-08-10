#!/usr/bin/env node
/**
 * verify-local.js - Gipfel 本地数据库层验证（Node + sql.js）
 *
 * 直接加载仓库真实的 migrations.ts / seed.ts（经 TypeScript 转译，SQL 与生产一致），
 * 在内存数据库中验证：
 *   1. 迁移 v1–v19 全部可执行（全新库）
 *   2. 迁移幂等（同库重跑 / 已有 DB 文件重开，均不重复应用）
 *   3. seed 数据正确（admin 用户存在、区域/合同类型/基建类型齐全）
 *   4. bcrypt 密码验证（admin/admin123 可通过，错误密码拒绝）
 *   5. 简单 CRUD：区域 / 公司 / 合同（含生成列）/ 账户 创建 + 读取
 *
 * 幂等：每次运行使用全新内存库（或临时文件），不触碰用户数据。
 * 退出码：0=全部通过 1=存在失败
 */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const ts = require('typescript')
const initSqlJs = require('sql.js')
const bcrypt = require('bcryptjs')

const ROOT = path.resolve(__dirname, '..', '..')
const MIGRATIONS_FILE = path.join(ROOT, 'src', 'main', 'database', 'migrations.ts')
const SEED_FILE = path.join(ROOT, 'src', 'main', 'database', 'seed.ts')

// ── 简单断言 / 结果统计 ──────────────────────────────────────────────
let passed = 0
let failed = 0
let current = ''

function test(name, fn) {
  current = name
  try {
    fn()
    passed++
    console.log(`  [PASS] ${name}`)
  } catch (e) {
    failed++
    console.log(`  [FAIL] ${name}`)
    console.log(`         ${e && e.message ? e.message : e}`)
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ── 把 TS 模块转译为 CommonJS 并在带桩 require 的沙箱中执行 ───────────
function makeHelpers(db) {
  const queryAll = (sql, params = []) => {
    const stmt = db.prepare(sql)
    if (params.length) stmt.bind(params)
    const out = []
    while (stmt.step()) out.push(stmt.getAsObject())
    stmt.free()
    return out
  }
  return {
    executeMulti: (sql) => db.run(sql),
    queryAll,
    queryOne: (sql, params = []) => {
      const r = queryAll(sql, params)
      return r.length ? r[0] : null
    },
    execute: (sql, params = []) => {
      const stmt = db.prepare(sql)
      if (params.length) stmt.bind(params)
      stmt.step()
      const modified = db.getRowsModified()
      stmt.free()
      return modified
    },
    lastInsertId: () => {
      const r = db.exec('SELECT last_insert_rowid() AS id')
      return r.length && r[0].values.length ? r[0].values[0][0] : 0
    }
  }
}

function loadTsModule(file, db) {
  if (!fs.existsSync(file)) throw new Error(`源文件不存在: ${file}`)
  const src = fs.readFileSync(file, 'utf8')
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  const mod = { exports: {} }
  const localRequire = (spec) => {
    if (spec === './connection') return { getDatabase: () => db }
    if (spec === './helpers') return makeHelpers(db)
    throw new Error(`意外的 import: ${spec}（在 ${file} 中）`)
  }
  new Function('require', 'module', 'exports', '__filename', '__dirname', out)(
    localRequire, mod, mod.exports, file, path.dirname(file)
  )
  return mod.exports
}

function schemaVersions(db) {
  return makeHelpers(db)
    .queryAll('SELECT version FROM schema_migrations ORDER BY version')
    .map((r) => r.version)
}

function runMigrations(db) {
  loadTsModule(MIGRATIONS_FILE, db).runMigrations()
}

function runSeed(db) {
  loadTsModule(SEED_FILE, db).seedDefaultData()
}

// ── 主流程 ──────────────────────────────────────────────────────────
async function main() {
  console.log('═══ verify-local.js - 本地数据库层验证 ═══')
  console.log(`迁移定义: ${path.relative(ROOT, MIGRATIONS_FILE)}`)
  console.log(`Seed 定义: ${path.relative(ROOT, SEED_FILE)}`)
  console.log('')

  const SQL = await initSqlJs()
  const db = new SQL.Database()

  // 1. 迁移可执行（全新库）
  test('迁移 v1–v19 全部可执行（全新库）', () => {
    runMigrations(db)
    const versions = schemaVersions(db)
    assertEq(versions.length, 19, 'schema_migrations 应恰好 19 条')
    const expected = Array.from({ length: 19 }, (_, i) => i + 1)
    assertEq(JSON.stringify(versions), JSON.stringify(expected), '迁移版本应为 1..19')
  })

  // 2. 迁移幂等（同库重跑）
  test('迁移幂等（同库重跑不重复应用）', () => {
    runMigrations(db)
    assertEq(schemaVersions(db).length, 19, '重跑后仍应为 19 条')
  })

  // 3. 迁移幂等（已有 DB 文件重开）
  test('迁移幂等（已有 DB 文件重开仍为 19 条）', () => {
    const buf = db.export()
    const tmp = path.join(os.tmpdir(), `gipfel-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    fs.writeFileSync(tmp, Buffer.from(buf))
    try {
      const db2 = new SQL.Database(fs.readFileSync(tmp))
      runMigrations(db2)
      assertEq(schemaVersions(db2).length, 19, '重开已有库后仍应为 19 条')
      db2.close()
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  })

  // 4. seed 数据正确
  test('seed：admin 用户存在且角色为 admin', () => {
    runSeed(db)
    const rows = makeHelpers(db).queryAll("SELECT username, role, password FROM users WHERE username = 'admin'")
    assertEq(rows.length, 1, '应存在 1 个 admin 用户')
    assertEq(rows[0].role, 'admin', 'admin 角色应为 admin')
  })
  test('seed：示例区域 A区/B区/C区 存在', () => {
    const rows = makeHelpers(db).queryAll("SELECT name FROM regions WHERE name IN ('A区','B区','C区')")
    assertEq(rows.length, 3, `应存在 3 个示例区域，实际 ${rows.length}`)
  })
  test('seed：合同类型 8 种、基建类型 32 种', () => {
    const ct = makeHelpers(db).queryAll('SELECT COUNT(*) AS c FROM contract_types')
    const it = makeHelpers(db).queryAll('SELECT COUNT(*) AS c FROM infrastructure_types')
    assertEq(ct[0].c, 8, `合同类型应为 8，实际 ${ct[0].c}`)
    assertEq(it[0].c, 32, `基建类型应为 32，实际 ${it[0].c}`)
  })

  // 5. bcrypt 密码验证
  test('bcrypt：admin/admin123 可验证，错误密码拒绝', () => {
    const row = makeHelpers(db).queryOne("SELECT password FROM users WHERE username = 'admin'")
    assert(row && row.password, 'admin 应有密码哈希')
    assertEq(bcrypt.compareSync('admin123', row.password), true, 'admin123 应通过验证')
    assertEq(bcrypt.compareSync('wrong-password', row.password), false, '错误密码应被拒绝')
  })

  // 6–9. CRUD
  const stamp = String(Date.now())
  const H = makeHelpers(db)

  test('CRUD：区域 创建 + 读取', () => {
    const name = `验证区域_${stamp}`
    H.execute(
      'INSERT INTO regions (name, population, talent_population, carbon_emissions, population_capacity, base_growth_rate) VALUES (?,?,?,?,?,?)',
      [name, 10000, 1000, 100, 20000, 0.03]
    )
    const r = H.queryOne('SELECT * FROM regions WHERE name = ?', [name])
    assert(r, '区域应能读回')
    assertEq(r.population, 10000, 'population 应一致')
    assert(r.id > 0, 'id 应 > 0')
  })

  test('CRUD：公司 创建 + 读取', () => {
    const regName = `验证区域_${stamp}`
    const compName = `验证公司_${stamp}`
    H.execute(
      'INSERT INTO companies (name, region, region_id, company_type, contact) VALUES (?,?,?,?,?)',
      [compName, regName, 1, '验证类型', '验证联系人']
    )
    const c = H.queryOne('SELECT * FROM companies WHERE name = ?', [compName])
    assert(c, '公司应能读回')
    assertEq(c.region, regName, 'region 应一致')
    assertEq(c.region_id, 1, 'region_id 应一致')
  })

  test('CRUD：合同 创建 + 读取（含生成列计算）', () => {
    const no = `VERIFY-${stamp}`
    H.execute(
      "INSERT INTO contracts (contract_no, contract_name, contract_type_id, region_id, status, sign_date) VALUES (?,?,?,?,?,?)",
      [no, '验证合同', 1, 1, 'active', '2026-01-15']
    )
    const c = H.queryOne('SELECT * FROM contracts WHERE contract_no = ?', [no])
    assert(c, '合同应能读回')
    assertEq(c.contract_name, '验证合同', 'contract_name 应一致')
    H.execute(
      'INSERT INTO contract_items (contract_id, item_name, quantity, unit_price, land_area, tax_rate) VALUES (?,?,?,?,?,?)',
      [c.id, '路灯（组）', 2, 100, 50, 0.1]
    )
    const item = H.queryOne('SELECT * FROM contract_items WHERE contract_id = ?', [c.id])
    assert(item, '合同条目应能读回')
    assert(Math.abs(item.amount - 200) < 1e-9, `生成列 amount 应为 200，实际 ${item.amount}`)
    assert(Math.abs(item.tax_amount - 20) < 1e-9, `生成列 tax_amount 应为 20，实际 ${item.tax_amount}`)
    assert(Math.abs(item.total - 220) < 1e-9, `生成列 total 应为 220，实际 ${item.total}`)
  })

  test('CRUD：账户 创建 + 读取（区域账户 + 资金流水）', () => {
    H.execute('INSERT INTO region_accounts (region_id, account_name, balance) VALUES (?,?,?)', [1, '验证账户', 1000])
    const acc = H.queryOne("SELECT * FROM region_accounts WHERE account_name = '验证账户'")
    assert(acc, '账户应能读回')
    assertEq(acc.balance, 1000, 'balance 应一致')
    H.execute(
      "INSERT INTO account_transactions (account_id, trans_type, category, amount, description, fiscal_year) VALUES (?,?,?,?,?,?)",
      [acc.id, 'expense', '运维', -100, '验证流水', 2026]
    )
    const txn = H.queryOne('SELECT * FROM account_transactions WHERE account_id = ?', [acc.id])
    assert(txn, '流水应能读回')
    assertEq(txn.amount, -100, '流水金额应一致')
    assertEq(txn.fiscal_year, 2026, 'fiscal_year 应一致')
  })

  db.close()

  console.log('')
  console.log(`结果: ${passed} 通过, ${failed} 失败`)
  console.log(failed === 0 ? 'verify-local: PASS' : 'verify-local: FAIL')
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('verify-local 执行异常:', e)
  process.exit(1)
})
