import { promises as dnsPromises } from 'node:dns'
import {
  getEntorno,
  getInfraEnvironmentStatus,
  listEntornos,
  listEntornosMaiaweb,
} from '@/lib/idp'
import { mysqlHostFromName, parseEntorno } from '@/lib/entorno'

// Resuelve la IP pública vía DNS del hostname tiresia.info
// (ej: unimaiapos1080qa.tiresia.info). Funciona aunque la máquina
// no sea del usuario, si el DNS la publica.
export async function resolveIpFromDns(name: string): Promise<string> {
  const host = mysqlHostFromName(name)
  if (!host) return ''
  try {
    const result = await dnsPromises.lookup(host)
    return result?.address?.trim() ?? ''
  } catch {
    return ''
  }
}

// Busca el estado real de una máquina por nombre sin importar de quién sea:
// detalle directo -> API de infra -> escaneo de listas completas.
export async function findEntornoStateByName(
  idpToken: string,
  name: string,
): Promise<{ estado: string; ip: string } | null> {
  const target = name.trim().toLowerCase()
  if (!target) return null
  try {
    const raw = await getEntorno(idpToken, name.trim())
    const parsed = parseEntorno(raw)
    if (parsed.name && parsed.name.toLowerCase() !== 'sin nombre') {
      return { estado: parsed.statusText || parsed.estado, ip: parsed.ip }
    }
  } catch {
    // continúa con infra y listas
  }
  // Estado directo en la API de infra (no filtra por dueño).
  try {
    const infra = await getInfraEnvironmentStatus(idpToken, name.trim())
    if (infra) {
      const parsed = parseEntorno(infra)
      const estado = parsed.statusText || parsed.estado
      if (estado) return { estado, ip: parsed.ip }
    }
  } catch {
    // continúa con el escaneo de listas
  }
  try {
    const results = await Promise.allSettled([
      listEntornos(idpToken),
      listEntornosMaiaweb(idpToken),
    ])
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      for (const raw of result.value) {
        const parsed = parseEntorno(raw)
        if (parsed.name.trim().toLowerCase() === target) {
          return { estado: parsed.statusText || parsed.estado, ip: parsed.ip }
        }
      }
    }
  } catch {
    // ignore
  }
  return null
}

// Extrae estado/IP de la respuesta del start (defensivo ante varias formas).
export function extractStateFromStartResult(res: unknown): { estado: string; ip: string } | null {
  if (!res || typeof res !== 'object') return null
  const root = res as Record<string, unknown>
  const nested = root.environment ?? root.data
  const obj =
    nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : root
  const str = (key: string) => (typeof obj[key] === 'string' ? (obj[key] as string) : '')
  const estado = str('estado') || str('status') || str('state')
  const ip = str('ip') || str('public_ip') || str('ip_address') || str('ipAddress')
  if (!estado && !ip) return null
  return { estado, ip }
}
