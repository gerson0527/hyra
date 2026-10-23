const STORAGE_KEY = 'hyra_sql_settings'

export type SqlSettings = {
  publicIp: string
}

export const DEFAULT_SQL_SETTINGS: SqlSettings = {
  publicIp: '',
}

export function loadSqlSettings(): SqlSettings {
  if (typeof window === 'undefined') return DEFAULT_SQL_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SQL_SETTINGS
    const parsed = JSON.parse(raw) as Partial<SqlSettings>
    return { ...DEFAULT_SQL_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SQL_SETTINGS
  }
}

export function saveSqlSettings(settings: SqlSettings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export async function detectPublicIp(): Promise<string> {
  const response = await fetch('https://api.ipify.org?format=text', { cache: 'no-store' })
  if (!response.ok) throw new Error('No se pudo detectar la IP pública.')
  const ip = (await response.text()).trim()
  if (!ip) throw new Error('Respuesta vacía al detectar IP.')
  return ip
}
