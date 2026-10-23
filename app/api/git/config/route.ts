import { NextResponse } from 'next/server'
import {
  getGitBasePath,
  getGitRepos,
  suggestRepoForInstance,
  taskKeyFromInstance,
} from '@/lib/git-config'
import { isGitAvailable } from '@/lib/git-service'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const instanceName = url.searchParams.get('instanceName')?.trim() || ''
  const instanceId = url.searchParams.get('instanceId')?.trim() || ''
  const estadotarea = url.searchParams.get('estadotarea')?.trim() || ''
  const lastRepoId = url.searchParams.get('lastRepoId')?.trim() || null

  const repos = getGitRepos().map((r) => ({
    id: r.id,
    label: r.label,
    folder: r.folder,
    subdir: r.subdir || '',
  }))

  const suggestedRepoId = suggestRepoForInstance(instanceName, lastRepoId)
  const taskKey = taskKeyFromInstance(instanceName, instanceId, estadotarea)

  return NextResponse.json({
    repos,
    suggestedRepoId,
    defaultCommitPrefix: taskKey ? `${taskKey}: ` : '',
    gitAvailable: isGitAvailable(),
    basePath: getGitBasePath(),
  })
}
