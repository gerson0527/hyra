export type LocalDirEntry = {
  name: string
  type: 'dir' | 'file'
  size: string
  modified: string
  fullPath: string
  sizeBytes: number
  mtimeMs: number
}

export type LocalListResult = {
  path: string
  entries: LocalDirEntry[]
}

export const DEFAULT_LOCAL_WORKSPACE = 'C:\\Users\\TIRESIA\\Documents\\Gerson\\repositoriosGIT'

const LAST_LOCAL_PATH_KEY = 'hyra_local_last_path'

type HyraDesktop = {
  isDesktop?: boolean
  listLocalDir?: (dirPath: string) => Promise<LocalListResult>
  pickLocalFolder?: () => Promise<string | null>
  localDocuments?: () => Promise<string>
  defaultLocalPath?: () => Promise<string>
}

function hyraDesktop(): HyraDesktop | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { hyra?: HyraDesktop }).hyra
}

export function isHyraDesktop(): boolean {
  const hyra = hyraDesktop()
  return Boolean(hyra?.isDesktop || typeof hyra?.listLocalDir === 'function')
}

export function isLocalFsAvailable(): boolean {
  return typeof hyraDesktop()?.listLocalDir === 'function'
}

export function saveLastLocalPath(path: string): void {
  if (typeof window === 'undefined') return
  const trimmed = path.trim()
  if (trimmed) localStorage.setItem(LAST_LOCAL_PATH_KEY, trimmed)
}

export async function getDefaultLocalPath(): Promise<string> {
  if (typeof window !== 'undefined') {
    const last = localStorage.getItem(LAST_LOCAL_PATH_KEY)?.trim()
    if (last) return last
  }
  const hyra = hyraDesktop()
  if (hyra?.defaultLocalPath) {
    try {
      return await hyra.defaultLocalPath()
    } catch {
      // fallback
    }
  }
  return DEFAULT_LOCAL_WORKSPACE
}

export async function listLocalDirectory(dirPath: string): Promise<LocalListResult> {
  const hyra = hyraDesktop()
  if (!hyra?.listLocalDir) {
    throw new Error('El sistema de archivos local no está disponible. Usa la app de escritorio.')
  }
  return hyra.listLocalDir(dirPath)
}

export async function pickLocalFolder(): Promise<string | null> {
  const hyra = hyraDesktop()
  if (!hyra?.pickLocalFolder) return null
  return hyra.pickLocalFolder()
}

export function parentLocalPath(dirPath: string): string | null {
  const trimmed = dirPath.trim()
  if (!trimmed) return null
  const isWin = /^[a-zA-Z]:[\\/]/.test(trimmed)
  const withoutTrailing = trimmed.replace(/[\\/]+$/, '')
  const idx = Math.max(withoutTrailing.lastIndexOf('\\'), withoutTrailing.lastIndexOf('/'))
  if (idx <= 0) {
    if (isWin && /^[a-zA-Z]:/.test(withoutTrailing)) return `${withoutTrailing.slice(0, 2)}\\`
    return null
  }
  const parent = withoutTrailing.slice(0, idx)
  if (isWin && parent.length === 2 && parent[1] === ':') return `${parent}\\`
  return parent || (isWin ? null : '/')
}
