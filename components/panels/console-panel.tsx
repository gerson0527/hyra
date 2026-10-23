"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { HyraInstance } from "@/lib/types"
import type { HyraEntorno } from "@/lib/entorno"
import { statusKeyFromEntorno } from "@/lib/entorno"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SshSettingsDialog } from "@/components/ssh-settings-dialog"
import { SshPresetsDialog } from "@/components/ssh-presets-dialog"
import { DEFAULT_SSH_SETTINGS, loadSshSettings, type SshSettings } from "@/lib/ssh-settings"
import {
  buildCompletionCommand,
  loadSshPresets,
  type SshPreset,
} from "@/lib/ssh-presets"
import {
  defaultTabCwd,
  noteCdCommand,
  parseCompletionMatches,
} from "@/lib/ssh-completion"
import { connectSsh, disconnectSsh, execSsh, fetchSshStatus } from "@/lib/ssh-api"
import { closeAllSshShells } from "@/lib/ssh-shell-api"
import { ExecTerminal, PtyTerminal } from "@/components/ssh-terminal"
import { X, Plus, Settings2, Terminal, Loader2, Play, Container, Server, Zap } from "lucide-react"

interface ConsoleTab {
  id: string
  label: string
  container: string | null
  isPresetTab: boolean
  closeable: boolean
  lines: string[]
}

function banner(
  entorno: HyraEntorno,
  container: string | null,
  isPresetTab: boolean,
  settings: SshSettings = DEFAULT_SSH_SETTINGS,
): string[] {
  return [
    `Instancia: ${entorno.name}`,
    `Host: ${entorno.ip || "—"} · puerto ${settings.sshPort}`,
    container ? `Contenedor: ${container}` : "Sesión general del host",
    isPresetTab
      ? "Usa la sesión SSH de General. Si el contenedor está apagado: docker start; si corre: docker exec."
      : "Conexión SSH (configura y pulsa Probar SSH).",
    "",
  ]
}

function tabIdForPreset(preset: SshPreset): string {
  const container = preset.container?.trim()
  if (container) return `container:${container}`
  return `preset:${preset.id}`
}

function tabLabelForPreset(preset: SshPreset): string {
  const container = preset.container?.trim()
  if (container) return container
  return preset.label
}

interface ConsoleSession {
  tabs: ConsoleTab[]
  activeId: string
  tabCwd: Record<string, string>
}

// Sobrevive a la navegacion (Cambiar instancia) mientras la app siga abierta.
const consoleSessions = new Map<string, ConsoleSession>()

function isEntornoStopped(entorno: HyraEntorno): boolean {
  return statusKeyFromEntorno(entorno) === "detenido" || entorno.estado === "deteniendose"
}

function freshSession(entorno: HyraEntorno, settings: SshSettings): ConsoleSession {
  return {
    tabs: [
      {
        id: "general",
        label: "General",
        container: null,
        isPresetTab: false,
        closeable: false,
        lines: banner(entorno, null, false, settings),
      },
    ],
    activeId: "general",
    tabCwd: { general: "~" },
  }
}

function restoreSession(entorno: HyraEntorno, settings: SshSettings): ConsoleSession {
  if (isEntornoStopped(entorno)) {
    consoleSessions.delete(entorno.id)
    return freshSession(entorno, settings)
  }
  return consoleSessions.get(entorno.id) ?? freshSession(entorno, settings)
}

function shellIdForTab(tab: ConsoleTab): string {
  if (tab.id.startsWith("custom:")) return tab.id
  return tab.container ? `container:${tab.container}` : "general"
}

export function ConsolePanel({
  entorno,
  instance,
}: {
  entorno: HyraEntorno
  instance: HyraInstance
}) {
  const isRunning = statusKeyFromEntorno(entorno) === "corriendo"
  const [presets, setPresets] = useState<SshPreset[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [busyTabs, setBusyTabs] = useState<Set<string>>(() => new Set())
  const [sshOk, setSshOk] = useState<boolean | null>(null)
  const [sshSettings, setSshSettings] = useState<SshSettings>(DEFAULT_SSH_SETTINGS)

  const lastPresetRef = useRef<number>(0)
  const [pendingCommands, setPendingCommands] = useState<Record<string, string[]>>({})

  const [initialSession] = useState(() => restoreSession(entorno, DEFAULT_SSH_SETTINGS))
  const [tabs, setTabs] = useState<ConsoleTab[]>(initialSession.tabs)
  const [activeId, setActiveId] = useState(initialSession.activeId)
  const [tabCwd, setTabCwd] = useState<Record<string, string>>(initialSession.tabCwd)
  const tabCwdRef = useRef(tabCwd)
  const prevEntornoIdRef = useRef<string | null>(null)
  const sessionOwnerRef = useRef(entorno.id)
  const stopped = isEntornoStopped(entorno)
  const prevSshOkRef = useRef<boolean | null>(null)

  tabCwdRef.current = tabCwd

  const setTabBusy = useCallback((tabId: string, busy: boolean) => {
    setBusyTabs((prev) => {
      const next = new Set(prev)
      if (busy) next.add(tabId)
      else next.delete(tabId)
      return next
    })
  }, [])

  const isTabBusy = useCallback((tabId: string) => busyTabs.has(tabId), [busyTabs])

  const refreshPresets = useCallback(() => setPresets(loadSshPresets()), [])

  useEffect(() => {
    refreshPresets()
  }, [refreshPresets])

  useEffect(() => {
    setSshSettings(loadSshSettings())
  }, [])

  useEffect(() => {
    if (prevEntornoIdRef.current === null) {
      prevEntornoIdRef.current = entorno.id
      return
    }
    if (prevEntornoIdRef.current === entorno.id) return
    prevEntornoIdRef.current = entorno.id

    void disconnectSsh()
    void closeAllSshShells()
    setSshOk(null)
    sessionOwnerRef.current = entorno.id
    setSshSettings(loadSshSettings(entorno.name))
    const session = restoreSession(entorno, loadSshSettings(entorno.name))
    setTabs(session.tabs)
    setActiveId(session.activeId)
    setTabCwd(session.tabCwd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entorno.id])

  useEffect(() => {
    consoleSessions.set(sessionOwnerRef.current, { tabs, activeId, tabCwd })
  }, [tabs, activeId, tabCwd])

  // Maquina detenida o apagandose: se descartan las pestanas de consola.
  useEffect(() => {
    if (!stopped) return
    consoleSessions.delete(entorno.id)
    const session = freshSession(entorno, loadSshSettings())
    void closeAllSshShells()
    setSshOk(null)
    setBusyTabs(new Set())
    setTabs(session.tabs)
    setActiveId(session.activeId)
    setTabCwd(session.tabCwd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopped, entorno.id])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  const execPrompt = useCallback(
    (tab: ConsoleTab) => {
      if (tab.isPresetTab) {
        return tab.container
          ? `${sshSettings.sshUser}@${tab.container}`
          : `${sshSettings.sshUser}@${entorno.ip || instance.name}`
      }
      return tab.container
        ? `${sshSettings.sshUser}@${tab.container}`
        : `${sshSettings.sshUser}@${entorno.ip || instance.name}`
    },
    [entorno.ip, instance.name, sshSettings.sshUser],
  )

  const appendLines = useCallback(
    (
      lines: string[],
      tabId: string = activeId,
      tabMeta?: { label: string; container: string | null; isPresetTab: boolean },
    ) => {
      setTabs((prev) => {
        let next = prev
        if (!prev.some((t) => t.id === tabId)) {
          if (!tabMeta) return prev
          next = [
            ...prev,
            {
              id: tabId,
              label: tabMeta.label,
              container: tabMeta.container,
              isPresetTab: tabMeta.isPresetTab,
              closeable: true,
              lines: banner(entorno, tabMeta.container, tabMeta.isPresetTab, sshSettings),
            },
          ]
        }
        return next.map((tab) => {
          if (tab.id !== tabId) return tab
          if (lines.length === 1 && lines[0] === "__CLEAR__") return { ...tab, lines: [] }
          return { ...tab, lines: [...tab.lines, ...lines] }
        })
      })
    },
    [activeId, entorno, sshSettings],
  )

  const openPresetTab = useCallback(
    (preset: SshPreset): { tabId: string; container: string | null; label: string } => {
      const container = preset.container?.trim() || null
      const tabId = tabIdForPreset(preset)
      const label = tabLabelForPreset(preset)

      setActiveId(tabId)
      setTabCwd((prev) => ({
        ...prev,
        [tabId]: defaultTabCwd(tabId, container),
      }))
      setTabs((prev) => {
        if (prev.some((t) => t.id === tabId)) return prev
        return [
          ...prev,
          {
            id: tabId,
            label,
            container,
            isPresetTab: true,
            closeable: true,
            lines: banner(entorno, container, true, sshSettings),
          },
        ]
      })
      return { tabId, container, label }
    },
    [entorno, sshSettings],
  )

  const testSshConnection = useCallback(async () => {
    if (!isRunning || !entorno.ip) {
      appendLines(["[SSH] La instancia debe estar corriendo y con IP.", ""], "general")
      setSshOk(false)
      return
    }
    appendLines(["[SSH] Conectando (configuración SSH)…", ""], "general")
    setTabBusy("general", true)
    try {
      const result = await connectSsh({ id: entorno.id, ip: entorno.ip })
      setSshOk(true)
      appendLines([`[SSH] Conectado como ${result.username}@${result.host}`, ""], "general")
    } catch (error) {
      setSshOk(false)
      const message = error instanceof Error ? error.message : "Error SSH."
      appendLines([`[SSH] No conectado:`, ...message.split("\n"), ""], "general")
    } finally {
      setTabBusy("general", false)
    }
  }, [appendLines, entorno.id, entorno.ip, isRunning, setTabBusy])

  // Auto-reconnect cuando la conexión SSH se pierde (true → false)
  useEffect(() => {
    const prev = prevSshOkRef.current
    prevSshOkRef.current = sshOk
    if (prev === true && sshOk === false && isRunning && entorno.ip) {
      const timer = setTimeout(() => {
        void testSshConnection()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [sshOk, isRunning, entorno.ip, testSshConnection])

  const completeTabPrefix = useCallback(
    async (
      tabId: string,
      container: string | null,
      isPresetTab: boolean,
      prefix: string,
    ): Promise<string[]> => {
      if (!sshOk || !entorno.ip) return []
      const cwd = tabCwdRef.current[tabId] ?? defaultTabCwd(tabId, container)
      const cmd = buildCompletionCommand(cwd, prefix, {
        container,
        useSudo: sshSettings.useSudoDocker,
      })
      try {
        const result = await execSsh(entorno.id, {
          command: cmd,
          prepared: true,
          presetDocker: isPresetTab,
          container,
        })
        return parseCompletionMatches(result.output)
      } catch {
        return []
      }
    },
    [entorno.id, entorno.ip, sshOk, sshSettings.useSudoDocker],
  )

  const runCommand = useCallback(
    async (
      command: string,
      container: string | null = active?.container ?? null,
      tabId: string = active?.id ?? activeId,
    ) => {
      const cmd = command.trim()
      if (!cmd) return
      const tab = tabs.find((t) => t.id === tabId)
      const isPresetTab = tab?.isPresetTab ?? false
      const sshUser = sshSettings.sshUser

      if (cmd === "clear") {
        appendLines(["__CLEAR__"], tabId)
        return
      }

      if (!isRunning) {
        appendLines([`$ ${cmd}`, "La instancia no está corriendo. Iníciala desde Detalle.", ""])
        return
      }

      if (!entorno.ip) {
        appendLines([`$ ${cmd}`, "La instancia no tiene IP asignada.", ""])
        return
      }

      if (!sshOk) {
        appendLines(["[SSH] Conecta primero desde General (SSH OK).", ""])
        return
      }

      const prompt = container
        ? `${sshUser}@${container}:~# ${cmd}`
        : `${sshUser}@${entorno.ip}:~# ${cmd}`
      appendLines([prompt], tabId)
      setTabBusy(tabId, true)

      if (cmd.startsWith("cd")) {
        setTabCwd((prev) => ({
          ...prev,
          [tabId]: noteCdCommand(
            cmd,
            prev[tabId] ?? defaultTabCwd(tabId, container),
          ),
        }))
      }

      try {
        const result = await execSsh(entorno.id, {
          command: cmd,
          container,
          presetDocker: isPresetTab,
        })
        const output = result.output.flatMap((block) =>
          block === "__CLEAR__" ? ["__CLEAR__"] : block.split("\n"),
        )
        appendLines([...output, ""], tabId)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error SSH."
        appendLines([`[SSH] Error:`, ...message.split("\n"), ""], tabId)
        if (message.includes("No hay conexión SSH activa")) setSshOk(false)
      } finally {
        setTabBusy(tabId, false)
      }
    },
    [active?.container, active?.id, activeId, appendLines, entorno.id, entorno.ip, isRunning, setTabBusy, sshOk, sshSettings.sshUser, tabs],
  )

  const runPreset = useCallback(
    (preset: SshPreset) => {
      const now = Date.now()
      if (now - lastPresetRef.current < 1500) return
      lastPresetRef.current = now

      const { tabId, container } = openPresetTab(preset)

      if (!sshOk) return

      const commands = preset.commands.map((c) => c.trim()).filter(Boolean)
      setPendingCommands((prev) => ({ ...prev, [tabId]: commands }))
    },
    [openPresetTab, sshOk],
  )

  useEffect(() => {
    if (!isRunning || !entorno.ip) return
    let cancelled = false
    void (async () => {
      const status = await fetchSshStatus()
      if (cancelled) return
      if (status.connected) {
        setSshOk(true)
        return
      }
      if (sshOk === null) await testSshConnection()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entorno.id, isRunning])

  if (!active) return null

  return (
    <div className="flex h-full flex-col">
      <SshSettingsDialog
        open={settingsOpen}
        host={entorno.ip}
        instanceKey={entorno.name}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setSshSettings(loadSshSettings(entorno.name))
          setSshOk(null)
          void (async () => {
            await disconnectSsh()
            await testSshConnection()
          })()
        }}
      />
      <SshPresetsDialog
        open={presetsOpen}
        onClose={() => setPresetsOpen(false)}
        onSaved={refreshPresets}
      />

      {/* —— Pestañas de consola (cambiar vista) —— */}
      <div className="shrink-0 border-b border-border bg-sidebar">
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Pestañas de consola
          </span>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                sshOk === true && "bg-success/15 text-success",
                sshOk === false && "bg-destructive/15 text-destructive",
                sshOk === null && "bg-muted text-muted-foreground",
              )}
            >
              {sshOk === true ? "SSH OK" : sshOk === false ? "SSH error" : "SSH…"}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void testSshConnection()}
              disabled={isTabBusy("general")}
            >
              Probar SSH
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setSettingsOpen(true)}>
              <Settings2 /> SSH
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setPresetsOpen(true)}>
              Personalizar
            </Button>
          </div>
        </div>

        <div className="flex items-end gap-0.5 overflow-x-auto px-2 pb-0 pt-1">
          {tabs.map((t) => {
            const isActive = t.id === activeId
            return (
              <div
                key={t.id}
                className={cn(
                  "group relative flex shrink-0 items-center gap-1 rounded-t-lg border border-b-0 px-2.5 py-1.5 text-xs transition-colors",
                  isActive
                    ? "z-10 border-border bg-[#010409] text-foreground"
                    : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className="inline-flex items-center gap-1.5"
                  title={t.isPresetTab ? `Consola del contenedor ${t.label}` : "Sesión SSH general del host"}
                >
                  {isTabBusy(t.id) ? (
                    <Loader2 className="size-3 animate-spin text-primary" />
                  ) : t.id === "general" ? (
                    <Server className="size-3 shrink-0" />
                  ) : t.container ? (
                    <Container className="size-3 shrink-0" />
                  ) : (
                    <Terminal className="size-3 shrink-0" />
                  )}
                  <span className="max-w-[140px] truncate">{t.label}</span>
                </button>
                {t.closeable ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTabs((prev) => prev.filter((x) => x.id !== t.id))
                      if (activeId === t.id) setActiveId("general")
                      const id = t.id
                      setPendingCommands((prev) => {
                        const next = { ...prev }
                        delete next[id]
                        return next
                      })
                    }}
                    className="rounded p-0.5 opacity-40 hover:bg-muted hover:opacity-100"
                    aria-label={`Cerrar pestaña ${t.label}`}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            )
          })}
          <Button variant="ghost" size="icon-xs" aria-label="Nueva pestaña" className="mb-1 shrink-0"
            onClick={() => {
              const id = `custom:${Date.now()}`
              setTabs((prev) => [
                ...prev,
                {
                  id,
                  label: `Terminal ${prev.length}`,
                  container: null,
                  isPresetTab: true,
                  closeable: true,
                  lines: banner(entorno, null, true, sshSettings),
                },
              ])
              setActiveId(id)
            }}
          >
            <Plus />
          </Button>
        </div>
      </div>

      {/* —— Presets (ejecutar comandos) —— */}
      <div className="shrink-0 border-b border-primary/20 bg-primary/[0.04]">
        <div className="flex gap-3 px-3 py-2">
          <div className="flex shrink-0 flex-col justify-center border-r border-primary/15 pr-3">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
              <Zap className="size-3" />
              Presets
            </span>
            <span className="mt-0.5 text-[9px] leading-tight text-muted-foreground">
              Ejecutar comandos
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {presets.map((preset) => {
              const presetTabId = tabIdForPreset(preset)
              const presetBusy = isTabBusy(presetTabId)
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => runPreset(preset)}
                  title={
                    preset.container
                      ? `Ejecutar en ${preset.container}`
                      : `Ejecutar en el host: ${preset.label}`
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border border-primary/25 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground/90 shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/10",
                    presetBusy && "border-primary/60 bg-primary/15 ring-1 ring-primary/30",
                  )}
                >
                  {presetBusy ? (
                    <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Play className="size-2.5 shrink-0 fill-primary/80 text-primary" />
                  )}
                  {preset.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-[#010409]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          const isGeneral = tab.id === "general"
          const canUsePty = sshOk && isRunning && Boolean(entorno.ip)

          if (canUsePty) {
            return (
              <div key={tab.id} className={cn("h-full", !isActive && "hidden")}>
                <PtyTerminal
                  active={isActive}
                  enabled
                  shellId={shellIdForTab(tab)}
                  container={tab.container}
                  useSudo={sshSettings.useSudoDocker}
                  pendingCommands={pendingCommands[tab.id]}
                  onCommandsSent={() =>
                    setPendingCommands((prev) => {
                      const next = { ...prev }
                      delete next[tab.id]
                      return next
                    })
                  }
                />
              </div>
            )
          }

          if (!isGeneral) {
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground",
                  !isActive && "hidden",
                )}
              >
                Conecta SSH (SSH OK) para abrir la consola de {tab.label}
              </div>
            )
          }

          return (
            <div key={tab.id} className={cn("h-full", !isActive && "hidden")}>
              <ExecTerminal
                active={isActive}
                lines={tab.lines}
                busy={isTabBusy(tab.id)}
                prompt={execPrompt(tab)}
                disabled={!isRunning || !entorno.ip}
                onCommand={(cmd) => void runCommand(cmd, tab.container, tab.id)}
                onTabComplete={(prefix) =>
                  completeTabPrefix(tab.id, tab.container, tab.isPresetTab, prefix)
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
