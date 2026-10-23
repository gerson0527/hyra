"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { HyraInstance } from "@/lib/types"
import type { HyraEntorno } from "@/lib/entorno"
import {
  resolveSftpHost,
  pickSftpSiteForInstance,
  getSftpSiteById,
  loadLastSftpSiteId,
  loadSftpSites,
  saveLastSftpSiteId,
  saveSftpSites,
  sftpHostForEntorno,
  DEFAULT_SFTP_REMOTE_PATH,
  type SftpSite,
} from "@/lib/sftp-sites"
import type { SftpDirEntry } from "@/lib/sftp-server"
import {
  connectSftp,
  fetchSftpStatus,
  listSftpDirectory,
  uploadToSftp,
} from "@/lib/sftp-api"
import { loadSftpSettings, saveSftpSettings } from "@/lib/sftp-settings"
import {
  getDefaultLocalPath,
  isLocalFsAvailable,
  listLocalDirectory,
  parentLocalPath,
  pickLocalFolder,
  saveLastLocalPath,
  type LocalDirEntry,
} from "@/lib/local-files"
import {
  addLocalBookmark,
  addRemoteBookmark,
  isBookmarked,
  loadLocalBookmarks,
  loadRemoteBookmarks,
  removeLocalBookmark,
  removeRemoteBookmark,
} from "@/lib/file-bookmarks"
import { SftpSitesDialog } from "@/components/sftp-sites-dialog"
import { AutoTransferPanel } from "@/components/auto-transfer-panel"
import { FileContextMenu, type FileMenuEntry } from "@/components/file-context-menu"
import { deleteSftpFile, renameSftpFile, downloadSftpFile, statSftpFile } from "@/lib/sftp-api"

async function getLocalFs(): Promise<{ unlink: (p: string) => Promise<void>; rename: (oldP: string, newP: string) => Promise<void> } | null> {
  if (typeof window === "undefined") return null
  try {
    const w = window as any
    if (w.require) {
      const fs = w.require("node:fs/promises")
      if (fs) return fs
    }
  } catch {
    // not Electron
  }
  return null
}
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Folder,
  File,
  FileCode2,
  FileText,
  FileJson,
  FileCog,
  FileArchive,
  FileImage,
  Database,
  Upload,
  Download,
  HardDrive,
  Server,
  Plug,
  Loader2,
  Settings2,
  RefreshCw,
  FolderOpen,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Bookmark,
  BookmarkPlus,
  X,
  Square,
  Play,
  SquareCheckBig,
  ListRestart,
  type LucideIcon,
} from "lucide-react"

type SortColumn = "name" | "size" | "modified"
type SortDirection = "asc" | "desc"

type FileEntry = {
  name: string
  type: "dir" | "file"
  size: string
  modified: string
  sizeBytes: number
  mtimeMs: number
}

type BrowserRow = FileEntry & {
  isParent?: boolean
}

function fileExtension(name: string): string {
  const base = name.trim()
  if (!base || base === "..") return ""
  const idx = base.lastIndexOf(".")
  if (idx <= 0) return ""
  return base.slice(idx + 1).toLowerCase()
}

function resolveFileIcon(name: string): { Icon: LucideIcon; chip: string; iconClass: string } {
  const ext = fileExtension(name)
  switch (ext) {
    case "sh":
    case "bash":
    case "pl":
    case "py":
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
    case "mjs":
      return {
        Icon: FileCode2,
        chip: "bg-emerald-500/15 ring-emerald-500/35",
        iconClass: "text-emerald-400",
      }
    case "sql":
    case "db":
      return {
        Icon: Database,
        chip: "bg-sky-500/15 ring-sky-500/35",
        iconClass: "text-sky-400",
      }
    case "json":
    case "xml":
    case "yaml":
    case "yml":
      return {
        Icon: FileJson,
        chip: "bg-orange-500/15 ring-orange-500/35",
        iconClass: "text-orange-400",
      }
    case "conf":
    case "cfg":
    case "ini":
    case "env":
      return {
        Icon: FileCog,
        chip: "bg-violet-500/15 ring-violet-500/35",
        iconClass: "text-violet-400",
      }
    case "zip":
    case "tar":
    case "gz":
    case "rar":
    case "7z":
      return {
        Icon: FileArchive,
        chip: "bg-amber-600/15 ring-amber-600/35",
        iconClass: "text-amber-500",
      }
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
      return {
        Icon: FileImage,
        chip: "bg-pink-500/15 ring-pink-500/35",
        iconClass: "text-pink-400",
      }
    case "md":
    case "txt":
    case "log":
      return {
        Icon: FileText,
        chip: "bg-slate-500/15 ring-slate-500/35",
        iconClass: "text-slate-300",
      }
    default:
      return {
        Icon: File,
        chip: "bg-blue-500/12 ring-blue-500/30",
        iconClass: "text-blue-300",
      }
  }
}

function FileEntryIcon({
  name,
  type,
  isParent,
}: {
  name: string
  type: "dir" | "file"
  isParent?: boolean
}) {
  if (isParent) {
    return (
      <span
        className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-sm bg-amber-500/25 ring-1 ring-amber-400/50"
        title="Subir un nivel"
      >
        <FolderOpen className="size-4 fill-amber-300 text-amber-500" strokeWidth={1.75} />
      </span>
    )
  }

  if (type === "dir") {
    const hidden = name.startsWith(".")
    return (
      <span
        className={cn(
          "inline-flex size-[22px] shrink-0 items-center justify-center rounded-sm ring-1",
          hidden
            ? "bg-amber-600/10 ring-amber-500/25"
            : "bg-amber-400/20 ring-amber-400/45",
        )}
      >
        <Folder
          className={cn(
            "size-4",
            hidden ? "fill-amber-500/50 text-amber-500/80" : "fill-amber-400 text-amber-500",
          )}
          strokeWidth={1.75}
        />
      </span>
    )
  }

  const { Icon, chip, iconClass } = resolveFileIcon(name)
  return (
    <span className={cn("inline-flex size-[22px] shrink-0 items-center justify-center rounded-sm ring-1", chip)}>
      <Icon className={cn("size-3.5", iconClass)} strokeWidth={2} />
    </span>
  )
}

const DEFAULT_SORT: { column: SortColumn; direction: SortDirection } = {
  column: "name",
  direction: "asc",
}

function sortFileEntries(
  entries: FileEntry[],
  column: SortColumn,
  direction: SortDirection,
): FileEntry[] {
  const mult = direction === "asc" ? 1 : -1

  return [...entries].sort((a, b) => {
    if (column === "name") {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      return mult * byName
    }
    if (column === "size") {
      const diff = a.sizeBytes - b.sizeBytes
      if (diff !== 0) return mult * diff
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    }
    const diff = a.mtimeMs - b.mtimeMs
    if (diff !== 0) return mult * diff
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  })
}

function nextSort(
  current: { column: SortColumn; direction: SortDirection },
  column: SortColumn,
): { column: SortColumn; direction: SortDirection } {
  if (current.column === column) {
    return { column, direction: current.direction === "asc" ? "desc" : "asc" }
  }
  return {
    column,
    direction: column === "name" ? "asc" : "desc",
  }
}

function SortHeader({
  label,
  column,
  align,
  sort,
  onSort,
  className,
}: {
  label: string
  column: SortColumn
  align: "left" | "right"
  sort: { column: SortColumn; direction: SortDirection }
  onSort: (column: SortColumn) => void
  className?: string
}) {
  const active = sort.column === column
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <th className={cn("px-3 py-1.5 font-medium", align === "right" ? "text-right" : "text-left", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
          align === "right" && "ml-auto",
        )}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} />
      </button>
    </th>
  )
}

function parentRemotePath(dirPath: string): string | null {
  const trimmed = dirPath.trim() || "/"
  if (trimmed === "/") return null
  const withoutTrailing = trimmed.replace(/\/+$/, "")
  const idx = withoutTrailing.lastIndexOf("/")
  if (idx <= 0) return "/"
  return withoutTrailing.slice(0, idx) || "/"
}

function joinRemotePath(base: string, name: string): string {
  const clean = base.replace(/\/+$/, "") || ""
  return `${clean}/${name}`.replace(/\/+/g, "/")
}

function joinLocalPath(base: string, name: string): string {
  const sep = base.includes("\\") ? "\\" : "/"
  const clean = base.replace(/[\\/]+$/, "")
  return `${clean}${sep}${name}`
}

function FileBrowser({
  title,
  icon,
  path,
  entries,
  parentPath,
  loading,
  disabled,
  emptyMessage,
  onNavigate,
  onOpenDir,
  onRefresh,
  showPickFolder,
  bookmarks = [],
  bookmarkSaved = false,
  onSaveBookmark,
  onRemoveBookmark,
  selectable,
  selectedNames,
  onSelectionChange,
  dragEnabled,
  getDragFullPath,
  dropEnabled,
  onFilesDrop,
  isRemote,
  onOpenFile,
  onFileAction,
}: {
  title: string
  icon: React.ReactNode
  path: string
  entries: FileEntry[]
  parentPath: string | null
  loading?: boolean
  disabled?: boolean
  emptyMessage: string
  onNavigate: (nextPath: string) => void
  onOpenDir: (name: string) => void
  onRefresh?: () => void
  showPickFolder?: boolean
  bookmarks?: string[]
  bookmarkSaved?: boolean
  onSaveBookmark?: () => void
  onRemoveBookmark?: (bookmarkPath: string) => void
  selectable?: boolean
  selectedNames?: Set<string>
  onSelectionChange?: (names: Set<string>) => void
  dragEnabled?: boolean
  getDragFullPath?: (name: string) => string | undefined
  dropEnabled?: boolean
  onFilesDrop?: (files: Array<{ name: string; fullPath: string }>) => void
  isRemote?: boolean
  onOpenFile?: (name: string) => void
  onFileAction?: (action: string, name: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const [pathEdit, setPathEdit] = useState(path)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    file: FileMenuEntry
  } | null>(null)

  useEffect(() => {
    setPathEdit(path)
  }, [path])

  useEffect(() => {
    setSort(DEFAULT_SORT)
  }, [path])

  const sortedEntries = useMemo(
    () => sortFileEntries(entries, sort.column, sort.direction),
    [entries, sort.column, sort.direction],
  )

  const rows: BrowserRow[] = parentPath
    ? [
        {
          name: "..",
          type: "dir",
          size: "—",
          modified: "—",
          sizeBytes: 0,
          mtimeMs: 0,
          isParent: true,
        },
        ...sortedEntries,
      ]
    : sortedEntries

  function goToEditedPath() {
    const next = pathEdit.trim()
    if (next) onNavigate(next)
  }

  function handleRowDoubleClick(row: BrowserRow) {
    if (disabled) return
    if (row.isParent && parentPath) {
      onNavigate(parentPath)
      return
    }
    if (row.type === "dir") { onOpenDir(row.name); return }
    // Show context menu on double-click for files (to let user choose)
    const rect = document.querySelector(`[data-row="${CSS.escape(row.name)}"]`)
    if (rect) {
      const r = rect.getBoundingClientRect()
      setContextMenu({
        x: r.left + 40,
        y: r.top + 20,
        file: {
          name: row.name,
          type: row.type,
          path: row.name,
          fullPath: row.name,
          size: row.size,
          modified: row.modified,
        },
      })
    }
  }

  function handleRowContextMenu(e: React.MouseEvent, row: BrowserRow) {
    e.preventDefault()
    if (disabled || row.isParent) return
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file: {
        name: row.name,
        type: row.type,
        path: row.name,
        fullPath: row.name,
        size: row.size,
        modified: row.modified,
      },
    })
  }

  function handleDragStart(e: React.DragEvent, row: BrowserRow) {
    if (!dragEnabled || !getDragFullPath || row.isParent || row.type !== "file") return

    const fileFullPath = getDragFullPath(row.name)
    if (!fileFullPath) return

    // If selection includes this file, drag all selected files
    const names = selectedNames?.has(row.name) && selectedNames.size > 1
      ? [...selectedNames]
      : [row.name]

    const files = names.map((n) => ({ name: n, fullPath: getDragFullPath(n) })).filter((f) => f.fullPath)
    if (files.length === 0) return

    e.dataTransfer.setData("text/plain", JSON.stringify(files))
    e.dataTransfer.effectAllowed = "copy"
    // Clear default drag image
    const el = document.createElement("div")
    el.textContent = `${files.length} archivo(s)`
    el.style.cssText = "position:absolute;top:-9999px;font-size:12px;background:#1f2937;color:#fff;padding:4px 8px;border-radius:4px;white-space:nowrap"
    document.body.appendChild(el)
    e.dataTransfer.setDragImage(el, 0, 0)
    setTimeout(() => document.body.removeChild(el), 0)
  }

  function handleDragOver(e: React.DragEvent) {
    if (!dropEnabled || disabled) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!dropEnabled || disabled) return
    e.preventDefault()
    dragCounterRef.current++
    if (dragCounterRef.current === 1) setDragOver(true)
  }

  function handleDragLeave() {
    if (!dropEnabled) return
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setDragOver(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragOver(false)
    if (!dropEnabled || disabled || !onFilesDrop) return
    try {
      const raw = e.dataTransfer.getData("text/plain")
      if (!raw) return
      const files = JSON.parse(raw) as Array<{ name: string; fullPath: string }>
      if (files.length > 0) onFilesDrop(files)
    } catch {
      // ignore invalid drag data
    }
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col border-border",
        dropEnabled && dragOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {bookmarks.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-muted/15 px-2 py-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Marcadores
          </span>
          {bookmarks.map((bookmark) => (
            <span
              key={bookmark}
              className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border bg-background pl-2"
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onNavigate(bookmark)}
                className="truncate py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                title={bookmark}
              >
                {bookmark}
              </button>
              {onRemoveBookmark ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemoveBookmark(bookmark)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  title="Quitar marcador"
                >
                  <X className="size-2.5" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        {icon}
        <span className="shrink-0 text-sm font-medium">{title}</span>
        <div className="ml-auto flex min-w-0 flex-1 items-center gap-1.5">
          <input
            value={pathEdit}
            onChange={(e) => setPathEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToEditedPath()
            }}
            disabled={disabled}
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={disabled}
            onClick={goToEditedPath}
          >
            Ir
          </Button>
          {onSaveBookmark && path.trim() && path !== "—" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-7 px-2", bookmarkSaved && "border-primary/40 text-primary")}
              disabled={disabled || bookmarkSaved}
              title={bookmarkSaved ? "Ruta ya guardada en marcadores" : "Guardar ruta actual como marcador"}
              onClick={onSaveBookmark}
            >
              {bookmarkSaved ? <Bookmark className="size-3.5 fill-current" /> : <BookmarkPlus className="size-3.5" />}
            </Button>
          ) : null}
          {showPickFolder ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={disabled}
              title="Elegir carpeta"
              onClick={() => {
                void pickLocalFolder().then((picked) => {
                  if (picked) onNavigate(picked)
                })
              }}
            >
              <FolderOpen className="size-3.5" />
            </Button>
          ) : null}
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={disabled || loading}
              onClick={onRefresh}
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/50 text-xs">
              <tr>
                {selectable ? (
                  <th className="w-8 px-2 py-1.5 text-left">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (!onSelectionChange) return
                        const fileRows = rows.filter((r) => !r.isParent && r.type === "file")
                        if (fileRows.every((r) => selectedNames?.has(r.name))) {
                          onSelectionChange(new Set())
                        } else {
                          onSelectionChange(new Set(fileRows.map((r) => r.name)))
                        }
                      }}
                      className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      {rows.filter((r) => !r.isParent && r.type === "file").length > 0 &&
                      rows.filter((r) => !r.isParent && r.type === "file").every((r) => selectedNames?.has(r.name)) ? (
                        <SquareCheckBig className="size-3.5" />
                      ) : (
                        <Square className="size-3.5" />
                      )}
                    </button>
                  </th>
                ) : null}
                <SortHeader
                  label="Nombre"
                  column="name"
                  align="left"
                  sort={sort}
                  onSort={(column) => setSort((prev) => nextSort(prev, column))}
                />
                <SortHeader
                  label="Tamaño"
                  column="size"
                  align="right"
                  sort={sort}
                  onSort={(column) => setSort((prev) => nextSort(prev, column))}
                />
                <SortHeader
                  label="Modificado"
                  column="modified"
                  align="right"
                  sort={sort}
                  onSort={(column) => setSort((prev) => nextSort(prev, column))}
                  className="hidden md:table-cell"
                />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={selectable ? 4 : 3} className="px-3 py-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.isParent ? "__parent__" : row.name}
                    data-row={row.isParent ? undefined : row.name}
                    draggable={dragEnabled && !row.isParent && row.type === "file"}
                    onDragStart={(e) => handleDragStart(e, row)}
                    className={cn(
                      "border-t border-border hover:bg-accent/40",
                      (row.type === "dir" || row.isParent) && !disabled && "cursor-pointer",
                      row.isParent && "bg-muted/20",
                      selectable && selectedNames?.has(row.name) && "bg-accent/30",
                      dragEnabled && row.type === "file" && "cursor-grab active:cursor-grabbing",
                    )}
                    onDoubleClick={() => handleRowDoubleClick(row)}
                    onContextMenu={(e) => handleRowContextMenu(e, row)}
                  >
                    {selectable ? (
                      <td className="w-8 px-2 py-1.5 text-left">
                        {!row.isParent && row.type === "file" ? (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!onSelectionChange) return
                              const next = new Set(selectedNames)
                              if (next.has(row.name)) {
                                next.delete(row.name)
                              } else {
                                next.add(row.name)
                              }
                              onSelectionChange(next)
                            }}
                            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                          >
                            {selectedNames?.has(row.name) ? (
                              <SquareCheckBig className="size-3.5" />
                            ) : (
                              <Square className="size-3.5" />
                            )}
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-2.5">
                        <FileEntryIcon name={row.name} type={row.type} isParent={row.isParent} />
                        <span
                          className={cn(
                            "font-mono text-[13px]",
                            row.type === "dir" ? "font-medium text-foreground" : "text-foreground/90",
                          )}
                        >
                          {row.name}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
                      {row.size}
                    </td>
                    <td className="hidden px-3 py-1.5 text-right font-mono text-[12px] text-muted-foreground md:table-cell">
                      {row.modified}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          )}
        </div>

        {contextMenu && (
          <FileContextMenu
            file={contextMenu.file}
            x={contextMenu.x}
            y={contextMenu.y}
            isRemote={Boolean(isRemote)}
            onClose={() => setContextMenu(null)}
            onOpen={() => {
              if (!contextMenu) return
              const file = contextMenu.file
              if (file.type === "dir") onOpenDir(file.name)
              else onOpenFile?.(file.name)
              setContextMenu(null)
            }}
            onDownload={() => {
              onFileAction?.("download", contextMenu!.file.name)
              setContextMenu(null)
            }}
            onDelete={() => {
              onFileAction?.("delete", contextMenu!.file.name)
              setContextMenu(null)
            }}
            onRename={() => {
              onFileAction?.("rename", contextMenu!.file.name)
              setContextMenu(null)
            }}
            onDuplicate={() => {
              onFileAction?.("duplicate", contextMenu!.file.name)
              setContextMenu(null)
            }}
            onMove={() => {
              onFileAction?.("move", contextMenu!.file.name)
              setContextMenu(null)
            }}
            onCopyName={() => {
              navigator.clipboard.writeText(contextMenu!.file.name)
              setContextMenu(null)
            }}
            onCopyPath={() => {
              navigator.clipboard.writeText(contextMenu!.file.fullPath)
              setContextMenu(null)
            }}
            onProperties={async () => {
              if (!contextMenu) return
              onFileAction?.("properties", contextMenu.file.name)
              setContextMenu(null)
            }}
            onEdit={(editor) => {
              onFileAction?.(`edit:${editor}`, contextMenu!.file.name)
              setContextMenu(null)
            }}
        />
      )}
    </div>
  )
}

export function FilesPanel({
  entorno,
  instance,
}: {
  entorno: HyraEntorno
  instance: HyraInstance
}) {
  const [sites, setSites] = useState<SftpSite[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [sitesOpen, setSitesOpen] = useState(false)
  const [sftpOk, setSftpOk] = useState<boolean | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [remotePath, setRemotePath] = useState(DEFAULT_SFTP_REMOTE_PATH)
  const [remoteEntries, setRemoteEntries] = useState<SftpDirEntry[]>([])
  const [localPath, setLocalPath] = useState("")
  const [localEntries, setLocalEntries] = useState<LocalDirEntry[]>([])
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [localFsReady, setLocalFsReady] = useState(false)
  const [localBookmarks, setLocalBookmarks] = useState<string[]>([])
  const [remoteBookmarks, setRemoteBookmarks] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sftpPassword, setSftpPassword] = useState("")
  const [rememberSftpPassword, setRememberSftpPassword] = useState(true)
  const [sessionPort, setSessionPort] = useState(22)
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [autoTransferOpen, setAutoTransferOpen] = useState(false)

  const entornoRef = useMemo(
    () => ({
      name: entorno.name || instance.name,
      ip: entorno.ip || instance.ip,
      mysqlHost: entorno.mysqlHost,
    }),
    [entorno.ip, entorno.mysqlHost, entorno.name, instance.ip, instance.name],
  )

  const refreshSites = useCallback(() => {
    const loaded = loadSftpSites()
    setSites(loaded)
    const suggested = pickSftpSiteForInstance(loaded, entornoRef.name)
    const last = loadLastSftpSiteId(entorno.id)
    const id =
      (suggested && loaded.some((s) => s.id === suggested) ? suggested : null) ||
      (last && loaded.some((s) => s.id === last) ? last : null) ||
      loaded[0]?.id ||
      ""
    setSelectedSiteId(id)
  }, [entorno.id, entornoRef.name])

  useEffect(() => {
    refreshSites()
    const sftpSettings = loadSftpSettings()
    setSftpPassword(sftpSettings.sftpPassword)
    setRememberSftpPassword(sftpSettings.rememberSftpPassword)
    setLocalBookmarks(loadLocalBookmarks())
  }, [refreshSites])

  useEffect(() => {
    if (isLocalFsAvailable()) {
      setLocalFsReady(true)
      return
    }
    const id = window.setInterval(() => {
      if (isLocalFsAvailable()) {
        setLocalFsReady(true)
        window.clearInterval(id)
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!selectedSiteId) return
    const site = getSftpSiteById(sites, selectedSiteId)
    setRemoteBookmarks(loadRemoteBookmarks(selectedSiteId, site?.bookmarks ?? []))
  }, [selectedSiteId, sites])

  useEffect(() => {
    setSftpOk(null)
    setRemoteEntries([])
    setRemotePath(DEFAULT_SFTP_REMOTE_PATH)
    setError(null)
  }, [entorno.id])

  const selectedSite = useMemo(
    () => getSftpSiteById(sites, selectedSiteId) ?? sites[0],
    [sites, selectedSiteId],
  )

  useEffect(() => {
    if (selectedSite) setSessionPort(selectedSite.port)
  }, [selectedSite])

  const sessionSite = useMemo(
    () => (selectedSite ? { ...selectedSite, port: sessionPort } : undefined),
    [selectedSite, sessionPort],
  )

  const displayHost = useMemo(() => {
    if (!selectedSite) return sftpHostForEntorno(entornoRef, instance.ip)
    return resolveSftpHost(selectedSite, entornoRef, instance.ip)
  }, [entornoRef, instance.ip, selectedSite])

  const loadRemote = useCallback(
    async (siteId: string, path?: string) => {
      setLoadingRemote(true)
      setError(null)
      try {
        const result = await listSftpDirectory(siteId, path)
        setRemotePath(result.path)
        setRemoteEntries(result.entries)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al listar remoto.")
        if (String(err).includes("No hay conexión SFTP activa")) setSftpOk(false)
      } finally {
        setLoadingRemote(false)
      }
    },
    [],
  )

  const loadLocal = useCallback(async (targetPath: string) => {
    if (!isLocalFsAvailable() || !targetPath.trim()) return
    setLoadingLocal(true)
    setError(null)
    try {
      const result = await listLocalDirectory(targetPath)
      setLocalPath(result.path)
      saveLastLocalPath(result.path)
      setLocalEntries(result.entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al listar carpeta local.")
    } finally {
      setLoadingLocal(false)
    }
  }, [])

  const uploadSelectedFiles = useCallback(
    async (targetRemotePath: string) => {
      if (!selectedSiteId || selectedLocalFiles.size === 0 || !sftpOk) return
      setUploading(true)
      setError(null)
      try {
        const files = [...selectedLocalFiles].map((name) => ({
          localPath: joinLocalPath(localPath, name),
          remotePath: joinRemotePath(targetRemotePath, name),
        }))
        await uploadToSftp(selectedSiteId, files)
        setSelectedLocalFiles(new Set())
        // refresh remote directory
        await loadRemote(selectedSiteId, targetRemotePath)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al subir archivos.")
      } finally {
        setUploading(false)
      }
    },
    [selectedSiteId, selectedLocalFiles, sftpOk, localPath, loadRemote],
  )

  useEffect(() => {
    if (!localFsReady) return
    void getDefaultLocalPath().then((defaultPath) => {
      void loadLocal(defaultPath)
    })
  }, [localFsReady, loadLocal])

  useEffect(() => {
    if (!selectedSiteId) return
    let cancelled = false
    void (async () => {
      const status = await fetchSftpStatus(selectedSiteId)
      if (cancelled) return
      setSftpOk(status.connected)
      if (status.connected) {
        const site = getSftpSiteById(sites, selectedSiteId)
        const initialPath = site?.defaultPath || DEFAULT_SFTP_REMOTE_PATH
        setRemotePath(initialPath)
        await loadRemote(selectedSiteId, initialPath)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entorno.id, loadRemote, selectedSiteId, sites])

  const handleConnect = useCallback(async () => {
    if (!sessionSite) return
    setConnecting(true)
    setError(null)
    try {
      if (selectedSite && sessionPort !== selectedSite.port) {
        const updated = sites.map((s) =>
          s.id === selectedSite.id ? { ...s, port: sessionPort } : s,
        )
        saveSftpSites(updated)
        setSites(updated)
      }
      saveLastSftpSiteId(entorno.id, sessionSite.id)
      saveSftpSettings({ sftpPassword, rememberSftpPassword })
      const result = await connectSftp(sessionSite, sftpPassword)
      setSftpOk(true)
      setRemotePath(result.remotePath)
      await loadRemote(sessionSite.id, result.remotePath)
    } catch (err) {
      setSftpOk(false)
      setError(err instanceof Error ? err.message : "Error SFTP.")
    } finally {
      setConnecting(false)
    }
  }, [
    entorno.id,
    loadRemote,
    rememberSftpPassword,
    selectedSite,
    sessionPort,
    sessionSite,
    sites,
    sftpPassword,
  ])

  const handleFilesDrop = useCallback(
    async (files: Array<{ name: string; fullPath: string }>) => {
      if (!selectedSiteId || !sftpOk) return
      setUploading(true)
      setError(null)
      try {
        const uploadFiles = files
          .filter((f) => f.fullPath)
          .map((f) => ({
            localPath: f.fullPath,
            remotePath: joinRemotePath(remotePath, f.name),
          }))
        if (uploadFiles.length === 0) return
        await uploadToSftp(selectedSiteId, uploadFiles)
        await loadRemote(selectedSiteId, remotePath)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al subir archivos.")
      } finally {
        setUploading(false)
      }
    },
    [selectedSiteId, sftpOk, remotePath, loadRemote],
  )

  function openRemoteDir(name: string) {
    if (!selectedSite || !sftpOk) return
    const next = joinRemotePath(remotePath, name)
    void loadRemote(selectedSite.id, next)
  }

  function navigateRemote(nextPath: string) {
    if (!selectedSite || !sftpOk) return
    void loadRemote(selectedSite.id, nextPath)
  }

  function openLocalDir(name: string) {
    const next = joinLocalPath(localPath, name)
    void loadLocal(next)
  }

  async function handleLocalFileAction(action: string, name: string) {
    const fullPath = joinLocalPath(localPath, name)
    try {
      const fs = await getLocalFs()
      if (!fs) {
        setError("Operación de archivos local no disponible en el navegador.")
        return
      }
      switch (action) {
        case "delete": {
          await fs.unlink(fullPath)
          await loadLocal(localPath)
          break
        }
        case "rename": {
          const newName = prompt("Nuevo nombre:", name)
          if (newName && newName !== name) {
            await fs.rename(fullPath, joinLocalPath(localPath, newName))
            await loadLocal(localPath)
          }
          break
        }
        default:
          break
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Error al ejecutar "${action}".`)
    }
  }

  async function handleRemoteFileAction(action: string, name: string) {
    if (!selectedSiteId || !sftpOk) return
    const fullPath = joinRemotePath(remotePath, name)
    try {
      switch (action) {
        case "download": {
          const blob = await downloadSftpFile(selectedSiteId, fullPath)
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = name
          a.click()
          URL.revokeObjectURL(url)
          break
        }
        case "delete": {
          const entry = remoteEntries.find((e) => e.name === name)
          if (entry?.type === "dir") {
            if (!confirm(`Eliminar la carpeta "${name}" y su contenido?`)) return
          }
          await deleteSftpFile(selectedSiteId, fullPath, entry?.type === "dir")
          await loadRemote(selectedSiteId, remotePath)
          break
        }
        case "rename": {
          const newName = prompt("Nuevo nombre:", name)
          if (newName && newName !== name) {
            await renameSftpFile(selectedSiteId, fullPath, joinRemotePath(remotePath, newName))
            await loadRemote(selectedSiteId, remotePath)
          }
          break
        }
        case "duplicate": {
          const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : ""
          const base = ext ? name.slice(0, name.lastIndexOf(".")) : name
          const newName2 = `${base} (copia)${ext}`
          const copyRes = await fetch('/api/sftp/copy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ siteId: selectedSiteId, src: fullPath, dest: joinRemotePath(remotePath, newName2) }),
          })
          if (!copyRes.ok) {
            const copyData = await copyRes.json()
            throw new Error(copyData.error || 'Error al duplicar')
          }
          await loadRemote(selectedSiteId, remotePath)
          break
        }
        case "move": {
          const dest = prompt("Ruta de destino:", remotePath)
          if (dest && dest !== remotePath) {
            await renameSftpFile(selectedSiteId, fullPath, `${dest.replace(/\/+$/, "")}/${name}`)
            await loadRemote(selectedSiteId, remotePath)
          }
          break
        }
        case "properties": {
          const stat = await statSftpFile(selectedSiteId, fullPath)
          const info = [
            `Nombre: ${name}`,
            `Ruta: ${fullPath}`,
            `Tamaño: ${(stat.size / 1024).toFixed(1)} KB`,
            `Modificado: ${new Date(stat.mtime * 1000).toLocaleString("es-CO")}`,
            `Tipo: ${stat.isDirectory ? "Carpeta" : "Archivo"}`,
            `Permisos: ${stat.mode.toString(8).slice(-3)}`,
          ]
          alert(info.join("\n"))
          break
        }
        case "edit:notepad":
        case "edit:code":
        case "edit:default": {
          const editor = action.replace("edit:", "")
          const blob2 = await downloadSftpFile(selectedSiteId, fullPath)
          const buf = await blob2.arrayBuffer()
          const w = window as any
          if (w.require) {
            const tmpDir = w.require("node:os").tmpdir()
            const tmpFile = w.require("node:path").join(tmpDir, name)
            w.require("node:fs").writeFileSync(tmpFile, Buffer.from(buf))
            if (editor === "code") {
              w.require("node:child_process").spawn("code", [tmpFile], { detached: true })
            } else if (editor === "notepad") {
              w.require("node:child_process").spawn("notepad", [tmpFile], { detached: true })
            } else {
              const shell = w.require("electron")?.shell
              if (shell?.openPath) shell.openPath(tmpFile)
            }
          } else {
            const url2 = URL.createObjectURL(blob2)
            const a2 = document.createElement("a")
            a2.href = url2
            a2.download = name
            a2.click()
            URL.revokeObjectURL(url2)
          }
          break
        }
        default:
          break
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Error al ejecutar "${action}".`)
    }
  }

  function navigateLocal(nextPath: string) {
    void loadLocal(nextPath)
  }

  const remoteParent = parentRemotePath(remotePath)
  const localParent = parentLocalPath(localPath)
  const siteSeedBookmarks = selectedSite?.bookmarks ?? []

  return (
    <div className="flex h-full flex-col">
      <SftpSitesDialog
        open={sitesOpen}
        onClose={() => setSitesOpen(false)}
        onSaved={refreshSites}
        instanceHost={sftpHostForEntorno(entornoRef, instance.ip)}
        instanceName={entornoRef.name}
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="text-xs text-muted-foreground">Sitio SFTP</span>
        <select
          value={selectedSiteId}
          onChange={(e) => {
            setSelectedSiteId(e.target.value)
            setSftpOk(null)
            setRemoteEntries([])
            saveLastSftpSiteId(entorno.id, e.target.value)
          }}
          className="h-8 min-w-[160px] rounded-md border border-border bg-background px-2 text-xs outline-none"
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.label} (:{site.port})
            </option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground">Servidor</span>
        <input
          readOnly
          value={displayHost}
          title={`Host WinSCP — ${entornoRef.name}`}
          className="h-8 min-w-[220px] max-w-[320px] rounded-md border border-border bg-muted/40 px-2 font-mono text-[11px] text-foreground outline-none"
        />

        <span className="text-xs text-muted-foreground">Puerto</span>
        <input
          type="number"
          min={1}
          max={65535}
          value={sessionPort}
          onChange={(e) => setSessionPort(Number(e.target.value) || 22)}
          className="h-8 w-[64px] rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary/40"
        />

        <span className="text-xs text-muted-foreground">Usuario</span>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          {selectedSite?.username ?? "root"}
        </code>

        <span className="text-xs text-muted-foreground">Contraseña</span>
        <input
          type="password"
          value={sftpPassword}
          onChange={(e) => setSftpPassword(e.target.value)}
          placeholder="Contraseña SSH"
          className="h-8 w-[140px] rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary/40"
          autoComplete="off"
        />
        <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={rememberSftpPassword}
            onChange={(e) => setRememberSftpPassword(e.target.checked)}
            className="size-3 rounded border-border"
          />
          Recordar
        </label>

        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            sftpOk === true && "bg-success/15 text-success",
            sftpOk === false && "bg-destructive/15 text-destructive",
            sftpOk === null && "bg-muted text-muted-foreground",
          )}
        >
          {sftpOk === true ? "SFTP OK" : sftpOk === false ? "SFTP error" : "SFTP…"}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleConnect()}
            disabled={connecting || !selectedSite}
          >
            {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
            Conectar al servidor
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!sftpOk || loadingRemote}
            onClick={() => selectedSite && void loadRemote(selectedSite.id, remotePath)}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSitesOpen(true)}>
            <Settings2 className="size-3.5" />
            Sitios
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!sftpOk || uploading}
            onClick={() => setAutoTransferOpen((o) => !o)}
            title="Transferencia automática"
          >
            <ListRestart className="size-3.5" />
          </Button>
          <Button variant="outline" size="sm" disabled={!sftpOk || loadingRemote}
            onClick={async () => {
              if (!selectedSiteId || !sftpOk) return
              const filesToDownload = remoteEntries.filter((e) => e.type === "file")
              if (filesToDownload.length === 0) {
                setError("No hay archivos para descargar en el directorio actual.")
                return
              }
              for (const entry of filesToDownload) {
                try {
                  const fullPath = joinRemotePath(remotePath, entry.name)
                  const blob = await downloadSftpFile(selectedSiteId, fullPath)
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = entry.name
                  a.click()
                  URL.revokeObjectURL(url)
                } catch (err) {
                  setError(err instanceof Error ? err.message : `Error al descargar ${entry.name}`)
                  break
                }
              }
            }}
          >
            <Download /> Descargar
          </Button>
          <Button
            size="sm"
            disabled={!sftpOk || selectedLocalFiles.size === 0 || uploading}
            onClick={() => void uploadSelectedFiles(remotePath)}
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {uploading ? "Subiendo…" : `Subir (${selectedLocalFiles.size})`}
          </Button>
        </div>
      </div>

      {error ? (
        <pre className="shrink-0 whitespace-pre-wrap border-b border-border bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
          {error}
        </pre>
      ) : null}

      {autoTransferOpen ? (
        <AutoTransferPanel
          siteId={selectedSiteId || ""}
          sftpOk={sftpOk === true}
          onTransferComplete={() => {
            if (selectedSiteId) void loadRemote(selectedSiteId, remotePath)
          }}
        />
      ) : null}

      <div className="flex flex-1 divide-x divide-border overflow-hidden">
        <FileBrowser
          title="Local"
          icon={<HardDrive className="size-4 text-muted-foreground" />}
          path={localPath || "—"}
          entries={localEntries}
          parentPath={localParent}
          loading={loadingLocal}
          disabled={!localFsReady}
          emptyMessage={
            localFsReady
              ? "Carpeta vacía."
              : "El panel local requiere la app de escritorio. Cierra y vuelve a abrir con npm run desktop."
          }
          bookmarks={localBookmarks}
          bookmarkSaved={localPath ? isBookmarked(localBookmarks, localPath) : false}
          onSaveBookmark={() => {
            if (!localPath) return
            setLocalBookmarks(addLocalBookmark(localPath))
          }}
          onRemoveBookmark={(bookmarkPath) => {
            setLocalBookmarks(removeLocalBookmark(bookmarkPath))
          }}
          onNavigate={(nextPath) => {
            setSelectedLocalFiles(new Set())
            navigateLocal(nextPath)
          }}
          onOpenDir={(name) => {
            setSelectedLocalFiles(new Set())
            openLocalDir(name)
          }}
          onRefresh={() => {
            setSelectedLocalFiles(new Set())
            localPath && void loadLocal(localPath)
          }}
          showPickFolder={localFsReady}
          selectable={sftpOk === true}
          selectedNames={selectedLocalFiles}
          onSelectionChange={setSelectedLocalFiles}
          dragEnabled={sftpOk === true}
          getDragFullPath={(name) => joinLocalPath(localPath, name)}
          onOpenFile={(name) => {
            const fullPath = joinLocalPath(localPath, name)
            const { shell } = window as any
            if (shell?.openPath) shell.openPath(fullPath)
          }}
          onFileAction={(action, name) => void handleLocalFileAction(action, name)}
        />
        <FileBrowser
          title="Servidor"
          icon={<Server className="size-4 text-muted-foreground" />}
          path={remotePath}
          entries={remoteEntries}
          parentPath={remoteParent}
          loading={loadingRemote}
          disabled={!sftpOk}
          emptyMessage={sftpOk ? "Carpeta vacía." : "Conecta SFTP para ver archivos."}
          bookmarks={remoteBookmarks}
          bookmarkSaved={remotePath ? isBookmarked(remoteBookmarks, remotePath) : false}
          onSaveBookmark={() => {
            if (!selectedSiteId || !remotePath) return
            setRemoteBookmarks(addRemoteBookmark(selectedSiteId, remotePath, siteSeedBookmarks))
          }}
          onRemoveBookmark={(bookmarkPath) => {
            if (!selectedSiteId) return
            setRemoteBookmarks(removeRemoteBookmark(selectedSiteId, bookmarkPath, siteSeedBookmarks))
          }}
          onNavigate={navigateRemote}
          onOpenDir={openRemoteDir}
          onRefresh={() => selectedSite && void loadRemote(selectedSite.id, remotePath)}
          dropEnabled={sftpOk === true}
          onFilesDrop={handleFilesDrop}
          isRemote
          onOpenFile={(name) => {
            if (selectedSiteId && sftpOk) {
              const fullPath = joinRemotePath(remotePath, name)
              void downloadSftpFile(selectedSiteId, fullPath).then((blob) => {
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = name
                a.click()
                URL.revokeObjectURL(url)
              })
            }
          }}
          onFileAction={(action, name) => void handleRemoteFileAction(action, name)}
        />
      </div>
    </div>
  )
}
