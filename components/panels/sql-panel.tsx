"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { HyraInstance } from "@/lib/types"
import type { HyraEntorno } from "@/lib/entorno"
import { mysqlHostForEntorno } from "@/lib/mysql-config"
import { connectMysql, execMysql, fetchMysqlDatabases, fetchMysqlStatus } from "@/lib/mysql-api"
import {
  filterUserDatabases,
  loadSavedQueries,
  queryDatabases,
  queryGroups,
  saveSavedQueries,
  upsertQueryFromEditor,
  type SavedSqlQuery,
} from "@/lib/saved-queries"
import { SqlQueriesDialog } from "@/components/sql-queries-dialog"
import { SqlPublicIpField } from "@/components/sql-public-ip-field"
import { loadSqlSettings } from "@/lib/sql-settings"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Play, Database, Bookmark, Settings2, Save, Loader2, Plug, RefreshCw } from "lucide-react"

function dbStorageKey(entornoId: string) {
  return `hyra_sql_db:${entornoId}`
}

type QueryResult = {
  columns: string[]
  rows: (string | null)[][]
  output: string
  rowCount: number
  elapsedMs: number
}

export function SqlPanel({
  entorno,
  instance,
}: {
  entorno: HyraEntorno
  instance: HyraInstance
}) {
  const [queries, setQueries] = useState<SavedSqlQuery[]>([])
  const [selectedQueryId, setSelectedQueryId] = useState<string>("")
  const [sql, setSql] = useState("")
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [mysqlOk, setMysqlOk] = useState<boolean | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [databases, setDatabases] = useState<string[]>([])
  const [loadingDatabases, setLoadingDatabases] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState("")
  const [showSystemDatabases, setShowSystemDatabases] = useState(false)
  const [dbFilter, setDbFilter] = useState("")
  const [publicIp, setPublicIp] = useState("")

  const mysqlHost = mysqlHostForEntorno(entorno) || instance.ip
  const mysqlUrl = `mysql://root@${mysqlHost}:3306`

  const refreshQueries = useCallback(() => {
    const loaded = loadSavedQueries()
    setQueries(loaded)
    const id =
      selectedQueryId && loaded.some((q) => q.id === selectedQueryId)
        ? selectedQueryId
        : loaded[0]?.id ?? ""
    setSelectedQueryId(id)
    const picked = loaded.find((q) => q.id === id)
    if (picked) {
      setSql(picked.sql)
      setDirty(false)
      setResult(null)
      setError(null)
    }
  }, [selectedQueryId])

  useEffect(() => {
    refreshQueries()
    setPublicIp(loadSqlSettings().publicIp)
  }, [refreshQueries])

  useEffect(() => {
    setMysqlOk(null)
    setResult(null)
    setError(null)
    setDatabases([])
    const savedDb = typeof window !== "undefined" ? localStorage.getItem(dbStorageKey(entorno.id)) : ""
    setSelectedDatabase(savedDb || "")
  }, [entorno.id])

  const visibleDatabases = useMemo(
    () => filterUserDatabases(databases, showSystemDatabases),
    [databases, showSystemDatabases],
  )

  const filteredDatabases = useMemo(() => {
    const q = dbFilter.trim().toLowerCase()
    let list = visibleDatabases
    if (q) list = list.filter((name) => name.toLowerCase().includes(q))
    if (selectedDatabase && !list.includes(selectedDatabase) && databases.includes(selectedDatabase)) {
      list = [selectedDatabase, ...list]
    }
    return list
  }, [dbFilter, databases, selectedDatabase, visibleDatabases])

  const loadDatabases = useCallback(async () => {
    setLoadingDatabases(true)
    try {
      const list = await fetchMysqlDatabases()
      setDatabases(list)
      if (selectedDatabase && !list.includes(selectedDatabase)) {
        setSelectedDatabase("")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las bases.")
    } finally {
      setLoadingDatabases(false)
    }
  }, [selectedDatabase])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const status = await fetchMysqlStatus()
      if (cancelled) return
      setMysqlOk(status.connected)
      if (status.connected) {
        try {
          const list = await fetchMysqlDatabases()
          if (!cancelled) setDatabases(list)
        } catch {
          // ignorar al reabrir pestaña
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entorno.id])

  const selected = useMemo(
    () => queries.find((q) => q.id === selectedQueryId) ?? queries[0],
    [queries, selectedQueryId],
  )

  useEffect(() => {
    if (selected && !dirty) {
      setSql(selected.sql)
      setResult(null)
      setError(null)
    }
  }, [selected, dirty])

  const groups = useMemo(() => queryGroups(queries), [queries])

  function pick(id: string) {
    const q = queries.find((x) => x.id === id)
    if (!q) return
    setSelectedQueryId(id)
    setSql(q.sql)
    setDirty(false)
    setResult(null)
    setError(null)
    const presetDbs = queryDatabases(q)
    if (presetDbs.length === 1) {
      setSelectedDatabase(presetDbs[0])
      localStorage.setItem(dbStorageKey(entorno.id), presetDbs[0])
    }
  }

  function handleDatabaseChange(value: string) {
    setSelectedDatabase(value)
    if (value) localStorage.setItem(dbStorageKey(entorno.id), value)
    else localStorage.removeItem(dbStorageKey(entorno.id))
  }

  function saveCurrentQuery() {
    if (!selected) return
    const dbs = selectedDatabase ? [selectedDatabase] : []
    const next = upsertQueryFromEditor(queries, selected.id, sql, dbs)
    saveSavedQueries(next)
    setQueries(next)
    setDirty(false)
  }

  const execTargets = useMemo(() => {
    const fromPreset = selected ? queryDatabases(selected) : []
    if (fromPreset.length > 0) return fromPreset
    if (selectedDatabase) return [selectedDatabase]
    return []
  }, [selected, selectedDatabase])

  const testMysqlConnection = useCallback(async () => {
    if (!mysqlHost) {
      setError("La instancia no tiene IP asignada.")
      setMysqlOk(false)
      return
    }
    setConnecting(true)
    setError(null)
    try {
      await connectMysql(entorno.id)
      setMysqlOk(true)
      await loadDatabases()
    } catch (err) {
      setMysqlOk(false)
      setError(err instanceof Error ? err.message : "Error MySQL.")
    } finally {
      setConnecting(false)
    }
  }, [entorno.id, loadDatabases, mysqlHost])

  const runQuery = useCallback(async () => {
    const trimmed = sql.trim()
    if (!trimmed) return
    if (!mysqlOk) {
      setError("Conecta MySQL primero (botón «Conectar MySQL»).")
      return
    }
    setExecuting(true)
    setError(null)
    try {
      const data = await execMysql(entorno.id, trimmed, {
        database: execTargets.length === 1 ? execTargets[0] : undefined,
        databases: execTargets.length > 1 ? execTargets : undefined,
        publicIp,
      })
      setResult({
        columns: data.columns,
        rows: data.rows,
        output: data.output,
        rowCount: data.rowCount,
        elapsedMs: data.elapsedMs,
      })
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : "Error al ejecutar.")
      if (String(err).includes("No hay conexión MySQL activa")) setMysqlOk(false)
    } finally {
      setExecuting(false)
    }
  }, [entorno.id, execTargets, mysqlOk, publicIp, sql])

  const showTable = result && result.columns.length > 0

  return (
    <div className="flex h-full min-h-0">
      <SqlQueriesDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={refreshQueries}
        initialSql={sql}
        availableDatabases={databases}
        publicIp={publicIp}
        onPublicIpChange={setPublicIp}
      />

      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-1.5 px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Bookmark className="size-3.5" /> Consultas guardadas
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {groups.map((group) => (
            <div key={group} className="mb-3">
              <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">{group}</p>
              <ul className="flex flex-col gap-0.5">
                {queries
                  .filter((q) => q.group === group)
                  .map((q) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => pick(q.id)}
                        className={cn(
                          "w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                          q.id === selectedQueryId
                            ? "bg-primary/10 text-primary"
                            : "text-foreground/80 hover:bg-accent",
                        )}
                      >
                        {q.name}
                        {q.id === selectedQueryId && dirty ? " *" : ""}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto bg-background">
          {error ? (
            <pre className="whitespace-pre-wrap p-4 font-mono text-[13px] text-destructive">{error}</pre>
          ) : result ? (
            showTable ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border hover:bg-accent/40">
                      {row.map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 font-mono text-[13px]">
                          {cell ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre className="whitespace-pre-wrap p-4 font-mono text-[13px] leading-relaxed text-foreground">
                {result.output}
              </pre>
            )
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Conecta MySQL y ejecuta la consulta para ver los resultados.
            </div>
          )}
        </div>

        {result ? (
          <div className="shrink-0 border-y border-border bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
            {showTable ? `${result.rowCount} filas` : "Comando ejecutado"} · {(result.elapsedMs / 1000).toFixed(3)}s
          </div>
        ) : null}

        <textarea
          value={sql}
          onChange={(e) => {
            setSql(e.target.value)
            setDirty(true)
            setResult(null)
            setError(null)
          }}
          spellCheck={false}
          className="h-44 min-h-[120px] max-h-[40vh] w-full shrink-0 resize-y border-t border-border bg-background p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
          placeholder="Escribe o edita tu consulta SQL…"
        />

        <div className="shrink-0 border-t border-border bg-muted/15 px-3 py-2">
          <SqlPublicIpField value={publicIp} onChange={setPublicIp} compact />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-muted/20 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Base de datos
          </span>
          <input
            value={dbFilter}
            onChange={(e) => setDbFilter(e.target.value)}
            placeholder="Filtrar…"
            disabled={!mysqlOk}
            className="h-8 w-28 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:border-ring disabled:opacity-50"
          />
          <select
            value={selectedDatabase}
            onChange={(e) => handleDatabaseChange(e.target.value)}
            disabled={!mysqlOk || loadingDatabases}
            className="h-8 min-w-[160px] max-w-[280px] flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:border-ring disabled:opacity-50"
          >
            <option value="">Sin base concreta</option>
            {filteredDatabases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={!mysqlOk || loadingDatabases}
            onClick={() => void loadDatabases()}
            title="Actualizar lista de bases"
          >
            {loadingDatabases ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={showSystemDatabases}
              onChange={(e) => setShowSystemDatabases(e.target.checked)}
            />
            Sistema
          </label>
          <span className="text-[10px] text-muted-foreground">
            {mysqlOk
              ? execTargets.length > 1
                ? `Ejecutará en ${execTargets.length} bases`
                : execTargets.length === 1
                  ? `BD: ${execTargets[0]}`
                  : `${visibleDatabases.length} bases disponibles`
              : "Conecta MySQL para listar bases"}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
          <div className="inline-flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <Database className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-xs text-muted-foreground sm:text-sm">{mysqlUrl}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                mysqlOk === true && "bg-success/15 text-success",
                mysqlOk === false && "bg-destructive/15 text-destructive",
                mysqlOk === null && "bg-muted text-muted-foreground",
              )}
            >
              {mysqlOk === true ? "MySQL OK" : mysqlOk === false ? "MySQL error" : "MySQL…"}
            </span>
            {selected ? (
              <span className="hidden truncate text-[11px] text-muted-foreground lg:inline">
                · {selected.name}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void testMysqlConnection()}
              disabled={connecting || executing}
            >
              {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
              Conectar MySQL
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Settings2 className="size-3.5" />
              Personalizar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selected || !dirty}
              onClick={saveCurrentQuery}
            >
              <Save className="size-3.5" />
              Guardar
            </Button>
            <Button size="sm" onClick={() => void runQuery()} disabled={!mysqlOk || executing}>
              {executing ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              Ejecutar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
