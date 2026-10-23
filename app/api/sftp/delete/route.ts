import { NextResponse } from 'next/server'
import { sftpDelete } from '@/lib/sftp-server'
import { getSftpSession, resolveSftpSessionKey } from '@/lib/sftp-session'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { siteId, path, isDir } = body as { siteId: string; path: string; isDir?: boolean }

    if (!siteId || !path) {
      return NextResponse.json({ error: 'Faltan parámetros: siteId, path' }, { status: 400 })
    }

    const sessionKey = await resolveSftpSessionKey(siteId)
    if (!sessionKey) {
      return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
    }

    const session = getSftpSession(sessionKey.key)
    if (!session || session.entornoId !== sessionKey.entornoId) {
      return NextResponse.json({ error: 'No hay conexión SFTP activa.' }, { status: 400 })
    }

    await sftpDelete(session.client, path, Boolean(isDir))
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al eliminar.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
