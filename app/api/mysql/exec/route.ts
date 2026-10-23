import { NextResponse } from 'next/server'
import { mysqlParamsForEntorno } from '@/lib/mysql-config'
import { resolveSelectedEntorno } from '@/lib/entorno-server'
import { executeMysqlSql, executeMysqlSqlBatch } from '@/lib/mysql-server'
import { getMysqlSession, resolveMysqlSessionKey } from '@/lib/mysql-session'
import {
  buildQueryContext,
  expandQueryVariables,
  formatMissingVariablesMessage,
  missingQueryVariables,
} from '@/lib/sql-query-variables'

export const runtime = 'nodejs'

type ExecBody = {
  sql?: string
  entornoId?: string
  database?: string
  databases?: string[]
  publicIp?: string
}

export async function POST(request: Request) {
  const sessionKey = await resolveMysqlSessionKey()
  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
  }

  const session = getMysqlSession(sessionKey.key)
  if (!session || session.entornoId !== sessionKey.entornoId) {
    return NextResponse.json(
      { error: 'No hay conexión MySQL activa. Pulsa «Conectar MySQL» primero.' },
      { status: 400 },
    )
  }

  let body: ExecBody = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido.' }, { status: 400 })
  }

  if (body.entornoId && body.entornoId !== sessionKey.entornoId) {
    return NextResponse.json({ error: 'Instancia no coincide con la sesión.' }, { status: 400 })
  }

  const sql = body.sql?.trim()
  if (!sql) {
    return NextResponse.json({ error: 'Consulta SQL vacía.' }, { status: 400 })
  }

  const entorno = await resolveSelectedEntorno()
  if (!entorno) {
    return NextResponse.json({ error: 'No hay instancia seleccionada.' }, { status: 400 })
  }

  const params = mysqlParamsForEntorno(entorno)
  const databases =
    body.databases?.map((d) => d.trim()).filter(Boolean) ??
    (body.database?.trim() ? [body.database.trim()] : [])

  const context = buildQueryContext(entorno, body.publicIp || '')
  const missing = missingQueryVariables(sql, context)
  if (missing.length > 0) {
    return NextResponse.json({ error: formatMissingVariablesMessage(missing) }, { status: 400 })
  }

  const expandedSql = expandQueryVariables(sql, context)

  try {
    const result =
      databases.length > 1
        ? await executeMysqlSqlBatch(params, expandedSql, databases)
        : await executeMysqlSql(
            { ...params, database: databases[0] || undefined },
            expandedSql,
          )

    const last = result.results[result.results.length - 1]
    return NextResponse.json({
      output: result.output,
      columns: last?.columns ?? [],
      rows: last?.rows ?? [],
      rowCount: last?.rowCount ?? 0,
      elapsedMs: result.elapsedMs,
      host: params.host,
      databases,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al ejecutar SQL.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
