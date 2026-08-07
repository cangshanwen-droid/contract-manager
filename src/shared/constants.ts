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
  CONTRACT_DELETE: 'contract:delete',
  CONTRACT_SUMMARIZE: 'contract:summarize',

  CONTRACT_TYPE_LIST: 'contract-type:list',

  INFRA_TYPE_LIST: 'infra-type:list',

  DASHBOARD_SUMMARY: 'dashboard:summary',

  FORMULA_CALCULATE: 'formula:calculate',
  FORMULA_LOG_LIST: 'formula:log-list',

  REPORT_LAND_AREA: 'report:land-area',
  REPORT_LAND_AREA_BY_REGION: 'report:land-area-by-region',

  FILE_SELECT: 'file:select',
  FILE_OPEN: 'file:open',

  INFRA_CALC_LOAD: 'infra-calc:load',

  AUTH_LOGIN: 'auth:login',
  AUTH_REGISTER: 'auth:register',
  AUTH_CHANGE_PASSWORD: 'auth:change-password',

  ACCOUNT_LIST: 'account:list',
  ACCOUNT_GET: 'account:get',
  ACCOUNT_TRANSACTIONS: 'account:transactions',
  ACCOUNT_ADD_TRANSACTION: 'account:add-transaction',
  ACCOUNT_SUMMARY: 'account:summary',

  DB_BACKUP: 'db:backup',
  DB_AUTO_BACKUP: 'db:auto-backup',
  DB_INFO: 'db:info',

  EXCEL_EXPORT: 'excel:export',
  EXCEL_IMPORT: 'excel:import'
} as const

export const CONTRACT_STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'terminated', label: '终止' },
  { value: 'expired', label: '过期' }
] as const

export const DEFAULT_PAGE_SIZE = 20
