import { NextResponse } from 'next/server'
import { getSftpSession, resolveSftpSessionKey } from '@/lib/sftp-session'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get('siteId')?.trim()
  if (!siteId) {
    return NextResponse.json({ connected: false })
  }

  const sessionKey = await resolveSftpSessionKey(siteId)
  if (!sessionKey) {
    return NextResponse.json({ connected: false })
  }

  const session = getSftpSession(sessionKey.key)
  if (!session || session.entornoId !== sessionKey.entornoId) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: true,
    host: session.host,
    port: session.port,
    username: session.username,
    siteId: session.siteId,
    siteLabel: session.siteLabel,
    remotePath: session.remotePath,
  })
}
