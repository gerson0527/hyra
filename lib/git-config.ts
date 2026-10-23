import path from 'path'

export const DEFAULT_GIT_BASE =
  process.env.HYRA_GIT_BASE?.trim() ||
  'C:\\Users\\TIRESIA\\Documents\\Gerson\\repositoriosGIT'

export type GitRepoConfig = {
  id: string
  label: string
  folder: string
  subdir?: string
  keywords?: string[]
  color?: string
}

export const DEFAULT_GIT_REPOS: GitRepoConfig[] = [
  { id: 'zubale', label: 'Zubale', folder: 'api_zubale', keywords: ['zubale'] },
  { id: 'rappi', label: 'Rappi', folder: 'api_rappi', keywords: ['rappi'] },
  { id: 'erp', label: 'ERP', folder: 'unidrogas', subdir: 'erp', keywords: ['erp', 'erpunidrogas'] },
  { id: 'pos', label: 'POS', folder: 'unidrogas', subdir: 'pos', keywords: ['pos', 'posunidrogas', 'sucuni', 'sucursal'] },
  { id: 'tupedidoenlinea', label: 'TuPedidoEnLinea', folder: 'tupedidoenlinea', keywords: ['tupedido', 'pedidoenlinea', 'tpe'] },
  { id: 'generico_erp', label: 'ERP Genérico', folder: 'generico', subdir: 'erp', keywords: ['generic', 'generico'] },
  { id: 'generico_pos', label: 'POS Genérico', folder: 'generico', subdir: 'posgenerico', keywords: ['posgenerico', 'posfarma'] },
  { id: 'docker_manager', label: 'Docker Manager', folder: 'docker_manager', keywords: ['docker', 'hyra', 'dockermgr'] },
  { id: 'documentacion', label: 'Documentación', folder: 'documentacion', keywords: ['doc', 'documentacion'] },
]

export function getGitBasePath(): string {
  return DEFAULT_GIT_BASE
}

export function getGitRepos(): GitRepoConfig[] {
  return DEFAULT_GIT_REPOS
}

export function getGitRepo(repoId: string): GitRepoConfig | undefined {
  return DEFAULT_GIT_REPOS.find((r) => r.id === repoId)
}

export function repoRootPath(repo: GitRepoConfig, basePath = getGitBasePath()): string {
  return path.join(basePath, repo.folder)
}

function norm(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function suggestRepoForInstance(
  instanceName: string,
  lastRepoId?: string | null,
): string | null {
  const repos = getGitRepos()
  const instKey = (instanceName || '').trim()
  if (!instKey) return null

  if (lastRepoId && repos.some((r) => r.id === lastRepoId)) {
    return lastRepoId
  }

  const normInst = norm(instKey)
  if (!normInst) return null

  let bestId: string | null = null
  let bestScore = 0

  for (const repo of repos) {
    for (const kw of repo.keywords || []) {
      const nk = norm(kw)
      if (!nk) continue
      if (!normInst.includes(nk) && !nk.includes(normInst)) continue

      let score = nk.length
      if (normInst.includes('pos') && repo.id === 'erp') score -= 50
      if (normInst.includes('erp') && !normInst.includes('pos') && repo.id === 'erp') score += 30
      if (normInst.includes('pos') && repo.id === 'pos') score += 40

      if (score > bestScore) {
        bestScore = score
        bestId = repo.id
      }
    }
  }

  return bestId
}

export function taskKeyFromInstance(
  instanceName: string,
  instanceId?: string,
  estadotarea?: string,
): string {
  const texts = [instanceName, instanceId || '', estadotarea || '']
  for (const text of texts) {
    const match = (text || '').toUpperCase().match(/([A-Z][A-Z0-9]*-\d+)/)
    if (match) return match[1]
  }
  return ''
}
