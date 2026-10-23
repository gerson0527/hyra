const fetchOpts: RequestInit = {
  cache: 'no-store',
  credentials: 'include',
}

export type ShellTarget = {
  shellId: string
  container?: string | null
  useSudo?: boolean
}

type InputBuffer = {
  pending: string
  timer: ReturnType<typeof setTimeout> | null
  flushing: Promise<boolean> | null
}

const inputBuffers = new Map<string, InputBuffer>()
const failureHandlers = new Map<string, () => void>()
const INPUT_FLUSH_MS = 20

function getInputBuffer(shellId: string): InputBuffer {
  let buffer = inputBuffers.get(shellId)
  if (!buffer) {
    buffer = { pending: '', timer: null, flushing: null }
    inputBuffers.set(shellId, buffer)
  }
  return buffer
}

function shouldFlushImmediately(data: string): boolean {
  return /[\r\n\t\x03\x1b]/.test(data)
}

async function postShellInput(shellId: string, data: string): Promise<boolean> {
  const response = await fetch('/api/ssh/shell/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shellId, data }),
  })
  return response.ok
}

async function flushShellInputBuffer(shellId: string): Promise<boolean> {
  const buffer = inputBuffers.get(shellId)
  if (!buffer?.pending) return true

  // If already flushing, wait for it then retry to pick up any
  // data that arrived in the meantime — avoids race between
  // await and pending check.
  if (buffer.flushing) {
    await buffer.flushing.catch(() => {})
    return flushShellInputBuffer(shellId)
  }

  const data = buffer.pending
  buffer.pending = ''
  if (buffer.timer) {
    clearTimeout(buffer.timer)
    buffer.timer = null
  }

  buffer.flushing = postShellInput(shellId, data).catch(() => false)
  try {
    const ok = await buffer.flushing
    if (!ok) failureHandlers.get(shellId)?.()
    return ok
  } finally {
    buffer.flushing = null
  }
}

/** Encola teclas y las envía en lotes (no una petición por tecla). */
export function sendSshShellInput(shellId: string, data: string): void {
  const buffer = getInputBuffer(shellId)
  buffer.pending += data

  if (shouldFlushImmediately(data)) {
    void flushShellInputBuffer(shellId)
    return
  }

  if (!buffer.timer) {
    buffer.timer = setTimeout(() => {
      buffer.timer = null
      void flushShellInputBuffer(shellId)
    }, INPUT_FLUSH_MS)
  }
}

export async function flushSshShellInput(shellId: string): Promise<boolean> {
  return flushShellInputBuffer(shellId)
}

export function disposeShellInputBuffer(shellId: string) {
  const buffer = inputBuffers.get(shellId)
  if (buffer?.timer) clearTimeout(buffer.timer)
  inputBuffers.delete(shellId)
  failureHandlers.delete(shellId)
}

/** Se invoca cuando el servidor ya no acepta entrada (shell cerrada). */
export function onShellInputFailure(shellId: string, handler: () => void): () => void {
  failureHandlers.set(shellId, handler)
  return () => {
    if (failureHandlers.get(shellId) === handler) {
      failureHandlers.delete(shellId)
    }
  }
}

export async function openSshShell(
  cols = 120,
  rows = 32,
  target: ShellTarget,
): Promise<{ ok: boolean; error?: string; retryable?: boolean }> {
  const response = await fetch('/api/ssh/shell/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      cols,
      rows,
      shellId: target.shellId,
      container: target.container ?? null,
      useSudo: Boolean(target.useSudo),
    }),
  })
  const data = await response.json()
  if (!response.ok) {
    return { ok: false, error: data.error || 'No se pudo abrir la shell.', retryable: Boolean(data.retryable) }
  }
  return { ok: true }
}

export async function closeSshShell(shellId: string): Promise<void> {
  await flushSshShellInput(shellId)
  disposeShellInputBuffer(shellId)
  await fetch('/api/ssh/shell/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shellId }),
  })
}

export async function closeAllSshShells(): Promise<void> {
  await Promise.all([...inputBuffers.keys()].map((shellId) => flushSshShellInput(shellId)))
  for (const shellId of [...inputBuffers.keys()]) {
    disposeShellInputBuffer(shellId)
  }
  await fetch('/api/ssh/shell/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ all: true }),
  })
}

export async function resizeSshShell(shellId: string, cols: number, rows: number): Promise<void> {
  await fetch('/api/ssh/shell/resize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shellId, cols, rows }),
  })
}

export type ShellStreamHandlers = {
  onData: (data: string) => void
  onError?: (message: string) => void
  onClose?: () => void
}

export function connectSshShellStream(
  shellId: string,
  handlers: ShellStreamHandlers,
): () => void {
  const source = new EventSource(
    `/api/ssh/shell/stream?shellId=${encodeURIComponent(shellId)}`,
  )

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as { type: string; data?: string; message?: string }
      if (payload.type === 'data' && payload.data) {
        handlers.onData(payload.data)
      } else if (payload.type === 'error' && payload.message) {
        handlers.onError?.(payload.message)
      } else if (payload.type === 'close') {
        handlers.onClose?.()
      }
    } catch {
      // ignore malformed events
    }
  }

  source.onerror = () => {
    handlers.onError?.('Conexión de terminal interrumpida.')
    source.close()
  }

  return () => {
    source.close()
  }
}
