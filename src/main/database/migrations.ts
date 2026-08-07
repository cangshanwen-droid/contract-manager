import { getDatabase } from './connection'
import { executeMulti, queryAll } from './helpers'

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS regions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL UNIQUE,
  population          REAL    NOT NULL DEFAULT 0,
  talent_population   REAL    NOT NULL DEFAULT 0,
  carbon_emissions    REAL    NOT NULL DEFAULT 0,
  population_capacity REAL    NOT NULL DEFAULT 10000,
  base_growth_rate    REAL    NOT NULL DEFAULT 0.03,
  current_happiness   REAL    DEFAULT NULL,
  current_employment_rate REAL DEFAULT NULL,
  created_at          TEXT    DEFAULT (datetime('now','localtime')),
  updated_at          TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS companies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  region        TEXT    NOT NULL DEFAULT '',
  company_type  TEXT    DEFAULT '',
  contact       TEXT    DEFAULT '',
  phone         TEXT    DEFAULT '',
  email         TEXT    DEFAULT '',
  address       TEXT    DEFAULT '',
  notes         TEXT    DEFAULT '',
  is_active     INTEGER DEFAULT 1,
  created_at    TEXT    DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_companies_region ON companies(region);

CREATE TABLE IF NOT EXISTS infrastructure_types (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL UNIQUE,
  default_land_area REAL    NOT NULL DEFAULT 0,
  unit              TEXT    DEFAULT '座',
  description       TEXT    DEFAULT '',
  created_at        TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS contract_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT    DEFAULT '',
  color       TEXT    DEFAULT '#1890ff',
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT    DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS contracts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_no     TEXT    NOT NULL UNIQUE,
  contract_name   TEXT    NOT NULL,
  contract_type_id INTEGER REFERENCES contract_types(id),
  party_a         TEXT    NOT NULL DEFAULT '',
  party_b_id      INTEGER REFERENCES companies(id),
  party_b_name    TEXT    NOT NULL DEFAULT '',
  region_id       INTEGER REFERENCES regions(id),
  sign_date       TEXT,
  status          TEXT    DEFAULT 'draft',
  notes           TEXT    DEFAULT '',
  created_at      TEXT    DEFAULT (datetime('now','localtime')),
  updated_at      TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_contracts_region ON contracts(region_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_party_b ON contracts(party_b_id);

CREATE TABLE IF NOT EXISTS contract_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id     INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  item_name       TEXT    NOT NULL,
  quantity        REAL    NOT NULL DEFAULT 1,
  unit_price      REAL    NOT NULL DEFAULT 0,
  amount          REAL    GENERATED ALWAYS AS (quantity * unit_price) STORED,
  land_area       REAL    NOT NULL DEFAULT 0,
  total_land_area REAL    GENERATED ALWAYS AS (quantity * land_area) STORED,
  tax_rate        REAL    DEFAULT 0,
  tax_amount      REAL    GENERATED ALWAYS AS (ROUND(quantity * unit_price * tax_rate, 2)) STORED,
  total           REAL    GENERATED ALWAYS AS (quantity * unit_price * (1 + tax_rate)) STORED,
  sort_order      INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_contract_items_contract ON contract_items(contract_id);

CREATE TABLE IF NOT EXISTS formula_logs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id           INTEGER NOT NULL REFERENCES regions(id),
  round               INTEGER NOT NULL DEFAULT 1,
  calculated_at       TEXT    DEFAULT (datetime('now','localtime')),
  input_population    REAL    NOT NULL,
  input_talent        REAL    NOT NULL,
  input_carbon        REAL    NOT NULL,
  input_supply        REAL    NOT NULL DEFAULT 0,
  input_demand        REAL    NOT NULL DEFAULT 0,
  input_price_avg     REAL    NOT NULL DEFAULT 0,
  output_happiness    REAL    NOT NULL,
  output_base_price   REAL    DEFAULT 0,
  output_sell_price   REAL    DEFAULT 0,
  output_employment_rate REAL NOT NULL,
  output_population_next REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_formula_logs_region ON formula_logs(region_id);

CREATE TABLE IF NOT EXISTS infra_employment_bonuses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name     TEXT    NOT NULL UNIQUE,
  bonus         REAL    NOT NULL DEFAULT 0,
  created_at    TEXT    DEFAULT (datetime('now','localtime'))
);
    `
  },
  {
    version: 2,
    sql: `
ALTER TABLE contract_items ADD COLUMN skill_level REAL DEFAULT 0;
ALTER TABLE contract_items ADD COLUMN carbon_factor REAL DEFAULT 0;
    `
  },
  {
    version: 3,
    sql: `
ALTER TABLE infrastructure_types ADD COLUMN price REAL DEFAULT 0;
ALTER TABLE infrastructure_types ADD COLUMN revenue_index REAL DEFAULT 0;
ALTER TABLE infrastructure_types ADD COLUMN recommended_ratio REAL DEFAULT 0;
ALTER TABLE infrastructure_types ADD COLUMN maintenance_fee REAL DEFAULT 0;
    `
  },
  {
    version: 4,
    sql: `
ALTER TABLE infrastructure_types ADD COLUMN category TEXT DEFAULT '民生配套';
ALTER TABLE infrastructure_types ADD COLUMN population_addition REAL DEFAULT 0;
ALTER TABLE infrastructure_types ADD COLUMN talent_addition INTEGER DEFAULT 0;
ALTER TABLE infrastructure_types ADD COLUMN happiness_index REAL DEFAULT 0;
ALTER TABLE infrastructure_types ADD COLUMN h_bonus REAL DEFAULT 0;
ALTER TABLE infrastructure_types ADD COLUMN carbon_reduction REAL DEFAULT 0;
ALTER TABLE infrastructure_types ADD COLUMN activation_price REAL DEFAULT 0;
    `
  },
  {
    version: 5,
    sql: `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE,
  password   TEXT    NOT NULL,
  salt       TEXT    DEFAULT '',
  role       TEXT    DEFAULT 'user',
  created_at TEXT    DEFAULT (datetime('now','localtime'))
);

-- 添加 salt 列到已有 users 表（如果是从旧版本升级）
-- sql.js 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS，用 try-catch 在 migrations runner 中处理

-- 默认 admin 使用 PBKDF2-SHA512 带盐哈希
-- 密码: admin, salt 和 hash 由 pbkdf2(randomBytes(32), 'admin', 100000, 64, 'sha512') 生成
INSERT OR IGNORE INTO users (username, password, salt, role)
VALUES ('admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', '', 'admin');
    `
  },
  {
    version: 6,
    sql: `
CREATE TABLE IF NOT EXISTS region_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id   INTEGER NOT NULL REFERENCES regions(id),
  account_name TEXT   NOT NULL,
  balance     REAL   NOT NULL DEFAULT 0,
  is_master   INTEGER DEFAULT 0,
  created_at  TEXT   DEFAULT (datetime('now','localtime')),
  updated_at  TEXT   DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS account_transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL REFERENCES region_accounts(id),
  trans_type   TEXT    NOT NULL,
  category     TEXT    DEFAULT '',
  amount       REAL   NOT NULL,
  description  TEXT   DEFAULT '',
  fiscal_year  INTEGER,
  created_at   TEXT   DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_trans_account ON account_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_trans_fiscal ON account_transactions(fiscal_year);
    `
  }
]

export function runMigrations(): void {
  const db = getDatabase()

  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   INTEGER PRIMARY KEY,
      name      TEXT    NOT NULL,
      applied_at TEXT    DEFAULT (datetime('now','localtime'))
    )
  `)

  const applied = new Set(
    queryAll('SELECT version FROM schema_migrations ORDER BY version').map(
      (r: Record<string, unknown>) => r.version as number
    )
  )

  // 兼容旧版迁移：如果 users 表已存在但没有 salt 列，自动添加
  if (applied.has(5)) {
    try {
      db.run('ALTER TABLE users ADD COLUMN salt TEXT DEFAULT \'\'')
    } catch {
      // 列已存在，忽略
    }
  }

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    executeMulti(migration.sql)
    db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [
      migration.version,
      `v${migration.version}`
    ])
    console.log(`Migration ${migration.version} applied`)
  }
}
