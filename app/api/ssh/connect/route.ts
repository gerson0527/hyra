import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionPayload } from '@/lib/auth'
import { resolveSelectedEntorno, resolveSelectedEntornoId } from '@/lib/entorno-server'
import { getEntorno } from '@/lib/idp'
import {
  buildConnectAttempts,
  connectWithFallback,
  execOnClient,
} from '@/lib/ssh-server'
import {
  getSshSession,
  removeSshSession,
  resolveSshSessionKey,
  setSshSession,
} from '@/lib/ssh-session'

export const runtime = 'nodejs'

type ConnectBody = {
  entornoId?: string
  host?: string
  settings?: {
    sshUser?: string
    sshPort?: number
    sshKeyPath?: string
    sshPassword?: string
  }
}

async function resolveConnectTarget(body: ConnectBody): Promise<{
  entornoId: string
  host: string
  llave: string
} | null> {
  const cookieEntornoId = await resolveSelectedEntornoId()
  const entornoId = cookieEntornoId || body.entornoId?.trim() || ''
  if (!entornoId) return null

  if (body.entornoId && cookieEntornoId && body.entornoId !== cookieEntornoId) {
    return null
  }

  let host = body.host?.trim() || ''
  let llave = ''

  const entorno = await resolveSelectedEntorno()
  if (entorno && entorno.id === entornoId) {
    host = entorno.ip || host
    llave = entorno.llave || ''
  }

  if (!host) return null

  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  const payload = token ? await verifySessionPayload(token) : null
  if (payload?.idpToken) {
    try {
      const detail = await getEntorno(payload.idpToken, entornoId)
      host = detail.ip || host
      llave = detail.llave || llave
    } catch {
      // usar datos del body / caché
    }
  }

  return { entornoId, host, llave }
}

export async function POST(request: Request) {
  const sessionKey = await resolveSshSessionKey()

  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
  }

  let body: ConnectBody = {}
  try {
    body = await request.json()
  } catch {
    // defaults
  }

  const target = await resolveConnectTarget(body)
  if (!target) {
    return NextResponse.json({ error: 'No hay instancia seleccionada o sin IP.' }, { status: 400 })
  }

  const settings = {
    sshUser: body.settings?.sshUser ?? 'opc',
    sshPort: body.settings?.sshPort ?? 22,
    sshKeyPath: body.settings?.sshKeyPath ?? '',
    sshPassword: body.settings?.sshPassword ?? '',
  }

  const existing = getSshSession(sessionKey.key)
  if (
    existing &&
    existing.host === target.host &&
    existing.entornoId === target.entornoId
  ) {
    try {
      await execOnClient(existing.client, 'echo hyra-ssh-ok', 10000)
      return NextResponse.json({
        connected: true,
        host: existing.host,
        username: existing.username,
        reused: true,
      })
    } catch {
      removeSshSession(sessionKey.key)
    }
  } else if (existing) {
    removeSshSession(sessionKey.key)
  }

  const { attempts, keyPathError, keyPath } = await buildConnectAttempts(
    target.host,
    settings,
    target.llave,
    'settings',
  )

  if (attempts.length === 0) {
    const parts = [
      keyPathError ? `No se pudo leer la llave (${keyPath || 'sin ruta'}): ${keyPathError}` : null,
      'Configura SSH: llave .ppk/.pem, contraseña o llave Hyra.',
    ].filter(Boolean)
    return NextResponse.json({ error: parts.join('\n') }, { status: 400 })
  }

  try {
    const connected = await connectWithFallback(attempts)
    await execOnClient(connected.client, 'echo hyra-ssh-ok', 10000)

    setSshSession(sessionKey.key, {
      client: connected.client,
      username: connected.username,
      host: target.host,
      entornoId: target.entornoId,
    })

    return NextResponse.json({
      connected: true,
      host: target.host,
      username: connected.username,
      reused: false,
    })
  } catch (error) {
    const authError = error instanceof Error ? error.message : 'Error SSH desconocido.'
    const message = keyPathError ? `Llave: ${keyPathError}\n\n${authError}` : authError
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
