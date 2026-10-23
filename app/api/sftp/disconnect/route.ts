import { NextResponse } from 'next/server'
import { removeSftpSession, resolveSftpSessionKey } from '@/lib/sftp-session'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let siteId = ''
  try {
    const body = await request.json()
    siteId = String(body.siteId || '').trim()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido.' }, { status: 400 })
  }

  if (!siteId) {
    return NextResponse.json({ error: 'Sitio SFTP no indicado.' }, { status: 400 })
  }

  const sessionKey = await resolveSftpSessionKey(siteId)
  if (!sessionKey) {
    return NextResponse.json({ ok: true })
  }

  removeSftpSession(sessionKey.key)
  return NextResponse.json({ ok: true })
}
