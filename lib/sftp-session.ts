import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { INSTANCE_COOKIE } from '@/lib/entorno'
import type { Client } from 'ssh2'
import { closeClient } from '@/lib/sftp-server'

export type SftpSession = {
  client: Client
  username: string
  host: string
  port: number
  siteId: string
  siteLabel: string
  remotePath: string
  entornoId: string
}

type SftpSessionStore = Map<string, SftpSession>

const globalStore = globalThis as typeof globalThis & {
  __hyraSftpSessions?: SftpSessionStore
}

function sessions(): SftpSessionStore {
  if (!globalStore.__hyraSftpSessions) {
    globalStore.__hyraSftpSessions = new Map()
  }
  return globalStore.__hyraSftpSessions
}

export function sftpSessionKey(userKey: string, entornoId: string, siteId: string): string {
  return `${userKey}:${entornoId}:sftp:${siteId}`
}

export async function resolveSftpSessionKey(
  siteId?: string,
): Promise<{ key: string; entornoId: string; siteId: string } | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token) : null
  const entornoId = jar.get(INSTANCE_COOKIE)?.value
  if (!session?.email || !entornoId || !siteId) return null
  return { key: sftpSessionKey(session.email, entornoId, siteId), entornoId, siteId }
}

export function getSftpSession(key: string): SftpSession | null {
  return sessions().get(key) ?? null
}

export function setSftpSession(key: string, session: SftpSession): void {
  const map = sessions()
  const existing = map.get(key)
  if (existing && existing.client !== session.client) {
    closeClient(existing.client)
  }
  map.set(key, session)
}

export function removeSftpSession(key: string): void {
  const map = sessions()
  const existing = map.get(key)
  if (existing) closeClient(existing.client)
  map.delete(key)
}

export function removeSftpSessionsForEntorno(userKey: string, entornoId: string): void {
  const prefix = `${userKey}:${entornoId}:sftp:`
  for (const key of [...sessions().keys()]) {
    if (key.startsWith(prefix)) removeSftpSession(key)
  }
}
