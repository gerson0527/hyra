const LOCAL_KEY = 'hyra_file_bookmarks_local'
const REMOTE_KEY = 'hyra_file_bookmarks_remote'

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

function normalizePath(path: string): string {
  return path.trim().replace(/[\\/]+$/, '')
}

export function loadLocalBookmarks(): string[] {
  const items = readJson<string[]>(LOCAL_KEY, [])
  return [...new Set(items.map(normalizePath).filter(Boolean))]
}

export function saveLocalBookmarks(bookmarks: string[]): void {
  writeJson(
    LOCAL_KEY,
    [...new Set(bookmarks.map(normalizePath).filter(Boolean))],
  )
}

export function addLocalBookmark(path: string): string[] {
  const normalized = normalizePath(path)
  if (!normalized) return loadLocalBookmarks()
  const next = [...loadLocalBookmarks()]
  if (!next.includes(normalized)) next.push(normalized)
  saveLocalBookmarks(next)
  return next
}

export function removeLocalBookmark(path: string): string[] {
  const normalized = normalizePath(path)
  const next = loadLocalBookmarks().filter((item) => item !== normalized)
  saveLocalBookmarks(next)
  return next
}

export function loadRemoteBookmarks(siteId: string, seed: string[] = []): string[] {
  const all = readJson<Record<string, string[]>>(REMOTE_KEY, {})
  const stored = all[siteId] ?? []
  const merged = [...new Set([...seed, ...stored].map(normalizePath).filter(Boolean))]
  return merged
}

export function saveRemoteBookmarks(siteId: string, bookmarks: string[]): void {
  const all = readJson<Record<string, string[]>>(REMOTE_KEY, {})
  all[siteId] = [...new Set(bookmarks.map(normalizePath).filter(Boolean))]
  writeJson(REMOTE_KEY, all)
}

export function addRemoteBookmark(siteId: string, path: string, seed: string[] = []): string[] {
  const normalized = normalizePath(path)
  if (!normalized) return loadRemoteBookmarks(siteId, seed)
  const current = loadRemoteBookmarks(siteId, seed)
  if (current.includes(normalized)) return current
  const next = [...current, normalized]
  saveRemoteBookmarks(siteId, next)
  return next
}

export function removeRemoteBookmark(siteId: string, path: string, seed: string[] = []): string[] {
  const normalized = normalizePath(path)
  const next = loadRemoteBookmarks(siteId, seed).filter((item) => item !== normalized)
  saveRemoteBookmarks(siteId, next)
  return next
}

export function isBookmarked(bookmarks: string[], path: string): boolean {
  const normalized = normalizePath(path)
  return bookmarks.some((item) => normalizePath(item) === normalized)
}
