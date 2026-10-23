import { NextResponse } from 'next/server'
import { sftpListDirectory } from '@/lib/sftp-server'
import { getSftpSession, resolveSftpSessionKey } from '@/lib/sftp-session'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const siteId = params.get('siteId')?.trim()
  const path = params.get('path')?.trim()

  if (!siteId) {
    return NextResponse.json({ error: 'Sitio SFTP no indicado.' }, { status: 400 })
  }

  const sessionKey = await resolveSftpSessionKey(siteId)
  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
  }

  const session = getSftpSession(sessionKey.key)
  if (!session || session.entornoId !== sessionKey.entornoId) {
    return NextResponse.json(
      { error: 'No hay conexión SFTP activa. Pulsa «Conectar SFTP» primero.' },
      { status: 400 },
    )
  }

  const targetPath = path || session.remotePath || '/'

  try {
    const result = await sftpListDirectory(session.client, targetPath)
    session.remotePath = result.path
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo listar el directorio.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
