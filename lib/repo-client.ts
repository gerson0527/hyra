import { promises as fs } from "fs"
import * as path from "path"
import type { PlannerRepo } from "./planner-settings"

export interface RepoFile {
  path: string
  content: string
}

const MAX_FILE_BYTES = 100_000
const MAX_TOTAL_BYTES = 1_500_000
const MAX_FILES = 60
const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "out",
  "coverage", ".turbo", ".cache", "vendor", "target", "bin", "obj",
])
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".txt", ".yml", ".yaml", ".toml",
  ".css", ".scss", ".less", ".html", ".vue", ".svelte",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".php", ".sh", ".bash", ".sql", ".env", ".dockerfile",
  ".gitignore", ".gitattributes",
])

interface BitbucketEntry {
  path: { name: string; toString(): string }
  type: string
  size?: number
}

export function isLocalPath(value?: string): boolean {
  if (!value) return false
  const v = value.trim()
  return v.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(v)
}

export async function fetchRepoContext(repo: PlannerRepo): Promise<string> {
  if (repo.localPath && isLocalPath(repo.localPath)) {
    return await fetchLocal(repo)
  }

  const url = (repo.url ?? "").toLowerCase()
  if (!url) {
    return `## Repositorio ${repo.name}\n\nSin URL ni ruta local configurada.`
  }
  if (url.includes("github.com")) return await fetchGitHub(repo)
  if (url.includes("bitbucket.org")) return await fetchBitbucket(repo)
  return `## Repositorio ${repo.name}\n\nProveedor no soportado. URL: ${repo.url}\n\nSolo se soportan GitHub, Bitbucket y rutas locales.`
}

async function fetchLocal(repo: PlannerRepo): Promise<string> {
  const root = repo.localPath!.trim()
  try {
    const stat = await fs.stat(root)
    if (!stat.isDirectory()) {
      return `## Repositorio ${repo.name}\n\nLa ruta no es un directorio: ${root}`
    }
  } catch (e) {
    return `## Repositorio ${repo.name}\n\nNo se pudo acceder a la ruta: ${root}\n\n${e instanceof Error ? e.message : String(e)}`
  }

  const allFiles: { relPath: string; absPath: string; size: number }[] = []

  async function walk(dir: string, prefix: string) {
    let entries: import("fs").Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue
        await walk(abs, rel)
      } else if (entry.isFile()) {
        if (!isTextPath(entry.name)) continue
        try {
          const s = await fs.stat(abs)
          if (s.size > MAX_FILE_BYTES) continue
          allFiles.push({ relPath: rel, absPath: abs, size: s.size })
        } catch {
          // ignore
        }
      }
    }
  }

  await walk(root, "")

  allFiles.sort((a, b) => b.size - a.size)

  const collected: { relPath: string; absPath: string; size: number }[] = []
  let totalBytes = 0
  for (const file of allFiles) {
    if (collected.length >= MAX_FILES) break
    if (totalBytes + file.size > MAX_TOTAL_BYTES) break
    collected.push(file)
    totalBytes += file.size
  }

  const files: RepoFile[] = []
  for (const file of collected) {
    try {
      const content = await fs.readFile(file.absPath, "utf-8")
      files.push({ path: file.relPath, content })
    } catch {
      // ignore
    }
  }

  return renderRepoContext(repo, files, "(local)")
}

async function fetchGitHub(repo: PlannerRepo): Promise<string> {
  const { owner, repo: repoName } = parseGitHubUrl(repo.url)
  if (!owner || !repoName) {
    return `## Repositorio ${repo.name}\n\nURL de GitHub inválida: ${repo.url}`
  }

  const branch = repo.branch || "main"
  const headers = buildGitHubHeaders(repo.token)

  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/git/trees/${branch}?recursive=1`,
    { headers },
  )

  if (!treeRes.ok) {
    return `## Repositorio ${repo.name}\n\nError al listar archivos: ${treeRes.status} ${treeRes.statusText}`
  }

  const treeData = await treeRes.json()
  const tree = (treeData.tree ?? []) as { path: string; type: string; size?: number }[]

  const candidates = tree
    .filter((e) => e.type === "blob")
    .filter((e) => !shouldSkipPath(e.path))
    .filter((e) => isTextPath(e.path))
    .filter((e) => !e.size || e.size <= MAX_FILE_BYTES)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, MAX_FILES)

  let totalBytes = 0
  const collected: { path: string; size: number }[] = []
  for (const file of candidates) {
    if (totalBytes + (file.size ?? 0) > MAX_TOTAL_BYTES) break
    collected.push({ path: file.path, size: file.size ?? 0 })
    totalBytes += file.size ?? 0
  }

  const files: RepoFile[] = []
  for (const file of collected) {
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/${file.path}`,
      { headers },
    )
    if (!rawRes.ok) continue
    const content = await rawRes.text()
    files.push({ path: file.path, content })
  }

  return renderRepoContext(repo, files, branch)
}

async function fetchBitbucket(repo: PlannerRepo): Promise<string> {
  const { workspace, repoSlug } = parseBitbucketUrl(repo.url)
  if (!workspace || !repoSlug) {
    return `## Repositorio ${repo.name}\n\nURL de Bitbucket inválida: ${repo.url}\n\nFormato esperado: https://bitbucket.org/{workspace}/{repo-slug}`
  }

  const branch = repo.branch || "main"
  const auth = buildBitbucketAuth(repo.token)

  const tree = await listBitbucketTree(workspace, repoSlug, branch, "", auth)
  if (tree.error) {
    return `## Repositorio ${repo.name}\n\nError al listar archivos: ${tree.error}`
  }

  const candidates = tree.entries
    .filter((e) => e.type === "commit_file")
    .filter((e) => !shouldSkipPath(e.path.name))
    .filter((e) => isTextPath(e.path.name))
    .filter((e) => !e.size || e.size <= MAX_FILE_BYTES)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, MAX_FILES)

  let totalBytes = 0
  const collected: { path: string; size: number }[] = []
  for (const file of candidates) {
    if (totalBytes + (file.size ?? 0) > MAX_TOTAL_BYTES) break
    collected.push({ path: file.path.name, size: file.size ?? 0 })
    totalBytes += file.size ?? 0
  }

  const files: RepoFile[] = []
  for (const file of collected) {
    try {
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/src/${branch}/${file.path}`,
        { headers: auth },
      )
      if (!res.ok) continue
      const content = await res.text()
      files.push({ path: file.path, content })
    } catch {
      // ignore file fetch errors
    }
  }

  return renderRepoContext(repo, files, branch)
}

async function listBitbucketTree(
  workspace: string,
  repoSlug: string,
  branch: string,
  path: string,
  auth: Record<string, string>,
  accumulated: BitbucketEntry[] = [],
  page = 1,
): Promise<{ entries: BitbucketEntry[]; error?: string }> {
  const target = path
    ? `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/src/${branch}/${path}/?pagelen=100&page=${page}&format=meta`
    : `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/src/${branch}/?pagelen=100&page=${page}&format=meta`

  const res = await fetch(target, { headers: auth })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    return { entries: [], error: `${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ""}` }
  }

  const data = await res.json()
  const values: BitbucketEntry[] = data.values ?? []
  accumulated.push(...values)

  if (data.next && page < 20) {
    return await listBitbucketTree(workspace, repoSlug, branch, path, auth, accumulated, page + 1)
  }

  return { entries: accumulated }
}

function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com[/:]+([^/]+)\/([^/.]+)/i)
  if (!match) return { owner: "", repo: "" }
  return { owner: match[1], repo: match[2] }
}

function parseBitbucketUrl(url: string): { workspace: string; repoSlug: string } {
  const match = url.match(/bitbucket\.org\/([^/]+)\/([^/]+)/i)
  if (!match) return { workspace: "", repoSlug: "" }
  return { workspace: match[1], repoSlug: match[2] }
}

function buildGitHubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "hyra-planner",
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function buildBitbucketAuth(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "hyra-planner",
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function shouldSkipDir(name: string): boolean {
  if (IGNORED_DIRS.has(name)) return true
  if (name.startsWith(".") && name !== ".env" && name !== ".gitignore" && name !== ".gitattributes") return true
  return false
}

function shouldSkipPath(path: string): boolean {
  const parts = path.split("/")
  return parts.some((p) => IGNORED_DIRS.has(p) || (p.startsWith(".") && p !== ".env" && p !== ".gitignore" && p !== ".gitattributes"))
}

function isTextPath(path: string): boolean {
  const lower = path.toLowerCase()
  if (TEXT_EXTENSIONS.has(lower)) return true
  if (lower === "dockerfile" || lower.endsWith("/dockerfile")) return true
  return false
}

function renderRepoContext(repo: PlannerRepo, files: RepoFile[], refLabel: string): string {
  if (files.length === 0) {
    return `## Repositorio ${repo.name} (${refLabel})\n\nSin archivos relevantes encontrados.`
  }
  const sections = files.map((f) =>
    `### ${f.path}\n\`\`\`\n${f.content.slice(0, 8_000)}\n\`\`\``,
  )
  return `## Repositorio ${repo.name} (${refLabel})\n\n${sections.join("\n\n")}`
}