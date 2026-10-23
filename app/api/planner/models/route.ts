import { NextResponse } from "next/server"
import type { PlannerSettings } from "@/lib/planner-settings"

type ModelProvider = "anthropic" | "openai" | "gemini" | "minimax"

interface ModelEntry {
  id: string
  label: string
  provider: ModelProvider
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenAI: ${res.status}`)
  const data = await res.json()
  const chatPrefixes = ["gpt-", "o1", "o3", "ft:gpt-"]
  return (data.data ?? [])
    .filter((m: { id: string }) => chatPrefixes.some((p) => m.id.startsWith(p)))
    .map((m: { id: string }) => ({
      id: m.id,
      label: m.id,
      provider: "openai" as const,
    }))
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  })
  if (!res.ok) throw new Error(`Anthropic: ${res.status}`)
  const data = await res.json()
  return (data.data ?? [])
    .filter((m: { id: string }) => m.id.startsWith("claude-"))
    .map((m: { id: string; display_name?: string }) => ({
      id: m.id,
      label: m.display_name ?? m.id,
      provider: "anthropic" as const,
    }))
}

async function fetchGeminiModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  )
  if (!res.ok) throw new Error(`Gemini: ${res.status}`)
  const data = await res.json()
  return (data.models ?? [])
    .filter(
      (m: { supportedGenerationMethods?: string[]; name: string }) =>
        m.supportedGenerationMethods?.includes("generateContent") &&
        m.name.startsWith("models/gemini-"),
    )
    .map((m: { name: string; displayName?: string }) => ({
      id: m.name.replace("models/", ""),
      label: m.displayName ?? m.name.replace("models/", ""),
      provider: "gemini" as const,
    }))
}

async function fetchMiniMaxModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch("https://api.minimax.chat/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`MiniMax: ${res.status}`)
  const data = await res.json()
  return (data.data ?? [])
    .filter((m: { id: string }) => /minimax|abab/i.test(m.id))
    .map((m: { id: string }) => ({
      id: m.id,
      label: m.id,
      provider: "minimax" as const,
    }))
}

export async function POST(request: Request) {
  try {
    const { settings } = (await request.json()) as { settings: PlannerSettings }

    const results = await Promise.allSettled([
      settings.openaiApiKey
        ? fetchOpenAIModels(settings.openaiApiKey).then((models) => ({
            provider: "openai" as const,
            models,
          }))
        : Promise.resolve(null),
      settings.anthropicApiKey
        ? fetchAnthropicModels(settings.anthropicApiKey).then((models) => ({
            provider: "anthropic" as const,
            models,
          }))
        : Promise.resolve(null),
      settings.geminiApiKey
        ? fetchGeminiModels(settings.geminiApiKey).then((models) => ({
            provider: "gemini" as const,
            models,
          }))
        : Promise.resolve(null),
      settings.minimaxApiKey
        ? fetchMiniMaxModels(settings.minimaxApiKey).then((models) => ({
            provider: "minimax" as const,
            models,
          }))
        : Promise.resolve(null),
    ])

    const models: ModelEntry[] = []
    const errors: string[] = []

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        models.push(...result.value.models)
      } else if (result.status === "rejected") {
        errors.push(result.reason?.message ?? "Error desconocido")
      }
    }

    return NextResponse.json({ models, errors })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    )
  }
}
