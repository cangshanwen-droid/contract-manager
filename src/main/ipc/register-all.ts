import { registerRegionHandlers } from './region.handler'
import { registerCompanyHandlers } from './company.handler'
import { registerContractTypeHandlers } from './contract-type.handler'
import { registerDashboardHandlers } from './dashboard.handler'
import { registerFormulaHandlers } from './formula.handler'
import { registerContractHandlers } from './contract.handler'
import { registerReportHandlers } from './report.handler'
import { registerInfraCalcHandlers } from './infra-calc.handler'
import { registerAuthHandlers } from './auth.handler'
import { registerGipfelHandlers } from './gipfel.handler'
import { registerAccountHandlers } from './account.handler'
import { registerBackupHandlers } from './backup.handler'
import { registerExcelHandlers } from './excel.handler'
import { registerStockHandlers } from './stock.handler'
import { registerStockQuoteHandlers } from './stock-quote.handler'
import { registerAnnouncementHandlers } from './announcement.handler'
import { registerAuditHandlers } from './audit.handler'
import { registerNotificationHandlers } from './notification.handler'
import { registerSystemHandlers } from './system.handler'
import { registerCredentialHandlers } from './credential.handler'

export function registerAllHandlers(): void {
  registerRegionHandlers()
  registerCompanyHandlers()
  registerContractTypeHandlers()
  registerDashboardHandlers()
  registerFormulaHandlers()
  registerContractHandlers()
  registerReportHandlers()
  registerInfraCalcHandlers()
  registerAuthHandlers()
  registerGipfelHandlers()
  registerAccountHandlers()
  registerBackupHandlers()
  registerExcelHandlers()
  registerStockHandlers()
  registerStockQuoteHandlers()
  registerAnnouncementHandlers()
  registerAuditHandlers()
  registerNotificationHandlers()
  registerSystemHandlers()
  registerCredentialHandlers()
}
