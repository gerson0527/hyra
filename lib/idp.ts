const DEFAULT_IDP_API_URL = 'https://idp.tiresia.com.co/api'

import type { HyraEntornoRaw } from '@/lib/entorno'

export type IdpMeResponse = {
  email?: string
  username?: string
  name?: string
  roles?: string[]
  perms?: string[]
  [key: string]: unknown
}

export class IdpAuthError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'IdpAuthError'
    this.status = status
  }
}

export function getIdpApiUrl(): string {
  return (process.env.IDP_API_URL ?? DEFAULT_IDP_API_URL).replace(/\/$/, '')
}

function readErrorMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return 'No se pudo iniciar sesión.'
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  return 'Correo o contraseña incorrectos.'
}

function extractToken(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const token = record.access_token ?? record.token ?? record.accessToken
  return typeof token === 'string' && token.length > 0 ? token : null
}

export async function loginToIdp(email: string, password: string): Promise<string> {
  const response = await fetch(`${getIdpApiUrl()}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  })

  let data: unknown
  try { data = await response.json() } catch { data = null }

  if (!response.ok) {
    throw new IdpAuthError(readErrorMessage(data), response.status)
  }

  const token = extractToken(data)
  if (!token) {
    throw new IdpAuthError('La API no devolvió un token de acceso.')
  }

  return token
}

export async function fetchIdpMe(idpToken: string): Promise<IdpMeResponse> {
  const response = await fetch(`${getIdpApiUrl()}/me`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${idpToken}`,
    },
    cache: 'no-store',
  })

  let data: unknown
  try { data = await response.json() } catch { data = null }

  if (!response.ok) {
    const message =
      typeof (data as { detail?: unknown } | null)?.detail === 'string'
        ? (data as { detail: string }).detail
        : 'No se pudo validar la sesión con el IDP.'
    throw new IdpAuthError(message, response.status)
  }

  return (data ?? {}) as IdpMeResponse
}

export function mapIdpMeToUser(me: IdpMeResponse, fallbackEmail: string) {
  const email = typeof me.email === 'string' ? me.email : fallbackEmail
  const name =
    (typeof me.username === 'string' && me.username) ||
    (typeof me.name === 'string' && me.name) ||
    email.split('@')[0] ||
    'Usuario'

  return { email, name }
}

async function idpFetch<T>(path: string, idpToken: string): Promise<T> {
  const response = await fetch(`${getIdpApiUrl()}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${idpToken}`,
    },
    cache: 'no-store',
  })

  let data: unknown
  try { data = await response.json() } catch { data = null }

  if (!response.ok) {
    const message =
      typeof (data as { detail?: unknown } | null)?.detail === 'string'
        ? (data as { detail: string }).detail
        : 'No se pudo obtener datos del IDP.'
    throw new IdpAuthError(message, response.status)
  }

  return data as T
}

export async function listEntornos(idpToken: string) {
  return idpFetch<HyraEntornoRaw[]>('/entornos', idpToken)
}

export async function listEntornosMaiaweb(idpToken: string): Promise<HyraEntornoRaw[]> {
  const response = await fetch(`${getIdpApiUrl()}/entornos/maiaweb`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,*/*',
      Authorization: `Bearer ${idpToken}`,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new IdpAuthError(
      `Maiaweb devolvió ${response.status}.`,
      response.status,
    )
  }

  const html = await response.text()
  return scrapeMaiawebRows(html)
}

const MAIAWEB_COLUMNS = ['nombre', 'url', 'ip', 'estado', 'fechacreacion', 'creadopor'] as const

type MaiawebColumn = (typeof MAIAWEB_COLUMNS)[number]

function getMaiawebCells(row: string): string[] {
  const cells: string[] = []
  const cellRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi
  let match: RegExpExecArray | null
  while ((match = cellRegex.exec(row)) !== null) {
    const raw = match[1]
    const text = raw
      .replace(/<button\b[\s\S]*?<\/button>/gi, '')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
    cells.push(text)
  }
  return cells
}

function pickCell(cells: string[], index: number): string {
  return (cells[index] ?? '').trim()
}

function mapMaiawebRow(row: Record<MaiawebColumn, string>, fallbackIndex: number): HyraEntornoRaw {
  const name = row.nombre || `maiaweb-${fallbackIndex}`
  const id = `maiaweb:${name}`
  return {
    id,
    nombre: name,
    ip: row.ip,
    estado: row.estado,
    fechacreacion: row.fechacreacion,
    asignado: row.creadopor,
  }
}

function scrapeMaiawebRows(html: string): HyraEntornoRaw[] {
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let match: RegExpExecArray | null
  let index = 0
  const items: HyraEntornoRaw[] = []

  while ((match = rowRegex.exec(html)) !== null) {
    const cells = getMaiawebCells(match[1])
    if (cells.length < MAIAWEB_COLUMNS.length) continue
    const row = {
      nombre: pickCell(cells, 0),
      url: pickCell(cells, 1),
      ip: pickCell(cells, 2),
      estado: pickCell(cells, 3),
      fechacreacion: pickCell(cells, 4),
      creadopor: pickCell(cells, 5),
    }
    if (!row.nombre) continue
    items.push(mapMaiawebRow(row, index))
    index += 1
  }

  return items
}

export async function getEntorno(idpToken: string, entornoId: string) {
  return idpFetch<HyraEntornoRaw>(`/entornos/${encodeURIComponent(entornoId)}`, idpToken)
}

// Consulta el estado de una máquina en la API de infra por nombre, sin importar
// de quién sea. Devuelve null si el endpoint no existe o no la encuentra.
export async function getInfraEnvironmentStatus(
  idpToken: string,
  nombre: string,
): Promise<HyraEntornoRaw | null> {
  const encoded = encodeURIComponent(nombre.trim())
  const candidates = [
    `/infra/environments/${encoded}`,
    `/infra/environments/${encoded}/status`,
  ]
  for (const path of candidates) {
    try {
      const response = await fetch(`${getIdpApiUrl()}${path}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${idpToken}`,
        },
        cache: 'no-store',
      })
      if (!response.ok) continue
      const data: unknown = await response.json().catch(() => null)
      if (!data || typeof data !== 'object') continue
      const normalized = normalizeInfraPayload(data, nombre)
      if (normalized) return normalized
    } catch {
      continue
    }
  }
  return null
}

function infraStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function normalizeInfraPayload(data: unknown, fallbackName: string): HyraEntornoRaw | null {
  if (!data || typeof data !== 'object') return null
  const root = data as Record<string, unknown>
  const nested = root.environment ?? root.data
  const src =
    nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : root
  const nombre = infraStr(src, ['nombre', 'name', 'environment']) || fallbackName
  return {
    id: infraStr(src, ['id', 'nombre', 'name', 'environment']) || fallbackName,
    nombre,
    ip: infraStr(src, ['ip', 'public_ip', 'ip_address', 'ipAddress']),
    estado: infraStr(src, ['estado', 'status', 'state']),
    fechacreacion: infraStr(src, ['fechacreacion', 'created_at', 'createdAt']),
    asignado: infraStr(src, ['asignado', 'owner', 'created_by', 'requestedByName']),
  }
}

export async function extendRuntime(idpToken: string, nombre: string, horas: number) {
  const response = await fetch(`${getIdpApiUrl()}/jobs/extend-runtime`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${idpToken}`,
    },
    body: JSON.stringify({ nombre, horas, collection: 'entornos' }),
    cache: 'no-store',
  })
  let data: unknown
  try { data = await response.json() } catch { data = null }

  if (!response.ok) {
    const message =
      typeof (data as { detail?: unknown } | null)?.detail === 'string'
        ? (data as { detail: string }).detail
        : 'No se pudo extender el tiempo.'
    throw new IdpAuthError(message, response.status)
  }

  return data
}

async function readInfraError(response: Response, fallback: string): Promise<IdpAuthError> {
  // Leer el cuerpo como texto para no perder errores no-JSON del backend.
  const text = await response.text().catch(() => '')
  let data: unknown = null
  try {
    data = text.trim() ? JSON.parse(text) : null
  } catch {
    data = null
  }
  const detail = (data as { message?: unknown; detail?: unknown; error?: unknown } | null) ?? {}
  const backendMsg =
    (typeof detail.message === 'string' && detail.message) ||
    (typeof detail.detail === 'string' && detail.detail) ||
    (typeof detail.error === 'string' && detail.error) ||
    ''
  // Si el backend no dio mensaje útil, mostrar un fragmento de la respuesta
  // cruda junto al código HTTP para poder diagnosticar.
  const rawSnippet = text.trim().replace(/\s+/g, ' ').slice(0, 300)
  const message =
    backendMsg ||
    (rawSnippet ? `${fallback} Respuesta [HTTP ${response.status}]: ${rawSnippet}` : `${fallback} (HTTP ${response.status})`)
  const withStatus = message.includes(`HTTP ${response.status}`)
    ? message
    : `${message} (HTTP ${response.status})`
  return new IdpAuthError(withStatus, response.status)
}

export async function startInstanceOnDemand(
  idpToken: string,
  nombre: string,
  horas: number,
  expiresAt: string,
  requesterName: string,
  requesterEmail: string,
) {
  const response = await fetch(
    `${getIdpApiUrl()}/infra/environments/${encodeURIComponent(nombre)}/start-on-demand`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${idpToken}`,
      },
      body: JSON.stringify({
        nombre,
        horas,
        expires_at: expiresAt,
        requestedByEmail: requesterEmail,
        requestedByName: requesterName,
      }),
      cache: 'no-store',
    },
  )

  if (!response.ok) throw await readInfraError(response, 'No se pudo iniciar la instancia.')
  return response.json().catch(() => ({}))
}

export async function stopInstanceOnDemand(
  idpToken: string,
  nombre: string,
  requesterName: string,
  requesterEmail: string,
) {
  const response = await fetch(
    `${getIdpApiUrl()}/infra/environments/${encodeURIComponent(nombre)}/stop-on-demand`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${idpToken}`,
      },
      body: JSON.stringify({
        requestedByName: requesterName,
        requestedByEmail: requesterEmail,
      }),
      cache: 'no-store',
    },
  )

  if (!response.ok) throw await readInfraError(response, 'No se pudo detener la instancia.')
  return response.json().catch(() => ({}))
}
