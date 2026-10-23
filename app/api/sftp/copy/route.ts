import { NextResponse } from 'next/server'
import { sftpCopy } from '@/lib/sftp-server'
import { getSftpSession, resolveSftpSessionKey } from '@/lib/sftp-session'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { siteId, src, dest } = body as { siteId: string; src: string; dest: string }

    if (!siteId || !src || !dest) {
      return NextResponse.json({ error: 'Faltan parámetros: siteId, src, dest' }, { status: 400 })
    }

    const sessionKey = await resolveSftpSessionKey(siteId)
    if (!sessionKey) {
      return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
    }

    const session = getSftpSession(sessionKey.key)
    if (!session || session.entornoId !== sessionKey.entornoId) {
      return NextResponse.json({ error: 'No hay conexión SFTP activa.' }, { status: 400 })
    }

    await sftpCopy(session.client, src, dest)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al copiar.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
