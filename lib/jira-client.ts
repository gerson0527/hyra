import type { PlannerSettings } from "./planner-settings"

export interface JiraAttachment {
  id: string
  filename: string
  mimeType: string
  content: string
  size: number
}

export interface JiraIssue {
  key: string
  summary: string
  description: string
  issueType: string
  status: string
  confluenceLinks: string[]
  attachments: JiraAttachment[]
  comments: string[]
}

function jiraHeaders(settings: PlannerSettings) {
  return {
    Authorization: `Basic ${Buffer.from(`${settings.jiraEmail}:${settings.jiraApiToken}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

export async function getJiraIssue(issueKey: string, settings: PlannerSettings): Promise<JiraIssue> {
  const base = settings.jiraBaseUrl.replace(/\/+$/, "")
  const url = `${base}/rest/api/3/issue/${issueKey}?expand=renderedFields`
  const res = await fetch(url, { headers: jiraHeaders(settings) })

  if (!res.ok) {
    throw new Error(`Jira error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  const fields = data.fields

  const description = extractAdfText(fields.description)
  const confluenceLinks = await getConfluenceLinks(issueKey, settings)
  const attachments: JiraAttachment[] = (fields.attachment ?? []).map((a: any) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    content: a.content,
    size: a.size,
  }))
  const comments: string[] = (fields.comment?.comments ?? []).map(
    (c: any) => extractAdfText(c.body),
  )

  return {
    key: data.key,
    summary: fields.summary,
    description,
    issueType: fields.issuetype?.name ?? "Unknown",
    status: fields.status?.name ?? "Unknown",
    confluenceLinks,
    attachments,
    comments,
  }
}

async function getConfluenceLinks(issueKey: string, settings: PlannerSettings): Promise<string[]> {
  const base = settings.jiraBaseUrl.replace(/\/+$/, "")
  const url = `${base}/rest/api/3/issue/${issueKey}/remotelink`
  const res = await fetch(url, { headers: jiraHeaders(settings) })
  if (!res.ok) return []

  const links = await res.json()
  return links
    .filter((l: any) => l.object?.url?.includes("confluence"))
    .map((l: any) => l.object.url as string)
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
