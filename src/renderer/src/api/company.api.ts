import { IPC_CHANNELS } from '../../../shared/constants'
import type { Company } from '../../../shared/types'

const invoke = (ch: string, ...args: unknown[]) => window.api.invoke(ch, ...args)

export const companyApi = {
  list: () => invoke(IPC_CHANNELS.COMPANY_LIST) as Promise<Company[]>,
  get: (id: number) => invoke(IPC_CHANNELS.COMPANY_GET, id) as Promise<Company | undefined>,
  create: (data: Partial<Company>) =>
    invoke(IPC_CHANNELS.COMPANY_CREATE, data) as Promise<Company>,
  update: (id: number, data: Partial<Company>) =>
    invoke(IPC_CHANNELS.COMPANY_UPDATE, id, data) as Promise<Company | undefined>,
  delete: (id: number) => invoke(IPC_CHANNELS.COMPANY_DELETE, id) as Promise<{ success: boolean }>
}
