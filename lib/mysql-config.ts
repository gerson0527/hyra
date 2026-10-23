import type { HyraEntorno } from '@/lib/entorno'
import { mysqlHostFromName } from '@/lib/entorno'

export const DEFAULT_MYSQL_PORT = 3306
export const DEFAULT_MYSQL_USER = 'root'

/** Contraseña común de entornos Hyra (override con MYSQL_PASSWORD en servidor). */
export const DEFAULT_MYSQL_PASSWORD = '8S1sH6Ua5PH'

export type MysqlParams = {
  host: string
  port: number
  user: string
  password: string
  database?: string
}

export function getMysqlPassword(): string {
  return process.env.MYSQL_PASSWORD?.trim() || DEFAULT_MYSQL_PASSWORD
}

/** Host MySQL: IP de la instancia; si no hay, hostname tiresia.info. */
export function mysqlHostForEntorno(entorno: Pick<HyraEntorno, 'ip' | 'mysqlHost' | 'name'>): string {
  const ip = entorno.ip?.trim()
  if (ip) return ip
  const hostname = entorno.mysqlHost?.trim()
  if (hostname) return hostname
  return mysqlHostFromName(entorno.name || '')
}

export function mysqlParamsForEntorno(
  entorno: Pick<HyraEntorno, 'ip' | 'mysqlHost' | 'name'>,
  database = '',
): MysqlParams {
  return {
    host: mysqlHostForEntorno(entorno),
    port: DEFAULT_MYSQL_PORT,
    user: DEFAULT_MYSQL_USER,
    password: getMysqlPassword(),
    database: database.trim() || undefined,
  }
}
