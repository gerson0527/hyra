export type InstanceStatus = "running" | "stopped" | "partial"

export interface DockerContainer {
  name: string
  image: string
  status: "up" | "exited"
  uptime: string
  ports: string
  cpu?: string
  mem?: string
}

export interface HyraInstance {
  id: string
  name: string
  status: InstanceStatus
  ip: string
  ticket: string
  expiresIn: string
  cpu: number
  memory: number
  containers: DockerContainer[]
  preset: "ERP" | "POS" | "Sucursal"
}

export interface SqlQuery {
  id: string
  name: string
  group: "ERP" | "POS"
  sql: string
}

export interface SftpEntry {
  name: string
  type: "dir" | "file"
  size: string
  modified: string
}

export type GitFileStatus = "modified" | "new" | "deleted" | "staged"

export interface DiffHunk {
  id: string
  header: string
  lines: DiffLine[]
  patch?: string
}

export interface DiffLine {
  type: "context" | "add" | "remove"
  oldNo: number | null
  newNo: number | null
  text: string
  patch?: string
  raw?: string
  rawIndex?: number
}

export interface GitFile {
  path: string
  status: GitFileStatus
  zone: "staged" | "unstaged"
  additions: number
  deletions: number
  selected: boolean
  excluded: boolean
  isNoise: boolean
  isIde: boolean
  hunks: DiffHunk[]
  rawStatus?: string
  mtime?: number
}

export interface GitRepo {
  id: string
  label: string
  folder: string
  subfolder?: string
  branch: string
}
