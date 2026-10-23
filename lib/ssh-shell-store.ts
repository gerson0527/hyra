import type { ClientChannel } from 'ssh2'

export type ShellListener = (data: string) => void
export type ShellCloseListener = () => void

export type ActiveShell = {
  stream: ClientChannel
  listeners: Set<ShellListener>
  closeListeners: Set<ShellCloseListener>
  cols: number
  rows: number
}

const globalStore = globalThis as typeof globalThis & {
  __hyraSshShells?: Map<string, ActiveShell>
}

function shells(): Map<string, ActiveShell> {
  if (!globalStore.__hyraSshShells) {
    globalStore.__hyraSshShells = new Map()
  }
  return globalStore.__hyraSshShells
}

export function getShell(sessionKey: string): ActiveShell | null {
  return shells().get(sessionKey) ?? null
}

export function subscribeShell(sessionKey: string, listener: ShellListener): () => void {
  const shell = shells().get(sessionKey)
  if (!shell) return () => {}
  shell.listeners.add(listener)
  return () => {
    shell.listeners.delete(listener)
  }
}

export function subscribeShellClose(sessionKey: string, listener: ShellCloseListener): () => void {
  const shell = shells().get(sessionKey)
  if (!shell) return () => {}
  shell.closeListeners.add(listener)
  return () => {
    shell.closeListeners.delete(listener)
  }
}

export function notifyShellClosed(sessionKey: string) {
  const shell = shells().get(sessionKey)
  if (!shell) return
  for (const listener of [...shell.closeListeners]) {
    try {
      listener()
    } catch (err) {
      console.error('[shell] close listener error:', err)
    }
  }
}

export function broadcastShell(sessionKey: string, data: string) {
  const shell = shells().get(sessionKey)
  if (!shell) return
  for (const listener of [...shell.listeners]) {
    try {
      listener(data)
    } catch (err) {
      console.error('[shell] data listener error:', err)
    }
  }
}

export function setShell(sessionKey: string, shell: ActiveShell) {
  const map = shells()
  const existing = map.get(sessionKey)
  if (existing && existing.stream !== shell.stream) {
    closeShellStream(existing)
  }
  map.set(sessionKey, shell)
}

export function closeShellStream(shell: ActiveShell) {
  shell.listeners.clear()
  shell.closeListeners.clear()
  try {
    shell.stream.end()
  } catch {
    // ignore
  }
}

export function removeShell(sessionKey: string) {
  const map = shells()
  const existing = map.get(sessionKey)
  if (existing) {
    closeShellStream(existing)
    map.delete(sessionKey)
  }
}

export function removeShellsForSession(sessionKey: string) {
  const map = shells()
  const prefix = `${sessionKey}::`
  for (const key of [...map.keys()]) {
    if (key === sessionKey || key.startsWith(prefix)) {
      removeShell(key)
    }
  }
}
