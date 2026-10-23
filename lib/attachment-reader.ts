import type { JiraAttachment } from "./jira-client"
import type { PlannerSettings } from "./planner-settings"

export async function extractAttachmentText(
  attachment: JiraAttachment,
  settings: PlannerSettings,
): Promise<string> {
  const { filename, mimeType, content: downloadUrl, size } = attachment

  if (size > 5_000_000) {
    return `[Adjunto omitido: ${filename} (${Math.round(size / 1024)}KB, demasiado grande)]`
  }

  const textMime = mimeType.startsWith("text/") || mimeType === "application/json"
  const imageMime = mimeType.startsWith("image/")
  const pdfMime = mimeType === "application/pdf"

  if (!textMime && !imageMime && !pdfMime) {
    return `[Adjunto omitido: ${filename} (tipo ${mimeType} no procesable)]`
  }

  const auth = `Basic ${Buffer.from(`${settings.jiraEmail}:${settings.jiraApiToken}`).toString("base64")}`
  const res = await fetch(downloadUrl, {
    headers: { Authorization: auth },
  })

  if (!res.ok) {
    return `[Error al descargar adjunto: ${filename}]`
  }

  if (textMime) {
    return await res.text()
  }

  if (pdfMime) {
    return `[PDF adjunto: ${filename}]`
  }

  const buffer = await res.arrayBuffer()
  const base64 = Buffer.from(buffer).toString("base64")
  return `[IMAGEN:${mimeType}:${base64}:${filename}]`
}
