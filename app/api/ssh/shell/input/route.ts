import { NextResponse } from 'next/server'
import { resolveSshSessionKey } from '@/lib/ssh-session'
import { resolveShellStoreKey, writeToShell } from '@/lib/ssh-shell'

export const runtime = 'nodejs'

type InputBody = {
  shellId?: string
  data?: string
}

export async function POST(request: Request) {
  const sessionKey = await resolveSshSessionKey()
  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 })
  }

  let body: InputBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const shellId = body.shellId?.trim() || 'general'
  const storeKey = resolveShellStoreKey(sessionKey.key, shellId)
  const data = body.data ?? ''
  if (!data) {
    return NextResponse.json({ error: 'Sin datos.' }, { status: 400 })
  }

  const ok = writeToShell(storeKey, data)
  if (!ok) {
    return NextResponse.json({ error: 'Shell no activa.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
