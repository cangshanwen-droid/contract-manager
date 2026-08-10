import { IPC_CHANNELS } from '../../../shared/constants'
import type { Region } from '../../../shared/types'
import { invoke } from './cloudApi'

export const regionApi = {
  list: () => invoke(IPC_CHANNELS.REGION_LIST) as Promise<Region[]>,
  get: (id: number) => invoke(IPC_CHANNELS.REGION_GET, id) as Promise<Region | undefined>,
  create: (data: Partial<Region>) => invoke(IPC_CHANNELS.REGION_CREATE, data) as Promise<Region>,
  update: (id: number, data: Partial<Region>) =>
    invoke(IPC_CHANNELS.REGION_UPDATE, id, data) as Promise<Region | undefined>,
  delete: (id: number) => invoke(IPC_CHANNELS.REGION_DELETE, id) as Promise<{ success: boolean }>
}
