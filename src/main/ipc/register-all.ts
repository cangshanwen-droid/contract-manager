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
}
