import { NextResponse } from 'next/server'
import { gitAddFiles } from '@/lib/git-service'
import { resolveGitRepo, validateRepoRoot } from '@/lib/git-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = (await request.json()) as { repoId?: string; paths?: string[] }
  const repoId = body.repoId?.trim()
  const paths = Array.isArray(body.paths) ? body.paths.filter(Boolean) : []

  if (!repoId) {
    return NextResponse.json({ ok: false, error: 'repoId requerido' }, { status: 400 })
  }

  const resolved = resolveGitRepo(repoId)
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'Repositorio desconocido' }, { status: 404 })
  }

  const rootError = validateRepoRoot(resolved.root)
  if (rootError) {
    return NextResponse.json({ ok: false, error: rootError }, { status: 400 })
  }

  const result = gitAddFiles(resolved.root, paths)
  return NextResponse.json({
    ok: result.code === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.code !== 0 ? result.stderr || result.stdout : undefined,
  })
}
