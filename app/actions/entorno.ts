'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getIdpAccessToken, getSession } from '@/app/actions/auth'
import { getSelectedEntorno } from '@/app/actions/instance'
import {
  extendRuntime,
  IdpAuthError,
  startInstanceOnDemand,
  stopInstanceOnDemand,
} from '@/lib/idp'
import {
  extractStateFromStartResult,
  findEntornoStateByName,
  resolveIpFromDns,
} from '@/lib/entorno-lookup'

function formatExpiresAt(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

async function revalidateAfterAction() {
  revalidatePath('/')
  revalidatePath('/instancias')
}

// Guarda una máquina en la lista visible aunque no pertenezca al usuario
// (la API solo devuelve las propias). Si no hay IP, intenta resolverla por DNS.
async function saveVisibleEntorno(entName: string, estado: string, ip = '') {
  let finalIp = ip.trim()
  if (!finalIp) finalIp = await resolveIpFromDns(entName)
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get('hyra_manual_entornos')?.value
    const list: { id: string; nombre: string; ip: string; estado: string; fechacreacion: string }[] =
      raw ? (JSON.parse(raw) as typeof list) : []
    const id = `manual:${entName}`
    const filtered = (Array.isArray(list) ? list : []).filter((item) => item.id !== id)
    filtered.push({
      id,
      nombre: entName,
      ip: finalIp,
      estado,
      fechacreacion: new Date().toISOString().slice(0, 10),
    })
    cookieStore.set('hyra_manual_entornos', JSON.stringify(filtered), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })
  } catch {
    // ignore
  }
}

export async function startEntornoAction(
  _prev: { error?: string; ok?: string },
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const hours = Number(formData.get('hours') ?? 8)
  if (!Number.isFinite(hours) || hours < 1 || hours > 72) {
    return { error: 'Indica entre 1 y 72 horas.' }
  }

  const session = await getSession()
  const entorno = await getSelectedEntorno()
  const idpToken = await getIdpAccessToken()
  if (!session || !entorno || !idpToken) {
    return { error: 'No hay instancia seleccionada.' }
  }

  try {
    await startInstanceOnDemand(
      idpToken,
      entorno.name,
      hours,
      formatExpiresAt(hours),
      session.name,
      session.email,
    )
    await revalidateAfterAction()
    return { ok: `Iniciando '${entorno.name}'…` }
  } catch (error) {
    if (error instanceof IdpAuthError) return { error: error.message }
    return { error: 'No se pudo iniciar la instancia.' }
  }
}

export async function stopEntornoAction(
  _prev: { error?: string; ok?: string },
  _formData?: FormData,
): Promise<{ error?: string; ok?: string }> {
  const session = await getSession()
  const entorno = await getSelectedEntorno()
  const idpToken = await getIdpAccessToken()
  if (!session || !entorno || !idpToken) {
    return { error: 'No hay instancia seleccionada.' }
  }

  try {
    await stopInstanceOnDemand(idpToken, entorno.name, session.name, session.email)
    await revalidateAfterAction()
    return { ok: `Deteniendo '${entorno.name}'…` }
  } catch (error) {
    if (error instanceof IdpAuthError) return { error: error.message }
    return { error: 'No se pudo detener la instancia.' }
  }
}

export async function startEntornoByNameAction(
  _prev: { error?: string; ok?: string },
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const name = String(formData.get('name') ?? '').trim()
  const hours = Number(formData.get('hours') ?? 8)
  if (!name) return { error: 'Indica el nombre de la instancia.' }
  if (!Number.isFinite(hours) || hours < 1 || hours > 72) {
    return { error: 'Indica entre 1 y 72 horas.' }
  }

  const session = await getSession()
  const idpToken = await getIdpAccessToken()
  if (!session || !idpToken) return { error: 'No hay sesión activa.' }

  const token = idpToken as string

  try {
    const startResult = await startInstanceOnDemand(
      token,
      name,
      hours,
      formatExpiresAt(hours),
      session.name,
      session.email,
    )
    // Guardar la instancia iniciada por nombre para que aparezca en la lista
    // aunque no pertenezca al usuario (las lecturas filtran por dueño y no la
    // ven). El start devolvió éxito, así que se confía en el encendido:
    // estado verificado > datos de la respuesta > "corriendo" (confirmado).
    const real = await findEntornoStateByName(token, name)
    const hint = extractStateFromStartResult(startResult)
    const estado = real?.estado || hint?.estado || 'corriendo'
    const ip = real?.ip || hint?.ip || ''
    await saveVisibleEntorno(name, estado, ip)
    await revalidateAfterAction()
    if ((real?.estado ?? hint?.estado ?? '').toLowerCase().startsWith('corriendo')) {
      return { ok: `'${name}' ya está encendida y ahora aparece en tu lista.` }
    }
    const backendMsg =
      startResult && typeof startResult === 'object'
        ? String(
            (startResult as { message?: unknown }).message ??
              (startResult as { detail?: unknown }).detail ??
              '',
          )
        : ''
    const extra = backendMsg ? ` Respuesta: ${backendMsg}.` : ''
    return {
      ok: `'${name}' encendida (solicitud aceptada) y visible en tu lista. Puede tardar unos minutos en aceptar conexiones.${extra}`,
    }
  } catch (error) {
    if (error instanceof IdpAuthError) {
      const msg = error.message.toLowerCase()
      // Si ya estaba encendida, igual debe aparecer en la lista.
      if (
        msg.includes('ya est') ||
        msg.includes('already') ||
        msg.includes('corriendo') ||
        msg.includes('running') ||
        msg.includes('encendida') ||
        msg.includes('activa')
      ) {
        const real = await findEntornoStateByName(token, name)
        await saveVisibleEntorno(name, real?.estado ?? 'corriendo', real?.ip ?? '')
        await revalidateAfterAction()
        return { ok: `'${name}' ya está encendida y ahora aparece en tu lista.` }
      }
      return {
        error: `${error.message} Verifica que el nombre esté exacto (mayúsculas, guiones y sufijo, ej: UNIMAIAPOS-1080-QA).`,
      }
    }
    return { error: `No se pudo iniciar '${name}' (error de red o del servidor). Intenta de nuevo.` }
  }
}

export async function addEntornoManualAction(
  _prev: { error?: string; ok?: string },
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const session = await getSession()
  if (!session) return { error: 'No hay sesión activa.' }

  const nombre = String(formData.get('nombre') ?? '').trim()
  const ip = String(formData.get('ip') ?? '').trim()
  const estado = String(formData.get('estado') ?? '').trim() || 'detenido'
  const fechacreacion =
    String(formData.get('fechacreacion') ?? '').trim() ||
    new Date().toISOString().slice(0, 10)

  if (!nombre) return { error: 'Indica el nombre de la instancia.' }
  if (!ip) return { error: 'Indica la IP de la instancia.' }

  const cookieStore = await cookies()
  const list: { id: string; nombre: string; ip: string; estado: string; fechacreacion: string }[] =
    (() => {
      try {
        const raw = cookieStore.get('hyra_manual_entornos')?.value
        return raw ? (JSON.parse(raw) as typeof list) : []
      } catch {
        return []
      }
    })()

  const id = `manual:${nombre}`
  const filtered = list.filter((item) => item.id !== id)
  filtered.push({ id, nombre, ip, estado, fechacreacion })

  cookieStore.set('hyra_manual_entornos', JSON.stringify(filtered), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  await revalidateAfterAction()
  return { ok: `Agregado '${nombre}'.` }
}

export async function removeEntornoManualAction(
  _prev: { error?: string; ok?: string },
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Falta id.' }

  const cookieStore = await cookies()
  try {
    const raw = cookieStore.get('hyra_manual_entornos')?.value
    const list: { id: string }[] = raw ? (JSON.parse(raw) as { id: string }[]) : []
    const filtered = list.filter((item) => item.id !== id)
    cookieStore.set('hyra_manual_entornos', JSON.stringify(filtered), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })
  } catch {
    // ignore
  }

  await revalidateAfterAction()
  return { ok: 'Eliminado.' }
}

export async function extendEntornoAction(
  _prev: { error?: string; ok?: string },
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const hours = Number(formData.get('hours') ?? 2)
  if (!Number.isFinite(hours) || hours < 1 || hours > 72) {
    return { error: 'Indica entre 1 y 72 horas.' }
  }

  const entorno = await getSelectedEntorno()
  const idpToken = await getIdpAccessToken()
  if (!entorno || !idpToken) {
    return { error: 'No hay instancia seleccionada.' }
  }

  try {
    await extendRuntime(idpToken, entorno.name, hours)
    await revalidateAfterAction()
    return { ok: `Aumentando tiempo de '${entorno.name}'…` }
  } catch (error) {
    if (error instanceof IdpAuthError) return { error: error.message }
    return { error: 'No se pudo extender el tiempo.' }
  }
}

// Consulta el estado real de una instancia guardada como "iniciando" y
// actualiza la cookie manual para que la tarjeta deje de quedarse pegada.
export async function refreshStartingEntornoAction(
  nombre: string,
): Promise<{ estado?: string; ip?: string; error?: string }> {
  const clean = String(nombre ?? '').trim()
  if (!clean) return { error: 'Falta nombre.' }
  const idpToken = await getIdpAccessToken()
  if (!idpToken) return { error: 'No hay sesión activa.' }

  try {
    const found_state = await findEntornoStateByName(idpToken, clean)
    let estado = found_state?.estado || ''
    let ip = found_state?.ip || ''
    if (estado && !ip) {
      ip = await resolveIpFromDns(clean)
    }
    const cookieStore = await cookies()
    const cookieRaw = cookieStore.get('hyra_manual_entornos')?.value
    const list: { id: string; nombre: string; ip: string; estado: string; fechacreacion: string }[] =
      cookieRaw ? (JSON.parse(cookieRaw) as typeof list) : []
    const id = `manual:${clean}`
    const found = (Array.isArray(list) ? list : []).find((item) => item.id === id)
    if (found && estado) {
      found.estado = estado
      if (ip) found.ip = ip
      cookieStore.set('hyra_manual_entornos', JSON.stringify(list), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      })
      await revalidateAfterAction()
    }
    return { estado, ip }
  } catch (error) {
    if (error instanceof IdpAuthError) return { error: error.message }
    return { error: 'No se pudo consultar el estado.' }
  }
}

// Solo consulta si la máquina está encendida, SIN encenderla.
// Si la encuentra, la deja visible en la lista con su estado real.
export async function checkEntornoByNameAction(
  _prev: { error?: string; ok?: string },
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Indica el nombre de la instancia.' }

  const session = await getSession()
  const idpToken = await getIdpAccessToken()
  if (!session || !idpToken) return { error: 'No hay sesión activa.' }

  const found = await findEntornoStateByName(idpToken, name)
  if (!found || !found.estado) {
    return {
      error: `No se encontró '${name}' en la API (las máquinas de otros usuarios no aparecen). Si sabes que está encendida, usa "Mostrar igual". Si está apagada, usa "Iniciar".`,
    }
  }

  await saveVisibleEntorno(name, found.estado, found.ip)
  await revalidateAfterAction()
  const lower = found.estado.toLowerCase()
  if (lower.startsWith('corriendo')) {
    return { ok: `'${name}' está ENCENDIDA${found.ip ? ` (IP: ${found.ip})` : ''} y ya aparece en tu lista. No necesitas encenderla.` }
  }
  return {
    ok: `'${name}' está ${found.estado} y ya aparece en tu lista. Si está detenida, usa "Iniciar".`,
  }
}

// Fija una máquina como visible en la lista con el estado indicado,
// SIN llamar al encendido. Para cuando sabes que está prendida (ej. SSH)
// pero la API no la muestra.
export async function pinEntornoVisibleAction(
  _prev: { error?: string; ok?: string },
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const name = String(formData.get('name') ?? '').trim()
  const estado = String(formData.get('estado') ?? '').trim() || 'corriendo'
  const ip = String(formData.get('ip') ?? '').trim()
  if (!name) return { error: 'Indica el nombre de la instancia.' }

  const session = await getSession()
  if (!session) return { error: 'No hay sesión activa.' }

  await saveVisibleEntorno(name, estado, ip)
  await revalidateAfterAction()
  return { ok: `'${name}' ahora aparece en tu lista como "${estado}".` }
}
