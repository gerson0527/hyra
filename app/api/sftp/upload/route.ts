import { NextResponse } from 'next/server'
import { sftpUploadFile, sftpMkdir } from '@/lib/sftp-server'
import { getSftpSession, resolveSftpSessionKey } from '@/lib/sftp-session'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { siteId, files } = body as {
      siteId: string
      files: Array<{ localPath: string; remotePath: string }>
    }

    if (!siteId || !files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: 'Faltan parámetros: siteId, files[{localPath, remotePath}]' },
        { status: 400 },
      )
    }

    const sessionKey = await resolveSftpSessionKey(siteId)
    if (!sessionKey) {
      return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
    }

    const session = getSftpSession(sessionKey.key)
    if (!session || session.entornoId !== sessionKey.entornoId) {
      return NextResponse.json({ error: 'No hay conexión SFTP activa.' }, { status: 400 })
    }

    const results: Array<{ localPath: string; remotePath: string; ok: boolean; error?: string }> = []

    for (const file of files) {
      try {
        if (!fs.existsSync(file.localPath)) {
          results.push({ ...file, ok: false, error: 'Archivo local no encontrado' })
          continue
        }
        const stat = fs.statSync(file.localPath)
        if (stat.isDirectory()) {
          results.push({ ...file, ok: false, error: 'No se puede subir una carpeta' })
          continue
        }

        // Ensure remote directory exists
        const remoteDir = path.posix.dirname(file.remotePath)
        try {
          await sftpMkdir(session.client, remoteDir)
        } catch {
          // directory likely exists already
        }

        await sftpUploadFile(session.client, file.localPath, file.remotePath)
        results.push({ ...file, ok: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al subir archivo'
        results.push({ ...file, ok: false, error: message })
      }
    }

    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0 && failed.length === files.length) {
      return NextResponse.json(
        { error: `No se pudo subir ningún archivo.\n${failed.map((f) => `- ${f.remotePath}: ${f.error}`).join('\n')}` },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al subir archivos.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
