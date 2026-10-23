import { NextResponse } from 'next/server'
import { execOnClient } from '@/lib/ssh-server'
import { getSshSession, resolveSshSessionKey } from '@/lib/ssh-session'

export const runtime = 'nodejs'

type ContainerStat = {
  name: string
  cpu: string
  mem: string
}

export async function GET() {
  const sessionKey = await resolveSshSessionKey()
  if (!sessionKey) {
    return NextResponse.json({ containers: [], list: [] })
  }
  const session = getSshSession(sessionKey.key)
  if (!session) {
    return NextResponse.json({ containers: [], list: [] })
  }
  try {
    // Get docker stats (CPU/mem) and ps (container list) in parallel
    const [statsResult, psResult] = await Promise.all([
      execOnClient(
        session.client,
        'sudo docker stats --no-stream --format "{{json .}}" 2>/dev/null | head -20',
        15000,
      ).catch(() => ({ stdout: '' }) as any),
      execOnClient(
        session.client,
        'sudo docker ps -a --format "{{json .}}" 2>/dev/null | head -20',
        15000,
      ).catch(() => ({ stdout: '' }) as any),
    ])

    const stats: ContainerStat[] = []
    for (const line of (statsResult.stdout || '').trim().split('\n').filter(Boolean)) {
      try {
        const s = JSON.parse(line)
        stats.push({ name: s.Name, cpu: s.CPUPerc || '0%', mem: s.MemPerc || '0%' })
      } catch { /* skip */ }
    }

    const list: any[] = []
    for (const line of (psResult.stdout || '').trim().split('\n').filter(Boolean)) {
      try {
        const p = JSON.parse(line)
        list.push({
          name: p.Names,
          image: p.Image,
          status: p.State === 'running' ? 'up' : 'exited',
          uptime: p.Status || '—',
          ports: p.Ports || '—',
        })
      } catch { /* skip */ }
    }

    return NextResponse.json({ containers: stats, list })
  } catch {
    return NextResponse.json({ containers: [], list: [] })
  }
}
