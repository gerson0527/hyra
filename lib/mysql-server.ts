import mysql from 'mysql2/promise'
import type { MysqlParams } from '@/lib/mysql-config'

export type MysqlQueryResult = {
  columns: string[]
  rows: (string | null)[][]
  rowCount: number
  text: string
}

export type MysqlExecResult = {
  output: string
  results: MysqlQueryResult[]
  elapsedMs: number
}

function formatTabular(columns: string[], rows: (unknown)[][]): string {
  if (!columns.length) return ''
  const lines = [columns.join('\t')]
  for (const row of rows) {
    lines.push(row.map((v) => (v == null ? '' : String(v))).join('\t'))
  }
  return lines.join('\n')
}

export function splitSqlStatements(sql: string): string[] {
  const text = (sql || '').trim()
  if (!text) return []

  const statements: string[] = []
  for (const chunk of text.split(';')) {
    const stmt = chunk.trim()
    if (!stmt) continue
    const lines = stmt
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('--'))
    const cleaned = lines.join('\n').trim()
    if (cleaned) statements.push(cleaned)
  }
  return statements
}

async function createConnection(params: MysqlParams) {
  return mysql.createConnection({
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: params.database || undefined,
    connectTimeout: 15000,
    charset: 'utf8mb4',
    ssl: undefined,
  })
}

export async function pingMysql(params: MysqlParams): Promise<void> {
  const conn = await createConnection(params)
  try {
    await conn.query('SELECT 1')
  } finally {
    await conn.end()
  }
}

export async function listMysqlDatabases(params: MysqlParams): Promise<string[]> {
  const conn = await createConnection({ ...params, database: undefined })
  try {
    const [rows] = await conn.query('SHOW DATABASES')
    const list = rows as Array<Record<string, string>>
    return list.map((row) => String(Object.values(row)[0] ?? ''))
  } finally {
    await conn.end()
  }
}

export async function executeMysqlSql(params: MysqlParams, sql: string): Promise<MysqlExecResult> {
  const started = Date.now()
  const statements = splitSqlStatements(sql)
  if (statements.length === 0) {
    return { output: 'Sin sentencias SQL.', results: [], elapsedMs: 0 }
  }

  const conn = await createConnection(params)
  const results: MysqlQueryResult[] = []
  const lines: string[] = []
  let totalAffected = 0

  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      const [rows, fields] = await conn.query(stmt)

      if (Array.isArray(fields) && fields.length > 0 && Array.isArray(rows)) {
        const columns = fields.map((f) => String(f.name))
        const data = rows as Record<string, unknown>[]
        const tableRows = data.map((row) => columns.map((col) => {
          const value = row[col]
          return value == null ? null : String(value)
        }))
        const text = formatTabular(columns, tableRows)
        results.push({ columns, rows: tableRows, rowCount: tableRows.length, text })
        lines.push(statements.length > 1 ? `[${i + 1}]\n${text}` : text)
      } else {
        const result = rows as mysql.ResultSetHeader
        const affected = typeof result?.affectedRows === 'number' ? result.affectedRows : 0
        totalAffected += affected
        const short = stmt.replace(/\s+/g, ' ')
        const preview = short.length > 72 ? `${short.slice(0, 69)}…` : short
        lines.push(
          statements.length > 1
            ? `[${i + 1}] OK — ${affected} fila(s) — ${preview}`
            : `OK (${affected} fila(s) afectada(s))`,
        )
      }
    }

    if (statements.length > 1) {
      lines.push(
        `\n✓ ${statements.length} sentencia(s) ejecutada(s) — ${totalAffected} fila(s) afectada(s) en total`,
      )
    }
  } finally {
    await conn.end()
  }

  return {
    output: lines.join('\n'),
    results,
    elapsedMs: Date.now() - started,
  }
}

export async function executeMysqlSqlBatch(
  params: MysqlParams,
  sql: string,
  databases: string[],
): Promise<MysqlExecResult> {
  const started = Date.now()
  const targets = databases.length > 0 ? databases : ['']
  const parts: string[] = []
  const errors: string[] = []
  let allResults: MysqlQueryResult[] = []

  for (const db of targets) {
    const label = db || '(sin base)'
    try {
      const result = await executeMysqlSql({ ...params, database: db || undefined }, sql)
      allResults = allResults.concat(result.results)
      if (db) {
        parts.push(`--- ${db} ---\n${result.output}`)
      } else {
        parts.push(result.output)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${label}: ${message}`)
    }
  }

  if (errors.length > 0 && parts.length === 0) {
    throw new Error(errors.join('\n'))
  }

  if (errors.length > 0) {
    parts.push(`--- Errores ---\n${errors.join('\n')}`)
  }

  return {
    output: parts.join('\n\n'),
    results: allResults,
    elapsedMs: Date.now() - started,
  }
}
