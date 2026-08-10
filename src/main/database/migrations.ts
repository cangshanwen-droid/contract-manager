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
  role       TEXT    DEFAULT 'user',
  created_at TEXT    DEFAULT (datetime('now','localtime'))
);

-- 默认 admin 使用 bcrypt 加盐哈希 (12 rounds)
-- 密码: admin；⚠️ hash 包含随机盐，此处为预生成值
INSERT OR IGNORE INTO users (username, password, role)
VALUES ('admin', '$2b$12$6HL.YjN5Ynl2R7XA3kEEJOdsFAlvd0SdNul8QE7CGS2lIsoSPmR4e', 'admin');
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
  },
  {
    version: 7,
    name: 'add_company_contract_metrics',
    sql: `
ALTER TABLE companies ADD COLUMN employee_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN annual_output REAL DEFAULT 0;
ALTER TABLE companies ADD COLUMN carbon_emission REAL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN total_cost REAL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN progress REAL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN expected_income REAL DEFAULT 0;
    `
  },
  {
    version: 8,
    name: 'add_contract_item_financials',
    sql: `
ALTER TABLE contract_items ADD COLUMN expected_income REAL DEFAULT 0;
ALTER TABLE contract_items ADD COLUMN total_cost REAL DEFAULT 0;
    `
  },
  {
    version: 9,
    name: 'create_announcements',
    sql: `
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  region_id  INTEGER,
  priority   TEXT    NOT NULL DEFAULT 'normal' CHECK(priority IN ('high','normal','low')),
  created_by TEXT    NOT NULL DEFAULT '',
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    DEFAULT (datetime('now','localtime')),
  updated_at TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_announcements_region ON announcements(region_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
    `
  },
  {
    version: 10,
    name: 'add_audit_fields',
    sql: `
ALTER TABLE contracts ADD COLUMN created_by TEXT DEFAULT '';
ALTER TABLE contracts ADD COLUMN updated_by TEXT DEFAULT '';
ALTER TABLE account_transactions ADD COLUMN operator TEXT DEFAULT '';
    `
  },
  {
    version: 11,
    name: 'add_company_stock_fields',
    sql: `
ALTER TABLE companies ADD COLUMN is_listed INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN stock_symbol TEXT DEFAULT '';
ALTER TABLE companies ADD COLUMN stock_initial_price REAL DEFAULT 100;
    `
  },
  {
    version: 12,
    name: 'add_company_region_fk',
    sql: `
ALTER TABLE companies ADD COLUMN region_id INTEGER REFERENCES regions(id);

-- 迁移现有区域文本到 region_id：按名称匹配
UPDATE companies SET region_id = (
  SELECT r.id FROM regions r WHERE r.name = companies.region LIMIT 1
);

DROP INDEX IF EXISTS idx_companies_region;
CREATE INDEX IF NOT EXISTS idx_companies_region_id ON companies(region_id);
    `
  },
  {
    version: 13,
    name: 'add_contract_transaction_link',
    sql: `
ALTER TABLE account_transactions ADD COLUMN contract_id INTEGER REFERENCES contracts(id);
ALTER TABLE account_transactions ADD COLUMN source_type TEXT DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS idx_trans_contract ON account_transactions(contract_id);
    `
  },
  {
    version: 14,
    name: 'create_audit_logs',
    sql: `
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL DEFAULT '',
  role       TEXT    NOT NULL DEFAULT '',
  action     TEXT    NOT NULL,
  target     TEXT    NOT NULL DEFAULT '',
  target_id  INTEGER,
  old_value  TEXT,
  new_value  TEXT,
  ip         TEXT,
  timestamp  TEXT    DEFAULT (datetime('now','localtime')),
  result     TEXT    NOT NULL DEFAULT 'success'
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_username ON audit_logs(username);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    `
  },
  {
    version: 15,
    name: 'add_contract_approval',
    sql: `
ALTER TABLE contracts ADD COLUMN approval_status TEXT DEFAULT 'approved';
ALTER TABLE contracts ADD COLUMN approved_by TEXT DEFAULT '';
ALTER TABLE contracts ADD COLUMN approved_at TEXT;
CREATE INDEX IF NOT EXISTS idx_contracts_approval ON contracts(approval_status);
    `
  },
  {
    version: 16,
    name: 'create_contract_versions',
    sql: `
-- 合同版本历史：每次编辑前保存旧快照，实现编辑留痕可追溯
CREATE TABLE IF NOT EXISTS contract_versions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id    INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  snapshot       TEXT    NOT NULL,
  changed_fields TEXT    NOT NULL DEFAULT '[]',
  created_by     TEXT    NOT NULL DEFAULT '',
  created_at     TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_contract_versions_contract ON contract_versions(contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_versions_version ON contract_versions(contract_id, version);
    `
  },
  {
    version: 17,
    name: 'create_roles_and_user_roles',
    sql: `
-- ═══════════════════════════════════════════════════════════════
-- v17 细粒度权限：roles 表（角色 → 权限点 JSON）+ user_roles 关联表
-- 保守方案：保持 3 个固定角色（rep/operator/admin），
-- 用权限点（permission）做前端菜单/路由 + 后端 handler 双重校验。
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  label       TEXT    NOT NULL DEFAULT '',
  permissions TEXT    NOT NULL DEFAULT '[]',
  created_at  TEXT    DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id  INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- 种子：3 个固定角色及其权限点（与 src/shared/permissions.ts 保持一致）
INSERT OR IGNORE INTO roles (name, label, permissions) VALUES
 ('rep', '代表端',
  '["contract.view","account.view"]'),
 ('operator', '操作端',
  '["contract.view","contract.create","contract.approve","contract.edit","account.view","account.create","account.transact","stock.trade","announce.manage"]'),
 ('admin', '管理端',
  '["contract.view","contract.create","contract.approve","contract.edit","account.view","account.create","account.transact","user.manage","announce.manage","stock.trade","system.config"]');

-- 存量用户回填关联（users.role → user_roles）
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON r.name = u.role;
    `
  },
  {
    version: 18,
    name: 'create_notifications',
    sql: `
-- ═══════════════════════════════════════════════════════════════
-- v18 通知中心：铃铛 + 未读红点 + 下拉面板
-- 触发源：合同提交审批 → admin；合同批准/驳回 → 创建人；
--         新公告 → 全员；账户交易 → 账户管理人员。
-- type: approval(审批) | announcement(公告) | transaction(交易) | system(系统)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL DEFAULT '',
  type       TEXT    NOT NULL DEFAULT 'system',
  link       TEXT    NOT NULL DEFAULT '',
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
    `
  },
  {
    version: 19,
    name: 'add_users_last_login',
    sql: `
-- v19 用户最后登录时间：登录成功时写入，用于系统概览活跃用户统计
ALTER TABLE users ADD COLUMN last_login TEXT;
    `
  },
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

  // P0-3 防御：整体 try/catch，迁移失败时报告具体版本号，便于定位与恢复；
  // 失败版本不写入 schema_migrations，配合 executeMulti 的列存在性检查，重启可安全重跑。
  let currentVersion = 0
  try {
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue
      currentVersion = migration.version
      executeMulti(migration.sql)
      db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [
        migration.version,
        `v${migration.version}`
      ])
      console.log(`Migration ${migration.version} applied`)
    }
  } catch (err: any) {
    const name = MIGRATIONS.find((m) => m.version === currentVersion)?.name
    console.error(`[MIGRATION FAILED] v${currentVersion}${name ? ` (${name})` : ''}: ${err?.message || err}`)
    throw err
  }
}
