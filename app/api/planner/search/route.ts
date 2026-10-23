import { NextResponse } from "next/server"
import type { PlannerSettings } from "@/lib/planner-settings"

export async function POST(request: Request) {
  try {
    const { settings, query } = (await request.json()) as {
      settings: PlannerSettings
      query?: string
    }

    if (!settings.jiraBaseUrl || !settings.jiraEmail || !settings.jiraApiToken) {
      return NextResponse.json({ error: "Jira no configurado" }, { status: 400 })
    }

    const auth = btoa(`${settings.jiraEmail}:${settings.jiraApiToken}`)
    const jql = query
      ? `text ~ "${query.replace(/"/g, '\\"')}" AND assignee = currentUser() AND updated > -30d ORDER BY updated DESC`
      : "assignee = currentUser() AND updated > -30d ORDER BY updated DESC"

    const res = await fetch(
      `${settings.jiraBaseUrl.replace(/\/$/, "")}/rest/api/3/search/jql`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql,
          maxResults: 25,
          fields: ["summary", "issuetype", "status", "priority"],
        }),
      },
    )

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Jira API error (${res.status}): ${text}` },
        { status: res.status },
      )
    }

    const data = await res.json()

    const issues = (data.issues ?? []).map((issue: { key: string; fields: { summary: string; issuetype?: { name: string }; status?: { name: string }; priority?: { name: string } } }) => ({
      key: issue.key,
      summary: issue.fields.summary ?? "(sin resumen)",
      type: issue.fields.issuetype?.name ?? "",
      status: issue.fields.status?.name ?? "",
      priority: issue.fields.priority?.name ?? "",
    }))

    return NextResponse.json({ issues })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    )
  }
}
