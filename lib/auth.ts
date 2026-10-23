import type { SessionUser } from '@/lib/user'

export const SESSION_COOKIE = 'hyra_session'
export const SESSION_MAX_AGE = 60 * 60 * 8

export type SessionPayload = SessionUser & {
  exp: number
  idpToken: string
}

function getAuthSecret(): string {
  return process.env.AUTH_SECRET ?? 'dev-secret-cambiar-en-produccion'
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function hmacSign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  // crypto.subtle.sign devuelve ArrayBuffer; indexarlo directo da undefined
  // y la firma salía siempre igual (sesiones forjables). Convertir a bytes.
  const sigBytes = new Uint8Array(sig)
  let binary = ''
  for (let i = 0; i < sigBytes.length; i++) binary += String.fromCharCode(sigBytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createSessionToken(user: SessionUser, idpToken: string): Promise<string> {
  const payload: SessionPayload = {
    email: user.email,
    name: user.name,
    idpToken,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  }
  const payloadStr = toBase64Url(JSON.stringify(payload))
  const sig = await hmacSign(payloadStr)
  return `${payloadStr}.${sig}`
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  const payload = await verifySessionPayload(token)
  if (!payload) return null
  return { email: payload.email, name: payload.name }
}

export async function verifySessionPayload(token: string): Promise<SessionPayload | null> {
  const [payloadStr, sig] = token.split('.')
  if (!payloadStr || !sig) return null

  const expected = await hmacSign(payloadStr)
  if (expected.length !== sig.length) return null
  let match = 0
  for (let i = 0; i < expected.length; i++) match |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (match !== 0) return null

  try {
    const payload = JSON.parse(fromBase64Url(payloadStr)) as SessionPayload
    if (!payload.email || !payload.name || !payload.idpToken || payload.exp < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}
