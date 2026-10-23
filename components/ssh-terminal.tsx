"use client"

import { useEffect, useRef, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import {
  closeSshShell,
  connectSshShellStream,
  disposeShellInputBuffer,
  flushSshShellInput,
  onShellInputFailure,
  openSshShell,
  resizeSshShell,
  sendSshShellInput,
} from "@/lib/ssh-shell-api"
import { cn } from "@/lib/utils"
import { completionContext, applyTabCompletion } from "@/lib/ssh-completion"

const TERM_THEME = {
  background: "#010409",
  foreground: "#c9d1d9",
  cursor: "#58a6ff",
  selectionBackground: "#264f78",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

async function pasteFromClipboard(term: Terminal) {
  try {
    const text = await navigator.clipboard.readText()
    if (text) term.paste(text)
  } catch {
    /* sin permiso de lectura del portapapeles */
  }
}

/**
 * Copiar/pegar estilo Windows Terminal:
 * - Ctrl+C con texto seleccionado copia (sin seleccion envia ^C).
 * - Ctrl+Shift+C copia; Ctrl+V / Ctrl+Shift+V pega.
 * Devuelve true si el evento fue manejado (xterm no debe procesarlo).
 */
function handleClipboardKey(term: Terminal, event: KeyboardEvent): boolean {
  if (event.type !== 'keydown') return false
  const key = event.key.toLowerCase()
  const mod = event.ctrlKey || event.metaKey
  if (!mod) return false

  if (key === 'c' && (event.shiftKey || term.hasSelection())) {
    if (term.hasSelection()) {
      event.preventDefault()
      void copyToClipboard(term.getSelection())
      term.clearSelection()
    }
    return true
  }

  if (key === 'v') {
    event.preventDefault()
    void pasteFromClipboard(term)
    return true
  }

  return false
}

/** Clic derecho: copia si hay seleccion, si no pega. */
function attachContextMenuClipboard(term: Terminal, container: HTMLElement) {
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault()
    if (term.hasSelection()) {
      void copyToClipboard(term.getSelection())
      term.clearSelection()
    } else {
      void pasteFromClipboard(term)
    }
  }
  container.addEventListener('contextmenu', onContextMenu)
  return () => container.removeEventListener('contextmenu', onContextMenu)
}

type PtyTerminalProps = {
  active: boolean
  enabled: boolean
  shellId: string
  container?: string | null
  useSudo?: boolean
  className?: string
  onStatus?: (message: string) => void
  pendingCommands?: string[]
  onCommandsSent?: () => void
}

export function PtyTerminal({
  active,
  enabled,
  shellId,
  container,
  useSudo,
  className,
  onStatus,
  pendingCommands,
  onCommandsSent,
}: PtyTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const startedRef = useRef(false)
  const shellAliveRef = useRef(false)
  const reconnectingRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const disposedRef = useRef(false)
  const disconnectStreamRef = useRef<(() => void) | null>(null)
  const requestReconnectRef = useRef<(() => Promise<void>) | null>(null)
  const activeRef = useRef(active)
  const enabledRef = useRef(enabled)
  const onStatusRef = useRef(onStatus)
  const onCommandsSentRef = useRef(onCommandsSent)
  const shellIdRef = useRef(shellId)
  const containerRef2 = useRef(container)
  const useSudoRef = useRef(useSudo)
  const markShellDeadRef = useRef<() => void>(() => {})
  const pendingCommandsRef = useRef(pendingCommands)
  const [status, setStatus] = useState("")

  const MAX_RECONNECT_ATTEMPTS = 3
  const RECONNECT_COOLDOWN_MS = 5000

  activeRef.current = active
  enabledRef.current = enabled
  onStatusRef.current = (msg) => {
    setStatus(msg)
    onStatus?.(msg)
  }
  onCommandsSentRef.current = onCommandsSent
  shellIdRef.current = shellId
  containerRef2.current = container
  useSudoRef.current = useSudo
  pendingCommandsRef.current = pendingCommands

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Consolas, 'Cascadia Mono', 'Courier New', monospace",
      lineHeight: 1.25,
      theme: TERM_THEME,
      scrollback: 5000,
      convertEol: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    termRef.current = term
    fitRef.current = fit

    const resizeObserver = new ResizeObserver(() => {
      if (!activeRef.current) return
      fit.fit()
      const cols = term.cols
      const rows = term.rows
      if (startedRef.current) void resizeSshShell(shellIdRef.current, cols, rows)
    })
    resizeObserver.observe(container)

    const onKey = term.onData((data) => {
      if (reconnectingRef.current) return

      if (!shellAliveRef.current) {
        if (data === "\r" || data === "\n") {
          reconnectAttemptsRef.current = 0
          void requestReconnectRef.current?.()
        }
        return
      }

      if (!startedRef.current) return
      sendSshShellInput(shellIdRef.current, data)
    })

    term.attachCustomKeyEventHandler((event) => {
      if (handleClipboardKey(term, event)) return false
      if (event.key === 'Tab') {
        event.preventDefault()
      }
      return true
    })
    const detachContextMenu = attachContextMenuClipboard(term, container)

    return () => {
      detachContextMenu()
      resizeObserver.disconnect()
      onKey.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      startedRef.current = false
      shellAliveRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit) return

    let disposed = false
    disposedRef.current = false
    reconnectAttemptsRef.current = 0

    const attachStream = () => {
      disconnectStreamRef.current?.()
      disconnectStreamRef.current = connectSshShellStream(shellId, {
        onData: (data) => {
          term.write(data)
        },
        onError: (message) => {
          if (disposed) return
          term.writeln(`\r\n\x1b[33m[SSH] ${message}\x1b[0m`)
          markShellDead()
        },
        onClose: () => {
          if (disposed) return
          markShellDead()
          void requestReconnect()
        },
      })
    }

    const markShellDead = () => {
      shellAliveRef.current = false
      startedRef.current = false
    }
    markShellDeadRef.current = markShellDead

    let lastOpenRetryable = false

    const openShellSession = async (): Promise<boolean> => {
      if (shellAliveRef.current && startedRef.current) {
        if (activeRef.current) attachStream()
        return true
      }
      fit.fit()
      const cols = term.cols
      const rows = term.rows

      onStatusRef.current?.("Conectando shell…")
      const opened = await openSshShell(cols, rows, {
        shellId,
        container: containerRef2.current,
        useSudo: useSudoRef.current,
      })
      if (disposed) return false
      if (!opened.ok) {
        term.writeln(`\r\n\x1b[31m[SSH] ${opened.error || "No se pudo abrir terminal interactiva."}\x1b[0m`)
        lastOpenRetryable = Boolean(opened.retryable)
        if (!lastOpenRetryable) term.writeln("\x1b[33mPulsa Enter para reintentar.\x1b[0m")
        onStatusRef.current?.("")
        markShellDead()
        if (lastOpenRetryable && !reconnectingRef.current && !disposed) void requestReconnect()
        return false
      }
      lastOpenRetryable = false

      startedRef.current = true
      shellAliveRef.current = true
      term.focus()
      onStatusRef.current?.("")
      if (activeRef.current) attachStream()
      const cmds = pendingCommandsRef.current
      if (cmds?.length) {
        for (const c of cmds) {
          term.writeln(`$ ${c}`)
          sendSshShellInput(shellIdRef.current, `${c}\n`)
        }
        onCommandsSentRef.current?.()
      }
      return true
    }

    const requestReconnect = async () => {
      if (disposed || reconnectingRef.current) return
      reconnectAttemptsRef.current++
      const attempt = reconnectAttemptsRef.current
      if (attempt > MAX_RECONNECT_ATTEMPTS) {
        term.writeln(`\r\n\x1b[31m[SSH] No se pudo reconectar tras ${MAX_RECONNECT_ATTEMPTS} intentos.\x1b[0m`)
        term.writeln("\x1b[33mPulsa Enter para reintentar.\x1b[0m")
        markShellDead()
        return
      }
      reconnectingRef.current = true
      markShellDead()
      disconnectStreamRef.current?.()
      disconnectStreamRef.current = null

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
      term.writeln(`\r\n\x1b[33m[SSH] Sesión interrumpida. Reconectando en ${delay / 1000}s (intento ${attempt}/${MAX_RECONNECT_ATTEMPTS})…\x1b[0m`)
      await closeSshShell(shellId)
      if (disposed) {
        reconnectingRef.current = false
        return
      }

      await new Promise<void>((resolve) => setTimeout(resolve, delay))
      if (disposed) {
        reconnectingRef.current = false
        return
      }

      const ok = await openShellSession()
      reconnectingRef.current = false
      if (ok) {
        setTimeout(() => {
          if (shellAliveRef.current) {
            reconnectAttemptsRef.current = 0
          }
        }, RECONNECT_COOLDOWN_MS)
      } else if (!disposed) {
        if (lastOpenRetryable) void requestReconnect()
        else term.writeln("\x1b[33mPulsa Enter para reintentar.\x1b[0m")
      }
    }

    requestReconnectRef.current = requestReconnect

    const unregisterFailure = onShellInputFailure(shellId, () => {
      if (disposed || reconnectingRef.current) return
      markShellDead()
      void requestReconnect()
    })

    void openShellSession()

    return () => {
      disposed = true
      disposedRef.current = true
      requestReconnectRef.current = null
      unregisterFailure()
      disconnectStreamRef.current?.()
      disconnectStreamRef.current = null
      if (startedRef.current || shellAliveRef.current) {
        startedRef.current = false
        shellAliveRef.current = false
        void flushSshShellInput(shellId).then(() => closeSshShell(shellId))
      } else {
        disposeShellInputBuffer(shellId)
      }
    }
  }, [enabled, shellId, container, useSudo])

  useEffect(() => {
    if (!enabled || !pendingCommands?.length) return
    const term = termRef.current
    if (!term) return
    if (!shellAliveRef.current || !startedRef.current) return
    for (const c of pendingCommands) {
      term.writeln(`$ ${c}`)
      sendSshShellInput(shellIdRef.current, `${c}\n`)
    }
    onCommandsSentRef.current?.()
  }, [enabled, pendingCommands, shellId])

  useEffect(() => {
    if (!active || !enabled || !termRef.current) return

    if (shellAliveRef.current && startedRef.current) {
      disconnectStreamRef.current?.()
      disconnectStreamRef.current = connectSshShellStream(shellId, {
        onData: (data) => { termRef.current?.write(data) },
        onError: (message) => {
          if (disposedRef.current) return
          termRef.current?.writeln(`\r\n\x1b[33m[SSH] ${message}\x1b[0m`)
          markShellDeadRef.current()
          void requestReconnectRef.current?.()
        },
        onClose: () => {
          if (disposedRef.current) return
          markShellDeadRef.current()
          void requestReconnectRef.current?.()
        },
      })
    }

    return () => {
      disconnectStreamRef.current?.()
      disconnectStreamRef.current = null
    }
  }, [active, enabled, shellId])

  useEffect(() => {
    if (active && enabled) {
      termRef.current?.focus()
      fitRef.current?.fit()
    }
  }, [active, enabled])

  return (
    <div className="relative h-full w-full" onClick={() => termRef.current?.focus()}>
      <div ref={containerRef} className={cn("h-full w-full min-h-0 p-1", className)} />
      {status && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#010409]/80">
          <div className="flex flex-col items-center gap-3">
            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs text-muted-foreground">{status}</span>
          </div>
        </div>
      )}
    </div>
  )
}

type ExecTerminalProps = {
  active: boolean
  lines: string[]
  busy: boolean
  prompt: string
  disabled?: boolean
  onCommand: (command: string) => void
  onTabComplete?: (prefix: string) => Promise<string[]>
  className?: string
}

export function ExecTerminal({
  active,
  lines,
  busy,
  prompt,
  disabled,
  onCommand,
  onTabComplete,
  className,
}: ExecTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const bufferRef = useRef("")
  const renderedLinesRef = useRef(0)
  const busyRef = useRef(busy)
  const disabledRef = useRef(disabled)
  const promptRef = useRef(prompt)
  const onCommandRef = useRef(onCommand)
  const onTabCompleteRef = useRef(onTabComplete)
  const completingRef = useRef(false)
  const awaitingPromptRef = useRef(true)
  const inputActiveRef = useRef(false)
  const prevLinesLengthRef = useRef(0)

  busyRef.current = busy
  disabledRef.current = disabled
  promptRef.current = prompt
  onCommandRef.current = onCommand
  onTabCompleteRef.current = onTabComplete

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Consolas, 'Cascadia Mono', 'Courier New', monospace",
      lineHeight: 1.25,
      theme: TERM_THEME,
      scrollback: 5000,
      convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    termRef.current = term
    fitRef.current = fit
    renderedLinesRef.current = 0

    const fitTerminal = () => fit.fit()
    fitTerminal()
    const resizeObserver = new ResizeObserver(fitTerminal)
    resizeObserver.observe(container)

    const onKey = term.onData((data) => {
      if (disabledRef.current || busyRef.current || completingRef.current) return

      if (data === '\t') {
        void runTabComplete(term)
        return
      }

      if (data === "\r") {
        const cmd = bufferRef.current
        bufferRef.current = ""
        inputActiveRef.current = false
        awaitingPromptRef.current = true
        term.write("\r\n")
        if (cmd.trim()) onCommandRef.current(cmd)
        else showPrompt(term)
        return
      }

      if (data === "\u007f") {
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1)
          term.write("\b \b")
        }
        return
      }

      if (data === "\u0003") {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection())
          term.clearSelection()
          return
        }
        bufferRef.current = ""
        inputActiveRef.current = false
        awaitingPromptRef.current = true
        term.write("^C\r\n")
        showPrompt(term)
        return
      }

      if (data < " " && data !== "\t") return

      if (!inputActiveRef.current) {
        inputActiveRef.current = true
        awaitingPromptRef.current = false
      }

      bufferRef.current += data
      term.write(data)
    })

    function showPrompt(term: Terminal) {
      if (awaitingPromptRef.current) {
        writePrompt(term, promptRef.current)
        awaitingPromptRef.current = false
        inputActiveRef.current = true
      }
    }

    term.attachCustomKeyEventHandler((event) => {
      if (handleClipboardKey(term, event)) return false
      if (event.key === 'Tab') {
        event.preventDefault()
      }
      return true
    })
    const detachContextMenu = attachContextMenuClipboard(term, container)

    async function runTabComplete(term: Terminal) {
      const complete = onTabCompleteRef.current
      if (!complete) return

      const { prefix } = completionContext(bufferRef.current)
      if (!prefix && !bufferRef.current.trim()) return

      completingRef.current = true
      try {
        const matches = await complete(prefix)
        const { prefix: p, start } = completionContext(bufferRef.current)
        const result = applyTabCompletion(bufferRef.current, start, p, matches)

        if (result.list) {
          term.write(`\r\n${result.list}\r\n`)
          awaitingPromptRef.current = true
          showPrompt(term)
          if (bufferRef.current) term.write(bufferRef.current)
        } else if (result.buffer !== bufferRef.current) {
          const added = result.buffer.slice(bufferRef.current.length)
          bufferRef.current = result.buffer
          term.write(added)
        }
      } finally {
        completingRef.current = false
      }
    }

    return () => {
      detachContextMenu()
      resizeObserver.disconnect()
      onKey.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      bufferRef.current = ""
      renderedLinesRef.current = 0
    }
  }, [])

  useEffect(() => {
    const term = termRef.current
    if (!term) return

    if (lines.length === 0 && prevLinesLengthRef.current > 0) {
      term.clear()
      renderedLinesRef.current = 0
      bufferRef.current = ""
      inputActiveRef.current = false
      awaitingPromptRef.current = true
      prevLinesLengthRef.current = 0

      if (!busy && active) {
        writePrompt(term, prompt)
        awaitingPromptRef.current = false
        inputActiveRef.current = true
      }
      return
    }

    if (lines.length === 1 && lines[0] === "__CLEAR__") {
      term.clear()
      renderedLinesRef.current = 0
      bufferRef.current = ""
      inputActiveRef.current = false
      awaitingPromptRef.current = true

      if (!busy && active) {
        writePrompt(term, prompt)
        awaitingPromptRef.current = false
        inputActiveRef.current = true
      }
      return
    }

    const from = renderedLinesRef.current
    if (from >= lines.length) {
      if (!busy && active && awaitingPromptRef.current && !inputActiveRef.current) {
        writePrompt(term, prompt)
        awaitingPromptRef.current = false
        inputActiveRef.current = true
      }
      return
    }

    let wroteOutput = false
    for (let i = from; i < lines.length; i += 1) {
      const line = lines[i]
      if (line === "__CLEAR__") {
        term.clear()
        renderedLinesRef.current = 0
        bufferRef.current = ""
        inputActiveRef.current = false
        awaitingPromptRef.current = true
        wroteOutput = true
        break
      }
      term.writeln(sanitizeExecLine(line))
      wroteOutput = true
    }
    renderedLinesRef.current = lines.length

    if (wroteOutput) {
      inputActiveRef.current = false
      awaitingPromptRef.current = !busy
    }

    if (!busy && active && awaitingPromptRef.current && !inputActiveRef.current) {
      writePrompt(term, prompt)
      awaitingPromptRef.current = false
      inputActiveRef.current = true
    }

    prevLinesLengthRef.current = lines.length
  }, [active, busy, lines, prompt])

  useEffect(() => {
    if (active) {
      termRef.current?.focus()
      fitRef.current?.fit()
    }
  }, [active])

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full min-h-0 p-1", className)}
      onClick={() => termRef.current?.focus()}
    />
  )
}

function writePrompt(term: Terminal, prompt: string) {
  term.write(`\x1b[36m${prompt}\x1b[0m `)
}

function sanitizeExecLine(line: string): string {
  return line.replace(/\r/g, "")
}
