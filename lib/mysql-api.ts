export type MysqlStatus = {
  connected: boolean
  host?: string
  port?: number
  user?: string
}

const fetchOpts: RequestInit = {
  cache: 'no-store',
  credentials: 'include',
}

export async function fetchMysqlStatus(): Promise<MysqlStatus> {
  const response = await fetch('/api/mysql/status', fetchOpts)
  return response.json()
}

export async function connectMysql(entornoId: string): Promise<{
  host: string
  port: number
  user: string
  reused?: boolean
}> {
  const response = await fetch('/api/mysql/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ entornoId }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo conectar a MySQL.')
  }
  return data
}

export async function fetchMysqlDatabases(): Promise<string[]> {
  const response = await fetch('/api/mysql/databases', fetchOpts)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'No se pudieron cargar las bases de datos.')
  }
  return data.databases as string[]
}

export async function execMysql(
  entornoId: string,
  sql: string,
  options?: { database?: string; databases?: string[]; publicIp?: string },
) {
  const response = await fetch('/api/mysql/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      entornoId,
      sql,
      database: options?.database,
      databases: options?.databases,
      publicIp: options?.publicIp,
    }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Error al ejecutar consulta.')
  }
  return data as {
    output: string
    columns: string[]
    rows: (string | null)[][]
    rowCount: number
    elapsedMs: number
    host: string
    databases: string[]
  }
}
