import { MYSQL_DOMAIN, mysqlHostFromName } from '@/lib/entorno'
import { slugify } from '@/lib/utils'

/** Slug DNS base: UNIMAIAPOS-1080-DEV → unimaiapos1080dev. */
export function sftpSlugFromInstanceName(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Hosts SFTP candidatos: slug directo primero (verificado con DNS:
 * unimaiapos1080qa.tiresia.info resuelve) y luego la variante histórica
 * WinSCP con 't' (unimaiapost...), por si existe en DNS interno.
 */
export function sftpHostnameCandidatesFromName(name: string): string[] {
  const slug = sftpSlugFromInstanceName(name)
  if (!slug) return []
  const direct = `${slug}.${MYSQL_DOMAIN}`
  const withT = slug.replace(/^unimaiapos(\d{4})/, 'unimaiapost$1')
  const tHost = withT !== slug ? `${withT}.${MYSQL_DOMAIN}` : ''
  const out = [direct]
  if (tHost && tHost !== direct) out.push(tHost)
  return out
}

/** Host SFTP principal (slug directo). */
export function sftpHostnameFromInstanceName(name: string): string {
  return sftpHostnameCandidatesFromName(name)[0] || ''
}

export type SftpSite = {
  id: string
  label: string
  host: string
  port: number
  username: string
  defaultPath: string
  bookmarks: string[]
}

const STORAGE_KEY = 'hyra_sftp_sites'
const LAST_SITE_KEY = 'hyra_sftp_last_site'

export const DEFAULT_SFTP_REMOTE_PATH = '/root'

export const DEFAULT_SFTP_SITES: SftpSite[] = [
  {
    id: 'docker_principal',
    label: 'dockerPrincipal',
    host: '',
    port: 22,
    username: 'root',
    defaultPath: DEFAULT_SFTP_REMOTE_PATH,
    bookmarks: [],
  },
  {
    id: 'erp',
    label: 'erpunidrogas',
    host: '',
    port: 27,
    username: 'root',
    defaultPath: DEFAULT_SFTP_REMOTE_PATH,
    bookmarks: ['/var/wsexternal', '/var/wsexternal_http'],
  },
  {
    id: 'pos',
    label: 'posunidrogas',
    host: '',
    port: 23,
    username: 'root',
    defaultPath: DEFAULT_SFTP_REMOTE_PATH,
    bookmarks: ['/var/www/html', '/var/log/apache2/error.log'],
  },
  {
    id: 'sucursalunidrogas',
    label: 'sucursalunidrogas',
    host: '',
    port: 23,
    username: 'root',
    defaultPath: DEFAULT_SFTP_REMOTE_PATH,
    bookmarks: [
      '/var/log/apache2/error.log',
      '/var/www/html/sieunidrogas/gestion/documentos/plantillas',
      '/var/www/repouni/unidrogas/pos/libs',
    ],
  },
  {
    id: 'ale0076',
    label: 'sucuniALE0076',
    host: '',
    port: 22,
    username: 'root',
    defaultPath: DEFAULT_SFTP_REMOTE_PATH,
    bookmarks: [],
  },
  {
    id: 'apibiometricos',
    label: 'apibiometricos',
    host: '',
    port: 22,
    username: 'root',
    defaultPath: DEFAULT_SFTP_REMOTE_PATH,
    bookmarks: [],
  },
]

export function normalizeSftpSite(site: Partial<SftpSite> & { label: string }): SftpSite {
  const rawPath = (site.defaultPath || DEFAULT_SFTP_REMOTE_PATH).trim() || DEFAULT_SFTP_REMOTE_PATH
  const defaultPath =
    rawPath === '/home/opc' || rawPath === '/var/www/repouni/unidrogas/pos/libs'
      ? DEFAULT_SFTP_REMOTE_PATH
      : rawPath

  return {
    id: site.id || slugify(site.label) || 'sitio',
    label: site.label.trim() || 'Sitio',
    host: (site.host || '').trim(),
    port: Number(site.port) || 22,
    username: (site.username || 'root').trim() || 'root',
    defaultPath,
    bookmarks: Array.isArray(site.bookmarks)
      ? site.bookmarks.map((b) => b.trim()).filter(Boolean)
      : [],
  }
}

export function loadSftpSites(): SftpSite[] {
  if (typeof window === 'undefined') return DEFAULT_SFTP_SITES
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SFTP_SITES
    const parsed = JSON.parse(raw) as SftpSite[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SFTP_SITES
    return parsed.map((s) => normalizeSftpSite(s))
  } catch {
    return DEFAULT_SFTP_SITES
  }
}

export function saveSftpSites(sites: SftpSite[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sites.map((s) => normalizeSftpSite(s))))
}

export function resetSftpSites(): SftpSite[] {
  saveSftpSites(DEFAULT_SFTP_SITES)
  return DEFAULT_SFTP_SITES
}

export function getSftpSiteById(sites: SftpSite[], siteId: string): SftpSite | undefined {
  return sites.find((s) => s.id === siteId)
}

export type SftpEntornoRef = {
  name: string
  ip?: string
  mysqlHost?: string
}

/** Host WinSCP: dominio tiresia.info con slug SFTP (puede diferir de MySQL). */
export function sftpHostForEntorno(entorno: SftpEntornoRef, fallbackIp = ''): string {
  const hostname =
    sftpHostnameFromInstanceName(entorno.name) ||
    entorno.mysqlHost?.trim() ||
    mysqlHostFromName(entorno.name)
  if (hostname) return hostname
  return (entorno.ip || fallbackIp).trim()
}

/** Orden WinSCP: host del sitio → candidatos DNS (directo, variante 't') → IP. */
export function resolveSftpHostCandidates(
  site: SftpSite,
  entorno: SftpEntornoRef,
  fallbackIp = '',
): string[] {
  const custom = (site.host || '').trim()
  if (custom) return [custom]

  const hosts = sftpHostnameCandidatesFromName(entorno.name)
  const ip = (entorno.ip || fallbackIp).trim()
  if (ip && !hosts.includes(ip)) hosts.push(ip)
  return hosts
}

export function sftpHostFallbackIp(entorno: SftpEntornoRef, fallbackIp = ''): string {
  return (entorno.ip || fallbackIp).trim()
}

/** Host principal en UI (dominio tiresia.info como WinSCP). */
export function resolveSftpHost(
  site: SftpSite,
  entorno: SftpEntornoRef,
  fallbackIp = '',
): string {
  const candidates = resolveSftpHostCandidates(site, entorno, fallbackIp)
  return candidates[0] || ''
}

/** Elige el sitio cuyo id/label coincide mejor con el nombre de la instancia. */
export function pickSftpSiteForInstance(sites: SftpSite[], instanceName: string): string | undefined {
  const normInst = instanceName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!normInst || sites.length === 0) return undefined

  let bestId: string | undefined
  let bestLen = 0
  for (const site of sites) {
    for (const cand of [site.id, site.label]) {
      const norm = cand.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!norm) continue
      if (norm.includes(normInst) || normInst.includes(norm)) {
        if (norm.length > bestLen) {
          bestLen = norm.length
          bestId = site.id
        }
      }
    }
  }
  return bestId
}

export function loadLastSftpSiteId(entornoId: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = localStorage.getItem(LAST_SITE_KEY)
    if (!raw) return ''
    const map = JSON.parse(raw) as Record<string, string>
    return map[entornoId] || ''
  } catch {
    return ''
  }
}

export function saveLastSftpSiteId(entornoId: string, siteId: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(LAST_SITE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    map[entornoId] = siteId
    localStorage.setItem(LAST_SITE_KEY, JSON.stringify(map))
  } catch {
    localStorage.setItem(LAST_SITE_KEY, JSON.stringify({ [entornoId]: siteId }))
  }
}
