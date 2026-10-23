"use client"

import { AVAILABLE_MODELS, type ModelProvider } from "@/lib/ai-router"
import type { ModelOption } from "@/lib/ai-router"

interface Props {
  value: string
  onChange: (value: string) => void
  configuredProviders: Set<ModelProvider>
  models?: ModelOption[]
  fetchErrors?: string[]
}

const PROVIDER_LABEL: Record<ModelProvider, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  gemini: "Gemini (Google)",
  minimax: "MiniMax",
}

export function ModelSelector({ value, onChange, configuredProviders, models, fetchErrors }: Props) {
  const list = models ?? AVAILABLE_MODELS

  const groups = new Map<ModelProvider, typeof list>()
  for (const m of list) {
    if (!groups.has(m.provider)) groups.set(m.provider, [])
    groups.get(m.provider)!.push(m)
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-[#1e2330] bg-[#131924] px-2.5 text-xs text-[#94a3b8] outline-none focus:ring-1 focus:ring-blue-500/50 hover:bg-[#1e2330] hover:text-[#f1f5f9] transition-colors"
    >
      {[...groups.entries()].map(([provider, providerModels]) => {
        const hasKey = models
          ? providerModels.length > 0
          : configuredProviders.has(provider)
        const error = fetchErrors?.find((e) =>
          e.toLowerCase().startsWith(provider.toLowerCase()),
        )
        const status = error ? "error" : hasKey ? "conectado" : "sin clave"
        return (
          <optgroup
            key={provider}
            label={`${PROVIDER_LABEL[provider]} — ${status}`}
          >
            {providerModels.map((m) => (
              <option key={m.id} value={m.id} disabled={!hasKey}>
                {m.label}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
