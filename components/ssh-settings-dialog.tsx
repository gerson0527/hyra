'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ModalOverlay } from '@/components/modal-overlay'
import {
  DEFAULT_SSH_SETTINGS,
  DEFAULT_SSH_KEY_PATH,
  clearInstanceSshSettings,
  hasInstanceSshSettings,
  loadSshSettings,
  saveSshSettings,
  type SshSettings,
  type SshSettingsScope,
} from '@/lib/ssh-settings'

export function SshSettingsDialog({
  open,
  host,
  instanceKey,
  onClose,
  onSaved,
}: {
  open: boolean
  host?: string
  /** Nombre de la instancia; si se indica, la configuración puede guardarse solo para ella. */
  instanceKey?: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [settings, setSettings] = useState<SshSettings>(DEFAULT_SSH_SETTINGS)
  const [scope, setScope] = useState<SshSettingsScope>('instance')
  const [hasOwn, setHasOwn] = useState(false)

  useEffect(() => {
    if (!open) return
    setSettings(loadSshSettings(instanceKey ?? null))
    const own = instanceKey ? hasInstanceSshSettings(instanceKey) : false
    setHasOwn(own)
    setScope(instanceKey ? 'instance' : 'global')
  }, [open, instanceKey])

  if (!open) return null

  return (
    <ModalOverlay open={open} onClose={onClose} className="max-w-md">
      <form
        className="rounded-xl border border-border bg-card p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault()
          saveSshSettings(settings, scope, instanceKey ?? null)
          onSaved?.()
          onClose()
        }}
      >
        <h3 className="text-base font-semibold">Configuración SSH</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {host
            ? `Servidor: ${host} — usuario + llave .ppk/.pem o contraseña (como PuTTY).`
            : 'Credenciales usadas al conectar a cada instancia (puerto 22).'}
        </p>

        {instanceKey ? (
          <div className="mt-3 space-y-1.5 rounded-md border border-border bg-background/60 p-2.5">
            <label className="flex items-start gap-2 text-xs">
              <input
                type="radio"
                name="ssh-scope"
                className="mt-0.5"
                checked={scope === 'instance'}
                onChange={() => setScope('instance')}
              />
              <span>
                <span className="font-medium text-foreground">Solo para {instanceKey}</span>
                <span className="block text-[11px] text-muted-foreground">
                  Se recuerda para esta instancia y no afecta a las demás.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="radio"
                name="ssh-scope"
                className="mt-0.5"
                checked={scope === 'global'}
                onChange={() => setScope('global')}
              />
              <span>
                <span className="font-medium text-foreground">Predeterminada (todas)</span>
                <span className="block text-[11px] text-muted-foreground">
                  La usan las instancias que no tengan configuración propia.
                </span>
              </span>
            </label>
            <p className="pt-0.5 text-[11px] text-muted-foreground">
              {hasOwn
                ? 'Esta instancia tiene configuración propia.'
                : 'Esta instancia usa la configuración predeterminada.'}
            </p>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Puerto</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={settings.sshPort}
              onChange={(e) => setSettings((s) => ({ ...s, sshPort: Number(e.target.value) }))}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Usuario (root, opc, ubuntu…)</span>
            <input
              value={settings.sshUser}
              onChange={(e) => setSettings((s) => ({ ...s, sshUser: e.target.value }))}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Llave privada (.ppk / .pem)</span>
            <input
              value={settings.sshKeyPath}
              onChange={(e) => setSettings((s) => ({ ...s, sshKeyPath: e.target.value }))}
              placeholder={DEFAULT_SSH_KEY_PATH}
              className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus-visible:border-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Contraseña SSH (opcional)</span>
            <input
              type="password"
              value={settings.sshPassword}
              onChange={(e) => setSettings((s) => ({ ...s, sshPassword: e.target.value }))}
              placeholder="Contraseña del servidor o frase de la llave .ppk"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.rememberSshPassword}
              onChange={(e) => setSettings((s) => ({ ...s, rememberSshPassword: e.target.checked }))}
            />
            Recordar contraseña SSH en este equipo
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.useSudoDocker}
              onChange={(e) => setSettings((s) => ({ ...s, useSudoDocker: e.target.checked }))}
            />
            Usar sudo para comandos Docker
          </label>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Soporta llaves PuTTY (.ppk) igual que docker_manager. Si la .ppk tiene frase de paso,
          escríbela en Contraseña SSH. También se intenta la llave de Hyra del entorno.
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          {instanceKey && hasOwn ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                clearInstanceSshSettings(instanceKey)
                onSaved?.()
                onClose()
              }}
            >
              Usar la predeterminada
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Guardar
            </Button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  )
}
