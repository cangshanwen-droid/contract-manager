export const IPC_CHANNELS = {
  REGION_LIST: 'region:list',
  REGION_GET: 'region:get',
  REGION_CREATE: 'region:create',
  REGION_UPDATE: 'region:update',
  REGION_DELETE: 'region:delete',

  COMPANY_LIST: 'company:list',
  COMPANY_GET: 'company:get',
  COMPANY_CREATE: 'company:create',
  COMPANY_UPDATE: 'company:update',
  COMPANY_DELETE: 'company:delete',

  CONTRACT_LIST: 'contract:list',
  CONTRACT_GET: 'contract:get',
  CONTRACT_CREATE: 'contract:create',
  CONTRACT_UPDATE: 'contract:update',
  CONTRACT_DELETE: 'contract:delete',
  CONTRACT_APPROVE: 'contract:approve',
  CONTRACT_BATCH_APPROVE: 'contract:batch-approve',
  CONTRACT_SUMMARIZE: 'contract:summarize',
  CONTRACT_LIST_VERSIONS: 'contract:list-versions',

  CONTRACT_TYPE_LIST: 'contract-type:list',

  INFRA_TYPE_LIST: 'infra-type:list',

  DASHBOARD_SUMMARY: 'dashboard:summary',
  DASHBOARD_SYSTEM_STATS: 'dashboard:system-stats',

  SYSTEM_HEALTH: 'system:health',

  FORMULA_CALCULATE: 'formula:calculate',
  FORMULA_LOG_LIST: 'formula:log-list',

  REPORT_LAND_AREA: 'report:land-area',
  REPORT_LAND_AREA_BY_REGION: 'report:land-area-by-region',

  FILE_SELECT: 'file:select',
  FILE_OPEN: 'file:open',

  INFRA_CALC_LOAD: 'infra-calc:load',

  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_REGISTER: 'auth:register',
  AUTH_CHANGE_PASSWORD: 'auth:change-password',
  AUTH_CREATE_USER: 'auth:create-user',
  AUTH_DELETE_USER: 'auth:delete-user',
  AUTH_RESET_PASSWORD: 'auth:reset-password',
  AUTH_LIST_USERS: 'auth:list-users',

  ACCOUNT_LIST: 'account:list',
  ACCOUNT_GET: 'account:get',
  ACCOUNT_CREATE: 'account:create',
  ACCOUNT_TRANSACTIONS: 'account:transactions',
  ACCOUNT_ADD_TRANSACTION: 'account:add-transaction',
  ACCOUNT_SUMMARY: 'account:summary',
  ACCOUNT_YEARS: 'account:years',

  ANNOUNCEMENT_LIST: 'announcement:list',
  ANNOUNCEMENT_ACTIVE_LIST: 'announcement:active-list',
  ANNOUNCEMENT_CREATE: 'announcement:create',
  ANNOUNCEMENT_DELETE: 'announcement:delete',

  AUDIT_LIST: 'audit:list',
  AUDIT_LOG: 'audit:log',

  NOTIFICATION_LIST: 'notification:list',
  NOTIFICATION_MARK_READ: 'notification:mark-read',
  NOTIFICATION_UNREAD_COUNT: 'notification:unread-count',
  NOTIFICATION_CHANGED_EVENT: 'notification:changed',

  DB_BACKUP: 'db:backup',
  DB_BACKUP_TO_DESKTOP: 'db:backup-to-desktop',
  DB_RESTORE: 'db:restore',
  DB_AUTO_BACKUP: 'db:auto-backup',
  DB_INFO: 'db:info',

  EXCEL_EXPORT: 'excel:export',
  EXCEL_EXPORT_CONTRACTS: 'excel:export-contracts',
  EXCEL_EXPORT_REGIONS: 'excel:export-regions',
  EXCEL_EXPORT_ACCOUNT_TRANSACTIONS: 'excel:export-account-transactions',
  EXCEL_IMPORT: 'excel:import',

  GIPFEL_OPEN: 'open-gipfel-window',

  STOCK_SET_TOKEN: 'stock:set-token',
  STOCK_TEST_CONNECTION: 'stock:test-connection',
  STOCK_SYNC_LOG: 'stock:sync-log',
  STOCK_GET_MARKET: 'stock:get-market',
  STOCK_GET_QUOTE: 'stock:get-quote',

  CREDENTIAL_SET: 'credential:set',
  CREDENTIAL_GET: 'credential:get',
  ADMIN_GET_KEY: 'admin:get-key'
} as const

export const CONTRACT_STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'terminated', label: '终止' },
  { value: 'expired', label: '过期' }
] as const

export const CONTRACT_APPROVAL_OPTIONS = [
  { value: 'none', label: '未提交' },
  { value: 'pending', label: '待审批' },
  { value: 'approved', label: '已审批' },
  { value: 'rejected', label: '已驳回' }
] as const

export const DEFAULT_PAGE_SIZE = 20
