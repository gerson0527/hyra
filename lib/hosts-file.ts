export const WINDOWS_HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts'

const IP_LINE_RE =
  /^(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)\s+(\S+)(?:\s+#\s*(.*))?$/

const RESERVED_IPS = new Set(['127.0.0.1', '0.0.0.0', '::1', '::', 'fe80::1'])

export type HostsEntry = {
  lineIndex: number
  ip: string
  hostnames: string[]
  inlineComment?: string
  raw: string
  section: string
}

export type HostsParseResult = {
  lines: string[]
  entries: HostsEntry[]
  sections: string[]
}

export function isReservedHostsIp(ip: string): boolean {
  const n = ip.trim().toLowerCase()
  return RESERVED_IPS.has(n) || n.startsWith('fe80:')
}

export function parseHostsFile(content: string): HostsParseResult {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const entries: HostsEntry[] = []
  const sections: string[] = []
  let currentSection = 'General'

  lines.forEach((raw, lineIndex) => {
    const trimmed = raw.trim()
    if (!trimmed) return

    if (trimmed.startsWith('#')) {
      const label = trimmed.replace(/^#\s*/, '').trim() || trimmed
      if (label && !label.startsWith('Copyright') && label.length < 80) {
        currentSection = label
        if (!sections.includes(currentSection)) sections.push(currentSection)
      }
      return
    }

    const match = trimmed.match(IP_LINE_RE)
    if (!match) return

    const ip = match[1]
    const hostPart = match[2]
    const inlineComment = match[3]?.trim()
    const hostnames = hostPart.split(/\s+/).filter(Boolean)

    entries.push({
      lineIndex,
      ip,
      hostnames,
      inlineComment,
      raw,
      section: currentSection,
    })
    if (!sections.includes(currentSection)) sections.push(currentSection)
  })

  return { lines, entries, sections }
}

export function applyInstanceIpToHosts(
  content: string,
  newIp: string,
  options?: {
    sectionFilter?: Set<string>
    onlyDifferent?: boolean
    includeReserved?: boolean
  },
): { content: string; changedLines: number; preview: { host: string; from: string; to: string }[] } {
  const ip = newIp.trim()
  if (!ip) {
    return { content, changedLines: 0, preview: [] }
  }

  const { lines, entries } = parseHostsFile(content)
  const sectionFilter = options?.sectionFilter
  const onlyDifferent = options?.onlyDifferent !== false
  const preview: { host: string; from: string; to: string }[] = []
  let changedLines = 0

  for (const entry of entries) {
    if (sectionFilter && !sectionFilter.has(entry.section)) continue
    if (!options?.includeReserved && isReservedHostsIp(entry.ip)) continue
    if (onlyDifferent && entry.ip === ip) continue

    const trimmed = entry.raw.trim()
    const match = trimmed.match(IP_LINE_RE)
    if (!match) continue

    const hostPart = match[2]
    const commentSuffix = match[3] ? ` # ${match[3]}` : ''
    const newLine = `${ip} ${hostPart}${commentSuffix}`
    lines[entry.lineIndex] = newLine
    changedLines += 1
    for (const host of entry.hostnames) {
      preview.push({ host, from: entry.ip, to: ip })
    }
  }

  return { content: lines.join('\n'), changedLines, preview }
}
