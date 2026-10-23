import { Client, type SFTPWrapper } from 'ssh2'
import {
  closeClient,
  connectWithFallback,
  loadPrivateKey,
  resolveSshKeyPath,
  type SshConnectConfig,
} from '@/lib/ssh-server'

export type SftpDirEntry = {
  name: string
  type: 'dir' | 'file'
  size: string
  modified: string
  sizeBytes: number
  mtimeMs: number
}

const SFTP_READY_TIMEOUT_MS = 12_000

function formatSize(bytes: number): string {
  if (bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatMtime(seconds?: number): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) reject(error)
      else resolve(sftp)
    })
  })
}

export type SftpAuthSettings = {
  sshKeyPath: string
  keyPassphrase?: string
  password?: string
}

function isNonSshProtocolError(message: string): boolean {
  return /Packet length \d+ exceeds max length/i.test(message)
}

export function formatSftpConnectError(message: string, host: string, port: number): string {
  if (isNonSshProtocolError(message)) {
    return (
      `El puerto ${port} en ${host} no responde como SSH/SFTP.\n` +
      'Se probará otro host de la instancia si está disponible.'
    )
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return (
      `No se resolvió el host ${host} (DNS).\n` +
      'Verifica el nombre de la instancia (ej. unimaiapost1080dev.tiresia.info).'
    )
  }
  if (/authentication methods failed/i.test(message)) {
    return `${message}\nRevisa la contraseña SFTP (root en puertos 23/27).`
  }
  return message
}

function isDnsError(message: string): boolean {
  return /ENOTFOUND|EAI_AGAIN/i.test(message)
}

function isRetryableHostError(message: string): boolean {
  return isDnsError(message) || isNonSshProtocolError(message)
}

/** WinSCP: un intento por contraseña (+ keyboard-interactive) y fallback opc si el usuario configurado falla. */
function buildSftpFastAttempts(
  host: string,
  port: number,
  username: string,
  password: string,
): SshConnectConfig[] {
  const attempts: SshConnectConfig[] = [
    {
      host,
      port,
      username,
      password,
      tryKeyboard: true,
      readyTimeoutMs: SFTP_READY_TIMEOUT_MS,
      authLabel: 'contraseña',
    },
  ]
  if (username.trim() !== 'opc') {
    attempts.push({
      host,
      port,
      username: 'opc',
      password,
      tryKeyboard: true,
      readyTimeoutMs: SFTP_READY_TIMEOUT_MS,
      authLabel: 'contraseña (opc)',
    })
  }
  return attempts
}

/** Respaldo lento: llaves solo si la contraseña rápida falló. */
async function buildSftpFallbackAttempts(
  host: string,
  port: number,
  username: string,
  settings: SftpAuthSettings,
  hyraKey?: string,
): Promise<{ attempts: SshConnectConfig[]; keyPathError?: string }> {
  const attempts: SshConnectConfig[] = []
  let keyPathError: string | undefined
  const keyPath = resolveSshKeyPath(settings.sshKeyPath)
  const keyPassphrase = settings.keyPassphrase?.trim() || ''
  const loginPassword = settings.password?.trim() || ''

  if (keyPath) {
    try {
      const privateKey = await loadPrivateKey(keyPath, keyPassphrase)
      attempts.push({
        host,
        port,
        username,
        privateKey,
        readyTimeoutMs: SFTP_READY_TIMEOUT_MS,
        authLabel: 'llave .ppk',
      })
    } catch (error) {
      keyPathError = error instanceof Error ? error.message : String(error)
    }
  }

  if (loginPassword) {
    attempts.push({
      host,
      port,
      username,
      password: loginPassword,
      tryKeyboard: true,
      keyboardOnly: true,
      readyTimeoutMs: SFTP_READY_TIMEOUT_MS,
      authLabel: 'teclado interactivo',
    })
  }

  const hyraPrivateKey =
    hyraKey?.trim() && /BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY/.test(hyraKey)
      ? hyraKey.replace(/\\n/g, '\n')
      : undefined

  if (hyraPrivateKey) {
    attempts.push({
      host,
      port,
      username,
      privateKey: hyraPrivateKey,
      readyTimeoutMs: SFTP_READY_TIMEOUT_MS,
      authLabel: 'llave Hyra',
    })
  }

  return { attempts, keyPathError }
}

async function tryConnectHost(
  host: string,
  port: number,
  username: string,
  settings: SftpAuthSettings,
  hyraKey?: string,
): Promise<{ client: Client; username: string; host: string }> {
  const password = settings.password?.trim() || ''

  if (password) {
    try {
      const connected = await connectWithFallback(
        buildSftpFastAttempts(host, port, username, password),
      )
      return { ...connected, host }
    } catch (fastError) {
      const fastMsg = fastError instanceof Error ? fastError.message : String(fastError)
      if (isDnsError(fastMsg)) throw fastError
    }
  }

  const { attempts, keyPathError } = await buildSftpFallbackAttempts(
    host,
    port,
    username,
    settings,
    hyraKey,
  )
  if (attempts.length === 0) {
    throw new Error(
      keyPathError
        ? `No se pudo leer la llave: ${keyPathError}`
        : 'Configura la llave .ppk o indica la contraseña SFTP.',
    )
  }
  const connected = await connectWithFallback(attempts)
  return { ...connected, host }
}

export async function connectSftp(
  hosts: string | string[],
  port: number,
  username: string,
  settings: SftpAuthSettings,
  hyraKey?: string,
  fallbackIp = '',
) {
  const primaryHosts = [
    ...new Set((Array.isArray(hosts) ? hosts : [hosts]).map((h) => h.trim()).filter(Boolean)),
  ]
  if (primaryHosts.length === 0 && !fallbackIp.trim()) {
    throw new Error('La instancia no tiene host para SFTP.')
  }

  const hostQueue = [...primaryHosts]
  const ip = fallbackIp.trim()
  if (ip && !hostQueue.includes(ip)) hostQueue.push(ip)

  const errors: string[] = []

  for (let i = 0; i < hostQueue.length; i++) {
    const host = hostQueue[i]
    try {
      return await tryConnectHost(host, port, username, settings, hyraKey)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`[${host}:${port}] ${message}`)
      const hasNext = i < hostQueue.length - 1
      if (!hasNext || !isRetryableHostError(message)) break
    }
  }

  throw new Error(errors.join('\n') || 'No se pudo conectar por SFTP.')
}

export async function sftpListDirectory(
  client: Client,
  dirPath: string,
): Promise<{ path: string; entries: SftpDirEntry[] }> {
  const sftp = await openSftp(client)
  try {
    const normalized = dirPath?.trim() || '/'
    const list = await new Promise<
      Array<{
        filename: string
        attrs: {
          size?: number
          mtime?: number
          isDirectory?: () => boolean
          isDir?: () => boolean
        }
      }>
    >((resolve, reject) => {
      sftp.readdir(normalized, (error, result) => {
        if (error) reject(error)
        else resolve(result)
      })
    })

    const entries: SftpDirEntry[] = list
      .filter((item) => item.filename !== '.' && item.filename !== '..')
      .map((item) => {
        const isDir =
          typeof item.attrs.isDirectory === 'function'
            ? item.attrs.isDirectory()
            : typeof item.attrs.isDir === 'function'
              ? item.attrs.isDir()
              : false
        return {
          name: item.filename,
          type: isDir ? 'dir' : 'file',
          size: isDir ? '—' : formatSize(item.attrs.size ?? 0),
          modified: formatMtime(item.attrs.mtime),
          sizeBytes: isDir ? 0 : (item.attrs.size ?? 0),
          mtimeMs: item.attrs.mtime ? item.attrs.mtime * 1000 : 0,
        }
      })

    return { path: normalized, entries }
  } finally {
    sftp.end()
  }
}

export async function sftpUploadFile(
  client: Client,
  localPath: string,
  remotePath: string,
): Promise<void> {
  const sftp = await openSftp(client)
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(localPath, remotePath, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  } finally {
    sftp.end()
  }
}

export async function sftpMkdir(
  client: Client,
  remotePath: string,
): Promise<void> {
  const sftp = await openSftp(client)
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(remotePath, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  } finally {
    sftp.end()
  }
}

export async function sftpDelete(client: Client, remotePath: string, isDir: boolean): Promise<void> {
  const sftp = await openSftp(client)
  try {
    await new Promise<void>((resolve, reject) => {
      if (isDir) {
        sftp.rmdir(remotePath, (error) => {
          if (error) reject(error)
          else resolve()
        })
      } else {
        sftp.unlink(remotePath, (error) => {
          if (error) reject(error)
          else resolve()
        })
      }
    })
  } finally {
    sftp.end()
  }
}

export async function sftpRename(client: Client, srcPath: string, destPath: string): Promise<void> {
  const sftp = await openSftp(client)
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.rename(srcPath, destPath, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  } finally {
    sftp.end()
  }
}

export type SftpFileStat = {
  size: number
  mtime: number
  atime: number
  mode: number
  isDirectory: boolean
  isFile: boolean
}

export async function sftpStat(client: Client, remotePath: string): Promise<SftpFileStat> {
  const sftp = await openSftp(client)
  try {
    const attrs = await new Promise<{ size?: number; mtime?: number; atime?: number; mode?: number; isDirectory?: () => boolean; isFile?: () => boolean }>((resolve, reject) => {
      sftp.stat(remotePath, (error, result) => {
        if (error) reject(error)
        else resolve(result as never)
      })
    })
    return {
      size: attrs.size ?? 0,
      mtime: attrs.mtime ?? 0,
      atime: attrs.atime ?? 0,
      mode: attrs.mode ?? 0,
      isDirectory: typeof attrs.isDirectory === 'function' ? attrs.isDirectory() : false,
      isFile: typeof attrs.isFile === 'function' ? attrs.isFile() : !(typeof attrs.isDirectory === 'function' ? attrs.isDirectory() : false),
    }
  } finally {
    sftp.end()
  }
}

export async function sftpCopy(client: Client, srcPath: string, destPath: string): Promise<void> {
  const sftp = await openSftp(client)
  try {
    const data = await new Promise<Buffer>((resolve, reject) => {
      sftp.readFile(srcPath, (error, buf) => {
        if (error) reject(error)
        else resolve(buf)
      })
    })
    await new Promise<void>((resolve, reject) => {
      sftp.writeFile(destPath, data, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  } finally {
    sftp.end()
  }
}

export async function sftpDownloadFile(
  client: Client,
  remotePath: string,
): Promise<Buffer> {
  const sftp = await openSftp(client)
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      sftp.readFile(remotePath, (error, data) => {
        if (error) reject(error)
        else resolve(data)
      })
    })
  } finally {
    sftp.end()
  }
}

export { closeClient }
