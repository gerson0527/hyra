import { NextResponse } from 'next/server'
import { sftpDownloadFile } from '@/lib/sftp-server'
import { getSftpSession, resolveSftpSessionKey } from '@/lib/sftp-session'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { siteId, path } = body as { siteId: string; path: string }

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

    const data = await sftpDownloadFile(session.client, path)
    const filename = path.split('/').pop() || 'download'

    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(data.length),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al descargar.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
