'use client'

import { useActionState, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Package, Play, Plus, Search, Trash2 } from 'lucide-react'
import { selectInstanceAction } from '@/app/actions/instance'
import { logoutAction } from '@/app/actions/auth'
import {
  addEntornoManualAction,
  checkEntornoByNameAction,
  pinEntornoVisibleAction,
  refreshStartingEntornoAction,
  removeEntornoManualAction,
  startEntornoByNameAction,
} from '@/app/actions/entorno'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  computeEntornoStats,
  filterEntornos,
  statusBadgeLabel,
  statusKeyFromEntorno,
  type EntornoStatusFilter,
  type HyraEntorno,
} from '@/lib/entorno'

function StatPill({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'running' | 'stopped' | 'partial' | 'total'
}) {
  return (
    <span className="rounded-full border border-[#22262e] bg-[#1a1d23] px-2.5 py-1 text-[11px] text-[#8b93a3]">
      <b
        className={cn(
          'mr-1 text-xs font-bold',
          tone === 'running' && 'text-[#27ae60]',
          tone === 'stopped' && 'text-[#e74c3c]',
          tone === 'partial' && 'text-[#f59e0b]',
          tone === 'total' && 'text-[#3498db]',
        )}
      >
        {value}
      </b>
      {label}
    </span>
  )
}

function PinVisibleForm({
  name,
  pinAction,
  pinPending,
  pinState,
}: {
  name: string
  pinAction: (payload: FormData) => void
  pinPending: boolean
  pinState: { error?: string; ok?: string }
}) {
  const [ip, setIp] = useState('')
  return (
    <form
      action={pinAction}
      className="flex flex-wrap items-end gap-2 rounded-md border border-[#27ae60]/30 bg-[#1f232b] px-2.5 py-2"
    >
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="estado" value="corriendo" />
      <p className="basis-full text-[11px] text-[#8b93a3]">
        ¿Sabes que está encendida (ej. entras por SSH)? Fíjala visible sin encenderla de nuevo. Si
        pones la IP, también podrás abrir la terminal y archivos.
      </p>
      <div className="min-w-[140px] flex-1">
        <label className="block text-[10px] uppercase tracking-wide text-[#8b93a3]">
          IP (opcional)
        </label>
        <input
          name="ip"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="Ej: 129.80.119.200"
          className="mt-1 h-8 w-full rounded-md border border-[#2a2f3a] bg-[#161920] px-2 text-xs text-[#f4f6f8] outline-none focus:border-[#27ae60]"
        />
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pinPending}>
        {pinPending ? 'Fijando…' : 'Mostrar igual como encendida'}
      </Button>
      {pinState.error ? (
        <p className="basis-full text-xs text-[#f87171]">{pinState.error}</p>
      ) : null}
      {pinState.ok ? (
        <p className="basis-full text-xs text-[#4ade80]">{pinState.ok}</p>
      ) : null}
    </form>
  )
}

function EnvCard({
  env,
  pending,
  formAction,
  onRemove,
  onRetry,
  retrying,
  pollError,
}: {
  env: HyraEntorno
  pending: boolean
  formAction: (payload: FormData) => void
  onRemove?: (id: string) => void
  onRetry?: (name: string) => void
  retrying?: boolean
  pollError?: string
}) {
  const statusKey = statusKeyFromEntorno(env)
  const isStarting = env.estado.toLowerCase().startsWith('iniciando')
  const badge = isStarting ? 'iniciando…' : statusBadgeLabel(statusKey)
  const isManual = env.id.startsWith('manual:')

  return (
    <form action={formAction} className="relative">
      <input type="hidden" name="id" value={env.id} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          'flex w-full gap-3 rounded-[10px] border border-[#2a2f3a] bg-[#1a1d23] p-3.5 text-left transition-all',
          'hover:-translate-y-px hover:border-[#3498db]/50 hover:bg-[#1f232b] hover:shadow-[0_0_12px_rgba(52,152,219,0.15)]',
          'disabled:cursor-not-allowed disabled:opacity-60',
          statusKey === 'detenido' && 'border-[#e74c3c]/30',
        )}
      >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg text-base',
          statusKey === 'corriendo' && 'bg-[rgba(39,174,96,0.12)]',
          statusKey === 'detenido' && 'bg-[rgba(231,76,60,0.14)]',
          statusKey === 'parcial' && 'bg-[rgba(245,158,11,0.12)]',
          statusKey === 'desconocido' && 'bg-[#3d2e1f]',
        )}
      >
        <Package className="size-4 text-[#f4f6f8]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-2 pr-6">
          <div className="text-xs font-semibold leading-snug break-words text-[#f4f6f8]">{env.name}</div>
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase',
              statusKey === 'corriendo' && !isStarting && 'bg-[rgba(39,174,96,0.12)] text-[#4ade80]',
              statusKey === 'detenido' && 'bg-[rgba(231,76,60,0.14)] text-[#f87171]',
              (statusKey === 'parcial' || isStarting) &&
                'animate-pulse bg-[rgba(241,196,15,0.12)] text-[#fbbf24]',
              statusKey === 'desconocido' && 'bg-[#252830] text-[#94a3b8]',
            )}
          >
            {badge}
          </span>
        </div>
        {isStarting ? (
          <div className="mb-1 animate-pulse text-[10px] text-[#fbbf24]">
            Encendiendo máquina… actualizando estado automáticamente.
          </div>
        ) : null}
        {isStarting && pollError ? (
          <div className="mt-1 rounded-md border border-[#e74c3c]/40 bg-[#e74c3c]/10 px-2 py-1 text-[10px] text-[#f87171]">
            No se pudo confirmar el estado: {pollError}
          </div>
        ) : null}
        {isStarting && onRetry ? (
          <button
            type="button"
            disabled={retrying}
            onClick={() => onRetry(env.name)}
            className="mt-1 rounded-md border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-2 py-1 text-[10px] font-semibold text-[#fbbf24] hover:bg-[#f59e0b]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {retrying ? 'Enviando solicitud…' : 'Reintentar encendido'}
          </button>
        ) : null}
        {env.ip ? <div className="text-[10px] text-[#8b93a3]">IP: {env.ip}</div> : null}
        {env.asignado ? <div className="text-[10px] text-[#8b93a3]">{env.asignado}</div> : null}
        {env.fechacreacion ? (
          <div className="text-[9px] text-[#6b7280]">Creada: {env.fechacreacion}</div>
        ) : null}
        {!env.ip && !env.asignado && !env.fechacreacion ? (
          <div className="text-[10px] text-[#8b93a3]">—</div>
        ) : null}
      </div>
      </button>
      {isManual && onRemove ? (
        <button
          type="button"
          aria-label={`Quitar ${env.name}`}
          onClick={() => onRemove(env.id)}
          className="absolute right-2 top-2 rounded p-1 text-[#8b93a3] hover:bg-[#2a2f3a] hover:text-[#f87171]"
          title="Quitar instancia manual"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </form>
  )
}

const REFRESH_OPTIONS = [
  { value: 30000, label: '30 s' },
  { value: 60000, label: '1 min' },
  { value: 120000, label: '2 min' },
  { value: 300000, label: '5 min' },
] as const

type RefreshInterval = (typeof REFRESH_OPTIONS)[number]['value']

const REFRESH_STORAGE_KEY = 'hyra_instances_refresh_ms'

function loadRefreshInterval(): RefreshInterval {
  if (typeof window === 'undefined') return 60000
  const raw = window.localStorage.getItem(REFRESH_STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  return REFRESH_OPTIONS.some((opt) => opt.value === parsed) ? (parsed as RefreshInterval) : 60000
}

export function InstancePicker({
  entornos,
  userEmail,
}: {
  entornos: HyraEntorno[]
  userEmail: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(selectInstanceAction, {})
  const [startByNameState, startByNameAction, startByNamePending] = useActionState(
    startEntornoByNameAction,
    {},
  )
  const [checkByNameState, checkByNameAction, checkByNamePending] = useActionState(
    checkEntornoByNameAction,
    {},
  )
  const [pinState, pinAction, pinPending] = useActionState(pinEntornoVisibleAction, {})
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<EntornoStatusFilter>('todos')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshMs, setRefreshMs] = useState<RefreshInterval>(60000)
  const [startByNameOpen, setStartByNameOpen] = useState(false)
  const [startByNameValue, setStartByNameValue] = useState('')
  const [startByNameHours, setStartByNameHours] = useState(8)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualNombre, setManualNombre] = useState('')
  const [manualIp, setManualIp] = useState('')
  const [manualEstado, setManualEstado] = useState('detenido')
  const [addManualState, addManualAction, addManualPending] = useActionState(
    addEntornoManualAction,
    {},
  )
  const [, removeManualAction] = useActionState(removeEntornoManualAction, {})

  const stats = useMemo(() => computeEntornoStats(entornos), [entornos])
  const filtered = useMemo(
    () => filterEntornos(entornos, search, status),
    [entornos, search, status],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    setRefreshMs(loadRefreshInterval())
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REFRESH_STORAGE_KEY, String(refreshMs))
    }
  }, [refreshMs])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => router.refresh(), refreshMs)
    return () => window.clearInterval(timer)
  }, [autoRefresh, refreshMs, router])

  useEffect(() => {
    if (startByNameState.ok || checkByNameState.ok || pinState.ok) {
      // No cerrar el formulario: mostrar el mensaje y refrescar para que
      // la instancia aparezca en la lista.
      router.refresh()
    }
  }, [startByNameState.ok, checkByNameState.ok, pinState.ok, router])

  useEffect(() => {
    if (addManualState.ok) {
      setManualOpen(false)
      setManualNombre('')
      setManualIp('')
      setManualEstado('detenido')
      router.refresh()
    }
  }, [addManualState.ok, router])

  // Seguimiento automático: mientras haya tarjetas "iniciando", consultar
  // el estado real cada 15 s para que no se quede pegado buscando.
  const startingNames = useMemo(
    () =>
      entornos
        .filter((env) => env.estado.toLowerCase().startsWith('iniciando'))
        .map((env) => env.name),
    [entornos],
  )

  const [pollErrors, setPollErrors] = useState<Record<string, string>>({})
  // Clave estable: los props cambian de referencia en cada router.refresh(),
  // así que el efecto debe depender del contenido, no del array.
  const startingKey = startingNames.join('|')
  useEffect(() => {
    if (!startingKey) return
    const names = startingKey.split('|')
    let cancelled = false
    const tick = async () => {
      const errs: Record<string, string> = {}
      for (const name of names) {
        if (cancelled) return
        try {
          const res = await refreshStartingEntornoAction(name)
          if (res.error) errs[name] = res.error
        } catch {
          errs[name] = 'Error de red al consultar el estado.'
        }
      }
      if (!cancelled) {
        setPollErrors(errs)
        router.refresh()
      }
    }
    void tick()
    const timer = window.setInterval(tick, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [startingKey, router])

  const removeManual = useCallback(
    (id: string) => {
      const fd = new FormData()
      fd.set('id', id)
      void removeManualAction(fd)
    },
    [removeManualAction],
  )

  // Reenvía la solicitud de encendido para una máquina trabada en "iniciando",
  // sin importar si está en la lista o a quién pertenece.
  const [retryingName, setRetryingName] = useState<string | null>(null)
  const [retryMsg, setRetryMsg] = useState('')
  const retryStart = useCallback(
    async (name: string) => {
      setRetryingName(name)
      setRetryMsg('')
      try {
        const fd = new FormData()
        fd.set('name', name)
        fd.set('hours', String(startByNameHours))
        const res = await startEntornoByNameAction({}, fd)
        setRetryMsg(res.ok ?? res.error ?? '')
      } catch {
        setRetryMsg(`No se pudo reintentar '${name}'.`)
      } finally {
        setRetryingName(null)
        router.refresh()
      }
    },
    [router, startByNameHours],
  )

  return (
    <div className="flex min-h-svh flex-col bg-[#12151c] text-[#f4f6f8]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#2a2f3a] bg-[#12151c] px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-[#3498db] text-white">
            <Boxes className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Hyra Docker Manager</p>
            <p className="text-[11px] text-[#8b93a3]">{userEmail}</p>
          </div>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm" className="text-[#8b93a3] hover:text-[#f4f6f8]">
            Cerrar sesión
          </Button>
        </form>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-2 p-3">
        <h2 className="text-[13px] font-semibold">Instancias</h2>

        <div className="flex flex-wrap gap-1.5">
          <StatPill value={stats.running} label="corriendo" tone="running" />
          <StatPill value={stats.stopped} label="detenidas" tone="stopped" />
          <StatPill value={stats.partial} label="parcial" tone="partial" />
          <StatPill value={stats.total} label="total" tone="total" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStartByNameOpen((v) => !v)}
            className="h-6 px-2 py-0 text-[11px]"
            title="Iniciar una instancia por nombre aunque no aparezca en la lista"
          >
            <Play className="size-3" /> Iniciar por nombre
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setManualOpen((v) => !v)}
            className="h-6 px-2 py-0 text-[11px]"
            title="Agregar manualmente una instancia (ej. Maiaweb)"
          >
            <Plus className="size-3" /> Agregar manual
          </Button>
        </div>

        {startByNameOpen ? (
          <form
            action={startByNameAction}
            className="flex flex-wrap items-end gap-2 rounded-md border border-[#3498db]/30 bg-[#1f232b] px-2.5 py-2"
          >
            <div className="min-w-[180px] flex-1">
              <label className="block text-[10px] uppercase tracking-wide text-[#8b93a3]">Nombre</label>
              <input
                name="name"
                value={startByNameValue}
                onChange={(e) => setStartByNameValue(e.target.value)}
                placeholder="Ej: UNIMAIAPOS-1080-DEV"
                className="mt-1 h-8 w-full rounded-md border border-[#2a2f3a] bg-[#161920] px-2 text-xs text-[#f4f6f8] outline-none focus:border-[#3498db]"
                required
              />
            </div>
            <div className="w-20">
              <label className="block text-[10px] uppercase tracking-wide text-[#8b93a3]">Horas</label>
              <input
                name="hours"
                type="number"
                min={1}
                max={72}
                value={startByNameHours}
                onChange={(e) => setStartByNameHours(Number(e.target.value))}
                className="mt-1 h-8 w-full rounded-md border border-[#2a2f3a] bg-[#161920] px-2 text-xs text-[#f4f6f8] outline-none focus:border-[#3498db]"
                required
              />
            </div>
            <Button type="submit" size="sm" disabled={startByNamePending || !startByNameValue.trim()}>
              {startByNamePending ? 'Iniciando…' : 'Iniciar'}
            </Button>
            <Button
              type="submit"
              formAction={checkByNameAction}
              variant="outline"
              size="sm"
              disabled={checkByNamePending || !startByNameValue.trim()}
              title="Solo consulta si está encendida, sin encenderla"
            >
              {checkByNamePending ? 'Verificando…' : 'Solo verificar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStartByNameOpen(false)}>
              Cancelar
            </Button>
            <p className="basis-full text-[11px] text-[#8b93a3]">
              "Solo verificar" consulta si ya está encendida y la muestra en la lista sin encenderla de nuevo.
            </p>
            {startByNameState.error ? (
              <p className="basis-full text-xs text-[#f87171]">{startByNameState.error}</p>
            ) : null}
            {checkByNameState.error ? (
              <p className="basis-full text-xs text-[#f87171]">{checkByNameState.error}</p>
            ) : null}
            {startByNamePending ? (
              <p className="basis-full animate-pulse text-xs text-[#fbbf24]">
                Iniciando… espere, por favor.
              </p>
            ) : null}
            {checkByNamePending ? (
              <p className="basis-full animate-pulse text-xs text-[#fbbf24]">
                Verificando estado… espere, por favor.
              </p>
            ) : null}
            {startByNameState.ok ? (
              <p className="basis-full text-xs text-[#4ade80]">{startByNameState.ok}</p>
            ) : null}
            {checkByNameState.ok ? (
              <p className="basis-full text-xs text-[#4ade80]">{checkByNameState.ok}</p>
            ) : null}
          </form>
        ) : null}

        {startByNameOpen && checkByNameState.error && startByNameValue.trim() ? (
          <PinVisibleForm
            name={startByNameValue.trim()}
            pinAction={pinAction}
            pinPending={pinPending}
            pinState={pinState}
          />
        ) : null}

        {manualOpen ? (
          <form
            action={addManualAction}
            className="flex flex-wrap items-end gap-2 rounded-md border border-[#16a34a]/30 bg-[#1f232b] px-2.5 py-2"
          >
            <div className="min-w-[160px] flex-1">
              <label className="block text-[10px] uppercase tracking-wide text-[#8b93a3]">Nombre</label>
              <input
                name="nombre"
                value={manualNombre}
                onChange={(e) => setManualNombre(e.target.value)}
                placeholder="Ej: testmaiaweb-gortiz"
                className="mt-1 h-8 w-full rounded-md border border-[#2a2f3a] bg-[#161920] px-2 text-xs text-[#f4f6f8] outline-none focus:border-[#3498db]"
                required
              />
            </div>
            <div className="min-w-[140px] flex-1">
              <label className="block text-[10px] uppercase tracking-wide text-[#8b93a3]">IP</label>
              <input
                name="ip"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                placeholder="Ej: 157.151.194.216"
                className="mt-1 h-8 w-full rounded-md border border-[#2a2f3a] bg-[#161920] px-2 text-xs text-[#f4f6f8] outline-none focus:border-[#3498db]"
                required
              />
            </div>
            <div className="w-28">
              <label className="block text-[10px] uppercase tracking-wide text-[#8b93a3]">Estado</label>
              <select
                name="estado"
                value={manualEstado}
                onChange={(e) => setManualEstado(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-[#2a2f3a] bg-[#161920] px-2 text-xs text-[#f4f6f8] outline-none focus:border-[#3498db]"
              >
                <option value="detenido">detenido</option>
                <option value="corriendo">corriendo</option>
                <option value="parcial">parcial</option>
              </select>
            </div>
            <Button type="submit" size="sm" disabled={addManualPending || !manualNombre.trim() || !manualIp.trim()}>
              {addManualPending ? 'Agregando…' : 'Agregar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setManualOpen(false)}>
              Cancelar
            </Button>
            {addManualState.error ? (
              <p className="basis-full text-xs text-[#f87171]">{addManualState.error}</p>
            ) : null}
            {addManualState.ok ? (
              <p className="basis-full text-xs text-[#4ade80]">{addManualState.ok}</p>
            ) : null}
          </form>
        ) : null}

        <div className="flex gap-2">
          <div className="flex h-[34px] flex-1 items-center gap-2 rounded-md border border-[#2a2f3a] bg-[#161920] px-2.5 focus-within:border-[#3498db]">
            <Search className="size-3.5 shrink-0 text-[#6b7280]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar instancia..."
              className="w-full bg-transparent text-xs text-[#f4f6f8] outline-none placeholder:text-[#6b7280]"
            />
          </div>
          <div className="flex h-[34px] min-w-[140px] items-center gap-1.5 rounded-md border border-[#2a2f3a] bg-[#161920] px-2.5">
            <span className="text-xs text-[#8b93a3]">Estado:</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EntornoStatusFilter)}
              className="flex-1 bg-transparent text-xs text-[#f4f6f8] outline-none"
            >
              <option value="todos">todos</option>
              <option value="corriendo">corriendo</option>
              <option value="detenido">detenido</option>
              <option value="parcial">parcial</option>
            </select>
          </div>
        </div>

        {state.error ? (
          <p className="rounded-md border border-[#e74c3c]/30 bg-[#e74c3c]/10 px-3 py-2 text-sm text-[#f87171]">
            {state.error}
          </p>
        ) : null}

        {retryMsg ? (
          <p className="rounded-md border border-[#3498db]/30 bg-[#3498db]/10 px-3 py-2 text-xs text-[#7fb3e8]">
            {retryMsg}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-xs text-[#8b93a3]">
              <div className="mb-2 text-2xl">📦</div>
              <p>No hay instancias que coincidan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((env) => (
                <EnvCard
                  key={env.id}
                  env={env}
                  pending={pending}
                  formAction={formAction}
                  onRemove={env.id.startsWith('manual:') ? removeManual : undefined}
                  onRetry={retryStart}
                  retrying={retryingName === env.name}
                  pollError={pollErrors[env.name]}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-[#22262e] pt-2">
          <span className="text-[11px] text-[#8b93a3]">
            {stats.total} instancia{stats.total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-[11px] text-[#8b93a3]">auto-refresh</span>
              <select
                value={refreshMs}
                onChange={(e) => setRefreshMs(Number(e.target.value) as RefreshInterval)}
                disabled={!autoRefresh}
                className="h-6 rounded-md border border-[#2a2f3a] bg-[#161920] px-1.5 text-[11px] text-[#f4f6f8] outline-none disabled:opacity-50"
                title="Intervalo de refresco"
              >
                {REFRESH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                role="switch"
                aria-checked={autoRefresh}
                onClick={() => setAutoRefresh((v) => !v)}
                className={cn(
                  'relative h-5 w-9 rounded-full border transition-colors',
                  autoRefresh
                    ? 'border-[#3498db] bg-[rgba(52,152,219,0.25)]'
                    : 'border-[#2a2f3a] bg-[#2a2f3a]',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 size-3.5 rounded-full transition-transform',
                    autoRefresh ? 'translate-x-4 bg-[#3498db]' : 'bg-[#6b7280]',
                  )}
                />
              </button>
            </label>
          </div>
        </footer>
      </main>
    </div>
  )
}
