const LAST_REPO_KEY = 'hyra_git_last_repo'

export function loadLastRepoForInstance(instanceName: string): string | null {
  if (typeof window === 'undefined' || !instanceName) return null
  try {
    const raw = localStorage.getItem(LAST_REPO_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, string>
    return map[instanceName] || null
  } catch {
    return null
  }
}

export function saveLastRepoForInstance(instanceName: string, repoId: string): void {
  if (typeof window === 'undefined' || !instanceName || !repoId) return
  try {
    const raw = localStorage.getItem(LAST_REPO_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    map[instanceName] = repoId
    localStorage.setItem(LAST_REPO_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

const EXCLUDED_KEY = 'hyra_git_excluded'

export function loadExcludedPaths(repoId: string): Set<string> {
  if (typeof window === 'undefined' || !repoId) return new Set()
  try {
    const raw = localStorage.getItem(EXCLUDED_KEY)
    if (!raw) return new Set()
    const map = JSON.parse(raw) as Record<string, string[]>
    return new Set(map[repoId] || [])
  } catch {
    return new Set()
  }
}

export function saveExcludedPaths(repoId: string, paths: Set<string>): void {
  if (typeof window === 'undefined' || !repoId) return
  try {
    const raw = localStorage.getItem(EXCLUDED_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {}
    map[repoId] = [...paths]
    localStorage.setItem(EXCLUDED_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
