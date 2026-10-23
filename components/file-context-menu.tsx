"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
  Download,
  Trash2,
  Edit3,
  FileText,
  Info,
  ArrowRight,
  Clipboard,
  File,
} from "lucide-react"

export type FileMenuEntry = {
  name: string
  type: "dir" | "file"
  path: string
  fullPath: string
  size: string
  modified: string
}

type MenuItem = {
  label: string
  shortcut?: string
  icon?: React.ReactNode
  action?: () => void
  submenu?: MenuItem[]
  divider?: boolean
  disabled?: boolean
}

export function FileContextMenu({
  file,
  x,
  y,
  isRemote,
  onClose,
  onOpen,
  onDownload,
  onDelete,
  onRename,
  onDuplicate,
  onMove,
  onCopyName,
  onCopyPath,
  onProperties,
  onEdit,
}: {
  file: FileMenuEntry
  x: number
  y: number
  isRemote: boolean
  onClose: () => void
  onOpen?: () => void
  onDownload?: () => void
  onDelete?: () => void
  onRename?: () => void
  onDuplicate?: () => void
  onMove?: () => void
  onCopyName?: () => void
  onCopyPath?: () => void
  onProperties?: () => void
  onEdit?: (editor: string) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 220)
  const adjustedY = Math.min(y, window.innerHeight - 400)

  const items: MenuItem[] = [
    {
      label: "Abrir",
      icon: <FileText className="size-3.5" />,
      ...(isRemote
        ? {
            submenu: [
              { label: "Descargar y abrir", action: onOpen },
              { label: "Bloc de notas", action: () => onEdit?.("notepad") },
              { label: "VS Code", action: () => onEdit?.("code") },
              { label: "Editor predeterminado", action: () => onEdit?.("default") },
            ],
          }
        : { action: onOpen }),
    },
    {
      label: "Descargar",
      shortcut: "F5",
      icon: <Download className="size-3.5" />,
      action: isRemote ? onDownload : undefined,
      disabled: !isRemote,
    },
    {
      label: "Duplicar",
      shortcut: "Shift+F5",
      icon: <File className="size-3.5" />,
      action: onDuplicate,
    },
    {
      label: "Mover a",
      shortcut: "Shift+F6",
      icon: <ArrowRight className="size-3.5" />,
      action: onMove,
    },
    {
      label: "Renombrar",
      shortcut: "F2",
      icon: <Edit3 className="size-3.5" />,
      action: onRename,
    },
    {
      label: "Eliminar",
      shortcut: "F8",
      icon: <Trash2 className="size-3.5" />,
      action: onDelete,
    },
    { divider: true, label: "" },
    {
      label: "Copiar al portapapeles",
      shortcut: "Ctrl+C",
      icon: <Clipboard className="size-3.5" />,
      submenu: [
        { label: "Nombre del archivo", action: () => onCopyName?.() },
        { label: "Ruta completa", action: () => onCopyPath?.() },
      ],
    },
    {
      label: "Nombres de archivos",
      icon: <File className="size-3.5" />,
      submenu: [
        { label: "Copiar nombre", action: () => onCopyName?.() },
        { label: "Copiar ruta", action: () => onCopyPath?.() },
      ],
    },
    {
      label: "Propiedades",
      shortcut: "F9",
      icon: <Info className="size-3.5" />,
      action: onProperties,
    },
  ]

  function renderItem(item: MenuItem, idx: number) {
    if (item.divider) {
      return <div key={`div-${idx}`} className="my-1 border-t border-border" />
    }

    const hasSubmenu = !!item.submenu?.length
    const isActive = activeSubmenu === item.label

    return (
      <div key={item.label} className="relative">
        <button
          type="button"
          disabled={item.disabled}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "disabled:opacity-40 disabled:pointer-events-none",
            isActive && "bg-accent",
          )}
          onClick={() => {
            if (hasSubmenu) {
              setActiveSubmenu(isActive ? null : item.label)
            } else {
              item.action?.()
              onClose()
            }
          }}
          onMouseEnter={(e) => {
            if (hasSubmenu) {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setSubmenuPos({ x: rect.right, y: rect.top })
              setActiveSubmenu(item.label)
            }
          }}
        >
          {item.icon && <span className="shrink-0 text-muted-foreground">{item.icon}</span>}
          <span className="flex-1 truncate">{item.label}</span>
          {item.shortcut && (
            <span className="shrink-0 text-[9px] text-muted-foreground">{item.shortcut}</span>
          )}
          {hasSubmenu && <ArrowRight className="size-3 shrink-0 text-muted-foreground" />}
        </button>

        {hasSubmenu && isActive && item.submenu && (
          <div
            className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg"
            style={{ left: submenuPos.x, top: submenuPos.y }}
          >
            {item.submenu.map((sub, si) => (
              <button
                key={sub.label}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  sub.action?.()
                  onClose()
                }}
              >
                <span className="flex-1 truncate">{sub.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-xl"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="mb-1 border-b border-border px-2 pb-1.5 pt-1">
        <span className="block truncate text-[10px] font-medium text-foreground">{file.name}</span>
        <span className="text-[9px] text-muted-foreground">
          {file.type === "dir" ? "Carpeta" : file.size} · {file.modified}
        </span>
      </div>
      {items.map((item, i) => renderItem(item, i))}
    </div>
  )
}
