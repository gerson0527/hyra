import type { InstanceStatus } from '@/lib/types'

export const INSTANCE_COOKIE = 'hyra_selected_env'
export const MYSQL_DOMAIN = 'tiresia.info'
export const WEBHOOK_BASE = 'https://entornos-n8n.tiresia.com.co/webhook'

export type HyraEntornoRaw = {
  id: string
  nombre?: string | null
  ip?: string | null
  estado?: string | null
  estadotarea?: string | null
  asignado?: string | null
  informador?: string | null
  cliente?: string | null
  fechacreacion?: string | null
  habilitacion?: string | null
  expires_at?: string | null
  llave?: string | null
  ocid?: string | null
}

export type HyraEntorno = {
  id: string
  name: string
  ip: string
  estado: string
  statusText: string
  estadotarea: string
  asignado: string
  informador: string
  cliente: string
  fechacreacion: string
  habilitacion: string
  expiresAt: string
  llave: string
  mysqlHost: string
}

export type EntornoStats = {
  total: number
  running: number
  stopped: number
  partial: number
}

export type EntornoStatusFilter = 'todos' | 'corriendo' | 'detenido' | 'parcial'

export function mysqlHostFromName(name: string): string {
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return slug ? `${slug}.${MYSQL_DOMAIN}` : ''
}

export function normalizeStatusKey(status: string): string {
  const s = (status || '').toLowerCase()
  if (s.startsWith('corriendo') || s === 'running') return 'corriendo'
  if (s.startsWith('detenido') || s === 'stopped' || s === 'detenida') return 'detenido'
  if (s.startsWith('parcial') || s.startsWith('iniciando') || s.startsWith('deteniendose')) return 'parcial'
  return 'desconocido'
}

export function statusKeyFromEntorno(entorno: HyraEntorno): string {
  return normalizeStatusKey(entorno.statusText || entorno.estado)
}

export function mapToInstanceStatus(statusKey: string): InstanceStatus {
  if (statusKey === 'corriendo') return 'running'
  if (statusKey === 'parcial') return 'partial'
  return 'stopped'
}

export function parseEntorno(raw: HyraEntornoRaw): HyraEntorno {
  const name = raw.nombre || raw.id || 'Sin nombre'
  const estado = (raw.estado || 'desconocido').toLowerCase()
  const statusText = normalizeStatusKey(estado)

  return {
    id: raw.id,
    name,
    ip: raw.ip || '',
    estado,
    statusText: statusText === 'desconocido' ? estado : statusText,
    estadotarea: raw.estadotarea || '',
    asignado: raw.asignado || '',
    informador: raw.informador || '',
    cliente: raw.cliente || '',
    fechacreacion: raw.fechacreacion || '',
    habilitacion: raw.habilitacion || '',
    expiresAt: raw.expires_at || '',
    llave: raw.llave || '',
    mysqlHost: mysqlHostFromName(name),
  }
}

export function parseEntornos(items: HyraEntornoRaw[]): HyraEntorno[] {
  return (items || []).map(parseEntorno)
}

export function computeEntornoStats(entornos: HyraEntorno[]): EntornoStats {
  let running = 0
  let stopped = 0
  let partial = 0

  for (const env of entornos) {
    const key = statusKeyFromEntorno(env)
    if (key === 'corriendo') running += 1
    else if (key === 'parcial') partial += 1
    else if (key === 'detenido') stopped += 1
  }

  return { total: entornos.length, running, stopped, partial }
}

export function filterEntornos(
  entornos: HyraEntorno[],
  search: string,
  status: EntornoStatusFilter,
): HyraEntorno[] {
  const q = search.trim().toLowerCase()

  return entornos.filter((env) => {
    const key = statusKeyFromEntorno(env)
    if (status === 'corriendo' && key !== 'corriendo') return false
    if (status === 'detenido' && key !== 'detenido') return false
    if (status === 'parcial' && key !== 'parcial') return false

    if (!q) return true

    const haystack = [env.name, env.id, env.ip, env.asignado, env.estadotarea, env.cliente]
      .join(' ')
      .toLowerCase()

    return haystack.includes(q)
  })
}

export function inferPreset(name: string): 'ERP' | 'POS' | 'Sucursal' {
  const upper = name.toUpperCase()
  if (upper.includes('ERP')) return 'ERP'
  if (upper.includes('SUC')) return 'Sucursal'
  return 'POS'
}

export function statusBadgeLabel(statusKey: string): string {
  if (statusKey === 'corriendo' || statusKey === 'detenido' || statusKey === 'parcial') {
    return statusKey
  }
  return statusKey || 'desconocido'
}
