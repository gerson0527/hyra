import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionPayload } from '@/lib/auth'
import { resolveSelectedEntorno } from '@/lib/entorno-server'
import { getEntorno } from '@/lib/idp'
import { normalizeSftpSite, resolveSftpHostCandidates, sftpHostFallbackIp, DEFAULT_SFTP_REMOTE_PATH } from '@/lib/sftp-sites'
import { connectSftp, formatSftpConnectError } from '@/lib/sftp-server'
import { getSftpPasswordFromEnv } from '@/lib/sftp-settings'
import {
  getSftpSession,
  removeSftpSession,
  resolveSftpSessionKey,
  setSftpSession,
} from '@/lib/sftp-session'

export const runtime = 'nodejs'

type ConnectBody = {
  siteId?: string
  site?: {
    id?: string
    label?: string
    host?: string
    port?: number
    username?: string
    defaultPath?: string
    bookmarks?: string[]
  }
  settings?: {
    sshKeyPath?: string
    keyPassphrase?: string
    password?: string
  }
  /** Host resuelto en cliente según la instancia activa. */
  resolvedHost?: string
}

export async function POST(request: Request) {
  let body: ConnectBody = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido.' }, { status: 400 })
  }

  const siteId = body.siteId?.trim() || body.site?.id?.trim()
  if (!siteId || !body.site) {
    return NextResponse.json({ error: 'Sitio SFTP no indicado.' }, { status: 400 })
  }

  const sessionKey = await resolveSftpSessionKey(siteId)
  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
  }

  const entorno = await resolveSelectedEntorno()
  if (!entorno || entorno.id !== sessionKey.entornoId) {
    return NextResponse.json({ error: 'No hay instancia seleccionada.' }, { status: 400 })
  }

  const site = normalizeSftpSite({
    id: body.site.id || siteId,
    label: body.site.label || siteId,
    host: body.site.host || '',
    port: body.site.port,
    username: body.site.username,
    defaultPath: body.site.defaultPath,
    bookmarks: body.site.bookmarks,
  })

  const entornoRef = { name: entorno.name, ip: entorno.ip, mysqlHost: entorno.mysqlHost }
  const hosts = resolveSftpHostCandidates(site, entornoRef)
  if (hosts.length === 0) {
    return NextResponse.json({ error: 'La instancia no tiene IP para SFTP.' }, { status: 400 })
  }
  const primaryHost = hosts[0]
  const fallbackIp = sftpHostFallbackIp(entornoRef)

  const settings = {
    sshKeyPath: body.settings?.sshKeyPath ?? '',
    keyPassphrase: body.settings?.keyPassphrase ?? '',
    password: body.settings?.password?.trim() || getSftpPasswordFromEnv(),
  }

  const isPasswordContainer =
    settings.password && (site.port === 23 || site.port === 27)

  let llave = entorno.llave || ''
  if (!isPasswordContainer) {
    const jar = await cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    const payload = token ? await verifySessionPayload(token) : null
    if (payload?.idpToken) {
      try {
        const detail = await getEntorno(payload.idpToken, entorno.id)
        llave = detail.llave || llave
      } catch {
        // usar llave en caché
      }
    }
  }

  const existing = getSftpSession(sessionKey.key)
  if (
    existing &&
    hosts.includes(existing.host) &&
    existing.port === site.port &&
    existing.username === site.username
  ) {
    return NextResponse.json({
      connected: true,
      host: existing.host,
      port: site.port,
      username: existing.username,
      siteId: site.id,
      siteLabel: site.label,
      remotePath: site.defaultPath || existing.remotePath || DEFAULT_SFTP_REMOTE_PATH,
      reused: true,
    })
  }
  if (existing) removeSftpSession(sessionKey.key)

  try {
    const connected = await connectSftp(
      hosts,
      site.port,
      site.username,
      settings,
      llave,
      fallbackIp,
    )
    const remotePath = site.defaultPath || DEFAULT_SFTP_REMOTE_PATH
    setSftpSession(sessionKey.key, {
      client: connected.client,
      username: connected.username,
      host: connected.host,
      port: site.port,
      siteId: site.id,
      siteLabel: site.label,
      remotePath,
      entornoId: entorno.id,
    })
    return NextResponse.json({
      connected: true,
      host: connected.host,
      port: site.port,
      username: connected.username,
      siteId: site.id,
      siteLabel: site.label,
      remotePath,
      reused: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error SFTP desconocido.'
    return NextResponse.json(
      {
        error: `No se pudo conectar SFTP a ${site.username}@${primaryHost}:${site.port}.\n${formatSftpConnectError(message, primaryHost, site.port)}`,
      },
      { status: 502 },
    )
  }
}
