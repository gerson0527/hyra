'use client'

import { useEffect, useState } from 'react'
import { slugify } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ModalOverlay } from '@/components/modal-overlay'
import {
  DEFAULT_SSH_PRESETS,
  KNOWN_DOCKER_CONTAINERS,
  loadSshPresets,
  resetSshPresets,
  saveSshPresets,
  type SshPreset,
} from '@/lib/ssh-presets'

export function SshPresetsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const [presets, setPresets] = useState<SshPreset[]>(DEFAULT_SSH_PRESETS)
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (open) {
      const loaded = loadSshPresets()
      setPresets(loaded)
      setSelectedIndex(0)
    }
  }, [open])

  const current = presets[selectedIndex]

  function updateCurrent(patch: Partial<SshPreset>) {
    setPresets((prev) =>
      prev.map((item, index) => (index === selectedIndex ? { ...item, ...patch } : item)),
    )
  }

  function deleteCurrent() {
    if (presets.length <= 1) return
    const next = presets.filter((_, i) => i !== selectedIndex)
    const nextIndex = Math.min(selectedIndex, next.length - 1)
    setPresets(next)
    setSelectedIndex(nextIndex)
    saveSshPresets(next)
    onSaved?.()
  }

  return (
    <ModalOverlay open={open} onClose={onClose} className="max-w-3xl">
      <div className="flex max-h-[92vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Personalizar comandos SSH</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada preset abre una pestaña del contenedor y ejecuta con{' '}
            <code className="text-[11px]">sudo -i docker exec</code>. Un comando por línea (sin
            docker exec; se aplica automáticamente). Vacío en contenedor = ejecutar en el host.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-5 md:grid-cols-[220px_1fr]">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
              {presets.map((preset, index) => (
                <button
                  key={`${preset.id}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${
                    index === selectedIndex ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="shrink-0 space-y-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setPresets((prev) => {
                      const next = [
                        ...prev,
                        { id: slugify('Nuevo preset') || 'nuevo-preset', label: 'Nuevo preset', container: '', commands: [''] },
                      ]
                      setSelectedIndex(next.length - 1)
                      return next
                    })
                  }}
                >
                  Nuevo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={presets.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteCurrent()
                  }}
                >
                  Eliminar
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const defaults = resetSshPresets()
                  setPresets(defaults)
                  setSelectedIndex(0)
                }}
              >
                Restaurar defaults
              </Button>
            </div>
          </div>

          {current ? (
            <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Nombre del botón</span>
                <input
                  value={current.label}
                  onChange={(e) =>
                    updateCurrent({ label: e.target.value, id: slugify(e.target.value) || 'preset' })
                  }
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Contenedor Docker (opcional)</span>
                <input
                  list="hyra-docker-containers"
                  value={current.container}
                  onChange={(e) => updateCurrent({ container: e.target.value })}
                  placeholder="ej. erpunidrogas — vacío = host"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
                />
                <datalist id="hyra-docker-containers">
                  {KNOWN_DOCKER_CONTAINERS.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Comandos (uno por línea)</span>
                <textarea
                  value={current.commands.join('\n')}
                  onChange={(e) =>
                    updateCurrent({
                      commands: e.target.value.split('\n').map((line) => line.trimEnd()),
                    })
                  }
                  rows={10}
                  className="w-full min-h-[200px] rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              saveSshPresets(presets)
              onSaved?.()
              onClose()
            }}
          >
            Guardar presets
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
