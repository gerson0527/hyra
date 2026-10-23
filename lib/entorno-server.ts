import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionPayload } from '@/lib/auth'
import { INSTANCE_COOKIE, parseEntorno, type HyraEntorno } from '@/lib/entorno'
import { getEntorno } from '@/lib/idp'

/** Resuelve el entorno seleccionado leyendo cookies (válido en Route Handlers). */
export async function resolveSelectedEntorno(): Promise<HyraEntorno | null> {
  const jar = await cookies()
  const entornoId = jar.get(INSTANCE_COOKIE)?.value
  if (!entornoId) return null

  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  const payload = await verifySessionPayload(token)
  const idpToken = payload?.idpToken
  if (!idpToken) return null

  try {
    const raw = await getEntorno(idpToken, entornoId)
    return parseEntorno(raw)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[entorno-server] error resolving entorno:', err)
    }
    return null
  }
}

export async function resolveSelectedEntornoId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(INSTANCE_COOKIE)?.value ?? null
}
