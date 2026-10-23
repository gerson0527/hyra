import { NextResponse } from 'next/server'
import { mysqlParamsForEntorno } from '@/lib/mysql-config'
import { resolveSelectedEntorno } from '@/lib/entorno-server'
import { pingMysql } from '@/lib/mysql-server'
import {
  getMysqlSession,
  removeMysqlSession,
  resolveMysqlSessionKey,
  setMysqlSession,
} from '@/lib/mysql-session'

export const runtime = 'nodejs'

export async function POST() {
  const sessionKey = await resolveMysqlSessionKey()
  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
  }

  const entorno = await resolveSelectedEntorno()
  if (!entorno || entorno.id !== sessionKey.entornoId) {
    return NextResponse.json({ error: 'No hay instancia seleccionada.' }, { status: 400 })
  }

  const params = mysqlParamsForEntorno(entorno)
  if (!params.host) {
    return NextResponse.json({ error: 'La instancia no tiene IP para MySQL.' }, { status: 400 })
  }

  const existing = getMysqlSession(sessionKey.key)
  if (existing && existing.host === params.host && existing.entornoId === sessionKey.entornoId) {
    try {
      await pingMysql(params)
      return NextResponse.json({
        connected: true,
        host: params.host,
        port: params.port,
        user: params.user,
        reused: true,
      })
    } catch {
      removeMysqlSession(sessionKey.key)
    }
  } else if (existing) {
    removeMysqlSession(sessionKey.key)
  }

  try {
    await pingMysql(params)
    setMysqlSession(sessionKey.key, {
      host: params.host,
      port: params.port,
      user: params.user,
      entornoId: sessionKey.entornoId,
    })
    return NextResponse.json({
      connected: true,
      host: params.host,
      port: params.port,
      user: params.user,
      reused: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error MySQL desconocido.'
    return NextResponse.json(
      {
        error: `No se pudo conectar a MySQL (${params.user}@${params.host}:${params.port}).\n${message}`,
      },
      { status: 502 },
    )
  }
}
