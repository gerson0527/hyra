import { redirect } from 'next/navigation'
import { getSession } from '@/app/actions/auth'
import { getSelectedEntorno } from '@/app/actions/instance'
import { Dashboard } from '@/components/dashboard'
import type { HyraInstance } from '@/lib/types'
import {
  inferPreset,
  mapToInstanceStatus,
  statusKeyFromEntorno,
  type HyraEntorno,
} from '@/lib/entorno'

function entornoToHyraInstance(entorno: HyraEntorno): HyraInstance {
  const status = mapToInstanceStatus(statusKeyFromEntorno(entorno))

  return {
    id: entorno.id,
    name: entorno.name,
    status,
    ip: entorno.ip || '—',
    ticket: entorno.estadotarea || entorno.name,
    expiresIn: entorno.expiresAt || '—',
    cpu: 0,
    memory: 0,
    preset: inferPreset(entorno.name),
    containers: [],
  }
}

export default async function Page() {
  const session = await getSession()
  if (!session) redirect('/login')

  const entorno = await getSelectedEntorno()
  if (!entorno) redirect('/instancias')

  return (
    <Dashboard
      user={session}
      entorno={entorno}
      instance={entornoToHyraInstance(entorno)}
    />
  )
}
