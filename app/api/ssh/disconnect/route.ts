import { NextResponse } from 'next/server'
import { removeSshSession, resolveSshSessionKey } from '@/lib/ssh-session'
import { closeAllShellsForSession } from '@/lib/ssh-shell'

export const runtime = 'nodejs'

export async function POST() {
  const sessionKey = await resolveSshSessionKey()
  if (sessionKey) {
    closeAllShellsForSession(sessionKey.key)
    removeSshSession(sessionKey.key)
  }
  return NextResponse.json({ connected: false })
}
