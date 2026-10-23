import { NextResponse } from "next/server"
import type { PlannerSettings } from "@/lib/planner-settings"

function jiraHeaders(settings: PlannerSettings) {
  return {
    Authorization: `Basic ${Buffer.from(`${settings.jiraEmail}:${settings.jiraApiToken}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

function extractPageIdFromUrl(url: string): string | null {
  const match = url.match(/\/pages\/(\d+)/)
  return match ? match[1] : null
}

export async function POST(request: Request) {
  try {
    const { issueKey, settings } = (await request.json()) as {
      issueKey: string
      settings: PlannerSettings
    }

    if (!issueKey || !settings.jiraBaseUrl) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    const base = settings.jiraBaseUrl.replace(/\/+$/, "")

    // Fetch issue
    const issueRes = await fetch(
      `${base}/rest/api/3/issue/${issueKey}?fields=summary,description,issuetype,status,priority,attachment,comment`,
      { headers: jiraHeaders(settings) },
    )
    if (!issueRes.ok) {
      const text = await issueRes.text()
      return NextResponse.json(
        { error: `Jira error (${issueRes.status}): ${text}` },
        { status: issueRes.status },
      )
    }

    const data = await issueRes.json()
    const fields = data.fields

    const description = extractAdfText(fields.description)

    // Fetch Confluence remote links and get page titles
    const remoteLinksRes = await fetch(
      `${base}/rest/api/3/issue/${issueKey}/remotelink`,
      { headers: jiraHeaders(settings) },
    )
    const remoteLinks = remoteLinksRes.ok ? await remoteLinksRes.json() : []

    const confluencePages: { url: string; title: string }[] = []
    for (const link of remoteLinks ?? []) {
      const url: string = link.object?.url ?? ""
      if (!url.includes("confluence")) continue
      const pageId = extractPageIdFromUrl(url)
      let title = "Página de Confluence"
      if (pageId) {
        try {
          const pageRes = await fetch(
            `${base}/wiki/rest/api/content/${pageId}?fields=title`,
            { headers: jiraHeaders(settings) },
          )
          if (pageRes.ok) {
            const pageData = await pageRes.json()
            title = pageData.title ?? title
          }
        } catch {
          // ignore
        }
      }
      confluencePages.push({ url, title })
    }

    const attachments: { filename: string; size: number; mimeType: string }[] =
      (fields.attachment ?? []).map((a: any) => ({
        filename: a.filename,
        size: a.size,
        mimeType: a.mimeType,
      }))

    return NextResponse.json({
      key: data.key,
      summary: fields.summary,
      description,
      issueType: fields.issuetype?.name ?? "",
      status: fields.status?.name ?? "",
      priority: fields.priority?.name ?? "",
      comments: (fields.comment?.comments ?? []).length,
      confluencePages,
      attachments,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    )
  }
}

function extractAdfText(node: any): string {
  if (!node) return ""
  if (node.type === "text") return node.text ?? ""
  if (node.type === "hardBreak") return "\n"
  if (node.type === "codeBlock") {
    const lang = node.attrs?.language ?? ""
    const code = node.content?.map(extractAdfText).join("") ?? ""
    return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`
  }
  if (node.type === "mention") return `@${node.attrs?.text ?? node.attrs?.id ?? "usuario"}`
  if (node.type === "inlineCard") return node.attrs?.url ?? ""

  const content = node.content?.map(extractAdfText).join("") ?? ""
  if (node.type === "paragraph") return content + "\n"
  if (node.type === "listItem") return "- " + content + "\n"
  if (node.type === "bulletList" || node.type === "orderedList") return content + "\n"
  if (node.type === "table") {
    const rows = node.content?.map((row: any) => {
      const cells = row.content?.map((cell: any) => extractAdfText(cell).trim()).join(" | ") ?? ""
      return "| " + cells + " |"
    }).join("\n") ?? ""
    return "\n" + rows + "\n"
  }
  if (node.type === "tableRow") return ""
  if (node.type === "tableCell" || node.type === "tableHeader") return node.content?.map(extractAdfText).join("") ?? ""

  return content + " "
}
