'use client'

import { useEffect, useState } from 'react'
import { slugify } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ModalOverlay } from '@/components/modal-overlay'
import {
  DEFAULT_SFTP_SITES,
  loadSftpSites,
  normalizeSftpSite,
  resetSftpSites,
  saveSftpSites,
  type SftpSite,
} from '@/lib/sftp-sites'

export function SftpSitesDialog({
  open,
  onClose,
  onSaved,
  instanceHost = '',
  instanceName = '',
}: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  instanceHost?: string
  instanceName?: string
}) {
  const [sites, setSites] = useState<SftpSite[]>(DEFAULT_SFTP_SITES)
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (open) {
      setSites(loadSftpSites())
      setSelectedIndex(0)
    }
  }, [open])

  const current = sites[selectedIndex]

  function updateCurrent(patch: Partial<SftpSite>) {
    setSites((prev) =>
      prev.map((item, index) =>
        index === selectedIndex ? normalizeSftpSite({ ...item, ...patch }) : item,
      ),
    )
  }

  function deleteCurrent() {
    if (sites.length <= 1) return
    const next = sites.filter((_, i) => i !== selectedIndex)
    const nextIndex = Math.min(selectedIndex, next.length - 1)
    setSites(next)
    setSelectedIndex(nextIndex)
    saveSftpSites(next)
    onSaved?.()
  }

  return (
    <ModalOverlay open={open} onClose={onClose} className="max-w-3xl">
      <div className="flex max-h-[92vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Sitios SFTP</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Como WinSCP: cada sitio guarda puerto, usuario y carpeta. Host vacío usa el dominio de
            la instancia
            {instanceHost ? (
              <>
                {' '}
                (<span className="font-mono">{instanceHost}</span>
                {instanceName ? ` ← ${instanceName}` : ''})
              </>
            ) : (
              ' (*.tiresia.info)'
            )}
            .
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-5 md:grid-cols-[220px_1fr]">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
              {sites.map((site, index) => (
                <button
                  key={`${site.id}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${
                    index === selectedIndex ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <span className="block truncate font-medium">{site.label}</span>
                  <span className="text-[10px] text-muted-foreground">:{site.port}</span>
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
                    setSites((prev) => {
                      const next = [
                        ...prev,
                        normalizeSftpSite({
                          id: slugify(`sitio_${prev.length + 1}`) || 'sitio',
                          label: `Sitio ${prev.length + 1}`,
                          host: '',
                          port: 22,
                          username: 'root',
                          defaultPath: '/root',
                          bookmarks: [],
                        }),
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
                  disabled={sites.length <= 1}
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
                  const defaults = resetSftpSites()
                  setSites(defaults)
                  setSelectedIndex(0)
                }}
              >
                Restaurar defaults
              </Button>
            </div>
          </div>

          {current ? (
            <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Nombre</span>
                <input
                  value={current.label}
                  onChange={(e) => updateCurrent({ label: e.target.value })}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  Host (vacío = dominio instancia, WinSCP)
                </span>
                <input
                  value={current.host}
                  onChange={(e) => updateCurrent({ host: e.target.value })}
                  placeholder={instanceHost || 'unimaiapost1080dev.tiresia.info'}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
                />
                {!current.host.trim() && instanceHost ? (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Se usará: {instanceHost}
                  </p>
                ) : null}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Puerto</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={current.port}
                    onChange={(e) => updateCurrent({ port: Number(e.target.value) })}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Usuario</span>
                  <input
                    value={current.username}
                    onChange={(e) => updateCurrent({ username: e.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Carpeta inicial remota</span>
                <input
                  value={current.defaultPath}
                  onChange={(e) => updateCurrent({ defaultPath: e.target.value })}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus-visible:border-ring"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Marcadores (uno por línea)</span>
                <textarea
                  value={current.bookmarks.join('\n')}
                  onChange={(e) =>
                    updateCurrent({
                      bookmarks: e.target.value.split('\n').map((line) => line.trimEnd()),
                    })
                  }
                  rows={6}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring"
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
              saveSftpSites(sites)
              onSaved?.()
              onClose()
            }}
          >
            Guardar sitios
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
