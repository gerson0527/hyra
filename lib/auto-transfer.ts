import type { LocalDirEntry } from "./local-files"

const STORAGE_PREFIX = "hyra_auto_transfer_"
const WATCHED_FOLDER_KEY = `${STORAGE_PREFIX}local_path`
const REMOTE_FOLDER_KEY = `${STORAGE_PREFIX}remote_path`
const EXCLUDE_PATTERNS_KEY = `${STORAGE_PREFIX}exclude_patterns`
const INCLUDE_PATTERNS_KEY = `${STORAGE_PREFIX}include_patterns`
const ENABLED_KEY = `${STORAGE_PREFIX}enabled`

export type FileSnapshot = Record<string, { mtimeMs: number; sizeBytes: number }>

export function getWatchedFolder(): string {
  if (typeof window === "undefined") return ""
  return (
    localStorage.getItem(WATCHED_FOLDER_KEY)?.trim() ||
    "C:\\Users\\TIRESIA\\Documents\\Gerson\\repositoriosGIT\\unidrogas\\pos\\swfs"
  )
}

export function setWatchedFolder(path: string): void {
  if (typeof window !== "undefined") localStorage.setItem(WATCHED_FOLDER_KEY, path.trim())
}

export function getRemoteFolder(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(REMOTE_FOLDER_KEY)?.trim() || "/opt/puntoventaAIR/share"
}

export function setRemoteFolder(path: string): void {
  if (typeof window !== "undefined") localStorage.setItem(REMOTE_FOLDER_KEY, path.trim())
}

export function getExcludePatterns(): string[] {
  if (typeof window === "undefined") return []
  const raw = localStorage.getItem(EXCLUDE_PATTERNS_KEY)?.trim()
  if (!raw) return ["*.tmp", "*.log", "*.bak", "*.swp", "*.part", "thumbs.db", ".DS_Store"]
  return raw.split(",").map((p) => p.trim()).filter(Boolean)
}

export function setExcludePatterns(patterns: string[]): void {
  if (typeof window !== "undefined") localStorage.setItem(EXCLUDE_PATTERNS_KEY, patterns.join(","))
}

export function isAutoTransferEnabled(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(ENABLED_KEY) === "true"
}

export function setAutoTransferEnabled(enabled: boolean): void {
  if (typeof window !== "undefined") localStorage.setItem(ENABLED_KEY, enabled ? "true" : "false")
}

export function getIncludePatterns(): string[] {
  if (typeof window === "undefined") return []
  const raw = localStorage.getItem(INCLUDE_PATTERNS_KEY)?.trim()
  if (!raw) return []
  return raw.split(",").map((p) => p.trim()).filter(Boolean)
}

export function setIncludePatterns(patterns: string[]): void {
  if (typeof window !== "undefined") localStorage.setItem(INCLUDE_PATTERNS_KEY, patterns.join(","))
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "i")
}

export function isExcluded(name: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const trimmed = p.trim()
    if (!trimmed) return false
    try {
      return globToRegex(trimmed).test(name)
    } catch {
      return name.toLowerCase() === trimmed.toLowerCase()
    }
  })
}

export function detectNewOrChangedFiles(
  current: LocalDirEntry[],
  previous: FileSnapshot,
  excludePatterns: string[],
  includePatterns?: string[],
): Array<{ name: string; fullPath: string; mtimeMs: number; sizeBytes: number }> {
  const result: Array<{ name: string; fullPath: string; mtimeMs: number; sizeBytes: number }> = []

  for (const entry of current) {
    if (entry.type !== "file") continue
    if (isExcluded(entry.name, excludePatterns)) continue
    if (includePatterns && includePatterns.length > 0 && !isExcluded(entry.name, includePatterns)) continue

    const prev = previous[entry.name]
    if (!prev || prev.mtimeMs !== entry.mtimeMs || prev.sizeBytes !== entry.sizeBytes) {
      result.push({
        name: entry.name,
        fullPath: entry.fullPath,
        mtimeMs: entry.mtimeMs,
        sizeBytes: entry.sizeBytes,
      })
    }
  }

  return result
}

export function buildSnapshot(entries: LocalDirEntry[]): FileSnapshot {
  const snapshot: FileSnapshot = {}
  for (const entry of entries) {
    if (entry.type === "file") {
      snapshot[entry.name] = { mtimeMs: entry.mtimeMs, sizeBytes: entry.sizeBytes }
    }
  }
  return snapshot
}
