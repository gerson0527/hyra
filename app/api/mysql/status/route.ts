import { NextResponse } from 'next/server'
import { getMysqlSession, resolveMysqlSessionKey } from '@/lib/mysql-session'

export const runtime = 'nodejs'

export async function GET() {
  const sessionKey = await resolveMysqlSessionKey()
  if (!sessionKey) {
    return NextResponse.json({ connected: false })
  }

  const session = getMysqlSession(sessionKey.key)
  if (!session || session.entornoId !== sessionKey.entornoId) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: true,
    host: session.host,
    port: session.port,
    user: session.user,
  })
}
