"use client"

import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Search, Settings2, Sparkles } from "lucide-react"
import { ModelSelector } from "./ModelSelector"
import { GeneratePlanDialog } from "./GeneratePlanDialog"
import { IssuePreview } from "./IssuePreview"
import { PlanOutput } from "./PlanOutput"
import { PlannerSettingsDialog } from "./PlannerSettingsDialog"
import { AVAILABLE_MODELS, type ModelOption, type ModelProvider } from "@/lib/ai-router"
import { loadPlannerSettings } from "@/lib/planner-settings"
import type { PlannerSettings, PlannerRepo } from "@/lib/planner-settings"

interface JiraIssue {
  key: string
  summary: string
  type: string
  status: string
  priority: string
}

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

function hasJiraKey(s: PlannerSettings): boolean {
  return Boolean(s.jiraBaseUrl && s.jiraEmail && s.jiraApiToken)
}

const SAMPLE_PLAN = `## Pasos Técnicos

1. Análisis de requerimientos y revisión de la documentación existente en Confluence para entender el flujo actual del POS.
2. Configurar el ambiente de desarrollo local con Docker Compose integrando el nuevo módulo de inventario.
3. Implementar los endpoints REST para sincronización de stock entre ERP y POS (estimación **4h**).
4. Crear la interfaz de usuario en el panel de inventario para visualizar el stock actualizado en tiempo real (**6h**).
5. Pruebas unitarias y de integración con Jest (**3h**).
6. Despliegue en ambiente de staging y pruebas de aceptación con usuarios clave (**2h**).

## Riesgos

- Riesgo de inconsistencia de datos si la sincronización falla a mitad de transacción. Mitigación: implementar cola de reintentos con Redis.
- Posible sobrecarga en el ERP durante horas pico por la sincronización constante. Mitigación: implementar throttling y caché.
- Dependencia de la API de inventario legacy que no tiene documentación actualizada.

## Total Estimado

**15h** distribuidas en una sprint de 2 semanas.`

export function PlannerForm() {
  const [searchQuery, setSearchQuery] = useState("")
  const [modelId, setModelId] = useState(AVAILABLE_MODELS[0].id)
  const [plan, setPlan] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsVersion, setSettingsVersion] = useState(0)
  const [dynamicModels, setDynamicModels] = useState<ModelOption[] | null>(null)
  const [fetchErrors, setFetchErrors] = useState<string[]>([])
  const [jiraError, setJiraError] = useState("")
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const fetchingRef = useRef(false)
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [selectedKey, setSelectedKey] = useState("")
  const [showSample, setShowSample] = useState(false)
  const [repos, setRepos] = useState<PlannerRepo[]>([])
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState("")

  const [configuredProviders, setConfiguredProviders] = useState<Set<ModelProvider>>(new Set())
  const [jiraConfigured, setJiraConfigured] = useState(false)

  useEffect(() => {
    const s = loadPlannerSettings()
    const p = new Set<ModelProvider>()
    if (s.anthropicApiKey) p.add("anthropic")
    if (s.openaiApiKey) p.add("openai")
    if (s.geminiApiKey) p.add("gemini")
    if (s.minimaxApiKey) p.add("minimax")
    setConfiguredProviders(p)
    setJiraConfigured(hasJiraKey(s))
    setRepos(s.repos ?? [])
  }, [settingsVersion])

  useEffect(() => {
    if (generateDialogOpen) {
      const s = loadPlannerSettings()
      setRepos(s.repos ?? [])
    }
  }, [generateDialogOpen])

  const fetchModels = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setIsFetchingModels(true)
    setFetchErrors([])
    try {
      const settings = loadPlannerSettings()
      const hasAnyKey = settings.anthropicApiKey || settings.openaiApiKey || settings.geminiApiKey || settings.minimaxApiKey
      if (!hasAnyKey) {
        setDynamicModels(null)
        return
      }
      const res = await fetch("/api/planner/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Error al obtener modelos")
      }
      const data = await res.json()
      if (data.models?.length > 0) {
        setDynamicModels(data.models)
        if (!data.models.some((m: ModelOption) => m.id === modelId)) {
          setModelId(data.models[0].id)
        }
      }
      if (data.errors?.length > 0) setFetchErrors(data.errors)
    } catch (err) {
      setFetchErrors([err instanceof Error ? err.message : "Error de conexión"])
    } finally {
      setIsFetchingModels(false)
      fetchingRef.current = false
    }
  }, [settingsVersion, modelId])

  useEffect(() => {
    void fetchModels()
  }, [fetchModels])

  async function fetchIssues() {
    const settings = loadPlannerSettings()
    if (!hasJiraKey(settings)) return

    setIsSearching(true)
    setJiraError("")
    try {
      const res = await fetch("/api/planner/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, query: "" }),
      })
      const data = await res.json()
      if (res.ok) {
        setIssues(data.issues ?? [])
      } else {
        setJiraError(data.error ?? "Error de conexión con Jira")
        setIssues([])
      }
    } catch {
      setJiraError("No se pudo conectar con Jira")
      setIssues([])
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    if (jiraConfigured) {
      void fetchIssues()
    }
  }, [jiraConfigured])

  async function fetchPreview(key: string) {
    const settings = loadPlannerSettings()
    if (!hasJiraKey(settings)) return

    setIsPreviewLoading(true)
    setError("")
    try {
      const res = await fetch("/api/planner/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueKey: key, settings }),
      })
      const data = await res.json()
      if (res.ok) {
        setPreviewData(data)
        setSelectedKey(key)
      } else {
        setError(data.error ?? "Error al obtener vista previa")
        setPreviewData(null)
      }
    } catch {
      setError("No se pudo conectar con el servidor")
      setPreviewData(null)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  function selectIssue(issue: JiraIssue) {
    setSelectedKey(issue.key)
    setJiraError("")
    setPreviewData(null)
    setPlan("")
    void fetchPreview(issue.key)
  }

  async function handleGenerate(data: { selectedRepoIds: string[]; customLinks: string[] }) {
    if (!selectedKey) return

    const settings = loadPlannerSettings()
    if (!hasJiraKey(settings)) {
      setError("Configura primero las credenciales de Jira en Ajustes.")
      setGenerateDialogOpen(false)
      return
    }

    setIsLoading(true)
    setError("")
    setPlan("")

    try {
      const res = await fetch("/api/planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueKey: selectedKey,
          modelId,
          settings,
          selectedRepoIds: data.selectedRepoIds,
          customLinks: data.customLinks,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error ?? "Error desconocido")
      } else {
        setPlan(result.plan)
        setGenerateDialogOpen(false)
      }
    } catch {
      setError("No se pudo conectar con el servidor")
    } finally {
      setIsLoading(false)
    }
  }

  const ALLOWED_STATUSES = ["DOCUMENTAR", "EN CURSO", "POR AJUSTAR", "REVISIÓN COMITÉ", "REVISIÓN TÉCNICA DOCUMENTACIÓN"]

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(
      issues
        .filter(i => ALLOWED_STATUSES.includes(i.status.toUpperCase()))
        .map(i => i.status)
    )
    return Array.from(statuses).sort()
  }, [issues])

  const filteredIssues = useMemo(() => {
    let result = issues.filter(i => ALLOWED_STATUSES.includes(i.status.toUpperCase()))

    if (statusFilter) {
      result = result.filter(i => i.status === statusFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(i =>
        i.key.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q)
      )
    }

    return result
  }, [issues, searchQuery, statusFilter])

  return (
    <div className="flex w-full h-full text-sm">
      {/* PANEL IZQUIERDO */}
      <div className="w-[340px] flex-shrink-0 bg-[#0d1017] border-r border-[#1e2330] flex flex-col h-full">
        <div className="p-4 flex flex-col gap-3 shrink-0">
          <div>
            <h2 className="text-[#f1f5f9] font-semibold text-[13px]">Tareas de Jira</h2>
            <p className="text-[#475569] text-[11px]">Selecciona una tarea para generar su plan</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#475569]" />
                <input
                  placeholder="Buscar tarea..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 bg-[#1e2330] rounded-md pl-8 pr-3 text-xs text-[#f1f5f9] outline-none placeholder:text-[#475569] focus:ring-1 focus:ring-blue-500/50 transition-all border border-[#1e2330] focus:border-blue-500/30"
                />
              </div>
              <button
                onClick={() => void fetchIssues()}
                disabled={isSearching || !jiraConfigured}
                className="h-8 w-8 flex items-center justify-center rounded-md bg-[#1e2330] hover:bg-[#252b3b] text-[#94a3b8] transition-colors disabled:opacity-50 border border-[#1e2330]"
              >
                <RefreshCw className={`size-3.5 ${isSearching ? "animate-spin" : ""}`} />
              </button>
            </div>
            {uniqueStatuses.length > 0 && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-8 bg-[#1e2330] rounded-md px-2.5 text-xs text-[#f1f5f9] outline-none border border-[#1e2330] focus:border-blue-500/30"
              >
                <option value="">Todos los estados</option>
                {uniqueStatuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2">
              <div className={`size-1.5 rounded-full ${jiraConfigured ? "bg-[#22c55e] shadow-[0_0_6px_#22c55e88]" : "bg-muted-foreground"}`} />
              <span className={`text-[10px] font-medium ${jiraConfigured ? "text-[#22c55e]" : "text-muted-foreground"}`}>
                Atlassian {jiraConfigured ? "conectado" : "sin clave"}
              </span>
            </div>
            <span className="text-[#475569] text-[10px]">{filteredIssues.length} tareas</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid grid-cols-[108px_52px_1fr_80px] gap-2 px-4 py-2 border-y border-[#1e2330] bg-[#0d1017] text-[10px] text-[#334155] uppercase tracking-wider shrink-0">
            <span>Clave</span>
            <span>Tipo</span>
            <span>Resumen</span>
            <span className="text-right">Estado</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredIssues.map((issue) => {
              const isSelected = selectedKey === issue.key
              let statusBg = "bg-gray-500/10"
              let statusText = "text-[#a8a29e]"
              let statusBorder = "border-[#a8a29e]/20"

              const statusUpper = issue.status.toUpperCase()
              if (statusUpper === "PASO PRODUCCIÓN" || statusUpper === "DESPLIEGUE" || statusUpper === "DONE" || statusUpper === "CLOSED") {
                statusBg = "bg-[#14532d]"
                statusText = "text-[#4ade80]"
                statusBorder = "border-[#166534]"
              } else if (statusUpper === "POR AJUSTAR") {
                statusBg = "bg-[#7c2d12]"
                statusText = "text-[#fb923c]"
                statusBorder = "border-[#9a3412]"
              } else if (statusUpper === "EN CURSO" || statusUpper === "IN PROGRESS") {
                statusBg = "bg-[#1e3a8a]"
                statusText = "text-[#60a5fa]"
                statusBorder = "border-[#1e40af]"
              } else if (statusUpper === "ESTABILIZACIÓN") {
                statusBg = "bg-[#4c1d95]"
                statusText = "text-[#a78bfa]"
                statusBorder = "border-[#5b21b6]"
              } else if (statusUpper === "REVISIÓN COMITÉ") {
                statusBg = "bg-[#0f766e]"
                statusText = "text-[#2dd4bf]"
                statusBorder = "border-[#115e59]"
              } else if (statusUpper === "DOCUMENTAR") {
                statusBg = "bg-[#1c1917]"
                statusText = "text-[#a8a29e]"
                statusBorder = "border-[#292524]"
              }

              return (
                <button
                  key={issue.key}
                  onClick={() => selectIssue(issue)}
                  className={`w-full text-left grid grid-cols-[108px_52px_1fr_80px] gap-2 px-4 py-2.5 items-center transition-colors border-b border-[#1e2330]/50 ${isSelected ? "bg-[#0f1e3a] border-l-2 !border-l-blue-600" : "hover:bg-[#131924] border-l-2 border-l-transparent"
                    }`}
                >
                  <span className="text-[11px] text-blue-400 font-mono font-medium truncate pr-2">{issue.key}</span>
                  <span className="flex">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e2d40] text-blue-400 truncate max-w-[48px] inline-block">{issue.type || "T"}</span>
                  </span>
                  <span className="truncate text-[12px] text-[#94a3b8]">{issue.summary}</span>
                  <span className="flex justify-end">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${statusBg} ${statusText} ${statusBorder} truncate max-w-full inline-block text-center font-medium`}>
                      {issue.status}
                    </span>
                  </span>
                </button>
              )
            })}
            {filteredIssues.length === 0 && !isSearching && (
              <div className="p-4 text-center text-[11px] text-[#475569]">No se encontraron tareas</div>
            )}
          </div>
        </div>
      </div>

      {/* PANEL DERECHO */}
      <div className="flex-1 flex flex-col bg-[#0d1017] h-full overflow-hidden">
        {selectedKey ? (
          <div className="h-[60px] shrink-0 border-b border-[#1e2330] px-6 flex items-center justify-between">
            <div className="min-w-0 flex-1 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-blue-400 font-mono text-[11px] font-medium">{selectedKey}</span>
                {previewData?.issueType && <span className="text-[10px] text-[#475569]">{previewData.issueType}</span>}
              </div>
              <h3 className="text-[15px] font-semibold text-[#f1f5f9] truncate">
                {previewData?.summary || issues.find(i => i.key === selectedKey)?.summary || "Cargando..."}
              </h3>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-[180px]">
                <ModelSelector
                  value={modelId}
                  onChange={setModelId}
                  configuredProviders={configuredProviders}
                  models={dynamicModels ?? undefined}
                  fetchErrors={fetchErrors}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                className="h-8 border-[#1e2330] bg-[#131924] text-[#94a3b8] hover:bg-[#1e2330] hover:text-[#f1f5f9]"
              >
                <Settings2 className="size-3.5 mr-1.5" /> Ajustes
              </Button>
              <Button
                size="sm"
                onClick={() => setGenerateDialogOpen(true)}
                disabled={isLoading || !selectedKey}
                className="h-8 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4"
              >
                {isLoading ? (
                  <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="size-3.5 mr-1.5" />
                )}
                {isLoading ? "Generando..." : "✦ Generar plan"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="h-[60px] shrink-0 border-b border-[#1e2330] flex items-center px-6 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="h-8 border-[#1e2330] bg-[#131924] text-[#94a3b8] hover:bg-[#1e2330] hover:text-[#f1f5f9]"
            >
              <Settings2 className="size-3.5 mr-1.5" /> Ajustes
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {jiraError && (
            <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {jiraError}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!selectedKey && !plan && !isLoading && !showSample && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Sparkles className="size-12 mb-4 text-[#1e2330]" />
              <h3 className="text-lg font-medium text-[#94a3b8]">Listo para generar</h3>
              <p className="text-sm text-[#475569] max-w-sm mt-2">
                Selecciona una tarea de la lista y haz clic en "Generar plan" para obtener los pasos técnicos y estimación de horas.
              </p>
              <button
                type="button"
                onClick={() => setShowSample(true)}
                className="mt-4 text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
              >
                ○ ver cómo se ve un plan generado
              </button>
            </div>
          )}

          {showSample && !selectedKey && (
            <div className="animate-in fade-in">
              <PlanOutput plan={SAMPLE_PLAN} isLoading={false} />
            </div>
          )}

          {selectedKey && !plan && !isLoading && previewData && (
            <div className="animate-in fade-in">
              <IssuePreview data={previewData} />
            </div>
          )}

          {isLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
                <RefreshCw className="size-10 animate-spin text-blue-500 relative z-10" />
              </div>
              <h3 className="mt-6 text-sm font-medium text-[#f1f5f9] animate-pulse">Analizando documentación y generando plan...</h3>
              <p className="text-xs text-[#475569] mt-2">Este proceso puede tardar unos segundos.</p>
            </div>
          )}

          {plan && !isLoading && (
            <div className="animate-in fade-in slide-in-from-bottom-4">
              <PlanOutput plan={plan} isLoading={isLoading} />
            </div>
          )}
        </div>
      </div>

      <PlannerSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => setSettingsVersion((v) => v + 1)}
      />

      <GeneratePlanDialog
        open={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        onConfirm={handleGenerate}
        onOpenSettings={() => setSettingsOpen(true)}
        repos={repos}
        isLoading={isLoading}
      />
    </div>
  )
}
