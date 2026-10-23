'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const BURST_INTERVAL_MS = 4000
const NORMAL_INTERVAL_MS = 20000
const BURST_DURATION_MS = 5 * 60 * 1000

export function useEntornoAutoRefresh() {
  const router = useRouter()
  const burstUntilRef = useRef(0)
  const [bursting, setBursting] = useState(false)

  const kickRefresh = useCallback(() => {
    burstUntilRef.current = Date.now() + BURST_DURATION_MS
    setBursting(true)
    router.refresh()
  }, [router])

  useEffect(() => {
    let timeoutId = 0

    const schedule = () => {
      const active = Date.now() < burstUntilRef.current
      setBursting(active)
      router.refresh()
      const delay = active ? BURST_INTERVAL_MS : NORMAL_INTERVAL_MS
      timeoutId = window.setTimeout(schedule, delay)
    }

    schedule()
    return () => window.clearTimeout(timeoutId)
  }, [router])

  return { kickRefresh, bursting }
}
