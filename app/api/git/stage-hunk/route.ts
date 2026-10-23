import { NextResponse } from 'next/server'
import { gitStageHunk } from '@/lib/git-service'
import { resolveGitRepo, validateRepoRoot } from '@/lib/git-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = (await request.json()) as {
    repoId?: string
    path?: string
    hunkIndex?: number
    context?: number
  }
  const repoId = body.repoId?.trim()
  const filePath = body.path?.trim()
  const hunkIndex = body.hunkIndex
  const context = Math.max(0, Math.min(40, body.context ?? 3))

  if (!repoId || !filePath || hunkIndex === undefined || hunkIndex < 0) {
    return NextResponse.json({ ok: false, error: 'repoId, path y hunkIndex requeridos' }, { status: 400 })
  }

  const resolved = resolveGitRepo(repoId)
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'Repositorio desconocido' }, { status: 404 })
  }

  const rootError = validateRepoRoot(resolved.root)
  if (rootError) {
    return NextResponse.json({ ok: false, error: rootError }, { status: 400 })
  }

  const result = gitStageHunk(resolved.root, filePath, hunkIndex, context)
  return NextResponse.json({
    ok: result.code === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.code !== 0 ? result.stderr || result.stdout : undefined,
  })
}
