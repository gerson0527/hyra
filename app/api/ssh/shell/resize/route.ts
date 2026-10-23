import { NextResponse } from 'next/server'
import { resolveSshSessionKey } from '@/lib/ssh-session'
import { resolveShellStoreKey, resizeShell } from '@/lib/ssh-shell'

export const runtime = 'nodejs'

type ResizeBody = {
  shellId?: string
  cols?: number
  rows?: number
}

export async function POST(request: Request) {
  const sessionKey = await resolveSshSessionKey()
  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 })
  }

  let body: ResizeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const shellId = body.shellId?.trim() || 'general'
  const storeKey = resolveShellStoreKey(sessionKey.key, shellId)
  const cols = Math.max(40, Math.min(300, body.cols ?? 120))
  const rows = Math.max(8, Math.min(120, body.rows ?? 32))

  const ok = resizeShell(storeKey, cols, rows)
  if (!ok) {
    return NextResponse.json({ error: 'Shell no activa.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
