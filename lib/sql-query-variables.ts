import { mysqlHostForEntorno } from '@/lib/mysql-config'
import type { HyraEntorno } from '@/lib/entorno'

export const QUERY_VARIABLES_HELP =
  '{PUBLIC_IP} — tu IP pública (configúrala abajo)\n' +
  '{INSTANCE_IP} — IP de la instancia seleccionada\n' +
  '{MYSQL_HOST} — host MySQL del entorno\n' +
  '{INSTANCE_NAME} — nombre de la instancia'

export type QueryVariableContext = {
  PUBLIC_IP?: string
  INSTANCE_IP?: string
  MYSQL_HOST?: string
  INSTANCE_NAME?: string
}

export function buildQueryContext(
  entorno: Pick<HyraEntorno, 'ip' | 'mysqlHost' | 'name'>,
  publicIp = '',
): QueryVariableContext {
  return {
    PUBLIC_IP: publicIp.trim(),
    INSTANCE_IP: (entorno.ip || '').trim(),
    MYSQL_HOST: mysqlHostForEntorno(entorno),
    INSTANCE_NAME: (entorno.name || '').trim(),
  }
}

export function variablesInSql(sql: string): string[] {
  const matches = sql.match(/\{([A-Za-z_]+)\}/g) ?? []
  return [...new Set(matches.map((m) => m.slice(1, -1).toUpperCase()))]
}

export function expandQueryVariables(sql: string, context: QueryVariableContext): string {
  return sql.replace(/\{([A-Za-z_]+)\}/g, (match, key: string) => {
    const upper = key.toUpperCase()
    const value = context[upper as keyof QueryVariableContext]
    return value ? value : match
  })
}

export function missingQueryVariables(sql: string, context: QueryVariableContext): string[] {
  return variablesInSql(sql).filter((name) => {
    const value = context[name as keyof QueryVariableContext]
    return !value
  })
}

export function formatMissingVariablesMessage(missing: string[]): string {
  if (missing.length === 0) return ''
  if (missing.includes('PUBLIC_IP')) {
    return `Falta configurar tu IP pública. Usa {PUBLIC_IP} en la consulta y escríbela en «Mi IP pública».`
  }
  return `Variables sin valor: ${missing.map((v) => `{${v}}`).join(', ')}`
}
