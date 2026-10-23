import type { PlannerSettings } from "./planner-settings"

export type ModelProvider = "anthropic" | "openai" | "gemini" | "minimax"

export interface ModelOption {
  id: string
  label: string
  provider: ModelProvider
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "claude-sonnet-4-20250514",  label: "Claude Sonnet 4",  provider: "anthropic" },
  { id: "claude-haiku-3-5-20241022", label: "Claude Haiku 3.5", provider: "anthropic" },
  { id: "gpt-4o",                    label: "GPT-4o",           provider: "openai" },
  { id: "gpt-4o-mini",               label: "GPT-4o Mini",      provider: "openai" },
  { id: "gemini-2.0-flash",          label: "Gemini 2.0 Flash", provider: "gemini" },
  { id: "gemini-1.5-pro",            label: "Gemini 1.5 Pro",   provider: "gemini" },
  { id: "minimax-m3-8b",             label: "MiniMax M3 8B",    provider: "minimax" },
  { id: "minimax-m2-7b",             label: "MiniMax M2 7B",    provider: "minimax" },
  { id: "minimax-m1-7b",             label: "MiniMax M1 7B",    provider: "minimax" },
]

type AnthropicResponse = {
  content?: { text?: string }[]
}

type OpenAIResponse = {
  choices?: { message?: { content?: string } }[]
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

export async function generatePlan(prompt: string, modelId: string, settings: PlannerSettings): Promise<string> {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
  if (!model) throw new Error(`Modelo no reconocido: ${modelId}`)

  switch (model.provider) {
    case "anthropic": return callClaude(prompt, model.id, settings)
    case "openai":    return callOpenAI(prompt, model.id, settings)
    case "gemini":    return callGemini(prompt, model.id, settings)
    case "minimax":   return callMiniMax(prompt, model.id, settings)
  }
}

async function callClaude(prompt: string, model: string, settings: PlannerSettings): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API error: ${await res.text()}`)
  const data: AnthropicResponse = await res.json()
  return data.content?.[0]?.text ?? ""
}

async function callOpenAI(prompt: string, model: string, settings: PlannerSettings): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openaiApiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI API error: ${await res.text()}`)
  const data: OpenAIResponse = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
}

async function callGemini(prompt: string, model: string, settings: PlannerSettings): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiApiKey}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini API error: ${await res.text()}`)
  const data: GeminiResponse = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
}

async function callMiniMax(prompt: string, model: string, settings: PlannerSettings): Promise<string> {
  const res = await fetch("https://api.minimax.io/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.minimaxApiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`MiniMax API error: ${await res.text()}`)
  const data: OpenAIResponse = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
}
