import { useState, useEffect, useCallback } from 'react'
import { regionApi } from '../api/region.api'
import type { Region } from '../../../shared/types'

export function useRegions() {
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await regionApi.list()
      setRegions(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { regions, loading, reload: load }
}
