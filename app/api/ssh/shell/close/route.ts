import { NextResponse } from 'next/server'
import { resolveSshSessionKey } from '@/lib/ssh-session'
import { closeAllShellsForSession, closeInteractiveShell, resolveShellStoreKey } from '@/lib/ssh-shell'

export const runtime = 'nodejs'

type CloseBody = {
  shellId?: string
  all?: boolean
}

export async function POST(request: Request) {
  const sessionKey = await resolveSshSessionKey()
  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 })
  }

  let body: CloseBody = {}
  try {
    body = await request.json()
  } catch {
    // defaults
  }

  if (body.all) {
    closeAllShellsForSession(sessionKey.key)
  } else {
    const shellId = body.shellId?.trim() || 'general'
    closeInteractiveShell(resolveShellStoreKey(sessionKey.key, shellId))
  }

  return NextResponse.json({ ok: true })
}
