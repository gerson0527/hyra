import { Client } from 'ssh2'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PPKParser } from 'ppk-to-openssh'

export type SshConnectConfig = {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string | Buffer
  /** Responde prompts keyboard-interactive con la contraseña (común en contenedores Hyra). */
  tryKeyboard?: boolean
  /** Solo keyboard-interactive, sin enviar password en el handshake inicial. */
  keyboardOnly?: boolean
  /** Etiqueta para mensajes de error (contraseña, llave, etc.). */
  authLabel?: string
  /** Timeout de conexión SSH en ms (SFTP usa valor más bajo). */
  readyTimeoutMs?: number
}

export type SshExecResult = {
  stdout: string
  stderr: string
  code: number
}

export type SshConnected = {
  client: Client
  username: string
}

export const DEFAULT_SSH_KEY_PATH = path.join(os.homedir(), 'Downloads', 'ssh-entornos.ppk')
export const FALLBACK_SSH_KEY_PATH = path.join(os.homedir(), 'Downloads', 'ssh-entornos.key')

const SSH_USER_FALLBACKS = ['root', 'opc', 'ubuntu'] as const

export function resolveSshKeyPath(keyPath: string): string {
  const trimmed = keyPath.trim()
  if (trimmed && fs.existsSync(trimmed)) return trimmed
  if (fs.existsSync(DEFAULT_SSH_KEY_PATH)) return DEFAULT_SSH_KEY_PATH
  if (fs.existsSync(FALLBACK_SSH_KEY_PATH)) return FALLBACK_SSH_KEY_PATH
  return trimmed
}

function uniqueUsers(preferred: string): string[] {
  const users = [preferred || 'opc', ...SSH_USER_FALLBACKS]
  return [...new Set(users.map((u) => u.trim()).filter(Boolean))]
}

function connectOnce(config: SshConnectConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    const password = config.password?.trim()
    let connected = false

    client.once('ready', () => {
      connected = true
      resolve(client)
    })

    client.once('error', (err) => {
      if (connected) {
        // Post-conexión: no matar el cliente aquí.
        // El handler persistente en ssh-session.ts se encarga de la limpieza.
        return
      }
      try {
        client.end()
      } catch {
        // ignore
      }
      reject(err)
    })

    if (password && config.tryKeyboard !== false) {
      client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
        finish(prompts.map(() => password))
      })
    }

    const base = {
      host: config.host,
      port: config.port,
      username: config.username,
      privateKey: config.privateKey,
      readyTimeout: config.readyTimeoutMs ?? 25000,
      keepaliveInterval: 10000,
    }

    if (password && config.keyboardOnly) {
      client.connect({ ...base, tryKeyboard: true })
      return
    }

    client.connect({
      ...base,
      password: password || undefined,
      tryKeyboard: Boolean(password && config.tryKeyboard !== false),
    })
  })
}

export async function connectWithFallback(configs: SshConnectConfig[]): Promise<SshConnected> {
  const errors: string[] = []
  for (const config of configs) {
    try {
      const client = await connectOnce(config)
      return { client, username: config.username }
    } catch (error) {
      const label = `${config.username}@${config.host}:${config.port}`
      const method = config.authLabel ? `${config.authLabel}: ` : ''
      errors.push(`${label}: ${method}${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(errors.join('\n') || 'No se pudo conectar por SSH.')
}

function normalizeHyraKey(raw: string): string {
  let key = raw.trim()
  if (key.includes('\\n')) key = key.replace(/\\n/g, '\n')
  return key
}

function looksLikePrivateKey(key: string): boolean {
  return /BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY/.test(key)
}

async function parsePpkContent(content: string, passphrase = ''): Promise<string> {
  const parser = new PPKParser()
  const result = await parser.parse(content, passphrase || undefined)
  return result.privateKey
}

/** Carga llave .ppk (PuTTY) o OpenSSH (.pem) desde disco. */
export async function loadPrivateKey(keyPath: string, passphrase = ''): Promise<string> {
  const resolved = resolveSshKeyPath(keyPath)
  if (!resolved) throw new Error('Ruta de llave vacía.')
  if (!fs.existsSync(resolved)) throw new Error(`No existe la llave: ${resolved}`)

  const content = fs.readFileSync(resolved, 'utf8')
  if (content.includes('PuTTY-User-Key-File')) {
    return parsePpkContent(content, passphrase)
  }

  return content
}

export async function execOnClient(
  client: Client,
  command: string,
  timeoutMs = 120000,
): Promise<SshExecResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tiempo de espera agotado.')), timeoutMs)
    client.exec(command, (error, stream) => {
      if (error) {
        clearTimeout(timer)
        reject(error)
        return
      }
      let stdout = ''
      let stderr = ''
      stream
        .on('close', (code: number) => {
          clearTimeout(timer)
          resolve({ stdout, stderr, code: code ?? 0 })
        })
        .on('data', (data: Buffer) => {
          stdout += data.toString('utf8')
        })
      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
      })
    })
  })
}

export function closeClient(client: Client | null) {
  try {
    client?.end()
  } catch {
    // ignore
  }
}

export async function buildConnectAttempts(
  host: string,
  settings: {
    sshUser: string
    sshPort: number
    sshKeyPath: string
    sshPassword: string
  },
  hyraKey?: string,
  mode: 'settings' | 'root' = 'settings',
): Promise<{ attempts: SshConnectConfig[]; keyPathError?: string; keyPath?: string }> {
  const attempts: SshConnectConfig[] = []
  let keyPathError: string | undefined
  const port = settings.sshPort || 22
  const user = settings.sshUser || 'opc'
  const users = mode === 'root' ? ['root'] : uniqueUsers(user)
  const keyPath = resolveSshKeyPath(settings.sshKeyPath)

  if (keyPath) {
    try {
      const privateKey = await loadPrivateKey(keyPath, settings.sshPassword)
      for (const username of users) {
        attempts.push({ host, port, username, privateKey })
      }
    } catch (error) {
      keyPathError = error instanceof Error ? error.message : String(error)
    }
  }

  if (settings.sshPassword) {
    for (const username of users) {
      attempts.push({
        host,
        port,
        username,
        password: settings.sshPassword,
        tryKeyboard: true,
        authLabel: 'contraseña',
      })
    }
  }

  if (mode === 'settings' && hyraKey?.trim()) {
    const normalized = normalizeHyraKey(hyraKey)
    if (looksLikePrivateKey(normalized)) {
      for (const username of users) {
        attempts.push({ host, port, username, privateKey: normalized })
      }
    }
  }

  return { attempts, keyPathError, keyPath: keyPath || undefined }
}
