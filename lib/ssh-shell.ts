import type { Client, ClientChannel } from 'ssh2'
import {
  broadcastShell,
  getShell,
  notifyShellClosed,
  removeShell,
  removeShellsForSession,
  setShell,
  type ActiveShell,
} from '@/lib/ssh-shell-store'
import { quoteDockerName } from '@/lib/ssh-presets'

export type OpenShellOptions = {
  container?: string | null
  useSudo?: boolean
}

export function resolveShellStoreKey(sessionKey: string, shellId: string): string {
  return `${sessionKey}::${shellId || 'general'}`
}

function attachShellStream(storeKey: string, stream: ClientChannel, cols: number, rows: number): ActiveShell {
  const shell: ActiveShell = {
    stream,
    listeners: new Set(),
    closeListeners: new Set(),
    cols,
    rows,
  }

  stream.on('data', (chunk: Buffer) => {
    broadcastShell(storeKey, chunk.toString('utf8'))
  })

  stream.on('close', () => {
    notifyShellClosed(storeKey)
    removeShell(storeKey)
  })

  stream.stderr?.on('data', (chunk: Buffer) => {
    broadcastShell(storeKey, chunk.toString('utf8'))
  })

  setShell(storeKey, shell)
  return shell
}

const OPEN_SPACING_MS = 150
const OPEN_MAX_ATTEMPTS = 4

// Un cliente SSH tiene un limite de canales simultaneos (sshd MaxSessions) y
// rechaza aperturas en rafaga con "Channel open failure". Se serializan por conexion.
const openQueues = new WeakMap<Client, Promise<unknown>>()

export function isChannelOpenFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /channel open failure|open failed|administratively prohibited|resource shortage/i.test(message)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function openInteractiveShell(
  storeKey: string,
  client: Client,
  cols = 120,
  rows = 32,
  options?: OpenShellOptions,
): Promise<ActiveShell> {
  const previous = openQueues.get(client) ?? Promise.resolve()

  const run = async (): Promise<ActiveShell> => {
    let lastError: unknown
    for (let attempt = 1; attempt <= OPEN_MAX_ATTEMPTS; attempt += 1) {
      try {
        const shell = await openInteractiveShellOnce(storeKey, client, cols, rows, options)
        await sleep(OPEN_SPACING_MS)
        return shell
      } catch (error) {
        lastError = error
        if (!isChannelOpenFailure(error) || attempt === OPEN_MAX_ATTEMPTS) break
        await sleep(400 * attempt)
      }
    }
    throw lastError
  }

  const next = previous.then(run, run)
  openQueues.set(client, next.catch(() => undefined))
  return next
}

async function openInteractiveShellOnce(
  storeKey: string,
  client: Client,
  cols = 120,
  rows = 32,
  options?: OpenShellOptions,
): Promise<ActiveShell> {
  removeShell(storeKey)

  const container = options?.container?.trim() || ''
  const useSudo = Boolean(options?.useSudo)

  return new Promise((resolve, reject) => {
    const onStream = (error: Error | undefined, stream: ClientChannel) => {
      if (error) {
        reject(error)
        return
      }
      resolve(attachShellStream(storeKey, stream, cols, rows))
    }

    if (container) {
      const name = quoteDockerName(container)
      const prefix = useSudo ? 'sudo ' : ''
      const cmd = `${prefix}docker start ${name} >/dev/null 2>&1; ${prefix}docker exec -it ${name} bash`
      client.exec(
        cmd,
        { pty: { rows, cols, width: cols * 8, height: rows * 16, term: 'xterm-256color' } },
        onStream,
      )
      return
    }

    client.shell({ term: 'xterm-256color', cols, rows }, onStream)
  })
}

export function writeToShell(storeKey: string, data: string): boolean {
  const shell = getShell(storeKey)
  if (!shell) {
    return false
  }
  try {
    shell.stream.write(data)
    return true
  } catch (err) {
    removeShell(storeKey)
    return false
  }
}

export function resizeShell(storeKey: string, cols: number, rows: number): boolean {
  const shell = getShell(storeKey)
  if (!shell) {
    return false
  }
  try {
    shell.stream.setWindow(rows, cols, 0, 0)
    shell.cols = cols
    shell.rows = rows
    return true
  } catch (err) {
    removeShell(storeKey)
    return false
  }
}

export function closeInteractiveShell(storeKey: string) {
  removeShell(storeKey)
}

export function closeAllShellsForSession(sessionKey: string) {
  removeShellsForSession(sessionKey)
}
