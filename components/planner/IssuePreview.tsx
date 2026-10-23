"use client"

import { FileText, LinkIcon, MessageSquare, Paperclip } from "lucide-react"

interface ConfluencePage {
  url: string
  title: string
}

interface Attachment {
  filename: string
  size: number
  mimeType: string
}

interface PreviewData {
  key: string
  summary: string
  description: string
  issueType: string
  status: string
  priority: string
  comments: number
  confluencePages: ConfluencePage[]
  attachments: Attachment[]
}

export function IssuePreview({ data }: { data: PreviewData }) {
  const descLines = data.description.split("\n").filter(Boolean).slice(0, 20)
  const hasMore = data.description.split("\n").filter(Boolean).length > 20

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-primary">{data.key}</h3>
        <span className="text-xs text-muted-foreground">{data.summary}</span>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {data.issueType && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{data.issueType}</span>
        )}
        {data.status && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{data.status}</span>
        )}
        {data.priority && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{data.priority}</span>
        )}
        {data.comments > 0 && (
          <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            <MessageSquare className="size-3" />
            {data.comments}
          </span>
        )}
      </div>

      {data.description && (
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground">Descripción</p>
          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {descLines.join("\n")}
            {hasMore && <span className="text-[10px] text-muted-foreground/60">… ({data.description.split("\n").filter(Boolean).length - 20} líneas más)</span>}
          </div>
        </div>
      )}

      {data.confluencePages.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <LinkIcon className="size-3" />
            Confluence ({data.confluencePages.length})
          </p>
          <ul className="space-y-0.5">
            {data.confluencePages.map((p, i) => (
              <li key={i} className="truncate text-[11px] text-muted-foreground">
                {p.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.attachments.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Paperclip className="size-3" />
            Adjuntos ({data.attachments.length})
          </p>
          <ul className="space-y-0.5">
            {data.attachments.map((a, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-muted-foreground">
                <FileText className="mt-0.5 size-3 shrink-0" />
                <span className="truncate">{a.filename}</span>
                <span className="shrink-0">({formatSize(a.size)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
