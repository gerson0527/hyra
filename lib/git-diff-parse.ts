import type { DiffHunk, DiffLine } from '@/lib/types'

export type ParsedDiff = {
  meta: string[]
  hunks: DiffHunk[]
  rawText: string
}

const LINE_CONTEXT = 5

function parseHunkHeader(header: string): { oldStart: number; newStart: number } {
  const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  if (match) {
    return { oldStart: parseInt(match[1], 10), newStart: parseInt(match[2], 10) }
  }
  return { oldStart: 1, newStart: 1 }
}

function fileHeaders(meta: string[], filePath: string): string[] {
  const headers = meta.filter((l) => l.startsWith('---') || l.startsWith('+++'))
  if (headers.length) return headers
  return [`--- a/${filePath}`, `+++ b/${filePath}`]
}

function hunkPatch(meta: string[], hunkLines: string[], filePath: string): string {
  return [...fileHeaders(meta, filePath), ...hunkLines].join('\n') + '\n'
}

export function splitDiffIntoHunks(diffText: string): { meta: string[]; hunks: string[][] } {
  const lines = (diffText || '').replace(/\r\n/g, '\n').split('\n')
  const meta: string[] = []
  const hunks: string[][] = []
  let i = 0
  while (i < lines.length && !lines[i].startsWith('@@')) {
    if (lines[i].trim()) meta.push(lines[i])
    i += 1
  }
  while (i < lines.length) {
    if (!lines[i].startsWith('@@')) {
      i += 1
      continue
    }
    const hunkLines: string[] = [lines[i]]
    i += 1
    while (i < lines.length && !lines[i].startsWith('@@')) {
      hunkLines.push(lines[i])
      i += 1
    }
    hunks.push(hunkLines)
  }
  return { meta, hunks }
}

export function buildHunkPatch(meta: string[], hunkLines: string[], filePath: string): string {
  return hunkPatch(meta, hunkLines, filePath)
}

function countHunkBody(bodyLines: string[]): { oldCount: number; newCount: number } {
  let oldCount = 0
  let newCount = 0
  for (const line of bodyLines) {
    if (!line || line.startsWith('\\')) continue
    const c = line[0]
    if (c === ' ') {
      oldCount += 1
      newCount += 1
    } else if (c === '-') {
      oldCount += 1
    } else if (c === '+') {
      newCount += 1
    }
  }
  return { oldCount, newCount }
}

function lineNumbersAt(hunkRawLines: string[], bodyIndex: number): { oldNo: number; newNo: number } {
  const { oldStart, newStart } = parseHunkHeader(hunkRawLines[0])
  let oldNo = oldStart
  let newNo = newStart
  for (let i = 1; i < bodyIndex; i++) {
    const line = hunkRawLines[i] ?? ''
    if (line.startsWith('\\')) continue
    const c = line[0] ?? ' '
    if (c === '+') newNo += 1
    else if (c === '-') oldNo += 1
    else {
      oldNo += 1
      newNo += 1
    }
  }
  return { oldNo, newNo }
}

/** Localiza una línea +/- en el hunk por tipo y texto (evita desfase de índices cliente/servidor) */
export function findLineRawIndex(
  hunkRawLines: string[],
  lineType: 'add' | 'remove',
  lineText: string,
  hintOldNo?: number | null,
  hintNewNo?: number | null,
): number {
  const prefix = lineType === 'add' ? '+' : '-'
  const matches: number[] = []
  for (let i = 1; i < hunkRawLines.length; i++) {
    const raw = hunkRawLines[i]?.replace(/\r$/, '') ?? ''
    if (!raw || raw[0] !== prefix) continue
    if (raw.slice(1) !== lineText) continue
    matches.push(i)
  }
  if (matches.length === 0) return -1
  if (matches.length === 1) return matches[0]

  for (const idx of matches) {
    const nums = lineNumbersAt(hunkRawLines, idx)
    if (lineType === 'add' && hintNewNo != null && nums.newNo === hintNewNo) return idx
    if (lineType === 'remove' && hintOldNo != null && nums.oldNo === hintOldNo) return idx
  }
  return matches[0]
}

/** Parche mínimo para stage línea (equivalente a git add -p → split) */
export function buildLinePatchFromHunk(
  meta: string[],
  hunkRawLines: string[],
  rawIndex: number,
  filePath: string,
  context = LINE_CONTEXT,
): string {
  const start = Math.max(1, rawIndex - context)
  const end = Math.min(hunkRawLines.length - 1, rawIndex + context)
  const bodySlice = hunkRawLines.slice(start, end + 1).map((l) => l.replace(/\r$/, ''))

  if (!bodySlice.length) return ''

  const { oldNo: sliceOldStart, newNo: sliceNewStart } = lineNumbersAt(hunkRawLines, start)
  const { oldCount, newCount } = countHunkBody(bodySlice)
  const header = `@@ -${sliceOldStart},${oldCount} +${sliceNewStart},${newCount} @@`

  return [...fileHeaders(meta, filePath), header, ...bodySlice].join('\n') + '\n'
}

/** @internal */
function buildLinePatch(
  meta: string[],
  hunkRawLines: string[],
  rawIndex: number,
  filePath: string,
): string {
  return buildLinePatchFromHunk(meta, hunkRawLines, rawIndex, filePath)
}

function linesFromHunk(hunkLines: string[]): DiffLine[] {
  if (!hunkLines.length) return []

  const headerLine = hunkLines[0]
  const { oldStart, newStart } = parseHunkHeader(headerLine)
  let oldNo = oldStart
  let newNo = newStart
  const result: DiffLine[] = []
  let rawIndex = 1

  for (const line of hunkLines.slice(1)) {
    if (!line) {
      result.push({ type: 'context', oldNo, newNo, text: '', raw: ' ', rawIndex })
      oldNo += 1
      newNo += 1
      rawIndex += 1
      continue
    }

    const prefix = line[0]
    const text = line.slice(1)

    if (prefix === '+') {
      result.push({ type: 'add', oldNo: null, newNo, text, raw: line, rawIndex })
      newNo += 1
    } else if (prefix === '-') {
      result.push({ type: 'remove', oldNo, newNo: null, text, raw: line, rawIndex })
      oldNo += 1
    } else {
      result.push({ type: 'context', oldNo, newNo, text, raw: line, rawIndex })
      oldNo += 1
      newNo += 1
    }
    rawIndex += 1
  }

  return result
}

function attachLinePatches(
  hunks: DiffHunk[],
  meta: string[],
  filePath: string,
  hunkRawById: Map<string, string[]>,
): void {
  for (const hunk of hunks) {
    const rawLines = hunkRawById.get(hunk.id)
    if (!rawLines) continue
    for (const line of hunk.lines) {
      if (line.type !== 'context' && line.rawIndex !== undefined) {
        line.patch = buildLinePatch(meta, rawLines, line.rawIndex, filePath)
      }
    }
  }
}

export function parseDiffText(text: string, filePath: string): ParsedDiff {
  const rawText = text || ''
  const lines = rawText.split('\n')
  const meta: string[] = []
  const hunks: DiffHunk[] = []
  const hunkRawById = new Map<string, string[]>()

  let i = 0
  while (i < lines.length && !lines[i].startsWith('@@')) {
    if (lines[i].trim()) meta.push(lines[i])
    i += 1
  }

  let hunkIndex = 0
  while (i < lines.length) {
    if (!lines[i].startsWith('@@')) {
      i += 1
      continue
    }
    const hunkLines: string[] = [lines[i]]
    i += 1
    while (i < lines.length && !lines[i].startsWith('@@')) {
      hunkLines.push(lines[i])
      i += 1
    }
    const id = `h${hunkIndex}`
    hunkRawById.set(id, hunkLines)
    hunks.push({
      id,
      header: hunkLines[0],
      lines: linesFromHunk(hunkLines),
      patch: hunkPatch(meta, hunkLines, filePath),
    })
    hunkIndex += 1
  }

  attachLinePatches(hunks, meta, filePath, hunkRawById)

  return { meta, hunks, rawText }
}
