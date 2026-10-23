import { NextResponse } from 'next/server'
import { isIdeJunkPath, gitBranch, gitStatusSplit } from '@/lib/git-service'
import { resolveGitRepo, validateRepoRoot } from '@/lib/git-server'

export const runtime = 'nodejs'

function parseNum(value: string | undefined): number {
  if (!value || value === '-') return 0
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function mapEntry(e: {
  path: string
  status: string
  additions?: string
  deletions?: string
  mtime?: number
}) {
  return {
    path: e.path,
    status: e.status,
    additions: parseNum(e.additions),
    deletions: parseNum(e.deletions),
    isIde: isIdeJunkPath(e.path),
    mtime: e.mtime ?? 0,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const repoId = url.searchParams.get('repoId')?.trim()
  const ignoreNoise = url.searchParams.get('ignoreNoise') !== 'false'

  if (!repoId) {
    return NextResponse.json({ error: 'repoId requerido' }, { status: 400 })
  }

  const resolved = resolveGitRepo(repoId)
  if (!resolved) {
    return NextResponse.json({ error: 'Repositorio desconocido' }, { status: 404 })
  }

  const { repo, root } = resolved
  const rootError = validateRepoRoot(root)
  if (rootError) {
    return NextResponse.json({
      branch: '',
      unstaged: [],
      staged: [],
      files: [],
      noiseHidden: 0,
      ideHidden: 0,
      error: rootError,
    })
  }

  const subdir = repo.subdir || ''
  const status = gitStatusSplit(root, subdir, ignoreNoise)
  if (status.code !== 0) {
    return NextResponse.json({
      branch: gitBranch(root),
      unstaged: [],
      staged: [],
      files: [],
      noiseHidden: 0,
      ideHidden: status.ideHidden,
      error: status.error,
    })
  }

  const unstaged = status.unstaged.map(mapEntry)
  const staged = status.staged.map(mapEntry)

  return NextResponse.json({
    branch: gitBranch(root),
    unstaged,
    staged,
    files: [...unstaged, ...staged],
    noiseHidden: status.noiseHidden,
    ideHidden: status.ideHidden,
  })
}
