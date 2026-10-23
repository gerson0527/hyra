"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import type { DockerContainer, HyraInstance } from "@/lib/types"
import { fetchDockerStats } from "@/lib/ssh-api"
import { StatusDot } from "@/components/status-dot"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  extendEntornoAction,
  startEntornoAction,
  stopEntornoAction,
} from "@/app/actions/entorno"
import { updateManualIpAction } from "@/app/actions/instance"
import {
  inferPreset,
  mapToInstanceStatus,
  statusKeyFromEntorno,
  type HyraEntorno,
} from "@/lib/entorno"
import { sftpHostnameFromInstanceName } from "@/lib/sftp-sites"
import {
  Play,
  Square,
  Clock,
  Container,
  Ticket,
  User,
  Building2,
  Calendar,
  KeyRound,
  Database,
  Copy,
  Check,
  FolderOpen,
  TerminalSquare,
  ServerOff,
  ArrowRight,
  Loader2,
} from "lucide-react"

type DashboardTab = "detalle" | "ssh" | "sql" | "archivos" | "git"

const PRESET_STYLE: Record<HyraInstance["preset"], string> = {
  ERP: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  POS: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Sucursal: "border-violet-500/30 bg-violet-500/10 text-violet-400",
}

function formatDateTime(value: string): string {
  if (!value || value === "—") return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function HoursDialog({
  title,
  defaultHours,
  action,
  disabled,
  children,
  onActionSuccess,
}: {
  title: string
  defaultHours: number
  action: (prev: { error?: string; ok?: string }, formData: FormData) => Promise<{ error?: string; ok?: string }>
  disabled?: boolean
  children: React.ReactNode
  onActionSuccess?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(defaultHours)
  const [state, formAction, pending] = useActionState(action, {})

  useEffect(() => {
    if (state.ok) onActionSuccess?.()
  }, [state.ok, onActionSuccess])

  return (
    <>
      <Button type="button" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <form
            action={formAction}
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg"
            onSubmit={() => setTimeout(() => setOpen(false), 0)}
          >
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">¿Cuántas horas? (1–72)</p>
            <input type="hidden" name="hours" value={hours} />
            <input
              type="number"
              min={1}
              max={72}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="mt-3 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
            />
            {state.error ? <p className="mt-2 text-xs text-destructive">{state.error}</p> : null}
            {state.ok ? <p className="mt-2 text-xs text-success">{state.ok}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                Confirmar
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  if (!value || value === "—") return null

  return (
    <button
      type="button"
      title="Copiar"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function ConnectionRow({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/80 bg-background/50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="break-all font-mono text-[13px] leading-snug text-foreground">{value || "—"}</p>
        <CopyButton value={value} />
      </div>
      {hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function DetailPanel({
  entorno,
  instance,
  onOpenTab,
  onEntornoAction,
}: {
  entorno: HyraEntorno
  instance: HyraInstance
  onOpenTab?: (tab: DashboardTab) => void
  onEntornoAction?: () => void
}) {
  const statusKey = statusKeyFromEntorno(entorno)
  const isRunning = statusKey === "corriendo"
  const isPartial = statusKey === "parcial"
  const preset = instance.preset || inferPreset(entorno.name)
  const sftpHost = sftpHostnameFromInstanceName(entorno.name)
  const [stopState, stopAction, stopPending] = useActionState(stopEntornoAction, {})
  const isManual = entorno.id.startsWith("manual:")
  const [ipDraft, setIpDraft] = useState(entorno.ip)
  const [ipMsg, setIpMsg] = useState("")
  const [ipSaving, setIpSaving] = useState(false)
  const prevIpRef = useRef(entorno.ip)
  useEffect(() => {
    if (entorno.ip !== prevIpRef.current) {
      const prev = prevIpRef.current
      setIpDraft((draft) => (!draft.trim() || draft === prev ? entorno.ip : draft))
      prevIpRef.current = entorno.ip
    }
  }, [entorno.ip])
  const saveManualIp = async () => {
    setIpMsg("")
    setIpSaving(true)
    try {
      const fd = new FormData()
      fd.set("id", entorno.id)
      fd.set("ip", ipDraft)
      const res = await updateManualIpAction({}, fd)
      setIpMsg(res.ok ?? res.error ?? "")
      if (res.ok) onEntornoAction?.()
    } catch {
      setIpMsg("No se pudo guardar la IP.")
    } finally {
      setIpSaving(false)
    }
  }
  const [containerStats, setContainerStats] = useState<Map<string, { cpu: string; mem: string }>>(new Map())
  const [liveContainers, setLiveContainers] = useState<DockerContainer[] | null>(null)
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (stopState.ok) onEntornoAction?.()
  }, [stopState.ok, onEntornoAction])

  useEffect(() => {
    if (!isRunning) {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current)
        statsIntervalRef.current = null
      }
      setContainerStats(new Map())
      setLiveContainers(null)
      return
    }
    const fetch = async () => {
      try {
        const res = await fetchDockerStats()
        const map = new Map<string, { cpu: string; mem: string }>()
        for (const c of res.containers) map.set(c.name, { cpu: c.cpu, mem: c.mem })
        setContainerStats(map)
        if (res.list) {
          // Mapear al tipo DockerContainer; si la lista viene vacía, limpiar
          // (antes se ignoraba y la lista quedaba obsoleta).
          setLiveContainers(
            res.list.map((c) => ({
              name: c.name,
              image: c.image,
              status: /up|running/i.test(c.status) ? ('up' as const) : ('exited' as const),
              uptime: c.uptime,
              ports: c.ports,
            })),
          )
        }
      } catch {
        // ignore
      }
    }
    void fetch()
    statsIntervalRef.current = setInterval(fetch, 10000)
    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current)
        statsIntervalRef.current = null
      }
    }
  }, [isRunning])

  const displayContainers = liveContainers ?? instance.containers

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-5 md:p-6">
      {/* Cabecera */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight">{entorno.name}</h1>
              <StatusDot status={mapToInstanceStatus(statusKey)} withLabel />
              <span
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  PRESET_STYLE[preset],
                )}
              >
                {preset}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {entorno.cliente ? (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5 shrink-0" />
                  {entorno.cliente}
                </span>
              ) : null}
              {entorno.asignado ? (
                <span className="inline-flex items-center gap-1.5">
                  <User className="size-3.5 shrink-0" />
                  {entorno.asignado}
                </span>
              ) : null}
              {entorno.estadotarea ? (
                <span className="inline-flex items-center gap-1.5">
                  <Ticket className="size-3.5 shrink-0" />
                  {entorno.estadotarea}
                </span>
              ) : null}
            </div>
            {entorno.expiresAt ? (
              <p className="inline-flex items-center gap-1.5 rounded-md bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                Apagado programado:{" "}
                <span className="font-medium text-foreground">{formatDateTime(entorno.expiresAt)}</span>
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!isRunning ? (
              <HoursDialog
                title="Iniciar instancia"
                defaultHours={8}
                action={startEntornoAction}
                onActionSuccess={onEntornoAction}
              >
                <Play className="size-4" /> Iniciar instancia
              </HoursDialog>
            ) : (
              <>
                <form action={stopAction}>
                  <Button type="submit" variant="outline" size="sm" disabled={stopPending}>
                    <Square className="size-4" /> Detener
                  </Button>
                </form>
                <HoursDialog
                  title="Aumentar tiempo"
                  defaultHours={2}
                  action={extendEntornoAction}
                  disabled={!isRunning}
                  onActionSuccess={onEntornoAction}
                >
                  <Clock className="size-4" /> Aumentar tiempo
                </HoursDialog>
              </>
            )}
          </div>
        </div>

        {stopState.error ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {stopState.error}
          </p>
        ) : null}
        {stopState.ok ? (
          <p className="mt-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            {stopState.ok}
          </p>
        ) : null}
      </section>

      {/* Aviso instancia detenida */}
      {!isRunning && !isPartial ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
          <ServerOff className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-200/90">Instancia detenida</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Inicia la instancia para usar SSH, SQL, SFTP y ver contenedores Docker.
            </p>
          </div>
          <HoursDialog
            title="Iniciar instancia"
            defaultHours={8}
            action={startEntornoAction}
            onActionSuccess={onEntornoAction}
          >
            <Play className="size-3.5" /> Iniciar
          </HoursDialog>
        </div>
      ) : null}

      {isPartial ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          La instancia está iniciándose o deteniéndose. El estado se actualiza automáticamente.
        </div>
      ) : null}

      {/* Accesos rápidos */}
      {isRunning && onOpenTab ? (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <QuickLink
            icon={<TerminalSquare className="size-4" />}
            label="SSH / Consola"
            desc="Terminal y presets Docker"
            onClick={() => onOpenTab("ssh")}
          />
          <QuickLink
            icon={<Database className="size-4" />}
            label="SQL"
            desc="MySQL y consultas"
            onClick={() => onOpenTab("sql")}
          />
          <QuickLink
            icon={<FolderOpen className="size-4" />}
            label="Archivos SFTP"
            desc="WinSCP integrado"
            onClick={() => onOpenTab("archivos")}
          />
        </section>
      ) : null}

      {/* Conexión */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conexión</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <ConnectionRow label="IP pública" value={entorno.ip || "—"} hint="SSH opc@ puerto 22" />
          <ConnectionRow
            label="MySQL host"
            value={entorno.mysqlHost || "—"}
            hint="DBeaver / pestaña SQL"
          />
          <ConnectionRow
            label="SFTP / WinSCP"
            value={sftpHost || "—"}
            hint="Archivos — puertos 23 / 27"
          />
        </div>
        {isManual ? (
          <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border/80 bg-background/50 px-3 py-2.5">
            <p className="basis-full text-[11px] text-muted-foreground">
              Instancia fijada manualmente: completa la IP pública para habilitar SSH, archivos y
              SQL.
            </p>
            <div className="min-w-[160px] flex-1">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                IP pública
              </label>
              <input
                value={ipDraft}
                onChange={(e) => setIpDraft(e.target.value)}
                placeholder="Ej: 129.80.119.200"
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:border-primary"
              />
            </div>
            <Button type="button" size="sm" onClick={saveManualIp} disabled={ipSaving || !ipDraft.trim()}>
              {ipSaving ? "Guardando…" : "Guardar IP"}
            </Button>
            {ipMsg ? <p className="basis-full text-xs text-muted-foreground">{ipMsg}</p> : null}
          </div>
        ) : null}
      </section>

      {/* Metadatos */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Información
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <InfoCard icon={<User className="size-3.5" />} label="Informador" value={entorno.informador || "—"} />
          <InfoCard icon={<Calendar className="size-3.5" />} label="Creación" value={entorno.fechacreacion || "—"} />
          <InfoCard icon={<KeyRound className="size-3.5" />} label="Habilitación" value={entorno.habilitacion || "—"} />
          <InfoCard
            icon={<Ticket className="size-3.5" />}
            label="ID entorno"
            value={entorno.id}
            mono
            copyable
          />
        </div>
      </section>

      {/* Contenedores */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            <Container className="size-4 text-muted-foreground" />
            Contenedores Docker
            {instance.containers.length > 0 ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {displayContainers.length}
              </span>
            ) : null}
          </h2>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {displayContainers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <Container className="size-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                {isRunning ? "Sin contenedores listados" : "Instancia detenida"}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {isRunning
                  ? "Conecta por SSH y ejecuta docker ps, o usa los presets de la consola."
                  : "Inicia la instancia para levantar los contenedores del entorno."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Nombre</th>
                      <th className="px-4 py-2.5 text-left font-medium">Imagen</th>
                      <th className="px-4 py-2.5 text-left font-medium">Estado</th>
                      <th className="px-4 py-2.5 text-left font-medium">CPU</th>
                      <th className="px-4 py-2.5 text-left font-medium">Memoria</th>
                      <th className="px-4 py-2.5 text-left font-medium">Uptime</th>
                      <th className="px-4 py-2.5 text-left font-medium">Puertos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayContainers.map((c) => {
                      const stat = containerStats.get(c.name)
                      return (
                        <tr key={c.name} className="border-t border-border hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-mono text-[13px]">{c.name}</td>
                          <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">{c.image}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                c.status === "up"
                                  ? "bg-success/15 text-success"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {c.status === "up" ? "Up" : "Exited"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">
                            {stat?.cpu || "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">
                            {stat?.mem || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{c.uptime}</td>
                          <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">{c.ports}</td>
                        </tr>
                      )}
                    )}
                  </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function QuickLink({
  icon,
  label,
  desc,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <span className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{desc}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  )
}

function InfoCard({
  icon,
  label,
  value,
  mono,
  copyable,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="mt-1 flex items-start justify-between gap-1">
        <p className={cn("text-sm font-medium break-all", mono && "font-mono text-[12px]")}>{value}</p>
        {copyable ? <CopyButton value={value} /> : null}
      </div>
    </div>
  )
}
