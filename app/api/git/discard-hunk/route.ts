import { NextResponse } from 'next/server'
import { gitDiscardHunk } from '@/lib/git-service'
import { resolveGitRepo, validateRepoRoot } from '@/lib/git-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = (await request.json()) as {
    repoId?: string
    path?: string
    patch?: string
  }
  const repoId = body.repoId?.trim()
  const filePath = body.path?.trim()
  const patch = body.patch || ''

  if (!repoId || !filePath || !patch.trim()) {
    return NextResponse.json({ ok: false, error: 'repoId, path y patch requeridos' }, { status: 400 })
  }

  const resolved = resolveGitRepo(repoId)
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'Repositorio desconocido' }, { status: 404 })
  }

  const rootError = validateRepoRoot(resolved.root)
  if (rootError) {
    return NextResponse.json({ ok: false, error: rootError }, { status: 400 })
  }

  const result = gitDiscardHunk(resolved.root, filePath, patch)
  return NextResponse.json({
    ok: result.code === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.code !== 0 ? result.stderr || result.stdout : undefined,
  })
}
