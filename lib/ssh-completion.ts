export function defaultTabCwd(tabId: string, container: string | null): string {
  if (tabId === 'general' && !container) return '~'
  return '/'
}

export function completionContext(
  text: string,
  cursor: number = text.length,
): { prefix: string; start: number } {
  const before = text.slice(0, cursor)
  if (!before || before.endsWith(' ')) return { prefix: '', start: cursor }
  const space = before.lastIndexOf(' ')
  if (space === -1) return { prefix: before, start: 0 }
  return { prefix: before.slice(space + 1), start: space + 1 }
}

export function noteCdCommand(cmd: string, cwd: string): string {
  const stripped = cmd.trim()
  if (!stripped.startsWith('cd')) return cwd
  const parts = stripped.split(/\s+/, 2)
  if (parts.length === 1) return '~'
  const arg = parts[1].trim().replace(/^['"]|['"]$/g, '')
  if (arg.startsWith('/')) return arg
  if (arg === '~' || arg.startsWith('~/')) return arg
  const base = cwd === '~' ? '~' : cwd.replace(/\/$/, '') || '/'
  if (base === '~') return arg ? `~/${arg}` : '~'
  return `${base}/${arg}`
}

function longestCommonPrefix(items: string[]): string {
  if (items.length === 0) return ''
  let prefix = items[0]
  for (let i = 1; i < items.length; i += 1) {
    while (!items[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
      if (!prefix) return ''
    }
  }
  return prefix
}

export function parseCompletionMatches(output: string[]): string[] {
  const text = output.join('\n')
  const seen = new Set<string>()
  const matches: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (
      !trimmed ||
      trimmed.startsWith('[') ||
      trimmed.includes('sudo:') ||
      trimmed.includes('bash:') ||
      trimmed.includes('docker:') ||
      trimmed.includes('base64:') ||
      seen.has(trimmed)
    ) {
      continue
    }
    seen.add(trimmed)
    matches.push(trimmed)
    if (matches.length >= 50) break
  }
  return matches
}

export function applyTabCompletion(
  buffer: string,
  start: number,
  prefix: string,
  matches: string[],
): { buffer: string; list?: string } {
  if (matches.length === 0) return { buffer }

  let dirPrefix = ''
  let filePrefix = prefix
  if (prefix.includes('/')) {
    const idx = prefix.lastIndexOf('/')
    dirPrefix = prefix.slice(0, idx)
    filePrefix = prefix.slice(idx + 1)
    if (dirPrefix && !dirPrefix.endsWith('/')) dirPrefix += '/'
  }

  if (matches.length === 1) {
    const word = dirPrefix + matches[0]
    return { buffer: buffer.slice(0, start) + word }
  }

  const common = longestCommonPrefix(matches)
  if (common.length > filePrefix.length) {
    const word = dirPrefix + common
    return { buffer: buffer.slice(0, start) + word }
  }

  const shown = matches.map((m) => dirPrefix + m).join('  ')
  return { buffer, list: shown }
}

export { buildCompletionCommand } from '@/lib/ssh-presets'
