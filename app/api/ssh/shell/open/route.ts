import { NextResponse } from 'next/server'
import { getSshSession, removeSshSession, resolveSshSessionKey } from '@/lib/ssh-session'
import { isChannelOpenFailure, openInteractiveShell, resolveShellStoreKey } from '@/lib/ssh-shell'

export const runtime = 'nodejs'

type OpenBody = {
  cols?: number
  rows?: number
  shellId?: string
  container?: string | null
  useSudo?: boolean
}

export async function POST(request: Request) {
  const sessionKey = await resolveSshSessionKey()
  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
  }

  const session = getSshSession(sessionKey.key)
  if (!session || session.entornoId !== sessionKey.entornoId) {
    return NextResponse.json(
      { error: 'No hay conexión SSH activa. Pulsa «Probar SSH» primero.' },
      { status: 409 },
    )
  }

  let body: OpenBody = {}
  try {
    body = await request.json()
  } catch {
    // defaults
  }

  const shellId = body.shellId?.trim() || 'general'
  const cols = Math.max(40, Math.min(300, body.cols ?? 120))
  const rows = Math.max(8, Math.min(120, body.rows ?? 32))
  const storeKey = resolveShellStoreKey(sessionKey.key, shellId)

  try {
    await openInteractiveShell(storeKey, session.client, cols, rows, {
      container: body.container,
      useSudo: Boolean(body.useSudo),
    })
    return NextResponse.json({ ok: true, cols, rows, shellId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo abrir shell interactiva.'
    if (isChannelOpenFailure(error)) {
      // El canal fue rechazado pero la conexion SSH sigue viva: se conserva la sesion.
      return NextResponse.json(
        { error: `${message}. El servidor rechazo abrir otra consola; reintenta en unos segundos.`, retryable: true },
        { status: 503 },
      )
    }
    removeSshSession(sessionKey.key)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
