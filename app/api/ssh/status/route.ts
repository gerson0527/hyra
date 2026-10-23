import { NextResponse } from 'next/server'
import { execOnClient } from '@/lib/ssh-server'
import { getSshSession, removeSshSession, resolveSshSessionKey } from '@/lib/ssh-session'

export const runtime = 'nodejs'

export async function GET() {
  const sessionKey = await resolveSshSessionKey()

  if (!sessionKey) {
    return NextResponse.json({ connected: false })
  }

  const session = getSshSession(sessionKey.key)
  if (!session || session.entornoId !== sessionKey.entornoId) {
    return NextResponse.json({ connected: false })
  }

  try {
    await execOnClient(session.client, 'echo hyra-ssh-ok', 8000)
    return NextResponse.json({
      connected: true,
      host: session.host,
      username: session.username,
    })
  } catch {
    removeSshSession(sessionKey.key)
    return NextResponse.json({ connected: false })
  }
}
