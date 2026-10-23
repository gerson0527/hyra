"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { HyraInstance } from "@/lib/types"
import {
  applyInstanceIpToHosts,
  isReservedHostsIp,
  parseHostsFile,
  WINDOWS_HOSTS_PATH,
} from "@/lib/hosts-file"
import {
  isHostsAvailable,
  openHostsInEditor,
  readHostsFile,
  writeHostsFile,
} from "@/lib/hosts-desktop"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Globe,
  RefreshCw,
  Loader2,
  Check,
  ExternalLink,
  AlertTriangle,
} from "lucide-react"

const LAST_SECTIONS_KEY = "hyra_hosts_sections"
const QUICK_SECTIONS = ["unidrogas", "generico"] as const

export function HostsPanel({ instance }: { instance: HyraInstance }) {
  const [content, setContent] = useState("")
  const [path, setPath] = useState(WINDOWS_HOSTS_PATH)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [log, setLog] = useState("")
  const [hostsReady, setHostsReady] = useState(false)
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (isHostsAvailable()) {
      setHostsReady(true)
    }
  }, [])

  const parsed = useMemo(() => parseHostsFile(content), [content])
  const instanceIp = instance.ip?.trim() || ""

  const load = useCallback(async () => {
    if (!isHostsAvailable()) return
    setLoading(true)
    setError("")
    try {
      const data = await readHostsFile()
      setContent(data.content)
      setPath(data.path)
      const { sections, entries } = parseHostsFile(data.content)
      const devSections = sections.filter((s) =>
        entries.some((e) => e.section === s && !isReservedHostsIp(e.ip)),
      )
      const saved = loadSavedSections()
      const initial =
        saved.size > 0
          ? new Set([...saved].filter((s) => devSections.includes(s)))
          : new Set(devSections)
      setSelectedSections(initial.size > 0 ? initial : new Set(devSections))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, instance.id])

  const preview = useMemo(() => {
    if (!instanceIp || !content) return { changedLines: 0, preview: [] as { host: string; from: string; to: string }[] }
    return applyInstanceIpToHosts(content, instanceIp, {
      sectionFilter: selectedSections,
      onlyDifferent: true,
    })
  }, [content, instanceIp, selectedSections])

  const entriesBySection = useMemo(() => {
    const map = new Map<string, typeof parsed.entries>()
    for (const e of parsed.entries) {
      if (isReservedHostsIp(e.ip)) continue
      const list = map.get(e.section) ?? []
      list.push(e)
      map.set(e.section, list)
    }
    return map
  }, [parsed.entries])

  const pendingBySection = useMemo(() => {
    const map = new Map<string, number>()
    if (!instanceIp || !content) return map
    for (const section of parsed.sections) {
      const { changedLines } = applyInstanceIpToHosts(content, instanceIp, {
        sectionFilter: new Set([section]),
        onlyDifferent: true,
      })
      if (changedLines > 0) map.set(section, changedLines)
    }
    return map
  }, [content, instanceIp, parsed.sections])

  function resolveSection(name: string): string | undefined {
    const lower = name.toLowerCase()
    return parsed.sections.find((s) => s.toLowerCase() === lower)
  }

  function toggleSection(section: string) {
    setSelectedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      saveSections(next)
      return next
    })
  }

  async function handleApply(sectionFilter?: Set<string>, label?: string) {
    const filter = sectionFilter ?? selectedSections
    const applyPreview = applyInstanceIpToHosts(content, instanceIp, {
      sectionFilter: filter,
      onlyDifferent: true,
    })

    if (!instanceIp) {
      setError("La instancia no tiene IP asignada.")
      return
    }
    if (applyPreview.changedLines === 0) {
      const scope = label ? `#${label}` : "las secciones seleccionadas"
      setLog(`Nada que actualizar en ${scope}: ya apuntan a ${instanceIp}.`)
      return
    }
    const scopeLabel = label ? `#${label}` : `${applyPreview.changedLines} línea(s) seleccionada(s)`
    if (
      !window.confirm(
        `¿Actualizar ${applyPreview.changedLines} línea(s) en hosts (${scopeLabel})?\n\nNueva IP: ${instanceIp}\n\nWindows pedirá permisos de administrador.`,
      )
    ) {
      return
    }
    setApplying(label ?? "all")
    setError("")
    try {
      const result = await writeHostsFile(applyPreview.content)
      if (!result.ok) {
        setError(result.error || "No se pudo escribir el archivo hosts")
        return
      }
      setContent(applyPreview.content)
      const scope = label ? `#${label}` : "selección"
      setLog(
        `Hosts actualizados · ${scope} (${applyPreview.changedLines} líneas → ${instanceIp})` +
          (result.elevated ? " · con elevación UAC" : ""),
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(null)
    }
  }

  async function handleApplyQuick(sectionKey: string) {
    const section = resolveSection(sectionKey)
    if (!section) {
      setError(`No se encontró la sección #${sectionKey} en el archivo hosts.`)
      return
    }
    await handleApply(new Set([section]), sectionKey)
  }

  if (!hostsReady) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        <div>
          <Globe className="mx-auto mb-3 size-10 opacity-40" />
          <p>La gestión de hosts requiere la app de escritorio.</p>
          <p className="mt-1 text-xs">Ejecuta <code className="text-foreground">npm run desktop</code></p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Globe className="size-4 text-primary" />
              Archivo hosts
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{path}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/15 px-2.5 py-1 font-mono text-[12px] text-primary">
              Instancia: {instanceIp || "—"}
            </span>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Recargar
            </Button>
            <Button variant="outline" size="sm" onClick={() => void openHostsInEditor()}>
              <ExternalLink />
              Abrir en Notepad
            </Button>
            <Button
              size="sm"
              disabled={!!applying || !instanceIp || preview.changedLines === 0}
              onClick={() => void handleApply()}
            >
              {applying === "all" ? <Loader2 className="animate-spin" /> : <Check />}
              Aplicar selección ({preview.changedLines})
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Acciones rápidas:</span>
          {QUICK_SECTIONS.map((key) => {
            const section = resolveSection(key)
            const pending = section ? (pendingBySection.get(section) ?? 0) : 0
            const missing = !section
            return (
              <Button
                key={key}
                variant="secondary"
                size="sm"
                disabled={!!applying || !instanceIp || missing || pending === 0}
                title={
                  missing
                    ? `No existe la sección #${key} en hosts`
                    : pending === 0
                      ? `#${key} ya apunta a ${instanceIp}`
                      : `Actualizar ${pending} entrada(s) de #${key}`
                }
                onClick={() => void handleApplyQuick(key)}
              >
                {applying === key ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Aplicar {key}
                {!missing && pending > 0 ? ` (${pending})` : ""}
              </Button>
            )
          })}
        </div>
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-destructive">
            <AlertTriangle className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
        {log && <p className="mt-2 text-[11px] text-muted-foreground">{log}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-[12px] text-muted-foreground">
          Marca las secciones que quieres apuntar a la IP de la instancia{" "}
          <strong className="text-foreground">{instance.name}</strong>. No se modifican{" "}
          <code className="text-foreground">127.0.0.1</code> ni entradas del sistema.
        </p>

        {loading && !content ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Leyendo hosts…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {[...entriesBySection.entries()].map(([section, entries]) => {
              const selected = selectedSections.has(section)
              const needsUpdate = entries.some((e) => e.ip !== instanceIp)
              const pending = pendingBySection.get(section) ?? 0
              const quickKey = QUICK_SECTIONS.find((k) => k === section.toLowerCase())
              return (
                <section
                  key={section}
                  className={cn(
                    "rounded-lg border border-border bg-card/50",
                    selected && "border-primary/30",
                  )}
                >
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSection(section)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {selected && <Check className="size-3" />}
                      </span>
                      <span className="font-mono text-[12px] font-semibold">#{section}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {entries.length} entradas
                        {needsUpdate && instanceIp ? " · pendiente" : ""}
                      </span>
                    </button>
                    {pending > 0 && instanceIp && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-[11px]"
                        disabled={!!applying}
                        onClick={() =>
                          void handleApply(new Set([section]), quickKey ?? section)
                        }
                      >
                        {applying === (quickKey ?? section) ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}
                        Aplicar
                      </Button>
                    )}
                  </div>
                  <ul className="divide-y divide-border/60 font-mono text-[11px]">
                    {entries.map((e) => (
                      <li
                        key={e.lineIndex}
                        className={cn(
                          "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5",
                          e.ip !== instanceIp && selected && instanceIp && "bg-amber-500/5",
                        )}
                      >
                        <span
                          className={cn(
                            "shrink-0 tabular-nums",
                            e.ip !== instanceIp ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                          )}
                        >
                          {e.ip}
                        </span>
                        <span className="text-foreground">{e.hostnames.join(" ")}</span>
                        {e.inlineComment && (
                          <span className="text-muted-foreground"># {e.inlineComment}</span>
                        )}
                        {selected && e.ip !== instanceIp && instanceIp && (
                          <span className="ml-auto text-primary">→ {instanceIp}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function loadSavedSections(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(LAST_SECTIONS_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveSections(sections: Set<string>) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(LAST_SECTIONS_KEY, JSON.stringify([...sections]))
  } catch {
    /* ignore */
  }
}
