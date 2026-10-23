'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getIdpAccessToken, getSession } from '@/app/actions/auth'
import { SESSION_MAX_AGE } from '@/lib/auth'
import {
  INSTANCE_COOKIE,
  mysqlHostFromName,
  parseEntorno,
  parseEntornos,
  type HyraEntorno,
} from '@/lib/entorno'
import { getEntorno, IdpAuthError, listEntornos, listEntornosMaiaweb } from '@/lib/idp'
import { findEntornoStateByName, resolveIpFromDns } from '@/lib/entorno-lookup'

const MANUAL_ENTORNOS_COOKIE = 'hyra_manual_entornos'

type ManualEntorno = {
  id: string
  nombre: string
  ip: string
  estado: string
  fechacreacion: string
}

function readManualEntornos(cookieStore: Awaited<ReturnType<typeof cookies>>): ManualEntorno[] {
  try {
    const raw = cookieStore.get(MANUAL_ENTORNOS_COOKIE)?.value
    if (!raw) return []
    const parsed = JSON.parse(raw) as ManualEntorno[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function manualToHyraEntorno(item: ManualEntorno): HyraEntorno {
  return {
    id: item.id,
    name: item.nombre,
    ip: item.ip,
    estado: item.estado.toLowerCase(),
    statusText: item.estado,
    estadotarea: '',
    asignado: '',
    informador: '',
    cliente: '',
    fechacreacion: item.fechacreacion,
    habilitacion: '',
    expiresAt: '',
    llave: '',
    mysqlHost: mysqlHostFromName(item.nombre),
  }
}

export async function fetchEntornosForSession(): Promise<HyraEntorno[]> {
  const idpToken = await getIdpAccessToken()
  if (!idpToken) {
    throw new IdpAuthError('Sesión no válida.', 401)
  }

  const results = await Promise.allSettled([
    listEntornos(idpToken),
    listEntornosMaiaweb(idpToken),
  ])

  const cookieStore = await cookies()
  const rawManual = readManualEntornos(cookieStore)
  // Entradas fijadas sin IP: resolverla vía DNS tiresia.info y guardarla,
  // para que la lista muestre la IP sin tener que abrir el detalle.
  const missingIp = rawManual.filter((item) => !item.ip.trim())
  if (missingIp.length > 0) {
    await Promise.all(
      missingIp.map(async (item) => {
        const dnsIp = await resolveIpFromDns(item.nombre)
        if (dnsIp) item.ip = dnsIp
      }),
    )
    if (missingIp.some((item) => item.ip.trim())) {
      try {
        // Puede fallar si se ejecuta durante un render de Server Component;
        // en ese caso la IP igual se muestra en esta respuesta.
        cookieStore.set(MANUAL_ENTORNOS_COOKIE, JSON.stringify(rawManual), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365,
          path: '/',
        })
      } catch {
        // no persistir en este render; la próxima acción lo guardará
      }
    }
  }
  const manual = rawManual.map(manualToHyraEntorno)

  const merged = new Map<string, HyraEntorno>()
  for (const item of manual) merged.set(item.id, item)
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const raw of result.value) {
      const entorno = parseEntorno(raw)
      if (!merged.has(entorno.id)) merged.set(entorno.id, entorno)
    }
  }
  // Reconciliar: si la API ya trae la máquina (por nombre) que se había
  // guardado como manual "iniciando", reemplazar la manual por la real
  // para que deje de decir "iniciando" y muestre IP/estado verdaderos.
  const byName = new Map<string, HyraEntorno>()
  for (const item of merged.values()) {
    if (!item.id.startsWith('manual:')) {
      byName.set(item.name.trim().toLowerCase(), item)
    }
  }
  for (const item of [...merged.values()]) {
    if (!item.id.startsWith('manual:')) continue
    const real = byName.get(item.name.trim().toLowerCase())
    if (real) merged.delete(item.id)
  }
  return [...merged.values()]
}

export async function getSelectedEntorno(): Promise<HyraEntorno | null> {
  const cookieStore = await cookies()
  const id = cookieStore.get(INSTANCE_COOKIE)?.value
  if (!id) return null

  // Las entradas manuales/fijadas (manual:...) no existen en la API:
  // resolverlas desde la cookie para que la tarjeta sí abra. Si la API
  // expone datos reales (IP/estado), enriquecer y guardar; si no hay IP,
  // resolverla vía DNS del hostname tiresia.info.
  if (id.startsWith('manual:')) {
    const list = readManualEntornos(cookieStore)
    const entry = list.find((item) => item.id === id)
    if (!entry) return null
    const found = manualToHyraEntorno(entry)
    let changed = false
    try {
      const idpToken = await getIdpAccessToken()
      if (idpToken) {
        const real = await findEntornoStateByName(idpToken, found.name)
        if (real?.estado && real.estado !== entry.estado) {
          entry.estado = real.estado
          changed = true
        }
        if (real?.ip && real.ip !== entry.ip) {
          entry.ip = real.ip
          changed = true
        }
      }
    } catch {
      // sin datos de la API: intentar DNS igual
    }
    if (!entry.ip) {
      const dnsIp = await resolveIpFromDns(found.name)
      if (dnsIp) {
        entry.ip = dnsIp
        changed = true
      }
    }
    if (changed) {
      try {
        // Puede fallar durante un render de Server Component; la IP/estado
        // igual se devuelven en esta respuesta.
        cookieStore.set(MANUAL_ENTORNOS_COOKIE, JSON.stringify(list), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365,
          path: '/',
        })
      } catch {
        // no persistir en este render
      }
      return manualToHyraEntorno(entry)
    }
    return found
  }

  try {
    const idpToken = await getIdpAccessToken()
    if (!idpToken) return null
    const raw = await getEntorno(idpToken, id)
    return parseEntorno(raw)
  } catch {
    // Fallback: si la API no la devuelve (ej. máquina ajena), buscar en la
    // lista visible antes de rendirse.
    try {
      const entornos = await fetchEntornosForSession()
      return entornos.find((item) => item.id === id) ?? null
    } catch {
      return null
    }
  }
}

export async function selectInstanceAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) {
    return { error: 'Selecciona una instancia.' }
  }

  try {
    const entornos = await fetchEntornosForSession()
    const entorno = entornos.find((item) => item.id === id)
    if (!entorno) {
      return { error: 'La instancia seleccionada no está disponible.' }
    }

    const cookieStore = await cookies()
    cookieStore.set(INSTANCE_COOKIE, entorno.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    })
  } catch (error) {
    if (error instanceof IdpAuthError) {
      return { error: error.message }
    }
    return { error: 'No se pudo validar la instancia.' }
  }

  redirect('/')
}

export async function clearSelectedInstance(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(INSTANCE_COOKIE)
}

export async function refreshEntornosPath(): Promise<void> {
  revalidatePath('/instancias')
  revalidatePath('/')
}

// Actualiza la IP de una entrada manual/fijada (ej. desde el detalle),
// para que SSH, archivos y SQL puedan conectar.
export async function updateManualIpAction(
  _prev: { error?: string; ok?: string },
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  const ip = String(formData.get('ip') ?? '').trim()
  if (!id || !id.startsWith('manual:')) return { error: 'Instancia no editable.' }
  if (!ip) return { error: 'Indica la IP.' }

  const cookieStore = await cookies()
  const list = readManualEntornos(cookieStore)
  const entry = list.find((item) => item.id === id)
  if (!entry) return { error: 'La instancia ya no está en la lista.' }
  entry.ip = ip
  cookieStore.set(MANUAL_ENTORNOS_COOKIE, JSON.stringify(list), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
  revalidatePath('/')
  revalidatePath('/instancias')
  return { ok: `IP actualizada a ${ip}.` }
}
