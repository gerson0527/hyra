"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ModalOverlay } from "@/components/modal-overlay"
import { Plus, Trash2 } from "lucide-react"
import {
  DEFAULT_PLANNER_SETTINGS,
  loadPlannerSettings,
  savePlannerSettings,
  type PlannerSettings,
  type PlannerRepo,
} from "@/lib/planner-settings"

function newRepo(): PlannerRepo {
  return {
    id: crypto.randomUUID(),
    name: "",
    url: "",
    branch: "main",
    token: "",
  }
}

export function PlannerSettingsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_PLANNER_SETTINGS)

  useEffect(() => {
    if (open) {
      const loaded = loadPlannerSettings()
      setSettings({ ...DEFAULT_PLANNER_SETTINGS, ...loaded, repos: loaded.repos ?? [] })
    }
  }, [open])

  const onlyStarterRepos = settings.repos.length > 0 && settings.repos.every((r) => r.localPath?.includes("repositoriosGIT") ?? false)

  if (!open) return null

  function updateRepo(id: string, patch: Partial<PlannerRepo>) {
    setSettings((s) => ({
      ...s,
      repos: s.repos.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }))
  }

  function addRepo() {
    setSettings((s) => ({ ...s, repos: [...s.repos, newRepo()] }))
  }

  function removeRepo(id: string) {
    setSettings((s) => ({ ...s, repos: s.repos.filter((r) => r.id !== id) }))
  }

  return (
    <ModalOverlay open={open} onClose={onClose} className="max-w-2xl">
      <form
        className="max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault()
          const cleaned = {
            ...settings,
            repos: settings.repos
              .filter((r) => r.url.trim() !== "" || (r.localPath ?? "").trim() !== "")
              .map((r) => ({
                ...r,
                name: r.name.trim() || r.url.split("/").pop() || r.localPath?.split(/[\\/]/).pop() || "repo",
              })),
          }
          savePlannerSettings(cleaned)
          onSaved?.()
          onClose()
        }}
      >
        <h3 className="text-base font-semibold">Configuración del Planner</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Credenciales para Jira, Confluence, repositorios y APIs de IA. Se guardan localmente en este equipo.
        </p>

        <div className="mt-4 space-y-4">
          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Atlassian (Jira / Confluence)
            </legend>
            <Field label="URL base">
              <input
                value={settings.jiraBaseUrl}
                onChange={(e) => setSettings((s) => ({ ...s, jiraBaseUrl: e.target.value }))}
                placeholder="https://tu-empresa.atlassian.net"
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus-visible:border-ring"
              />
            </Field>
            <Field label="Email">
              <input
                value={settings.jiraEmail}
                onChange={(e) => setSettings((s) => ({ ...s, jiraEmail: e.target.value }))}
                placeholder="tu-email@tiresia.co"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
              />
            </Field>
            <Field label="API Token">
              <input
                type="password"
                value={settings.jiraApiToken}
                onChange={(e) => setSettings((s) => ({ ...s, jiraApiToken: e.target.value }))}
                placeholder="Generar en id.atlassian.com/manage-profile/security/api-tokens"
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus-visible:border-ring"
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Repositorios de código
            </legend>
            <p className="text-[11px] text-muted-foreground">
              Repositorios que el planner revisará para generar planes más detallados. Soporta ruta local (recomendado), GitHub o Bitbucket.
            </p>
            {settings.repos.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic">No hay repositorios configurados.</p>
            )}
            {settings.repos.map((repo) => (
              <div key={repo.id} className="space-y-2 rounded-md border border-border/50 bg-muted/30 p-2">
                <div className="flex items-center gap-2">
                  <input
                    value={repo.name}
                    onChange={(e) => updateRepo(repo.id, { name: e.target.value })}
                    placeholder="Nombre (ej: maia-web)"
                    className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:border-ring"
                  />
                  <button
                    type="button"
                    onClick={() => removeRepo(repo.id)}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <input
                  value={repo.url}
                  onChange={(e) => updateRepo(repo.id, { url: e.target.value })}
                  placeholder="https://bitbucket.org/tiresia/repo (opcional si usas ruta local)"
                  className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring"
                />
                <input
                  value={repo.localPath ?? ""}
                  onChange={(e) => updateRepo(repo.id, { localPath: e.target.value })}
                  placeholder="Ruta local, ej: C:\Users\Tiresia\Documents\repos\repo"
                  className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring"
                />
                <div className="flex gap-2">
                  <input
                    value={repo.branch}
                    onChange={(e) => updateRepo(repo.id, { branch: e.target.value })}
                    placeholder="main"
                    className="h-8 w-24 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring"
                  />
                  <input
                    type="password"
                    value={repo.token ?? ""}
                    onChange={(e) => updateRepo(repo.id, { token: e.target.value })}
                    placeholder="Token (solo para repos remotos privados)"
                    className="h-8 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring"
                  />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRepo}>
              <Plus className="size-3.5" />
              Agregar repositorio
            </Button>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              APIs de IA
            </legend>
            <Field label="Anthropic (Claude) API Key">
              <input
                type="password"
                value={settings.anthropicApiKey}
                onChange={(e) => setSettings((s) => ({ ...s, anthropicApiKey: e.target.value }))}
                placeholder="sk-ant-..."
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus-visible:border-ring"
              />
            </Field>
            <Field label="OpenAI (GPT) API Key">
              <input
                type="password"
                value={settings.openaiApiKey}
                onChange={(e) => setSettings((s) => ({ ...s, openaiApiKey: e.target.value }))}
                placeholder="sk-..."
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus-visible:border-ring"
              />
            </Field>
            <Field label="Google Gemini API Key">
              <input
                type="password"
                value={settings.geminiApiKey}
                onChange={(e) => setSettings((s) => ({ ...s, geminiApiKey: e.target.value }))}
                placeholder="AIza..."
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus-visible:border-ring"
              />
            </Field>
            <Field label="MiniMax API Key">
              <input
                type="password"
                value={settings.minimaxApiKey}
                onChange={(e) => setSettings((s) => ({ ...s, minimaxApiKey: e.target.value }))}
                placeholder="mm-..."
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus-visible:border-ring"
              />
            </Field>
          </fieldset>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="sm">
            Guardar
          </Button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}