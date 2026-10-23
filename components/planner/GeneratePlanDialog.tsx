"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ModalOverlay } from "@/components/modal-overlay"
import { GitBranch, Link2, Plus, Settings2, Sparkles, Trash2, Loader2 } from "lucide-react"
import type { PlannerRepo } from "@/lib/planner-settings"

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (data: { selectedRepoIds: string[]; customLinks: string[] }) => void
  onOpenSettings?: () => void
  repos: PlannerRepo[]
  isLoading?: boolean
}

export function GeneratePlanDialog({ open, onClose, onConfirm, onOpenSettings, repos, isLoading }: Props) {
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([])
  const [customLinks, setCustomLinks] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setSelectedRepoIds([])
      setCustomLinks([])
    }
  }, [open])

  if (!open) return null

  function toggleRepo(id: string) {
    setSelectedRepoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function addLink() {
    setCustomLinks((prev) => [...prev, ""])
  }

  function updateLink(idx: number, value: string) {
    setCustomLinks((prev) => prev.map((l, i) => (i === idx ? value : l)))
  }

  function removeLink(idx: number) {
    setCustomLinks((prev) => prev.filter((_, i) => i !== idx))
  }

  const validLinks = customLinks.map((l) => l.trim()).filter(Boolean)

  return (
    <ModalOverlay open={open} onClose={isLoading ? () => {} : onClose} className="max-w-lg">
      <div className="rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="size-4 text-blue-400" />
          Generar plan
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Selecciona los repositorios que el planner revisará y agrega los enlaces adicionales que debe consultar.
        </p>

        <div className="mt-4 space-y-4">
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="flex items-center justify-between gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <GitBranch className="size-3.5" />
                Repositorios a inspeccionar
              </span>
              <span className="text-[10px] font-normal normal-case">
                {repos.length} configurado{repos.length === 1 ? "" : "s"}
              </span>
            </legend>
            {repos.length === 0 ? (
              <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">
                  No tienes repositorios configurados.
                </p>
                {onOpenSettings && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose()
                      onOpenSettings()
                    }}
                  >
                    <Settings2 className="size-3.5" />
                    Abrir Ajustes
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {repos.map((repo) => {
                  const checked = selectedRepoIds.includes(repo.id)
                  return (
                    <label
                      key={repo.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRepo(repo.id)}
                        className="size-3.5 accent-blue-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">{repo.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {repo.localPath ? `📁 ${repo.localPath}` : repo.url}
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{repo.branch}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Link2 className="size-3.5" />
              Enlaces adicionales
            </legend>
            <p className="text-[11px] text-muted-foreground">
              Páginas de Confluence, PRs, documentación externa, etc. que el planner debe leer antes de generar el plan.
            </p>
            <div className="space-y-1.5">
              {customLinks.map((link, idx) => (
                <div key={idx} className="flex gap-1">
                  <input
                    value={link}
                    onChange={(e) => updateLink(idx, e.target.value)}
                    placeholder="https://..."
                    className="h-8 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring"
                  />
                  <button
                    type="button"
                    onClick={() => removeLink(idx)}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addLink}>
                <Plus className="size-3.5" />
                Agregar enlace
              </Button>
            </div>
          </fieldset>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {selectedRepoIds.length === 0 && validLinks.length === 0
              ? "Se usará solo Jira + adjuntos + Confluence del ticket."
              : `${selectedRepoIds.length} repo${selectedRepoIds.length === 1 ? "" : "s"} · ${validLinks.length} enlace${validLinks.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isLoading}
              onClick={() => onConfirm({ selectedRepoIds, customLinks: validLinks })}
              className="bg-blue-600 hover:bg-blue-500"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  Generar plan
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}