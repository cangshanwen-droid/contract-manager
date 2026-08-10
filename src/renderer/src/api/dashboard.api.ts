import { IPC_CHANNELS } from '../../../shared/constants'
import type { DashboardSummary, InfrastructureType, FormulaInput, FormulaOutput, FormulaLog } from '../../../shared/types'
import { invoke } from './cloudApi'

export const dashboardApi = {
  summary: () => invoke(IPC_CHANNELS.DASHBOARD_SUMMARY) as Promise<DashboardSummary>,
  infraTypes: () => invoke(IPC_CHANNELS.INFRA_TYPE_LIST) as Promise<InfrastructureType[]>
}

export const formulaApi = {
  calculate: (input: FormulaInput) =>
    invoke(IPC_CHANNELS.FORMULA_CALCULATE, input) as Promise<FormulaOutput>,
  logs: (regionId: number) =>
    invoke(IPC_CHANNELS.FORMULA_LOG_LIST, regionId) as Promise<FormulaLog[]>
}

export const api = {
  region: {
    list: () => invoke(IPC_CHANNELS.REGION_LIST) as Promise<any[]>,
    get: (id: number) => invoke(IPC_CHANNELS.REGION_GET, id),
    create: (data: any) => invoke(IPC_CHANNELS.REGION_CREATE, data),
    update: (id: number, data: any) => invoke(IPC_CHANNELS.REGION_UPDATE, id, data),
    delete: (id: number) => invoke(IPC_CHANNELS.REGION_DELETE, id)
  },
  company: {
    list: () => invoke(IPC_CHANNELS.COMPANY_LIST) as Promise<any[]>,
    get: (id: number) => invoke(IPC_CHANNELS.COMPANY_GET, id),
    create: (data: any) => invoke(IPC_CHANNELS.COMPANY_CREATE, data),
    update: (id: number, data: any) => invoke(IPC_CHANNELS.COMPANY_UPDATE, id, data),
    delete: (id: number) => invoke(IPC_CHANNELS.COMPANY_DELETE, id)
  },
  contract: {
    list: (regionId?: number) => invoke(IPC_CHANNELS.CONTRACT_LIST, regionId) as Promise<any[]>,
    get: (id: number) => invoke(IPC_CHANNELS.CONTRACT_GET, id),
    create: (data: any) => invoke(IPC_CHANNELS.CONTRACT_CREATE, data),
    delete: (id: number) => invoke(IPC_CHANNELS.CONTRACT_DELETE, id),
    summarize: (regionId: number) => invoke(IPC_CHANNELS.CONTRACT_SUMMARIZE, regionId)
  },
  contractType: {
    list: () => invoke(IPC_CHANNELS.CONTRACT_TYPE_LIST) as Promise<any[]>
  },
  infraType: {
    list: () => invoke(IPC_CHANNELS.INFRA_TYPE_LIST) as Promise<any[]>
  },
  formula: {
    calculate: (input: FormulaInput) => invoke(IPC_CHANNELS.FORMULA_CALCULATE, input) as Promise<FormulaOutput>,
    logs: (regionId: number) => invoke(IPC_CHANNELS.FORMULA_LOG_LIST, regionId) as Promise<FormulaLog[]>
  },
  dashboard: {
    summary: () => invoke(IPC_CHANNELS.DASHBOARD_SUMMARY) as Promise<DashboardSummary>
  }
}
