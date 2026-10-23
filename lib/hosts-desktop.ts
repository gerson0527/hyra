import { WINDOWS_HOSTS_PATH } from '@/lib/hosts-file'

export type HostsReadResult = {
  path: string
  content: string
}

export type HostsWriteResult = {
  ok: boolean
  error?: string
  elevated?: boolean
}

type HyraHostsDesktop = {
  readHosts?: () => Promise<HostsReadResult>
  writeHosts?: (content: string) => Promise<HostsWriteResult>
  openHostsFile?: () => Promise<{ ok: boolean; error?: string }>
}

function hyra(): HyraHostsDesktop | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { hyra?: HyraHostsDesktop }).hyra
}

export function isHostsAvailable(): boolean {
  return typeof hyra()?.readHosts === 'function'
}

export async function readHostsFile(): Promise<HostsReadResult> {
  const fn = hyra()?.readHosts
  if (!fn) {
    throw new Error('La gestión de hosts requiere la app de escritorio (npm run desktop).')
  }
  return fn()
}

export async function writeHostsFile(content: string): Promise<HostsWriteResult> {
  const fn = hyra()?.writeHosts
  if (!fn) {
    return { ok: false, error: 'La escritura de hosts requiere la app de escritorio.' }
  }
  return fn(content)
}

export async function openHostsInEditor(): Promise<{ ok: boolean; error?: string }> {
  const fn = hyra()?.openHostsFile
  if (!fn) {
    return { ok: false, error: 'Requiere la app de escritorio.' }
  }
  return fn()
}

export { WINDOWS_HOSTS_PATH }
