import fs from 'fs'
import path from 'path'
import { getGitBasePath, getGitRepo, type GitRepoConfig } from '@/lib/git-config'

export function resolveGitRepo(repoId: string): {
  repo: GitRepoConfig
  root: string
} | null {
  const repo = getGitRepo(repoId)
  if (!repo) return null
  const root = path.join(getGitBasePath(), repo.folder)
  return { repo, root }
}

export function validateRepoRoot(root: string): string | null {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return `No existe la carpeta del repositorio: ${root}`
  }
  if (!fs.existsSync(path.join(root, '.git'))) {
    return `No es un repositorio Git: ${root}`
  }
  return null
}
