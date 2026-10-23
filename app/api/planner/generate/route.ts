import { NextRequest, NextResponse } from "next/server"
import { getJiraIssue } from "@/lib/jira-client"
import { getConfluencePageText } from "@/lib/confluence-client"
import { extractAttachmentText } from "@/lib/attachment-reader"
import { buildPlannerPrompt } from "@/lib/prompt-builder"
import { generatePlan, AVAILABLE_MODELS } from "@/lib/ai-router"
import { fetchRepoContext } from "@/lib/repo-client"
import type { PlannerSettings } from "@/lib/planner-settings"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const { issueKey, modelId, settings, selectedRepoIds, customLinks } = await req.json() as {
      issueKey: string
      modelId: string
      settings: PlannerSettings
      selectedRepoIds?: string[]
      customLinks?: string[]
    }

    if (!issueKey || !modelId) {
      return NextResponse.json(
        { error: "Faltan parámetros: issueKey y modelId son requeridos" },
        { status: 400 },
      )
    }

    if (!settings?.jiraBaseUrl || !settings?.jiraEmail || !settings?.jiraApiToken) {
      return NextResponse.json(
        { error: "Configura primero las credenciales de Jira en Ajustes > Planner" },
        { status: 400 },
      )
    }

    if (!AVAILABLE_MODELS.find((m) => m.id === modelId)) {
      return NextResponse.json({ error: "Modelo no reconocido" }, { status: 400 })
    }

    const issue = await getJiraIssue(issueKey, settings)

    const selectedRepos = (settings.repos ?? []).filter(
      (r) => !selectedRepoIds || selectedRepoIds.length === 0 || selectedRepoIds.includes(r.id),
    )

    const customLinksContext = await fetchCustomLinks(customLinks ?? [], settings)

    const [confluenceContent, attachmentTexts, repoContexts] = await Promise.all([
      Promise.all(issue.confluenceLinks.map((url) => getConfluencePageText(url, settings))).then((r) => r.filter(Boolean)),
      Promise.all(issue.attachments.map((att) => extractAttachmentText(att, settings))).then((r) => r.filter(Boolean)),
      Promise.all(selectedRepos.map((repo) => fetchRepoContext(repo).catch((e) => `## ${repo.name}\n\nError: ${e.message}`))),
    ])

    const prompt = buildPlannerPrompt({
      issue,
      confluenceContent,
      attachmentTexts,
      repoContexts,
      customLinksContext,
    })

    const plan = await generatePlan(prompt, modelId, settings)

    return NextResponse.json({ plan, issueKey, modelId })
  } catch (err: any) {
    console.error("[planner/generate]", err)
    return NextResponse.json(
      { error: err.message ?? "Error interno del servidor" },
      { status: 500 },
    )
  }
}

async function fetchCustomLinks(links: string[], settings: PlannerSettings): Promise<string[]> {
  const auth = `Basic ${Buffer.from(`${settings.jiraEmail}:${settings.jiraApiToken}`).toString("base64")}`
  const results: string[] = []
  for (const link of links) {
    try {
      const url = new URL(link)
      const isConfluence = url.hostname.includes("atlassian") || url.pathname.includes("/wiki/")
      if (isConfluence) {
        const pageIdMatch = url.pathname.match(/\/pages\/(\d+)/)
        if (pageIdMatch) {
          const base = settings.jiraBaseUrl.replace(/\/+$/, "")
          const res = await fetch(
            `${base}/wiki/rest/api/content/${pageIdMatch[1]}?expand=body.storage`,
            { headers: { Authorization: auth, Accept: "application/json" } },
          )
          if (res.ok) {
            const data = await res.json()
            const title = data.title ?? "Sin título"
            const html = data.body?.storage?.value ?? ""
            const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            results.push(`### ${title}\n${text}`)
            continue
          }
        }
      }
      const res = await fetch(link, {
        headers: { "User-Agent": "hyra-planner/1.0" },
      })
      if (!res.ok) {
        results.push(`### ${link}\nNo se pudo obtener contenido (${res.status})`)
        continue
      }
      const contentType = res.headers.get("content-type") ?? ""
      if (contentType.includes("text/") || contentType.includes("json")) {
        const text = await res.text()
        results.push(`### ${link}\n${text.slice(0, 20_000)}`)
      } else {
        results.push(`### ${link}\nTipo de contenido no soportado: ${contentType}`)
      }
    } catch (e) {
      results.push(`### ${link}\nError: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return results
}
