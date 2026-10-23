"use client"

import { useState } from "react"
import type { HyraInstance } from "@/lib/types"
import { TopBar } from "@/components/top-bar"
import { DetailPanel } from "@/components/panels/detail-panel"
import { ConsolePanel } from "@/components/panels/console-panel"
import { SqlPanel } from "@/components/panels/sql-panel"
import { FilesPanel } from "@/components/panels/files-panel"
import { GitPanel } from "@/components/panels/git-panel"
import { HostsPanel } from "@/components/panels/hosts-panel"
import { PlannerForm } from "@/components/planner/PlannerForm"
import { cn } from "@/lib/utils"
import { useEntornoAutoRefresh } from "@/lib/use-entorno-auto-refresh"
import { setActiveSshInstance } from "@/lib/ssh-settings"
import type { SessionUser } from "@/lib/user"
import type { HyraEntorno } from "@/lib/entorno"
import { Info, TerminalSquare, Database, FolderOpen, GitBranch, Globe, ClipboardList, Loader2 } from "lucide-react"

type TabId = "detalle" | "ssh" | "sql" | "archivos" | "git" | "hosts" | "planner"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "detalle", label: "Detalle", icon: <Info className="size-4" /> },
  { id: "ssh", label: "SSH / Consola", icon: <TerminalSquare className="size-4" /> },
  { id: "sql", label: "SQL", icon: <Database className="size-4" /> },
  { id: "archivos", label: "Archivos", icon: <FolderOpen className="size-4" /> },
  { id: "git", label: "Git", icon: <GitBranch className="size-4" /> },
  { id: "hosts", label: "Hosts", icon: <Globe className="size-4" /> },
  { id: "planner", label: "Planner", icon: <ClipboardList className="size-4" /> },
]

export function Dashboard({
  user,
  entorno,
  instance,
}: {
  user: SessionUser
  entorno: HyraEntorno
  instance: HyraInstance
}) {
  const [tab, setTab] = useState<TabId>("detalle")
  // Antes de renderizar los paneles: toda lectura de config SSH usa esta instancia.
  setActiveSshInstance(entorno.name)
  const { kickRefresh, bursting } = useEntornoAutoRefresh()

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <TopBar user={user} managedEnvName={entorno.name} />
      {bursting ? (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-primary/20 bg-primary/5 px-3 py-1 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin text-primary" />
          Actualizando estado de la instancia…
        </div>
      ) : null}
      <main className="flex min-h-0 flex-1 flex-col">
        <nav className="flex shrink-0 items-center gap-1 border-b border-border bg-sidebar px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors",
                tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.icon}
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className={cn("h-full overflow-y-auto", tab !== "detalle" && "hidden")}>
            <DetailPanel
              entorno={entorno}
              instance={instance}
              onOpenTab={setTab}
              onEntornoAction={kickRefresh}
            />
          </div>
          <div className={cn("h-full", tab !== "ssh" && "hidden")}>
            <ConsolePanel entorno={entorno} instance={instance} />
          </div>
          <div className={cn("h-full", tab !== "sql" && "hidden")}>
            <SqlPanel entorno={entorno} instance={instance} />
          </div>
          <div className={cn("h-full", tab !== "archivos" && "hidden")}>
            <FilesPanel entorno={entorno} instance={instance} />
          </div>
          <div className={cn("h-full", tab !== "git" && "hidden")}>
            <GitPanel instance={instance} estadotarea={entorno.estadotarea} />
          </div>
          <div className={cn("h-full", tab !== "hosts" && "hidden")}>
            <HostsPanel instance={instance} />
          </div>
          <div className={cn("h-full overflow-hidden", tab !== "planner" && "hidden")}>
            <PlannerForm />
          </div>
        </div>
      </main>
    </div>
  )
}
