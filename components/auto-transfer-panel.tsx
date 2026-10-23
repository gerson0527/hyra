"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { listLocalDirectory, type LocalDirEntry } from "@/lib/local-files"
import { uploadToSftp } from "@/lib/sftp-api"
import {
  buildSnapshot,
  detectNewOrChangedFiles,
  getExcludePatterns,
  getIncludePatterns,
  getRemoteFolder,
  getWatchedFolder,
  isAutoTransferEnabled,
  setAutoTransferEnabled,
  setExcludePatterns,
  setIncludePatterns,
  setRemoteFolder,
  setWatchedFolder,
  type FileSnapshot,
} from "@/lib/auto-transfer"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Play,
  Square,
  ListRestart,
  Trash2,
  FolderOpen,
  RefreshCw,
  Check,
  X,
  AlertCircle,
} from "lucide-react"

type TransferLog = {
  name: string
  status: "ok" | "error" | "skipped"
  message?: string
  time: number
}

export function AutoTransferPanel({
  siteId,
  sftpOk,
  onTransferComplete,
}: {
  siteId: string
  sftpOk: boolean
  onTransferComplete: () => void
}) {
  const [enabled, setEnabled] = useState(isAutoTransferEnabled)
  const [localPath, setLocalPathState] = useState(getWatchedFolder)
  const [remotePath, setRemotePathState] = useState(getRemoteFolder)
  const [excludePatterns, setExcludePatternsState] = useState(getExcludePatterns)
  const [excludeInput, setExcludeInput] = useState(excludePatterns.join(", "))
  const [includePatterns, setIncludePatternsState] = useState(getIncludePatterns)
  const [includeInput, setIncludeInput] = useState(includePatterns.join(", "))
  const [logs, setLogs] = useState<TransferLog[]>([])
  const [watching, setWatching] = useState(false)
  const [snapshot, setSnapshot] = useState<FileSnapshot>({})
  const [pollCount, setPollCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const snapshotRef = useRef<FileSnapshot>(snapshot)
  const enabledRef = useRef(enabled)
  const siteIdRef = useRef(siteId)

  // keep refs in sync
  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    siteIdRef.current = siteId
  }, [siteId])

  const addLog = useCallback((entry: TransferLog) => {
    setLogs((prev) => [entry, ...prev].slice(0, 100))
  }, [])

  const pollDirectory = useCallback(async () => {
    if (!siteIdRef.current || !enabledRef.current || !sftpOk) return
    try {
      const result = await listLocalDirectory(localPath)
      const currSnapshot = snapshotRef.current
      const changed = detectNewOrChangedFiles(result.entries, currSnapshot, excludePatterns, includePatterns)

      if (changed.length > 0) {
        const files = changed.map((f) => ({
          localPath: f.fullPath,
          remotePath: `${remotePath.replace(/\/+$/, "")}/${f.name}`,
        }))

        try {
          const uploadResult = await uploadToSftp(siteIdRef.current, files)
          for (const item of changed) {
            const result = uploadResult.results.find((r) => r.localPath === item.fullPath)
            addLog({
              name: item.name,
              status: result?.ok ? "ok" : "error",
              message: result?.ok ? "Subido" : result?.error || "Error",
              time: Date.now(),
            })
          }
          onTransferComplete()
        } catch (err) {
          for (const item of changed) {
            addLog({
              name: item.name,
              status: "error",
              message: err instanceof Error ? err.message : "Error de subida",
              time: Date.now(),
            })
          }
        }
      }

      setSnapshot(buildSnapshot(result.entries))
      setPollCount((c) => c + 1)
    } catch {
      // local dir may not exist yet
    }
  }, [localPath, remotePath, excludePatterns, includePatterns, sftpOk, addLog, onTransferComplete])

  const startWatching = useCallback(() => {
    setWatching(true)
    setAutoTransferEnabled(true)
    setEnabled(true)
    // initialize snapshot on start
    listLocalDirectory(localPath).then((result) => {
      setSnapshot(buildSnapshot(result.entries))
    })
    intervalRef.current = setInterval(() => {
      void pollDirectory()
    }, 5000)
  }, [localPath, pollDirectory])

  const stopWatching = useCallback(() => {
    setWatching(false)
    setAutoTransferEnabled(false)
    setEnabled(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Apply watching on mount if enabled
  useEffect(() => {
    if (isAutoTransferEnabled() && sftpOk && siteId) {
      startWatching()
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function saveSettings() {
    setWatchedFolder(localPath)
    setRemoteFolder(remotePath)
    const patterns = excludeInput
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
    setExcludePatternsState(patterns)
    setExcludePatterns(patterns)
    const incPatterns = includeInput
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
    setIncludePatternsState(incPatterns)
    setIncludePatterns(incPatterns)
  }

  async function quickPickFolder() {
    const { pickLocalFolder } = await import("@/lib/local-files")
    const picked = await pickLocalFolder()
    if (picked) {
      setLocalPathState(picked)
      setWatchedFolder(picked)
    }
  }

  return (
    <div className="shrink-0 border-b border-border bg-card">
      <div className="flex items-center gap-3 px-3 py-2">
        <ListRestart className="size-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium shrink-0">Auto-transferencia</span>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">Local:</span>
          <input
            value={localPath}
            onChange={(e) => setLocalPathState(e.target.value)}
            className="h-6 w-[260px] rounded border border-border bg-background px-1.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-primary/40"
            spellCheck={false}
            placeholder="C:\ruta\local"
          />
          <button
            type="button"
            onClick={quickPickFolder}
            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="Elegir carpeta"
          >
            <FolderOpen className="size-3" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">Remoto:</span>
          <input
            value={remotePath}
            onChange={(e) => setRemotePathState(e.target.value)}
            className="h-6 w-[180px] rounded border border-border bg-background px-1.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-primary/40"
            spellCheck={false}
            placeholder="/ruta/remota"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">Incluir:</span>
          <input
            value={includeInput}
            onChange={(e) => setIncludeInput(e.target.value)}
            className="h-6 w-[120px] rounded border border-border bg-background px-1.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-primary/40"
            spellCheck={false}
            placeholder="*.swf"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">Excluir:</span>
          <input
            value={excludeInput}
            onChange={(e) => setExcludeInput(e.target.value)}
            className="h-6 w-[120px] rounded border border-border bg-background px-1.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-primary/40"
            spellCheck={false}
            placeholder="*.tmp, *.log"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={saveSettings}
          title="Guardar configuración"
        >
          <RefreshCw className="size-3" />
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          {watching ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
              <span className="size-1.5 animate-pulse rounded-full bg-success" />
              Vigilando ({pollCount})
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">Detenido</span>
          )}

          {!watching ? (
            <Button
              type="button"
              size="sm"
              className="h-6 px-2 text-[10px]"
              disabled={!sftpOk || !siteId}
              onClick={startWatching}
            >
              <Play className="size-3" />
              Iniciar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={stopWatching}
            >
              <Square className="size-3" />
              Detener
            </Button>
          )}

          {logs.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setLogs([])}
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      {logs.length > 0 ? (
        <div className="max-h-[120px] overflow-y-auto border-t border-border bg-muted/10">
          {logs.map((log, i) => (
            <div
              key={`${log.time}-${log.name}-${i}`}
              className="flex items-center gap-2 px-3 py-1 font-mono text-[10px]"
            >
              {log.status === "ok" ? (
                <Check className="size-3 shrink-0 text-success" />
              ) : log.status === "skipped" ? (
                <AlertCircle className="size-3 shrink-0 text-muted-foreground" />
              ) : (
                <X className="size-3 shrink-0 text-destructive" />
              )}
              <span className="truncate text-foreground/80">{log.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {log.status === "ok"
                  ? "→ servidor"
                  : log.status === "skipped"
                    ? "omitido"
                    : log.message}
              </span>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {new Date(log.time).toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
