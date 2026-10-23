import type { DiffHunk, GitFile, GitFileStatus } from '@/lib/types'

export type GitRepoInfo = {
  id: string
  label: string
  folder: string
  subdir: string
}

export type GitConfigResponse = {
  repos: GitRepoInfo[]
  suggestedRepoId: string | null
  defaultCommitPrefix: string
  gitAvailable: boolean
  basePath: string
}

export type GitStatusResponse = {
  branch: string
  unstaged: GitFileDto[]
  staged: GitFileDto[]
  files: GitFileDto[]
  noiseHidden: number
  ideHidden: number
  error?: string
}

export type GitFileDto = {
  path: string
  status: string
  additions: number
  deletions: number
  isIde: boolean
  mtime: number
}

export type GitDiffResponse = {
  path: string
  text: string
  hunks: DiffHunk[]
  error?: string
}

export type GitActionResponse = {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `Error HTTP ${res.status}`)
  }
  return data
}

export async function fetchGitConfig(params: {
  instanceName: string
  instanceId?: string
  estadotarea?: string
  lastRepoId?: string | null
}): Promise<GitConfigResponse> {
  const q = new URLSearchParams({
    instanceName: params.instanceName,
    instanceId: params.instanceId || '',
    estadotarea: params.estadotarea || '',
  })
  if (params.lastRepoId) q.set('lastRepoId', params.lastRepoId)
  const res = await fetch(`/api/git/config?${q}`)
  return parseJson(res)
}

export async function fetchGitStatus(
  repoId: string,
  ignoreNoise: boolean,
): Promise<GitStatusResponse> {
  const q = new URLSearchParams({ repoId, ignoreNoise: String(ignoreNoise) })
  const res = await fetch(`/api/git/status?${q}`)
  return parseJson(res)
}

export async function fetchGitDiff(
  repoId: string,
  path: string,
  status: string,
  context = 3,
  scope: 'staged' | 'unstaged' = 'unstaged',
): Promise<GitDiffResponse> {
  const q = new URLSearchParams({
    repoId,
    path,
    status,
    context: String(context),
    scope,
  })
  const res = await fetch(`/api/git/diff?${q}`)
  return parseJson(res)
}

export async function gitAdd(repoId: string, paths: string[]): Promise<GitActionResponse> {
  const res = await fetch('/api/git/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId, paths }),
  })
  return parseJson(res)
}

export async function gitCommit(
  repoId: string,
  message: string,
  paths?: string[],
): Promise<GitActionResponse> {
  const res = await fetch('/api/git/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId, paths: paths || [], message }),
  })
  return parseJson(res)
}

export async function gitUnstage(repoId: string, paths: string[]): Promise<GitActionResponse> {
  const res = await fetch('/api/git/unstage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId, paths }),
  })
  return parseJson(res)
}

export async function gitPush(repoId: string): Promise<GitActionResponse> {
  const res = await fetch('/api/git/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId }),
  })
  return parseJson(res)
}

export async function gitStageHunk(
  repoId: string,
  path: string,
  hunkIndex: number,
  context = 3,
): Promise<GitActionResponse> {
  const res = await fetch('/api/git/stage-hunk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId, path, hunkIndex, context }),
  })
  return parseJson(res)
}

export async function gitStageLine(
  repoId: string,
  path: string,
  hunkIndex: number,
  lineType: 'add' | 'remove',
  lineText: string,
  context = 3,
  oldNo?: number | null,
  newNo?: number | null,
): Promise<GitActionResponse> {
  const res = await fetch('/api/git/stage-line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId, path, hunkIndex, lineType, lineText, context, oldNo, newNo }),
  })
  return parseJson(res)
}

export async function gitApplyPatch(
  repoId: string,
  path: string,
  patch: string,
  mode: 'stage' | 'revert',
): Promise<GitActionResponse> {
  const res = await fetch('/api/git/apply-patch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId, path, patch, mode }),
  })
  return parseJson(res)
}

/** @deprecated use gitApplyPatch(..., 'revert') */
export async function gitDiscardHunk(
  repoId: string,
  path: string,
  patch: string,
): Promise<GitActionResponse> {
  return gitApplyPatch(repoId, path, patch, 'revert')
}

export function mapStatus(status: string): GitFileStatus {
  if (status === 'nuevo') return 'new'
  if (status === 'staged_nuevo') return 'new'
  if (status === 'staged') return 'staged'
  if (status === 'modificado' || status === 'staged+mod') return 'modified'
  return 'modified'
}

export function dtoToGitFile(
  dto: GitFileDto,
  zone: 'staged' | 'unstaged',
  excluded: boolean,
  selected: boolean,
): GitFile {
  return {
    path: dto.path,
    status: mapStatus(dto.status),
    zone,
    additions: dto.additions,
    deletions: dto.deletions,
    selected,
    excluded,
    isNoise: false,
    isIde: dto.isIde,
    hunks: [],
    rawStatus: dto.status,
    mtime: dto.mtime,
  }
}

export function diffStatusParam(file: GitFile): string {
  if (file.rawStatus === 'staged_nuevo' || file.rawStatus === 'nuevo') return 'nuevo'
  if (file.rawStatus === 'staged') return 'staged'
  return 'modificado'
}
