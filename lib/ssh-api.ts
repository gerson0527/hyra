import { getSshSettingsForApi } from '@/lib/ssh-settings'

export type SshStatus = {
  connected: boolean
  host?: string
  username?: string
}

const fetchOpts: RequestInit = {
  cache: 'no-store',
  credentials: 'include',
}

export async function fetchSshStatus(): Promise<SshStatus> {
  const response = await fetch('/api/ssh/status', fetchOpts)
  return response.json()
}

export async function connectSsh(entorno: { id: string; ip: string }): Promise<{
  host: string
  username: string
  reused?: boolean
}> {
  const settings = getSshSettingsForApi('settings')
  const response = await fetch('/api/ssh/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      settings,
      entornoId: entorno.id,
      host: entorno.ip,
    }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo conectar por SSH.')
  }
  return data
}

export async function disconnectSsh(): Promise<void> {
  await fetch('/api/ssh/disconnect', {
    method: 'POST',
    credentials: 'include',
  })
}

export async function fetchDockerStats(): Promise<{
  containers: { name: string; cpu: string; mem: string }[]
  list?: { name: string; image: string; status: string; uptime: string; ports: string }[]
}> {
  const response = await fetch('/api/ssh/docker-stats', fetchOpts)
  return response.json()
}

export async function execSsh(
  entornoId: string,
  payload: {
    command?: string
    commands?: string[]
    container?: string | null
    prepared?: boolean
    presetDocker?: boolean
  },
) {
  const settings = getSshSettingsForApi('settings')
  const response = await fetch('/api/ssh/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      ...payload,
      entornoId,
      settings: { useSudoDocker: settings.useSudoDocker },
    }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Error al ejecutar comando.')
  }
  return data as { output: string[]; host: string; username: string }
}
