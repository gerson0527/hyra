import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import {
  buildHunkPatch,
  buildLinePatchFromHunk,
  findLineRawIndex,
  splitDiffIntoHunks,
} from '@/lib/git-diff-parse'

export type GitStatusEntry = {
  path: string
  xy: string
  status: string
  staged: boolean
  additions?: string
  deletions?: string
  mtime?: number
}

export type GitStatusSplit = {
  code: number
  unstaged: GitStatusEntry[]
  staged: GitStatusEntry[]
  error: string
  noiseHidden: number
  ideHidden: number
}

function normPath(p: string): string {
  return (p || '').replace(/\\/g, '/')
}

function fileMtime(repoPath: string, relPath: string): number {
  try {
    const full = path.join(repoPath, relPath.replace(/\//g, path.sep))
    return Math.floor(fs.statSync(full).mtimeMs / 1000)
  } catch {
    return 0
  }
}

export function pathInSubdir(filePath: string, subdir: string): boolean {
  if (!subdir) return true
  const norm = normPath(filePath)
  const sub = normPath(subdir).replace(/^\/|\/$/g, '')
  return norm === sub || norm.startsWith(`${sub}/`)
}

export function isIdeJunkPath(filePath: string): boolean {
  const p = normPath(filePath).toLowerCase()
  const junkMarkers = [
    '/.metadata/',
    '/.settings/',
    '/.recommenders/',
    '/remotesystemstempfiles/',
    '/.flexlibproperties',
    '/.actionscriptproperties',
    '/.externaltoolbuilders/',
    '/.loadpath',
    '/.project',
    '/.classpath',
  ]
  if (junkMarkers.some((m) => p.includes(m))) return true
  if (p.includes('.metadata') && p.endsWith('/.lock')) return true
  return false
}

export function runGit(
  repoPath: string,
  args: string[],
  timeoutMs = 180_000,
): { code: number; stdout: string; stderr: string } {
  if (!repoPath || !fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    return { code: 1, stdout: '', stderr: `No existe la carpeta: ${repoPath}` }
  }
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    return { code: 1, stdout: '', stderr: `No es un repositorio Git: ${repoPath}` }
  }

  try {
    const proc = spawnSync('git', ['-C', repoPath, ...args], {
      encoding: 'utf-8',
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
    })
    return {
      code: proc.status ?? 1,
      stdout: proc.stdout || '',
      stderr: proc.stderr || '',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('ETIMEDOUT') || message.includes('timed out')) {
      return { code: 1, stdout: '', stderr: 'Tiempo de espera agotado ejecutando git.' }
    }
    if (message.includes('ENOENT')) {
      return { code: 1, stdout: '', stderr: 'Git no está instalado o no está en el PATH.' }
    }
    return { code: 1, stdout: '', stderr: message }
  }
}

function parseNumstatMap(
  repoPath: string,
  diffArgs: string[],
  subdir: string,
): Map<string, { additions: string; deletions: string }> {
  const map = new Map<string, { additions: string; deletions: string }>()
  const { code, stdout } = runGit(repoPath, diffArgs)
  if (code !== 0) return map

  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const filePath = normPath(parts[2].trim())
    if (!filePath || !pathInSubdir(filePath, subdir)) continue
    map.set(filePath, { additions: parts[0].trim(), deletions: parts[1].trim() })
  }
  return map
}

function collectChangedEntries(
  repoPath: string,
  subdir = '',
  ignoreNoise = false,
  hideIdeJunk = true,
): { entries: GitStatusEntry[]; error: string; ideHidden: number } {
  const diffArgs = ignoreNoise
    ? ['diff', '--numstat', '-w', '--ignore-cr-at-eol', 'HEAD']
    : ['diff', '--numstat', 'HEAD']

  const entries: GitStatusEntry[] = []
  const seen = new Set<string>()
  let ideHidden = 0

  const { code, stdout, stderr } = runGit(repoPath, diffArgs)
  if (code !== 0) {
    return { entries, error: stderr || stdout || 'git diff falló', ideHidden }
  }

  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const [addS, delS, rawPath] = parts
    const filePath = normPath(rawPath.trim())
    if (!filePath || !pathInSubdir(filePath, subdir)) continue
    seen.add(filePath)
    entries.push({
      path: filePath,
      xy: ' M',
      status: 'modificado',
      staged: false,
      additions: addS.trim(),
      deletions: delS.trim(),
    })
  }

  const ls = runGit(repoPath, ['ls-files', '--others', '--exclude-standard'])
  if (ls.code !== 0) {
    return { entries, error: ls.stderr || 'git ls-files falló', ideHidden }
  }

  for (const line of ls.stdout.split(/\r?\n/)) {
    const filePath = normPath(line.trim())
    if (!filePath || !pathInSubdir(filePath, subdir) || seen.has(filePath)) continue
    if (hideIdeJunk && isIdeJunkPath(filePath)) {
      ideHidden += 1
      continue
    }
    seen.add(filePath)
    entries.push({
      path: filePath,
      xy: '??',
      status: 'nuevo',
      staged: false,
      additions: '',
      deletions: '',
    })
  }

  entries.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()))
  return { entries, error: '', ideHidden }
}

export function gitStatusSplit(
  repoPath: string,
  subdir = '',
  ignoreNoise = true,
): GitStatusSplit {
  const noise = ignoreNoise ? ['-w', '--ignore-cr-at-eol'] : []
  let ideHidden = 0

  const stagedMap = parseNumstatMap(repoPath, ['diff', '--cached', '--numstat', ...noise], subdir)
  const unstagedMap = parseNumstatMap(repoPath, ['diff', '--numstat', ...noise], subdir)

  const stagedNameStatus = new Map<string, string>()
  const ns = runGit(repoPath, ['diff', '--cached', '--name-status', ...noise])
  if (ns.code === 0) {
    for (const line of ns.stdout.split(/\r?\n/)) {
      const tab = line.indexOf('\t')
      if (tab < 1) continue
      const code = line.slice(0, tab).trim()
      const filePath = normPath(line.slice(tab + 1).trim())
      if (filePath && pathInSubdir(filePath, subdir)) stagedNameStatus.set(filePath, code)
    }
  }

  const staged: GitStatusEntry[] = []
  for (const [filePath, stats] of stagedMap) {
    const code = stagedNameStatus.get(filePath) || 'M'
    staged.push({
      path: filePath,
      xy: 'M ',
      status: code === 'A' || code === '?' ? 'staged_nuevo' : 'staged',
      staged: true,
      additions: stats.additions,
      deletions: stats.deletions,
      mtime: fileMtime(repoPath, filePath),
    })
  }

  const unstaged: GitStatusEntry[] = []
  const stagedPaths = new Set(stagedMap.keys())

  for (const [filePath, stats] of unstagedMap) {
    unstaged.push({
      path: filePath,
      xy: ' M',
      status: stagedPaths.has(filePath) ? 'staged+mod' : 'modificado',
      staged: false,
      additions: stats.additions,
      deletions: stats.deletions,
      mtime: fileMtime(repoPath, filePath),
    })
  }

  const ls = runGit(repoPath, ['ls-files', '--others', '--exclude-standard'])
  if (ls.code !== 0) {
    return {
      code: 1,
      unstaged: [],
      staged,
      error: ls.stderr || 'git ls-files falló',
      noiseHidden: 0,
      ideHidden,
    }
  }

  for (const line of ls.stdout.split(/\r?\n/)) {
    const filePath = normPath(line.trim())
    if (!filePath || !pathInSubdir(filePath, subdir)) continue
    if (isIdeJunkPath(filePath)) {
      ideHidden += 1
      continue
    }
    unstaged.push({
      path: filePath,
      xy: '??',
      status: 'nuevo',
      staged: false,
      additions: '',
      deletions: '',
      mtime: fileMtime(repoPath, filePath),
    })
  }

  unstaged.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()))
  staged.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()))

  let noiseHidden = 0
  if (ignoreNoise) {
    const allStaged = parseNumstatMap(repoPath, ['diff', '--cached', '--numstat'], subdir)
    const allUnstaged = parseNumstatMap(repoPath, ['diff', '--numstat'], subdir)
    const shown = new Set([...stagedMap.keys(), ...unstagedMap.keys()])
    const allKeys = new Set([...allStaged.keys(), ...allUnstaged.keys()])
    noiseHidden = [...allKeys].filter((k) => !shown.has(k)).length
  }

  return {
    code: 0,
    unstaged,
    staged,
    error: '',
    noiseHidden,
    ideHidden,
  }
}

/** @deprecated use gitStatusSplit */
export function gitStatus(
  repoPath: string,
  subdir = '',
  ignoreNoise = true,
): {
  code: number
  entries: GitStatusEntry[]
  error: string
  noiseHidden: number
  ideHidden: number
} {
  const first = collectChangedEntries(repoPath, subdir, ignoreNoise, true)
  if (first.error) {
    return { code: 1, entries: [], error: first.error, noiseHidden: 0, ideHidden: first.ideHidden }
  }

  let noiseHidden = 0
  if (ignoreNoise) {
    const all = collectChangedEntries(repoPath, subdir, false, true)
    if (!all.error) {
      const shown = new Set(first.entries.map((e) => e.path))
      noiseHidden = all.entries.filter((e) => !shown.has(e.path)).length
    }
  }

  return {
    code: 0,
    entries: first.entries,
    error: '',
    noiseHidden,
    ideHidden: first.ideHidden,
  }
}

export function gitBranch(repoPath: string): string {
  const cur = runGit(repoPath, ['branch', '--show-current'])
  if (cur.code === 0 && cur.stdout.trim()) return cur.stdout.trim()

  const ref = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (ref.code === 0 && ref.stdout.trim()) {
    const name = ref.stdout.trim()
    return name === 'HEAD' ? '(detached)' : name
  }
  return ''
}

export function gitAddFiles(repoPath: string, paths: string[]): { code: number; stdout: string; stderr: string } {
  if (!paths.length) {
    return { code: 1, stdout: '', stderr: 'No hay archivos seleccionados.' }
  }
  const rel = paths.map(normPath)
  return runGit(repoPath, ['add', '--', ...rel])
}

export function gitUnstageFiles(
  repoPath: string,
  paths: string[],
): { code: number; stdout: string; stderr: string } {
  if (!paths.length) {
    return { code: 1, stdout: '', stderr: 'No hay archivos seleccionados.' }
  }
  const rel = paths.map(normPath)
  const result = runGit(repoPath, ['restore', '--staged', '--', ...rel])
  if (result.code === 0) return result
  return runGit(repoPath, ['reset', 'HEAD', '--', ...rel])
}

export function gitCommit(repoPath: string, message: string): { code: number; stdout: string; stderr: string } {
  const msg = (message || '').trim()
  if (!msg) return { code: 1, stdout: '', stderr: 'Escribe un mensaje de commit.' }
  return runGit(repoPath, ['commit', '-m', msg])
}

export function gitAddAndCommit(
  repoPath: string,
  paths: string[],
  message: string,
): { code: number; stdout: string; stderr: string } {
  const add = gitAddFiles(repoPath, paths)
  if (add.code !== 0) return add
  const commit = gitCommit(repoPath, message)
  const stdout = [add.stdout.trim(), commit.stdout.trim()].filter(Boolean).join('\n')
  const stderr = [add.stderr.trim(), commit.stderr.trim()].filter(Boolean).join('\n')
  return { code: commit.code, stdout, stderr }
}

export function gitPush(repoPath: string): { code: number; stdout: string; stderr: string } {
  return runGit(repoPath, ['push'], 300_000)
}

export function gitUnstagedFileDiff(
  repoPath: string,
  filePath: string,
  contextLines = 5,
): { code: number; stdout: string; stderr: string } {
  const rel = normPath(filePath)
  const u = Math.max(0, Math.min(40, contextLines))
  return runGit(repoPath, ['diff', '--no-color', `-U${u}`, '--', rel])
}

/** Stage Hunk For Commit — equivalente a git add -p → y en este bloque */
export function gitStageHunk(
  repoPath: string,
  filePath: string,
  hunkIndex: number,
  contextLines = 3,
): { code: number; stdout: string; stderr: string } {
  const rel = normPath(filePath)
  const diff = gitUnstagedFileDiff(repoPath, rel, contextLines)
  if (diff.code !== 0) {
    return { code: diff.code, stdout: diff.stdout, stderr: diff.stderr || 'git diff falló' }
  }
  if (!diff.stdout.trim()) {
    return { code: 1, stdout: '', stderr: 'Sin cambios sin staging para este archivo' }
  }
  const { meta, hunks } = splitDiffIntoHunks(diff.stdout)
  if (hunkIndex < 0 || hunkIndex >= hunks.length) {
    return {
      code: 1,
      stdout: '',
      stderr: `Bloque @@ no encontrado (índice ${hunkIndex}, hay ${hunks.length})`,
    }
  }
  const patch = buildHunkPatch(meta, hunks[hunkIndex], rel)
  const result = gitApplyPatch(repoPath, rel, patch, 'stage')
  if (result.code === 0) {
    return { code: 0, stdout: result.stdout || 'Stage Hunk For Commit: ok', stderr: result.stderr }
  }
  return result
}

/** Stage Line For Commit — equivalente a git add -p → s (split) + elegir línea */
export function gitStageLine(
  repoPath: string,
  filePath: string,
  hunkIndex: number,
  lineType: 'add' | 'remove',
  lineText: string,
  contextLines = 3,
  hintOldNo?: number | null,
  hintNewNo?: number | null,
): { code: number; stdout: string; stderr: string } {
  const rel = normPath(filePath)
  const diff = gitUnstagedFileDiff(repoPath, rel, Math.max(contextLines, 5))
  if (diff.code !== 0) {
    return { code: diff.code, stdout: diff.stdout, stderr: diff.stderr || 'git diff falló' }
  }
  if (!diff.stdout.trim()) {
    return { code: 1, stdout: '', stderr: 'Sin cambios sin staging para este archivo' }
  }
  const { meta, hunks } = splitDiffIntoHunks(diff.stdout)
  const hunk = hunks[hunkIndex]
  if (!hunk) {
    return { code: 1, stdout: '', stderr: `Bloque @@ no encontrado (índice ${hunkIndex})` }
  }

  const rawIndex = findLineRawIndex(hunk, lineType, lineText, hintOldNo, hintNewNo)
  if (rawIndex < 1) {
    return { code: 1, stdout: '', stderr: 'Línea no encontrada en el diff actual' }
  }

  const line = hunk[rawIndex]
  if (!line || line[0] !== (lineType === 'add' ? '+' : '-')) {
    return { code: 1, stdout: '', stderr: 'Solo se puede hacer stage de líneas modificadas (+/-)' }
  }

  const patch = buildLinePatchFromHunk(meta, hunk, rawIndex, rel, Math.max(contextLines, 3))
  if (!patch.trim()) {
    return { code: 1, stdout: '', stderr: 'No se pudo construir el parche de la línea' }
  }

  const result = gitApplyPatch(repoPath, rel, patch, 'stage')
  if (result.code === 0) {
    return { code: 0, stdout: result.stdout || 'Stage Line For Commit: ok', stderr: result.stderr }
  }
  return result
}

export function gitDiscardHunk(
  repoPath: string,
  filePath: string,
  hunkPatch: string,
): { code: number; stdout: string; stderr: string } {
  return gitApplyPatch(repoPath, filePath, hunkPatch, 'revert')
}

export function gitStagePatch(
  repoPath: string,
  filePath: string,
  patch: string,
): { code: number; stdout: string; stderr: string } {
  return gitApplyPatch(repoPath, filePath, patch, 'stage')
}

export function gitApplyPatch(
  repoPath: string,
  filePath: string,
  patchText: string,
  mode: 'stage' | 'revert',
): { code: number; stdout: string; stderr: string } {
  const rel = normPath(filePath)
  let patch = (patchText || '').trim()
  if (!rel || !patch) return { code: 1, stdout: '', stderr: 'Bloque vacío' }
  if (!patch.startsWith('---')) {
    patch = `--- a/${rel}\n+++ b/${rel}\n${patch}`
  }
  if (!patch.endsWith('\n')) patch += '\n'

  const patchPath = path.join(os.tmpdir(), `hyra-git-${Date.now()}.patch`)
  try {
    fs.writeFileSync(patchPath, patch, 'utf-8')
    const args =
      mode === 'stage'
        ? ['apply', '--cached', '--recount', '--whitespace=nowarn', patchPath]
        : ['apply', '-R', '--recount', '--whitespace=nowarn', patchPath]
    const result = runGit(repoPath, args)
    if (result.code !== 0) {
      const retryArgs =
        mode === 'stage'
          ? ['apply', '--cached', '--recount', '--3way', '--whitespace=nowarn', patchPath]
          : ['apply', '-R', '--recount', '--3way', '--whitespace=nowarn', patchPath]
      const retry = runGit(repoPath, retryArgs)
      if (retry.code === 0) {
        const okMsg = mode === 'stage' ? 'Añadido al staging' : 'Bloque revertido'
        return { code: 0, stdout: retry.stdout || okMsg, stderr: retry.stderr }
      }
      const msg =
        mode === 'stage'
          ? retry.stderr || result.stderr || 'No se pudo añadir al staging'
          : retry.stderr || result.stderr || 'No se pudo revertir el bloque'
      return { code: result.code, stdout: result.stdout, stderr: msg }
    }
    const okMsg = mode === 'stage' ? 'Añadido al staging' : 'Bloque revertido'
    return { code: 0, stdout: result.stdout || okMsg, stderr: result.stderr }
  } finally {
    try {
      fs.unlinkSync(patchPath)
    } catch {
      /* ignore */
    }
  }
}

function formatNewFileDiff(filePath: string, fullPath: string, maxLines = 800): { code: number; stdout: string; stderr: string } {
  try {
    const content = fs.readFileSync(fullPath, 'utf-8')
    let lines = content.split(/\r?\n/)
    let truncated = ''
    if (lines.length > maxLines) {
      const extra = lines.length - maxLines
      lines = lines.slice(0, maxLines)
      truncated = `\n... (${extra} líneas más no mostradas)`
    }
    const header = `--- /dev/null\n+++ b/${filePath}\n@@ archivo nuevo @@\n`
    const body = lines.map((line) => `+${line}`).join('\n')
    return { code: 0, stdout: header + body + truncated, stderr: '' }
  } catch (err) {
    return { code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }
  }
}

export function gitFileDiff(
  repoPath: string,
  filePath: string,
  status = '',
  contextLines = 3,
  scope: 'staged' | 'unstaged' = 'unstaged',
): { code: number; stdout: string; stderr: string } {
  const rel = normPath(filePath)
  if (!rel) return { code: 1, stdout: '', stderr: 'Ruta vacía' }

  const full = path.join(repoPath, rel.replace(/\//g, path.sep))
  const u = Math.max(0, Math.min(40, contextLines))

  if (scope === 'staged') {
    const cached = runGit(repoPath, ['diff', '--cached', '--no-color', `-U${u}`, '--', rel])
    if (cached.code !== 0) {
      return { code: cached.code, stdout: cached.stdout, stderr: cached.stderr || 'git diff --cached falló' }
    }
    if (cached.stdout.trim()) return { code: 0, stdout: cached.stdout, stderr: '' }
    return { code: 0, stdout: '(sin cambios en staging para este archivo)', stderr: '' }
  }

  if (status === 'nuevo' || status === 'staged_nuevo') {
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return { code: 1, stdout: '', stderr: `Archivo no encontrado: ${rel}` }
    }
    return formatNewFileDiff(rel, full)
  }

  const diff = runGit(repoPath, ['diff', '--no-color', `-U${u}`, '--', rel])
  if (diff.code !== 0) {
    return { code: diff.code, stdout: diff.stdout, stderr: diff.stderr || 'git diff falló' }
  }
  if (diff.stdout.trim()) return { code: 0, stdout: diff.stdout, stderr: '' }

  if (status === 'modificado' && fs.existsSync(full) && fs.statSync(full).isFile()) {
    return formatNewFileDiff(rel, full)
  }

  const cached = runGit(repoPath, ['diff', '--no-color', '--cached', '--', rel])
  if (cached.stdout.trim()) return { code: 0, stdout: cached.stdout, stderr: '' }
  if (cached.code !== 0 && cached.stderr) {
    return { code: cached.code, stdout: cached.stdout, stderr: cached.stderr }
  }

  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    return { code: 0, stdout: '(sin diff de texto — el archivo no cambió respecto al índice)\n', stderr: '' }
  }

  return { code: 0, stdout: '(sin cambios visibles para este archivo)', stderr: '' }
}

export function isGitAvailable(): boolean {
  const proc = spawnSync('git', ['--version'], { encoding: 'utf-8', timeout: 10_000 })
  return proc.status === 0
}
