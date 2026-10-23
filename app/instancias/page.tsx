import { redirect } from 'next/navigation'
import { getSession } from '@/app/actions/auth'
import { fetchEntornosForSession } from '@/app/actions/instance'
import { InstancePicker } from '@/components/instance-picker'
import { IdpAuthError } from '@/lib/idp'

export default async function InstanciasPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  try {
    const entornos = await fetchEntornosForSession()
    return <InstancePicker entornos={entornos} userEmail={session.email} />
  } catch (error) {
    const message =
      error instanceof IdpAuthError
        ? error.message
        : 'No se pudieron cargar tus instancias.'

    return (
      <div className="flex min-h-svh items-center justify-center bg-[#12151c] px-4">
        <div className="w-full max-w-md rounded-xl border border-[#2a2f3a] bg-[#1a1d23] p-6 text-center">
          <h1 className="text-lg font-semibold text-[#f4f6f8]">Error al cargar instancias</h1>
          <p className="mt-2 text-sm text-[#8b93a3]">{message}</p>
          <a href="/login" className="mt-4 inline-block text-sm font-medium text-[#3498db] hover:underline">
            Volver al inicio de sesión
          </a>
        </div>
      </div>
    )
  }
}
