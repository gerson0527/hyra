import { getSshSettingsForApi } from '@/lib/ssh-settings'
import type { SftpSite } from '@/lib/sftp-sites'
import type { SftpDirEntry } from '@/lib/sftp-server'

const fetchOpts: RequestInit = {
  cache: 'no-store',
  credentials: 'include',
}

export type SftpStatus = {
  connected: boolean
  host?: string
  port?: number
  username?: string
  siteId?: string
  siteLabel?: string
  remotePath?: string
}

export async function fetchSftpStatus(siteId: string): Promise<SftpStatus> {
  const response = await fetch(`/api/sftp/status?siteId=${encodeURIComponent(siteId)}`, fetchOpts)
  return response.json()
}

export async function connectSftp(site: SftpSite, password: string) {
  const settings = getSshSettingsForApi('settings')
  const response = await fetch('/api/sftp/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      siteId: site.id,
      site: {
        id: site.id,
        label: site.label,
        host: site.host,
        port: site.port,
        username: site.username,
        defaultPath: site.defaultPath,
        bookmarks: site.bookmarks,
      },
      settings: {
        sshKeyPath: settings.sshKeyPath,
        keyPassphrase: settings.sshPassword,
        password: password.trim(),
      },
    }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo conectar por SFTP.')
  }
  return data as {
    host: string
    port: number
    username: string
    siteId: string
    siteLabel: string
    remotePath: string
    reused?: boolean
  }
}

export async function disconnectSftp(siteId: string): Promise<void> {
  await fetch('/api/sftp/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ siteId }),
  })
}

export async function uploadToSftp(
  siteId: string,
  files: Array<{ localPath: string; remotePath: string }>,
): Promise<{ ok: boolean; results: Array<{ localPath: string; remotePath: string; ok: boolean; error?: string }> }> {
  const response = await fetch('/api/sftp/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ siteId, files }),
  })
  const data = await response.json()
  if (!response.ok) {
    const msgs = data.results
      ? data.results.filter((r: any) => r.error).map((r: any) => `${r.remotePath}: ${r.error}`).join('\n')
      : data.error || 'No se pudieron subir los archivos.'
    throw new Error(msgs)
  }
  return data
}

export async function listSftpDirectory(
  siteId: string,
  path?: string,
): Promise<{ path: string; entries: SftpDirEntry[] }> {
  const qs = new URLSearchParams({ siteId })
  if (path) qs.set('path', path)
  const response = await fetch(`/api/sftp/list?${qs.toString()}`, fetchOpts)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo listar el directorio remoto.')
  }
  return data
}

export async function deleteSftpFile(siteId: string, path: string, isDir?: boolean): Promise<void> {
  const response = await fetch('/api/sftp/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ siteId, path, isDir }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'No se pudo eliminar.')
}

export async function renameSftpFile(siteId: string, src: string, dest: string): Promise<void> {
  const response = await fetch('/api/sftp/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ siteId, src, dest }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'No se pudo renombrar/mover.')
}

export async function statSftpFile(siteId: string, path: string): Promise<{
  size: number; mtime: number; atime: number; mode: number; isDirectory: boolean; isFile: boolean
}> {
  const response = await fetch('/api/sftp/stat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ siteId, path }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'No se pudo obtener atributos.')
  return data.stat
}

export async function downloadSftpFile(siteId: string, path: string): Promise<Blob> {
  const response = await fetch('/api/sftp/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ siteId, path }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'No se pudo descargar.')
  }
  return response.blob()
}
