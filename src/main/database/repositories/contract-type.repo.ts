import { getDatabase } from '../connection'
import type { ContractType } from '../../../shared/types'

export class ContractTypeRepository {
  list(): ContractType[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM contract_types ORDER BY sort_order, name')
      .all() as ContractType[]
  }
}
