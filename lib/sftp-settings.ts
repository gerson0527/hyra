import { DEFAULT_MYSQL_PASSWORD } from '@/lib/mysql-config'

/** Contraseña SSH/SFTP de root en contenedores Hyra (distinta de MySQL). */
export const DEFAULT_SFTP_PASSWORD = 'nm7ZE2Z1r7GK*'

export function getSftpPasswordFromEnv(): string {
  return process.env.SFTP_PASSWORD?.trim() || DEFAULT_SFTP_PASSWORD
}


export type SftpSettings = {
  sftpPassword: string
  rememberSftpPassword: boolean
}

const STORAGE_KEY = 'hyra_sftp_settings'

export const DEFAULT_SFTP_SETTINGS: SftpSettings = {
  sftpPassword: DEFAULT_SFTP_PASSWORD,
  rememberSftpPassword: true,
}

function migrateStoredPassword(password: string): string {
  if (!password.trim() || password === DEFAULT_MYSQL_PASSWORD) {
    return DEFAULT_SFTP_PASSWORD
  }
  return password
}

export function loadSftpSettings(): SftpSettings {
  if (typeof window === 'undefined') return DEFAULT_SFTP_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SFTP_SETTINGS
    const parsed = { ...DEFAULT_SFTP_SETTINGS, ...JSON.parse(raw) } as SftpSettings
    return {
      ...parsed,
      sftpPassword: migrateStoredPassword(parsed.sftpPassword),
    }
  } catch {
    return DEFAULT_SFTP_SETTINGS
  }
}

export function saveSftpSettings(settings: SftpSettings): void {
  if (typeof window === 'undefined') return
  const payload: SftpSettings = {
    ...settings,
    sftpPassword: settings.rememberSftpPassword ? settings.sftpPassword : '',
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function getSftpPasswordForConnect(): string {
  const s = loadSftpSettings()
  return s.sftpPassword.trim()
}
