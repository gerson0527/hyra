"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { HyraInstance, GitFile } from "@/lib/types"
import {
  dtoToGitFile,
  diffStatusParam,
  fetchGitConfig,
  fetchGitDiff,
  fetchGitStatus,
  gitAdd,
  gitStageHunk,
  gitStageLine,
  gitApplyPatch,
  gitCommit,
  gitPush,
  gitUnstage,
  type GitRepoInfo,
} from "@/lib/git-api"
import {
  loadExcludedPaths,
  loadLastRepoForInstance,
  saveExcludedPaths,
  saveLastRepoForInstance,
} from "@/lib/git-storage"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  GitBranch,
  Check,
  Plus,
  Upload,
  EyeOff,
  X,
  FilePlus,
  FilePen,
  Ban,
  Loader2,
  RefreshCw,
  Copy,
  Minus,
} from "lucide-react"

interface FileMenu {
  x: number
  y: number
  path: string
  zone: "staged" | "unstaged"
}

interface DiffMenu {
  x: number
  y: number
  kind: "hunk" | "line"
  hunkId: string
  lineIndex?: number
}

type GitPanelProps = {
  instance: HyraInstance
  estadotarea?: string
}

const MAX_AGE_S = 72 * 60 * 60 // 72 horas = 3 días

export function GitPanel({ instance, estadotarea }: GitPanelProps) {
  const [repos, setRepos] = useState<GitRepoInfo[]>([])
  const [suggestedRepoId, setSuggestedRepoId] = useState<string | null>(null)
  const [repoId, setRepoId] = useState("")
  const [branch, setBranch] = useState("")
  const [stagedFiles, setStagedFiles] = useState<GitFile[]>([])
  const [unstagedFiles, setUnstagedFiles] = useState<GitFile[]>([])
  const [activeZone, setActiveZone] = useState<"staged" | "unstaged">("unstaged")
  const [activePath, setActivePath] = useState<string | null>(null)
  const [commitMsg, setCommitMsg] = useState("")
  const [hideNoise, setHideNoise] = useState(true)
  const [hideIde, setHideIde] = useState(true)
  const [onlyModified, setOnlyModified] = useState(false)
  const [commitPrefix, setCommitPrefix] = useState("")
  const [menu, setMenu] = useState<FileMenu | null>(null)
  const [diffMenu, setDiffMenu] = useState<DiffMenu | null>(null)
  const [diffContext, setDiffContext] = useState(3)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [busy, setBusy] = useState(false)
  const [gitAvailable, setGitAvailable] = useState(true)
  const [noiseHidden, setNoiseHidden] = useState(0)
  const [ideHidden, setIdeHidden] = useState(0)
  const [statusError, setStatusError] = useState("")
  const [diffError, setDiffError] = useState("")
  const [log, setLog] = useState("")
  const excludedRef = useRef<Set<string>>(new Set())
  const selectedRef = useRef<Set<string>>(new Set())
  const [statusVersion, setStatusVersion] = useState(0)

  const repo = repos.find((r) => r.id === repoId) ?? null

  const appendLog = useCallback((line: string) => {
    setLog((prev) => (prev ? `${prev}\n${line}` : line))
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!repoId) return
    setLoadingStatus(true)
    setStatusError("")
    try {
      const data = await fetchGitStatus(repoId, hideNoise)
      if (data.error) setStatusError(data.error)
      setBranch(data.branch)
      setNoiseHidden(data.noiseHidden)
      setIdeHidden(data.ideHidden)

      const excluded = excludedRef.current
      const known = new Set([
        ...data.unstaged.map((f) => f.path),
        ...data.staged.map((f) => f.path),
      ])
      for (const p of [...excluded]) {
        if (!known.has(p)) excluded.delete(p)
      }

      const nextUnstaged = data.unstaged.map((dto) =>
        dtoToGitFile(
          dto,
          "unstaged",
          excluded.has(dto.path),
          selectedRef.current.has(dto.path),
        ),
      )
      const nextStaged = data.staged.map((dto) =>
        dtoToGitFile(dto, "staged", false, false),
      )
      setUnstagedFiles(nextUnstaged)
      setStagedFiles(nextStaged)

      setActivePath((current) => (current && !known.has(current) ? null : current))
      setStatusVersion((v) => v + 1)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatusError(msg)
      appendLog(`Error status: ${msg}`)
    } finally {
      setLoadingStatus(false)
    }
  }, [repoId, hideNoise, appendLog])

  const loadDiff = useCallback(
    async (file: GitFile) => {
      if (!repoId || !file.path) return
      setLoadingDiff(true)
      setDiffError("")
      try {
        const data = await fetchGitDiff(
          repoId,
          file.path,
          diffStatusParam(file),
          diffContext,
          file.zone,
        )
        if (data.error) {
          setDiffError(data.error)
          return
        }
        const applyHunks = (prev: GitFile[]) =>
          prev.map((f) => (f.path === file.path ? { ...f, hunks: data.hunks } : f))
        if (file.zone === "staged") setStagedFiles(applyHunks)
        else setUnstagedFiles(applyHunks)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setDiffError(msg)
      } finally {
        setLoadingDiff(false)
      }
    },
    [repoId, diffContext],
  )

  useEffect(() => {
    let cancelled = false
    async function init() {
      const lastRepo = loadLastRepoForInstance(instance.name)
      try {
        const cfg = await fetchGitConfig({
          instanceName: instance.name,
          instanceId: instance.id,
          estadotarea,
          lastRepoId: lastRepo,
        })
        if (cancelled) return
        setRepos(cfg.repos)
        setSuggestedRepoId(cfg.suggestedRepoId)
        setGitAvailable(cfg.gitAvailable)
        setCommitPrefix(cfg.defaultCommitPrefix)
        const initial =
          lastRepo && cfg.repos.some((r) => r.id === lastRepo)
            ? lastRepo
            : cfg.suggestedRepoId && cfg.repos.some((r) => r.id === cfg.suggestedRepoId)
              ? cfg.suggestedRepoId
              : cfg.repos[0]?.id || ""
        setRepoId(initial)
        excludedRef.current = loadExcludedPaths(initial)
        selectedRef.current = new Set()
        setUnstagedFiles([])
        setStagedFiles([])
        setActivePath(null)
        setLog("")
        if (cfg.defaultCommitPrefix) setCommitMsg(cfg.defaultCommitPrefix)
        else setCommitMsg("")
      } catch (err) {
        if (!cancelled) {
          appendLog(`Error config: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [instance.id, instance.name, instance.ticket, estadotarea, appendLog])

  useEffect(() => {
    if (!repoId) return
    excludedRef.current = loadExcludedPaths(repoId)
    void refreshStatus()
  }, [repoId, hideNoise, refreshStatus])

  useEffect(() => {
    if (!activePath || !repoId || loadingStatus) return
    const entry =
      activeZone === "staged"
        ? stagedFiles.find((f) => f.path === activePath)
        : unstagedFiles.find((f) => f.path === activePath)
    if (!entry) return
    void loadDiff(entry)
  }, [activePath, activeZone, repoId, loadingStatus, statusVersion, diffContext, loadDiff])

  useEffect(() => {
    if (!onlyModified || !activePath || activeZone !== "unstaged") return
    const entry = unstagedFiles.find((f) => f.path === activePath)
    if (entry?.status === "new") setActivePath(null)
  }, [onlyModified, activePath, activeZone, unstagedFiles])

  const visibleUnstaged = useMemo(() => {
    const nowS = Math.floor(Date.now() / 1000)
    return unstagedFiles.filter((f) => {
      if (f.excluded) return false
      if (hideIde && f.isIde) return false
      if (onlyModified) {
        if (f.status === "new") return false
        // Ocultar archivos sin cambios reales de contenido
        if (f.additions === 0 && f.deletions === 0) return false
        // Ocultar archivos con más de 3 días de antigüedad (probablemente no son tuyos)
        if (f.mtime && f.mtime < nowS - MAX_AGE_S) return false
      }
      return true
    })
  }, [unstagedFiles, hideIde, onlyModified])

  const visibleStaged = stagedFiles.filter((f) => !(hideIde && f.isIde))

  const active =
    activeZone === "staged"
      ? stagedFiles.find((f) => f.path === activePath) ?? null
      : unstagedFiles.find((f) => f.path === activePath) ?? null

  const selectedCount = visibleUnstaged.filter((f) => f.selected).length
  const selectedPaths = visibleUnstaged.filter((f) => f.selected).map((f) => f.path)

  function updateUnstaged(path: string, fn: (f: GitFile) => GitFile) {
    setUnstagedFiles((prev) => prev.map((f) => (f.path === path ? fn(f) : f)))
  }

  function selectFile(path: string, zone: "staged" | "unstaged") {
    setActivePath(path)
    setActiveZone(zone)
  }

  useEffect(() => {
    if (!menu && !diffMenu) return
    const close = () => {
      setMenu(null)
      setDiffMenu(null)
    }
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [menu, diffMenu])

  function toggleSelect(path: string) {
    updateUnstaged(path, (f) => {
      const next = !f.selected
      if (next) selectedRef.current.add(path)
      else selectedRef.current.delete(path)
      return { ...f, selected: next }
    })
  }

  function exclude(path: string) {
    excludedRef.current.add(path)
    saveExcludedPaths(repoId, excludedRef.current)
    updateUnstaged(path, (f) => {
      selectedRef.current.delete(path)
      return { ...f, excluded: true, selected: false }
    })
    if (activePath === path && activeZone === "unstaged") setActivePath(null)
  }

  function excludeFolder(folder: string) {
    if (!folder) return
    const prefix = folder + "/"
    const paths = unstagedFiles
      .filter((f) => f.path.startsWith(prefix) || f.path === folder)
      .map((f) => f.path)
    for (const p of paths) {
      excludedRef.current.add(p)
      selectedRef.current.delete(p)
    }
    saveExcludedPaths(repoId, excludedRef.current)
    setUnstagedFiles((prev) =>
      prev.map((f) =>
        f.path.startsWith(prefix) || f.path === folder
          ? { ...f, excluded: true, selected: false }
          : f,
      ),
    )
    if (activePath && (activePath.startsWith(prefix) || activePath === folder) && activeZone === "unstaged") {
      setActivePath(null)
    }
  }

  async function handleUnstage(paths: string[]) {
    if (!paths.length) return
    setBusy(true)
    try {
      const result = await gitUnstage(repoId, paths)
      appendLog(`git unstage: ${result.stdout || result.stderr || (result.ok ? "ok" : "error")}`)
      if (!result.ok) {
        appendLog(result.error || "No se pudo quitar del staging")
        return
      }
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  async function handleStageHunk(path: string, hunkId: string) {
    setBusy(true)
    try {
      const hunkIndex = parseInt(hunkId.replace(/^h/, ''), 10)
      const result = await gitStageHunk(repoId, path, hunkIndex, diffContext)
      appendLog(
        `Stage Hunk For Commit: ${result.stdout || result.stderr || (result.ok ? 'ok' : 'error')}`,
      )
      if (!result.ok) {
        appendLog(result.error || 'No se pudo añadir el bloque al staging')
        return
      }
      await refreshStatus()
      const entry = unstagedFiles.find((f) => f.path === path)
      if (entry && activePath === path && activeZone === 'unstaged') void loadDiff(entry)
    } finally {
      setBusy(false)
    }
  }

  async function handleStageLine(
    path: string,
    hunkId: string,
    lineType: 'add' | 'remove',
    lineText: string,
    oldNo?: number | null,
    newNo?: number | null,
  ) {
    setBusy(true)
    try {
      const hunkIndex = parseInt(hunkId.replace(/^h/, ''), 10)
      const result = await gitStageLine(
        repoId,
        path,
        hunkIndex,
        lineType,
        lineText,
        diffContext,
        oldNo,
        newNo,
      )
      appendLog(
        `Stage Line For Commit: ${result.stdout || result.stderr || (result.ok ? 'ok' : 'error')}`,
      )
      if (!result.ok) {
        appendLog(result.error || 'No se pudo añadir la línea al staging')
        return
      }
      await refreshStatus()
      const entry = unstagedFiles.find((f) => f.path === path)
      if (entry && activePath === path && activeZone === 'unstaged') void loadDiff(entry)
    } finally {
      setBusy(false)
    }
  }

  async function handleApplyPatch(
    path: string,
    patch: string,
    mode: "stage" | "revert",
    label: string,
  ) {
    setBusy(true)
    try {
      const result = await gitApplyPatch(repoId, path, patch, mode)
      appendLog(
        `git ${mode === "stage" ? "stage" : "revert"} (${label}): ${result.stdout || result.stderr || (result.ok ? "ok" : "error")}`,
      )
      if (!result.ok) {
        appendLog(result.error || "La operación falló")
        return
      }
      await refreshStatus()
      const entry =
        activeZone === "staged"
          ? stagedFiles.find((f) => f.path === path)
          : unstagedFiles.find((f) => f.path === path)
      if (entry) void loadDiff(entry)
    } finally {
      setBusy(false)
    }
  }

  async function handleDiscardHunk(path: string, hunkId: string) {
    const file =
      activeZone === "staged"
        ? stagedFiles.find((f) => f.path === path)
        : unstagedFiles.find((f) => f.path === path)
    const hunk = file?.hunks.find((h) => h.id === hunkId)
    if (!hunk?.patch) return
    if (
      !window.confirm(
        "¿Revertir este bloque @@?\n\nSe modifica el archivo en disco (solo este bloque).",
      )
    ) {
      return
    }
    await handleApplyPatch(path, hunk.patch, "revert", "bloque")
  }

  function selectRepo(nextId: string, auto = false) {
    if (!repos.some((r) => r.id === nextId)) return
    setRepoId(nextId)
    excludedRef.current = loadExcludedPaths(nextId)
    selectedRef.current = new Set()
    if (!auto) saveLastRepoForInstance(instance.name, nextId)
  }

  async function handleAdd() {
    if (!selectedPaths.length) return
    setBusy(true)
    try {
      const result = await gitAdd(repoId, selectedPaths)
      appendLog(`git add: ${result.stdout || result.stderr || (result.ok ? "ok" : "error")}`)
      if (!result.ok) {
        appendLog(result.error || "git add falló")
        return
      }
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  async function handleCommit() {
    if (!commitMsg.trim()) return
    if (visibleStaged.length === 0 && selectedPaths.length === 0) return
    setBusy(true)
    try {
      const result =
        selectedPaths.length > 0
          ? await gitCommit(repoId, commitMsg.trim(), selectedPaths)
          : await gitCommit(repoId, commitMsg.trim())
      appendLog(`git commit: ${result.stdout || result.stderr || (result.ok ? "ok" : "error")}`)
      if (!result.ok) {
        appendLog(result.error || "git commit falló")
        return
      }
      selectedRef.current = new Set()
      if (commitPrefix) setCommitMsg(commitPrefix)
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  async function handlePush() {
    setBusy(true)
    try {
      const result = await gitPush(repoId)
      appendLog(`git push: ${result.stdout || result.stderr || (result.ok ? "ok" : "error")}`)
      if (!result.ok) appendLog(result.error || "git push falló")
    } finally {
      setBusy(false)
    }
  }

  const metaBits = useMemo(() => {
    const bits: string[] = []
    if (noiseHidden > 0) bits.push(`${noiseHidden} ocultos (unimerge)`)
    if (ideHidden > 0) bits.push(`${ideHidden} IDE ocultos`)
    return bits.join(" · ")
  }, [noiseHidden, ideHidden])

  if (!gitAvailable) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Git no está disponible en el PATH del servidor. Instala Git y reinicia la aplicación.
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div
        className="flex w-[22rem] shrink-0 flex-col border-r border-border bg-sidebar"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="border-b border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Repositorio
            </p>
            <button
              onClick={() => void refreshStatus()}
              disabled={loadingStatus || busy || !repoId}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              title="Actualizar estado"
            >
              {loadingStatus ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {repos.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRepo(r.id)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  r.id === repoId
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                  r.id === suggestedRepoId && r.id !== repoId && "border-primary/30",
                )}
                title={r.id === suggestedRepoId ? "Sugerido por el nombre de la instancia" : undefined}
              >
                {r.label}
                {r.id === suggestedRepoId && " ★"}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
              <GitBranch className="size-3" />
              {branch || "—"}
            </span>
            {repo && (
              <code className="truncate font-mono text-[11px] text-muted-foreground">
                {repo.folder}/{repo.subdir}
              </code>
            )}
          </div>
          {metaBits && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">{metaBits}</p>
          )}
          {statusError && (
            <p className="mt-1.5 text-[10px] text-destructive">{statusError}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2">
          <FilterToggle
            checked={hideNoise}
            onChange={setHideNoise}
            label="Ocultar ruido de unimerge"
          />
          <FilterToggle checked={hideIde} onChange={setHideIde} label="Ocultar archivos del IDE" />
          <FilterToggle
            checked={onlyModified}
            onChange={setOnlyModified}
            label="Solo modificados recientes (3 días)"
          />
        </div>

        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            {visibleUnstaged.length} sin staging · {selectedCount} marcados
          </span>
          <button
            onClick={() => {
              const markAll = selectedCount < visibleUnstaged.length
              setUnstagedFiles((prev) =>
                prev.map((f) => {
                  if (!visibleUnstaged.includes(f)) return f
                  if (markAll) selectedRef.current.add(f.path)
                  else selectedRef.current.delete(f.path)
                  return { ...f, selected: markAll }
                }),
              )
            }}
            className="hover:text-foreground"
          >
            {selectedCount < visibleUnstaged.length ? "Marcar todo" : "Desmarcar todo"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loadingStatus && visibleStaged.length === 0 && visibleUnstaged.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Leyendo cambios…
            </div>
          ) : visibleStaged.length === 0 && visibleUnstaged.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Sin cambios visibles. Ajusta los filtros o ejecuta git unimerge.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleStaged.length > 0 && (
                <section>
                  <p className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    En staging ({visibleStaged.length})
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {visibleStaged.map((f) => (
                      <li key={`staged-${f.path}`}>
                        <FileRow
                          file={f}
                          active={activePath === f.path && activeZone === "staged"}
                          showCheckbox={false}
                          onSelect={() => selectFile(f.path, "staged")}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setMenu({ x: e.clientX, y: e.clientY, path: f.path, zone: "staged" })
                          }}
                          trailing={
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleUnstage([f.path])
                              }}
                              disabled={busy}
                              className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                              title="Quitar del staging"
                            >
                              <Minus className="size-3.5" />
                            </button>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {visibleUnstaged.length > 0 && (
                <section>
                  <p className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Cambios sin staging ({visibleUnstaged.length})
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {visibleUnstaged.map((f) => (
                      <li key={`unstaged-${f.path}`}>
                        <FileRow
                          file={f}
                          active={activePath === f.path && activeZone === "unstaged"}
                          showCheckbox
                          selected={f.selected}
                          onToggleSelect={() => toggleSelect(f.path)}
                          onSelect={() => selectFile(f.path, "unstaged")}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setMenu({ x: e.clientX, y: e.clientY, path: f.path, zone: "unstaged" })
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-auto bg-background">
          {loadingDiff ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando diff…
            </div>
          ) : diffError ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">
              {diffError}
            </div>
          ) : active ? (
            <DiffView
              file={active}
              busy={busy}
              contextLines={diffContext}
              onDiscardHunk={(hid) => void handleDiscardHunk(active.path, hid)}
              onStageHunk={(hid) => void handleStageHunk(active.path, hid)}
              onOpenMenu={setDiffMenu}
              onMoreContext={() => setDiffContext((n) => Math.min(40, n + 3))}
              onLessContext={() => setDiffContext((n) => Math.max(0, n - 3))}
              onRefresh={() => {
                if (active) void loadDiff(active)
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Selecciona un archivo para ver el diff.
            </div>
          )}
        </div>

        <div className="border-t border-border bg-card p-3">
          {commitPrefix && (
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={() => setCommitMsg((m) => (m.startsWith(commitPrefix) ? m : commitPrefix + m))}
                className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-primary hover:border-primary/40"
              >
                {commitPrefix.trim()}
              </button>
              <span className="text-[11px] text-muted-foreground">Prefijo del ticket</span>
            </div>
          )}
          <textarea
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="Mensaje de commit..."
            disabled={busy}
            className="h-16 w-full resize-none rounded-md border border-border bg-background p-2 text-[13px] outline-none focus-visible:border-ring disabled:opacity-50"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount === 0 || busy}
              onClick={() => void handleAdd()}
            >
              <Plus /> Add ({selectedCount})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={(visibleStaged.length === 0 && selectedPaths.length === 0) || !commitMsg.trim() || busy}
              onClick={() => void handleCommit()}
            >
              <Check /> Commit ({visibleStaged.length || selectedPaths.length})
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void handlePush()}>
              <Upload /> Push
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Add → staging · Commit → lo que está en staging
            </span>
          </div>
          {log && (
            <pre className="mt-2 max-h-20 overflow-auto rounded border border-border bg-muted/30 p-2 font-mono text-[10px] text-muted-foreground">
              {log}
            </pre>
          )}
        </div>
      </div>

      {menu && (
        <FileContextMenu
          menu={menu}
          file={
            menu.zone === "staged"
              ? stagedFiles.find((f) => f.path === menu.path)!
              : unstagedFiles.find((f) => f.path === menu.path)!
          }
          onView={() => {
            selectFile(menu.path, menu.zone)
            setMenu(null)
          }}
          onToggle={() => {
            toggleSelect(menu.path)
            setMenu(null)
          }}
          onExclude={() => {
            exclude(menu.path)
            setMenu(null)
          }}
          onExcludeFolder={() => {
            const folder = menu.path.includes("/") ? menu.path.slice(0, menu.path.lastIndexOf("/")) : ""
            excludeFolder(folder)
            setMenu(null)
          }}
          onUnstage={() => {
            void handleUnstage([menu.path])
            setMenu(null)
          }}
        />
      )}

      {diffMenu && active && (
        <DiffContextMenu
          menu={diffMenu}
          file={active}
          onClose={() => setDiffMenu(null)}
          onStageHunk={() => {
            void handleStageHunk(active.path, diffMenu.hunkId)
            setDiffMenu(null)
          }}
          onRevertHunk={() => {
            void handleDiscardHunk(active.path, diffMenu.hunkId)
            setDiffMenu(null)
          }}
          onStageLine={() => {
            const hunk = active.hunks.find((h) => h.id === diffMenu.hunkId)
            const line = hunk?.lines[diffMenu.lineIndex ?? -1]
            if (line && (line.type === 'add' || line.type === 'remove')) {
              void handleStageLine(
                active.path,
                diffMenu.hunkId,
                line.type,
                line.text,
                line.oldNo,
                line.newNo,
              )
            }
            setDiffMenu(null)
          }}
          onRevertLine={() => {
            const hunk = active.hunks.find((h) => h.id === diffMenu.hunkId)
            const line = hunk?.lines[diffMenu.lineIndex ?? -1]
            if (line?.patch) void handleApplyPatch(active.path, line.patch, "revert", "línea")
            setDiffMenu(null)
          }}
          onMoreContext={() => {
            setDiffContext((n) => Math.min(40, n + 3))
            setDiffMenu(null)
          }}
          onLessContext={() => {
            setDiffContext((n) => Math.max(0, n - 3))
            setDiffMenu(null)
          }}
          onRefresh={() => {
            if (active) void loadDiff(active)
            setDiffMenu(null)
          }}
          onCopyLine={() => {
            const hunk = active.hunks.find((h) => h.id === diffMenu.hunkId)
            const line = hunk?.lines[diffMenu.lineIndex ?? -1]
            if (line) void navigator.clipboard.writeText(line.text)
            setDiffMenu(null)
          }}
        />
      )}
    </div>
  )
}

function FileRow({
  file,
  active,
  showCheckbox,
  selected,
  onToggleSelect,
  onSelect,
  onContextMenu,
  trailing,
}: {
  file: GitFile
  active: boolean
  showCheckbox?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  trailing?: React.ReactNode
}) {
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        "group flex cursor-default items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors",
        active ? "bg-primary/10" : "hover:bg-accent",
        file.zone === "staged" && "border border-sky-200/60 dark:border-sky-800/50",
      )}
    >
      {showCheckbox ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect?.()
          }}
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background",
          )}
          aria-label={selected ? "Desmarcar" : "Marcar"}
        >
          {selected && <Check className="size-3" />}
        </button>
      ) : (
        <span className="flex size-4 shrink-0 items-center justify-center rounded bg-sky-500/20 text-sky-700 dark:text-sky-300">
          <Check className="size-3" />
        </span>
      )}
      {file.status === "new" ? (
        <FilePlus className={cn("size-3.5 shrink-0", file.zone === "staged" ? "text-sky-600" : "text-success")} />
      ) : (
        <FilePen className={cn("size-3.5 shrink-0", file.zone === "staged" ? "text-sky-600" : "text-warning")} />
      )}
      <span className="flex-1 truncate font-mono text-[12px]">{file.path}</span>
      {(file.additions > 0 || file.deletions > 0) && (
        <span className="shrink-0 font-mono text-[11px]">
          <span className="text-diff-add-foreground">+{file.additions}</span>{" "}
          <span className="text-diff-remove-foreground">-{file.deletions}</span>
        </span>
      )}
      {trailing}
    </div>
  )
}

function FilterToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-left text-[12px]"
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded border transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
        )}
      >
        {checked && <Check className="size-3" />}
      </span>
      <span className={cn(checked ? "text-foreground" : "text-muted-foreground")}>
        <EyeOff className="mr-1 inline size-3" />
        {label}
      </span>
    </button>
  )
}

function fileStatusLabel(file: GitFile): string {
  if (file.zone === "staged") {
    if (file.status === "new" || file.rawStatus === "staged_nuevo") return "Archivo nuevo, en staging"
    return "Modificado, en staging"
  }
  if (file.status === "new") return "Archivo nuevo, sin staging"
  return "Modificado, sin staging"
}

function DiffView({
  file,
  busy,
  contextLines,
  onDiscardHunk,
  onStageHunk,
  onOpenMenu,
  onMoreContext,
  onLessContext,
  onRefresh,
}: {
  file: GitFile
  busy: boolean
  contextLines: number
  onDiscardHunk: (hunkId: string) => void
  onStageHunk: (hunkId: string) => void
  onOpenMenu: (menu: DiffMenu) => void
  onMoreContext: () => void
  onLessContext: () => void
  onRefresh: () => void
}) {
  const canStage = file.zone === "unstaged"
  if (file.status === "new" && file.hunks.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between bg-amber-400 px-3 py-1.5 text-[12px] font-medium text-amber-950">
          <span>Archivo nuevo</span>
          <span className="truncate font-mono">File: {file.path}</span>
        </div>
        <div className="p-6 text-center text-sm text-muted-foreground">
          Archivo nuevo — sin diff de texto. Se añadirá completo al hacer commit.
        </div>
      </div>
    )
  }

  if (file.hunks.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between bg-amber-400 px-3 py-1.5 text-[12px] font-medium text-amber-950">
          <span>{fileStatusLabel(file)}</span>
          <span className="truncate font-mono">File: {file.path}</span>
        </div>
        <div className="p-6 text-center text-sm text-muted-foreground">
          Sin diff visible para este archivo.
        </div>
      </div>
    )
  }

  return (
    <div className="font-mono text-[12.5px]">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-amber-400 px-3 py-1.5 text-[12px] font-medium text-amber-950">
        <span className="shrink-0">{fileStatusLabel(file)}</span>
        <span className="min-w-0 truncate font-mono">File: {file.path}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onLessContext}
            className="rounded px-1.5 py-0.5 hover:bg-amber-500/50"
            title="Menos contexto"
          >
            −ctx
          </button>
          <span className="text-[10px] opacity-80">{contextLines}</span>
          <button
            type="button"
            onClick={onMoreContext}
            className="rounded px-1.5 py-0.5 hover:bg-amber-500/50"
            title="Más contexto"
          >
            +ctx
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="rounded p-0.5 hover:bg-amber-500/50 disabled:opacity-40"
            title="Actualizar diff"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>
      {canStage && (
        <p className="border-b border-border bg-muted/30 px-3 py-1 text-[10px] text-muted-foreground">
          Clic derecho en la barra @@ o botón + → Stage Hunk · en línea +/- → Stage Line
        </p>
      )}
      {file.hunks.map((h) => (
        <div key={h.id} className="border-b border-border">
          <div
            className="flex cursor-default items-center justify-between bg-sky-100 px-3 py-1 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onOpenMenu({ x: e.clientX, y: e.clientY, kind: "hunk", hunkId: h.id })
            }}
          >
            <span className="font-semibold">{h.header}</span>
            <div className="flex items-center gap-1">
              {canStage && h.patch && (
                <button
                  type="button"
                  onClick={() => onStageHunk(h.id)}
                  disabled={busy}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium opacity-80 hover:bg-sky-200/80 hover:opacity-100 disabled:opacity-40 dark:hover:bg-sky-900/60"
                  title="Stage Hunk For Commit"
                >
                  <Plus className="mr-0.5 inline size-3" />
                  Stage Hunk
                </button>
              )}
              {h.patch && (
                <button
                  type="button"
                  onClick={() => onDiscardHunk(h.id)}
                  disabled={busy}
                  className="rounded p-0.5 opacity-70 hover:bg-sky-200/80 hover:opacity-100 disabled:opacity-40 dark:hover:bg-sky-900/60"
                  aria-label="Revertir bloque"
                  title="Revert Hunk"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
          {h.lines.map((ln, i) => (
            <div
              key={i}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenMenu({
                  x: e.clientX,
                  y: e.clientY,
                  kind: "line",
                  hunkId: h.id,
                  lineIndex: i,
                })
              }}
              className={cn(
                "flex cursor-default",
                ln.type === "add" && "bg-diff-add/15",
                ln.type === "remove" && "bg-diff-remove/15",
              )}
            >
              <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground/60">
                {ln.oldNo ?? ""}
              </span>
              <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground/60">
                {ln.newNo ?? ""}
              </span>
              <span
                className={cn(
                  "w-4 shrink-0 select-none text-center font-bold",
                  ln.type === "add" && "text-diff-add-foreground",
                  ln.type === "remove" && "text-diff-remove-foreground",
                )}
              >
                {ln.type === "add" ? "+" : ln.type === "remove" ? "-" : " "}
              </span>
              <span
                className={cn(
                  "whitespace-pre-wrap break-all pr-3",
                  ln.type === "add" && "text-diff-add-foreground",
                  ln.type === "remove" && "text-diff-remove-foreground",
                )}
              >
                {ln.text}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function DiffContextMenu({
  menu,
  file,
  onClose,
  onStageHunk,
  onRevertHunk,
  onStageLine,
  onRevertLine,
  onMoreContext,
  onLessContext,
  onRefresh,
  onCopyLine,
}: {
  menu: DiffMenu
  file: GitFile
  onClose: () => void
  onStageHunk: () => void
  onRevertHunk: () => void
  onStageLine: () => void
  onRevertLine: () => void
  onMoreContext: () => void
  onLessContext: () => void
  onRefresh: () => void
  onCopyLine: () => void
}) {
  const hunk = file.hunks.find((h) => h.id === menu.hunkId)
  const line = menu.lineIndex !== undefined ? hunk?.lines[menu.lineIndex] : null
  const canLine = line?.type === "add" || line?.type === "remove"
  const canHunk = Boolean(hunk?.patch) && file.zone === "unstaged"

  return (
    <div
      style={{ top: menu.y, left: menu.x }}
      className="fixed z-50 w-72 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {canHunk && (
        <>
          <MenuItem
            icon={<Plus className="size-3.5" />}
            onClick={onStageHunk}
            label="Stage Hunk For Commit"
            description="git add -p → y en este bloque @@"
          />
          {menu.kind === "hunk" && (
            <MenuItem
              icon={<X className="size-3.5" />}
              onClick={onRevertHunk}
              label="Revert Hunk"
              description="Deshace este bloque en el archivo"
              danger
            />
          )}
          <div className="my-1 h-px bg-border" />
        </>
      )}
      {!canHunk && file.zone === "staged" && (
        <p className="px-3 py-2 text-[10px] text-muted-foreground">
          Este archivo ya está en staging. Ábrelo desde «Cambios sin staging» para stage por bloque.
        </p>
      )}
      {menu.kind === "line" && canLine && (
        <>
          <MenuItem
            icon={<Plus className="size-3.5" />}
            onClick={onStageLine}
            label="Stage Line For Commit"
            description="git add -p → s (split) + esta línea"
          />
          <MenuItem
            icon={<X className="size-3.5" />}
            onClick={onRevertLine}
            label="Revert Line"
            description="Deshace solo esta línea en el archivo"
            danger
          />
          <div className="my-1 h-px bg-border" />
        </>
      )}
      <MenuItem icon={<EyeOff className="size-3.5" />} onClick={onLessContext} label="Menos contexto" />
      <MenuItem icon={<EyeOff className="size-3.5" />} onClick={onMoreContext} label="Más contexto" />
      <MenuItem icon={<RefreshCw className="size-3.5" />} onClick={onRefresh} label="Actualizar" />
      {line && (
        <MenuItem icon={<Copy className="size-3.5" />} onClick={onCopyLine} label="Copiar línea" />
      )}
      <div className="my-1 h-px bg-border" />
      <MenuItem icon={<X className="size-3.5" />} onClick={onClose} label="Cerrar" />
    </div>
  )
}

function FileContextMenu({
  menu,
  file,
  onView,
  onToggle,
  onExclude,
  onExcludeFolder,
  onUnstage,
}: {
  menu: FileMenu
  file: GitFile
  onView: () => void
  onToggle: () => void
  onExclude: () => void
  onExcludeFolder: () => void
  onUnstage: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const folder = menu.path.includes("/") ? menu.path.slice(0, menu.path.lastIndexOf("/")) : ""
  return (
    <div
      ref={ref}
      style={{ top: menu.y, left: menu.x }}
      className="fixed z-50 w-52 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem icon={<FilePen className="size-3.5" />} onClick={onView} label="Ver diff" />
      {menu.zone === "staged" ? (
        <MenuItem icon={<Minus className="size-3.5" />} onClick={onUnstage} label="Quitar del staging" danger />
      ) : (
        <>
          <MenuItem
            icon={<Check className="size-3.5" />}
            onClick={onToggle}
            label={file.selected ? "Desmarcar" : "Marcar"}
          />
          <div className="my-1 h-px bg-border" />
          <MenuItem
            icon={<Ban className="size-3.5" />}
            onClick={onExclude}
            label="No subir (mantener en disco)"
            danger
          />
          {folder && (
            <MenuItem
              icon={<EyeOff className="size-3.5" />}
              onClick={onExcludeFolder}
              label={`Excluir carpeta: ${folder.split("/").pop()}`}
              description={folder}
              danger
            />
          )}
        </>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  description,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  description?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-accent",
        danger && "text-destructive hover:bg-destructive/10",
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span className="text-[13px]">{label}</span>
      </span>
      {description && (
        <span className="pl-5 text-[10px] text-muted-foreground">{description}</span>
      )}
    </button>
  )
}
