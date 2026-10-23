import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { INSTANCE_COOKIE } from '@/lib/entorno'

export type MysqlSession = {
  host: string
  port: number
  user: string
  entornoId: string
}

type MysqlSessionStore = Map<string, MysqlSession>

const globalStore = globalThis as typeof globalThis & {
  __hyraMysqlSessions?: MysqlSessionStore
}

function sessions(): MysqlSessionStore {
  if (!globalStore.__hyraMysqlSessions) {
    globalStore.__hyraMysqlSessions = new Map()
  }
  return globalStore.__hyraMysqlSessions
}

export function mysqlSessionKey(userKey: string, entornoId: string): string {
  return `${userKey}:${entornoId}`
}

export async function resolveMysqlSessionKey(): Promise<{ key: string; entornoId: string } | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token) : null
  const entornoId = jar.get(INSTANCE_COOKIE)?.value
  if (!session?.email || !entornoId) return null
  return { key: mysqlSessionKey(session.email, entornoId), entornoId }
}

export function getMysqlSession(key: string): MysqlSession | null {
  return sessions().get(key) ?? null
}

export function setMysqlSession(key: string, session: MysqlSession): void {
  sessions().set(key, session)
}

export function removeMysqlSession(key: string): void {
  sessions().delete(key)
}
