'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  verifySessionPayload,
  verifySessionToken,
} from '@/lib/auth'
import { INSTANCE_COOKIE } from '@/lib/entorno'
import { fetchIdpMe, IdpAuthError, loginToIdp, mapIdpMeToUser } from '@/lib/idp'
import type { SessionUser } from '@/lib/user'

export async function loginAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Ingresa tu correo y contraseña.' }
  }

  let idpToken: string
  let user: SessionUser

  try {
    idpToken = await loginToIdp(email, password)
    const me = await fetchIdpMe(idpToken)
    user = mapIdpMeToUser(me, email)
  } catch (error) {
    if (error instanceof IdpAuthError) {
      return { error: error.message }
    }
    return { error: 'No se pudo conectar con el servidor de autenticación.' }
  }

  const token = await createSessionToken(user, idpToken)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })

  const from = String(formData.get('from') ?? '/instancias')
  const safeFrom =
    from.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : '/instancias'
  redirect(safeFrom)
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  cookieStore.delete(INSTANCE_COOKIE)
  redirect('/login')
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function getIdpAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  const payload = await verifySessionPayload(token)
  return payload?.idpToken ?? null
}
