import type { PlannerSettings } from "./planner-settings"

function confHeaders(settings: PlannerSettings) {
  return {
    Authorization: `Basic ${Buffer.from(`${settings.jiraEmail}:${settings.jiraApiToken}`).toString("base64")}`,
    Accept: "application/json",
  }
}

export async function getConfluencePageText(pageUrl: string, settings: PlannerSettings): Promise<string> {
  const pageId = extractPageIdFromUrl(pageUrl)
  if (!pageId) return ""

  const base = settings.jiraBaseUrl.replace(/\/+$/, "")
  const url = `${base}/wiki/rest/api/content/${pageId}?expand=body.storage`
  const res = await fetch(url, { headers: confHeaders(settings) })
  if (!res.ok) return ""

  const data = await res.json()
  const rawHtml = data.body?.storage?.value ?? ""
  return stripConfluenceHtml(rawHtml)
}

function extractPageIdFromUrl(url: string): string | null {
  const match = url.match(/\/pages\/(\d+)/)
  if (match) return match[1]
  console.warn("[confluence] URL no reconocida:", url)
  return null
}

function stripConfluenceHtml(html: string): string {
  return html
    .replace(/<ac:[^>]+>[\s\S]*?<\/ac:[^>]+>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}
