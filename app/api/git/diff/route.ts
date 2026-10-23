import { NextResponse } from 'next/server'
import { gitFileDiff } from '@/lib/git-service'
import { parseDiffText } from '@/lib/git-diff-parse'
import { resolveGitRepo, validateRepoRoot } from '@/lib/git-server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const repoId = url.searchParams.get('repoId')?.trim()
  const filePath = url.searchParams.get('path')?.trim()
  const status = url.searchParams.get('status')?.trim() || ''

  if (!repoId || !filePath) {
    return NextResponse.json({ error: 'repoId y path requeridos' }, { status: 400 })
  }

  const resolved = resolveGitRepo(repoId)
  if (!resolved) {
    return NextResponse.json({ error: 'Repositorio desconocido' }, { status: 404 })
  }

  const { root } = resolved
  const rootError = validateRepoRoot(root)
  if (rootError) {
    return NextResponse.json({ error: rootError }, { status: 400 })
  }

  const context = Math.max(0, Math.min(40, parseInt(url.searchParams.get('context') || '3', 10) || 3))
  const scope = url.searchParams.get('scope') === 'staged' ? 'staged' : 'unstaged'

  const diff = gitFileDiff(root, filePath, status, context, scope)
  if (diff.code !== 0) {
    return NextResponse.json({
      path: filePath,
      text: '',
      hunks: [],
      error: diff.stderr || diff.stdout || 'No se pudo obtener el diff',
    })
  }

  const parsed = parseDiffText(diff.stdout, filePath)
  return NextResponse.json({
    path: filePath,
    text: diff.stdout,
    hunks: parsed.hunks,
  })
}
