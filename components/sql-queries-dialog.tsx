'use client'

import { useEffect, useMemo, useState } from 'react'
import { slugify } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ModalOverlay } from '@/components/modal-overlay'
import {
  DEFAULT_SAVED_SQL_QUERIES,
  SQL_QUERY_GROUPS,
  SYSTEM_DATABASES,
  filterUserDatabases,
  loadSavedQueries,
  queryDatabases,
  resetSavedQueries,
  saveSavedQueries,
  type SavedSqlQuery,
  type SqlQueryGroup,
} from '@/lib/saved-queries'
import { SqlPublicIpField } from '@/components/sql-public-ip-field'

export function SqlQueriesDialog({
  open,
  onClose,
  onSaved,
  initialSql = '',
  availableDatabases = [],
  publicIp = '',
  onPublicIpChange,
}: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  initialSql?: string
  availableDatabases?: string[]
  publicIp?: string
  onPublicIpChange?: (ip: string) => void
}) {
  const [queries, setQueries] = useState<SavedSqlQuery[]>(DEFAULT_SAVED_SQL_QUERIES)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dbFilter, setDbFilter] = useState('')
  const [showSystem, setShowSystem] = useState(false)

  useEffect(() => {
    if (open) {
      setQueries(loadSavedQueries())
      setSelectedIndex(0)
      setDbFilter('')
    }
  }, [open])

  const current = queries[selectedIndex]

  const visibleDatabases = useMemo(() => {
    const base = filterUserDatabases(availableDatabases, showSystem)
    const q = dbFilter.trim().toLowerCase()
    if (!q) return base
    return base.filter((name) => name.toLowerCase().includes(q))
  }, [availableDatabases, dbFilter, showSystem])

  function updateCurrent(patch: Partial<SavedSqlQuery>) {
    setQueries((prev) =>
      prev.map((item, index) => (index === selectedIndex ? { ...item, ...patch } : item)),
    )
  }

  function toggleDatabase(db: string, checked: boolean) {
    if (!current) return
    const selected = new Set(queryDatabases(current))
    if (checked) selected.add(db)
    else selected.delete(db)
    updateCurrent({ databases: [...selected].sort((a, b) => a.localeCompare(b)) })
  }

  function setAllVisible(checked: boolean) {
    if (!current) return
    const selected = new Set(queryDatabases(current))
    for (const db of visibleDatabases) {
      if (checked) selected.add(db)
      else selected.delete(db)
    }
    updateCurrent({ databases: [...selected].sort((a, b) => a.localeCompare(b)) })
  }

  function insertIntoSql(token: string) {
    if (!current) return
    const text = current.sql
    const spacer = text.length > 0 && !text.endsWith('\n') && !text.endsWith(' ') ? ' ' : ''
    updateCurrent({ sql: text + spacer + token })
  }

  function deleteCurrent() {
    if (queries.length <= 1) return
    const next = queries.filter((_, i) => i !== selectedIndex)
    const nextIndex = Math.min(selectedIndex, next.length - 1)
    setQueries(next)
    setSelectedIndex(nextIndex)
    saveSavedQueries(next)
    onSaved?.()
  }

  const selectedDbCount = current ? queryDatabases(current).length : 0

  return (
    <ModalOverlay open={open} onClose={onClose} className="max-w-3xl">
      <div className="flex max-h-[92vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Personalizar consultas SQL</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Marca una o varias bases donde se ejecutará cada consulta. Si no marcas ninguna, se usa
            la base seleccionada en la pestaña SQL.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-5 md:grid-cols-[220px_1fr]">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
              {queries.map((query, index) => (
                <button
                  key={`${query.id}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${
                    index === selectedIndex ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <span className="block truncate font-medium">{query.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {query.group}
                    {queryDatabases(query).length > 0
                      ? ` · ${queryDatabases(query).length} BD`
                      : ''}
                  </span>
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
                    setQueries((prev) => {
                      const next = [
                        ...prev,
                        {
                          id: slugify(`consulta_${prev.length + 1}`) || 'consulta',
                          name: `Consulta ${prev.length + 1}`,
                          group: 'General' as SqlQueryGroup,
                          sql: initialSql.trim() || '',
                          databases: [],
                        },
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
                  disabled={queries.length <= 1}
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
                  const defaults = resetSavedQueries()
                  setQueries(defaults)
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
                  value={current.name}
                  onChange={(e) => updateCurrent({ name: e.target.value })}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Grupo</span>
                <select
                  value={current.group}
                  onChange={(e) => updateCurrent({ group: e.target.value as SqlQueryGroup })}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
                >
                  {SQL_QUERY_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Bases de datos del entorno
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {selectedDbCount > 0
                      ? `${selectedDbCount} seleccionada(s)`
                      : '0 — usa la del selector SQL'}
                  </span>
                </div>
                {availableDatabases.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Conecta MySQL en la pestaña SQL para cargar las bases del entorno.
                  </p>
                ) : (
                  <>
                    <input
                      value={dbFilter}
                      onChange={(e) => setDbFilter(e.target.value)}
                      placeholder="Filtrar por nombre…"
                      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:border-ring"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => setAllVisible(true)}
                      >
                        Todas
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => setAllVisible(false)}
                      >
                        Ninguna
                      </Button>
                      <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={showSystem}
                          onChange={(e) => setShowSystem(e.target.checked)}
                        />
                        Mostrar del sistema
                      </label>
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background/50 p-2">
                      {visibleDatabases.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">Sin coincidencias.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {visibleDatabases.map((db) => (
                            <label
                              key={db}
                              className="inline-flex items-center gap-2 truncate rounded px-1 py-0.5 text-[12px] hover:bg-accent/50"
                            >
                              <input
                                type="checkbox"
                                checked={queryDatabases(current).includes(db)}
                                onChange={(e) => toggleDatabase(db, e.target.checked)}
                              />
                              <span className="truncate" title={db}>
                                {db}
                                {SYSTEM_DATABASES.has(db.toLowerCase()) ? ' (sys)' : ''}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <SqlPublicIpField
                value={publicIp}
                onChange={(ip) => onPublicIpChange?.(ip)}
                onInsert={insertIntoSql}
              />

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Consulta SQL</span>
                <textarea
                  value={current.sql}
                  onChange={(e) => updateCurrent({ sql: e.target.value })}
                  rows={10}
                  spellCheck={false}
                  className="w-full min-h-[180px] rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring"
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
              saveSavedQueries(queries)
              onSaved?.()
              onClose()
            }}
          >
            Guardar consultas
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
