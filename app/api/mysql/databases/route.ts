import { NextResponse } from 'next/server'
import { mysqlParamsForEntorno } from '@/lib/mysql-config'
import { resolveSelectedEntorno } from '@/lib/entorno-server'
import { listMysqlDatabases } from '@/lib/mysql-server'
import { getMysqlSession, resolveMysqlSessionKey } from '@/lib/mysql-session'

export const runtime = 'nodejs'

export async function GET() {
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

  const entorno = await resolveSelectedEntorno()
  if (!entorno) {
    return NextResponse.json({ error: 'No hay instancia seleccionada.' }, { status: 400 })
  }

  const params = mysqlParamsForEntorno(entorno)

  try {
    const databases = await listMysqlDatabases(params)
    return NextResponse.json({ databases, host: params.host })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al listar bases de datos.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
