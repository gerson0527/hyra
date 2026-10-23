export type SshSettings = {
  sshUser: string
  sshPort: number
  sshKeyPath: string
  sshPassword: string
  rememberSshPassword: boolean
  useSudoDocker: boolean
}

export type SshSettingsScope = 'instance' | 'global'

const STORAGE_KEY = 'hyra_ssh_settings'
const BY_INSTANCE_KEY = 'hyra_ssh_settings_by_instance'

/** Ruta sugerida en el formulario (el servidor también prueba ~/Downloads/ssh-entornos.ppk). */
export const DEFAULT_SSH_KEY_PATH = 'C:\\Users\\TIRESIA\\Downloads\\ssh-entornos.ppk'

export const DEFAULT_SSH_SETTINGS: SshSettings = {
  sshUser: 'opc',
  sshPort: 22,
  sshKeyPath: '',
  sshPassword: '',
  rememberSshPassword: true,
  useSudoDocker: false,
}

/**
 * Instancia activa. La fija el Dashboard para que todo lo que lee la configuración
 * SSH (consola, SFTP, docker stats...) use la de la instancia que se está viendo.
 */
let activeInstanceKey: string | null = null

export function setActiveSshInstance(key: string | null): void {
  activeInstanceKey = key && key.trim() ? key.trim() : null
}

export function getActiveSshInstance(): string | null {
  return activeInstanceKey
}

function readInstanceMap(): Record<string, Partial<SshSettings>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(BY_INSTANCE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Partial<SshSettings>>) : {}
  } catch {
    return {}
  }
}

function writeInstanceMap(map: Record<string, Partial<SshSettings>>): void {
  localStorage.setItem(BY_INSTANCE_KEY, JSON.stringify(map))
}

export function loadGlobalSshSettings(): SshSettings {
  if (typeof window === 'undefined') return DEFAULT_SSH_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SSH_SETTINGS
    return { ...DEFAULT_SSH_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SSH_SETTINGS
  }
}

export function hasInstanceSshSettings(instanceKey: string | null = activeInstanceKey): boolean {
  if (!instanceKey) return false
  return Boolean(readInstanceMap()[instanceKey])
}

/** Configuración propia de la instancia si existe; si no, la general. */
export function loadSshSettings(instanceKey: string | null = activeInstanceKey): SshSettings {
  const global = loadGlobalSshSettings()
  if (!instanceKey) return global
  const own = readInstanceMap()[instanceKey]
  return own ? { ...global, ...own } : global
}

export function saveSshSettings(
  settings: SshSettings,
  scope: SshSettingsScope = 'global',
  instanceKey: string | null = activeInstanceKey,
): void {
  if (typeof window === 'undefined') return
  const payload: SshSettings = {
    ...settings,
    sshPassword: settings.rememberSshPassword ? settings.sshPassword : '',
  }

  if (scope === 'instance' && instanceKey) {
    const map = readInstanceMap()
    map[instanceKey] = payload
    writeInstanceMap(map)
    return
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

/** Quita la configuración propia: la instancia vuelve a usar la general. */
export function clearInstanceSshSettings(instanceKey: string | null = activeInstanceKey): void {
  if (typeof window === 'undefined' || !instanceKey) return
  const map = readInstanceMap()
  if (!(instanceKey in map)) return
  delete map[instanceKey]
  writeInstanceMap(map)
}

export type SshConnectionMode = 'settings' | 'root'

export function getSshSettingsForApi(
  mode: SshConnectionMode = 'settings',
): Omit<SshSettings, 'rememberSshPassword'> {
  const s = loadSshSettings()
  return {
    sshUser: mode === 'root' ? 'root' : s.sshUser,
    sshPort: s.sshPort,
    sshKeyPath: s.sshKeyPath,
    sshPassword: s.sshPassword,
    useSudoDocker: s.useSudoDocker,
  }
}
