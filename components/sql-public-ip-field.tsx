'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { detectPublicIp, loadSqlSettings, saveSqlSettings } from '@/lib/sql-settings'
import { QUERY_VARIABLES_HELP } from '@/lib/sql-query-variables'
import { Loader2, Wand2 } from 'lucide-react'

export function SqlPublicIpField({
  value,
  onChange,
  compact = false,
  onInsert,
}: {
  value: string
  onChange: (ip: string) => void
  compact?: boolean
  onInsert?: (token: string) => void
}) {
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)

  async function handleDetect() {
    setDetecting(true)
    setDetectError(null)
    try {
      const ip = await detectPublicIp()
      onChange(ip)
      const settings = loadSqlSettings()
      saveSqlSettings({ ...settings, publicIp: ip })
    } catch (error) {
      setDetectError(error instanceof Error ? error.message : 'No se pudo detectar la IP.')
    } finally {
      setDetecting(false)
    }
  }

  function handleChange(ip: string) {
    onChange(ip)
    const settings = loadSqlSettings()
    saveSqlSettings({ ...settings, publicIp: ip })
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2 rounded-md border border-border p-3'}>
      {!compact ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Variables SQL</span>
          <span className="text-[10px] text-muted-foreground">Se reemplazan al ejecutar</span>
        </div>
      ) : null}
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Mi IP pública → {'{PUBLIC_IP}'}</span>
        <div className="flex flex-wrap gap-2">
          <input
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="ej. 181.55.22.132"
            className="h-8 min-w-[140px] flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={detecting}
            onClick={() => void handleDetect()}
          >
            {detecting ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
            Detectar
          </Button>
          {onInsert ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onInsert('{PUBLIC_IP}')}
            >
              Insertar {'{PUBLIC_IP}'}
            </Button>
          ) : null}
        </div>
      </label>
      {detectError ? <p className="text-[11px] text-destructive">{detectError}</p> : null}
      {!compact ? (
        <pre className="whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-[10px] leading-relaxed text-muted-foreground">
          {QUERY_VARIABLES_HELP}
        </pre>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          También: {'{INSTANCE_IP}'}, {'{MYSQL_HOST}'}, {'{INSTANCE_NAME}'}
        </p>
      )}
    </div>
  )
}
