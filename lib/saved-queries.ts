import { slugify } from '@/lib/utils'

export type SqlQueryGroup = 'ERP' | 'POS' | 'General'

export type SavedSqlQuery = {
  id: string
  name: string
  group: SqlQueryGroup
  sql: string
  databases?: string[]
}

const STORAGE_KEY = 'hyra_saved_sql_queries'

export const SQL_QUERY_GROUPS: SqlQueryGroup[] = ['ERP', 'POS', 'General']

export const SYSTEM_DATABASES = new Set([
  'information_schema',
  'mysql',
  'performance_schema',
  'sys',
])

export function queryDatabases(query: Pick<SavedSqlQuery, 'databases'>): string[] {
  return (query.databases ?? []).map((d) => d.trim()).filter(Boolean)
}

export function filterUserDatabases(names: string[], showSystem = false): string[] {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  if (showSystem) return sorted
  return sorted.filter((name) => !SYSTEM_DATABASES.has(name.toLowerCase()))
}

const CONFIG_SERVICIOS_WEB_SQL = `update ConfigServiciosweb set url = 'http://evan.tiresia.com.co:3800' where identificador = 'evan';
update ConfigServiciosweb set url = 'http://contable.unidrogas.com.co:3800' where identificador = 'contableunidrogas';
update ConfigServiciosweb set url = 'http://evan.tiresia.com.co:3800' where identificador = 'evanunidrogas';
update ConfigServiciosweb set url = 'http://contable.unidrogas.com.co:3800' where identificador = 'contableunidrogas';
update ConfigServiciosweb set url = 'http://evan.tiresia.com.co:3800' where identificador = 'evanunidrogas2';
update ConfigServiciosweb set url = 'http://contable.unidrogas.com.co:3800' where identificador = 'contableunidrogas2';`

export const DEFAULT_SAVED_SQL_QUERIES: SavedSqlQuery[] = [
  {
    id: 'config_servicios_web',
    name: 'URLs ConfigServiciosweb',
    group: 'ERP',
    sql: CONFIG_SERVICIOS_WEB_SQL,
  },
  {
    id: 'asientos_erp',
    name: 'Asientos contables (ERP)',
    group: 'ERP',
    sql: "SELECT cuenta, debito, credito\nFROM contabilidad\nWHERE periodo = DATE_FORMAT(CURDATE(), '%Y-%m');",
  },
  {
    id: 'usuarios_activos',
    name: 'Usuarios activos',
    group: 'ERP',
    sql: 'SELECT usuario, ultimo_acceso\nFROM usuarios\nWHERE activo = 1;',
  },
  {
    id: 'ventas_dia',
    name: 'Ventas del día (POS)',
    group: 'POS',
    sql: 'SELECT factura, total, fecha\nFROM ventas\nWHERE DATE(fecha) = CURDATE()\nORDER BY fecha DESC;',
  },
  {
    id: 'stock_sucursal',
    name: 'Stock por sucursal',
    group: 'POS',
    sql: 'SELECT producto, bodega, existencia\nFROM inventario\nWHERE existencia < 10;',
  },
  {
    id: 'show_tables',
    name: 'SHOW TABLES',
    group: 'General',
    sql: 'SHOW TABLES;',
  },
]

function normalizeSavedQuery(query: SavedSqlQuery): SavedSqlQuery {
  return {
    id: query.id || 'consulta',
    name: query.name || 'Consulta',
    group: query.group || 'General',
    sql: query.sql || '',
    databases: queryDatabases(query),
  }
}

/** Solo añade presets nuevos de la app que aún no existen en el guardado (no restaura eliminados). */
function mergeNewDefaultsOnly(saved: SavedSqlQuery[]): SavedSqlQuery[] {
  const savedIds = new Set(saved.map((q) => q.id))
  const merged = [...saved]
  for (const query of DEFAULT_SAVED_SQL_QUERIES) {
    if (!savedIds.has(query.id)) merged.push(query)
  }
  return merged
}

export function loadSavedQueries(): SavedSqlQuery[] {
  if (typeof window === 'undefined') return DEFAULT_SAVED_SQL_QUERIES
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SAVED_SQL_QUERIES
    const parsed = JSON.parse(raw) as SavedSqlQuery[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SAVED_SQL_QUERIES
    return parsed.map(normalizeSavedQuery)
  } catch {
    return DEFAULT_SAVED_SQL_QUERIES
  }
}

/** Tras actualizar la app: añade solo consultas nuevas sin tocar las que guardaste o borraste. */
export function syncNewDefaultQueries(): SavedSqlQuery[] {
  const current = loadSavedQueries()
  const synced = mergeNewDefaultsOnly(current)
  saveSavedQueries(synced)
  return synced
}

export function saveSavedQueries(queries: SavedSqlQuery[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queries))
}

export function resetSavedQueries(): SavedSqlQuery[] {
  saveSavedQueries(DEFAULT_SAVED_SQL_QUERIES)
  return DEFAULT_SAVED_SQL_QUERIES
}

export function queryGroups(queries: SavedSqlQuery[]): SqlQueryGroup[] {
  const order = SQL_QUERY_GROUPS
  const found = new Set(queries.map((q) => q.group))
  return order.filter((g) => found.has(g))
}

export function upsertQueryFromEditor(
  queries: SavedSqlQuery[],
  selectedId: string,
  sql: string,
  databases?: string[],
): SavedSqlQuery[] {
  return queries.map((q) => {
    if (q.id !== selectedId) return q
    const patch: Partial<SavedSqlQuery> = { sql: sql.trim() }
    if (databases !== undefined) patch.databases = databases
    return { ...q, ...patch }
  })
}

export function createQuery(name: string, group: SqlQueryGroup, sql: string): SavedSqlQuery {
  const base = slugify(name)
  return {
    id: `${base}_${Date.now()}`,
    name: name.trim(),
    group,
    sql: sql.trim(),
  }
}
