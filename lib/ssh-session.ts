import { cookies } from 'next/headers'
import type { Client } from 'ssh2'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { INSTANCE_COOKIE } from '@/lib/entorno'
import { closeClient } from '@/lib/ssh-server'

export type SshSession = {
  client: Client
  username: string
  host: string
  entornoId: string
}

type SshSessionStore = Map<string, SshSession>

const globalStore = globalThis as typeof globalThis & {
  __hyraSshSessions?: SshSessionStore
}

function sessions(): SshSessionStore {
  if (!globalStore.__hyraSshSessions) {
    globalStore.__hyraSshSessions = new Map()
  }
  return globalStore.__hyraSshSessions
}

export function sshSessionKey(userKey: string, entornoId: string): string {
  return `${userKey}:${entornoId}`
}

export async function resolveSshSessionKey(): Promise<{ key: string; entornoId: string } | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token) : null
  const entornoId = jar.get(INSTANCE_COOKIE)?.value
  if (!session?.email || !entornoId) return null
  return { key: sshSessionKey(session.email, entornoId), entornoId }
}

export function getSshSession(key: string): SshSession | null {
  return sessions().get(key) ?? null
}

export function setSshSession(key: string, session: SshSession): void {
  const map = sessions()
  const existing = map.get(key)
  if (existing && existing.client !== session.client) {
    closeClient(existing.client)
  }
  map.set(key, session)

  // Persistent error handler: auto-remove session on transport error
  session.client.on('error', () => {
    const current = sessions().get(key)
    if (current && current.client === session.client) {
      removeSshSession(key)
    }
  })
}

export function removeSshSession(key: string): void {
  const map = sessions()
  const existing = map.get(key)
  if (existing) closeClient(existing.client)
  map.delete(key)
}
