export interface PlannerRepo {
  id: string
  name: string
  url: string
  branch: string
  token?: string
  localPath?: string
}

export interface PlannerSettings {
  jiraBaseUrl: string
  jiraEmail: string
  jiraApiToken: string
  anthropicApiKey: string
  openaiApiKey: string
  geminiApiKey: string
  minimaxApiKey: string
  repos: PlannerRepo[]
}

const STORAGE_KEY = "hyra_planner_settings"

export const STARTER_REPOS: Omit<PlannerRepo, "id">[] = [
  {
    name: "unidrogas · ERP",
    url: "",
    branch: "main",
    localPath: "C:\\Users\\Tiresia\\Documents\\Gerson\\repositoriosGIT\\unidrogas\\erp",
    token: "",
  },
  {
    name: "unidrogas · POS",
    url: "",
    branch: "main",
    localPath: "C:\\Users\\Tiresia\\Documents\\Gerson\\repositoriosGIT\\unidrogas\\pos",
    token: "",
  },
  {
    name: "api_rappi",
    url: "",
    branch: "main",
    localPath: "C:\\Users\\Tiresia\\Documents\\Gerson\\repositoriosGIT\\api_rappi",
    token: "",
  },
  {
    name: "api_zubale",
    url: "",
    branch: "main",
    localPath: "C:\\Users\\Tiresia\\Documents\\Gerson\\repositoriosGIT\\api_zubale",
    token: "",
  },
  {
    name: "documentacion",
    url: "",
    branch: "main",
    localPath: "C:\\Users\\Tiresia\\Documents\\Gerson\\repositoriosGIT\\documentacion",
    token: "",
  },
  {
    name: "generico",
    url: "",
    branch: "main",
    localPath: "C:\\Users\\Tiresia\\Documents\\Gerson\\repositoriosGIT\\generico",
    token: "",
  },
  {
    name: "maiaweb",
    url: "",
    branch: "main",
    localPath: "C:\\Users\\Tiresia\\Documents\\Gerson\\repositoriosGIT\\maiaweb",
    token: "",
  },
  {
    name: "tupedidoenlinea",
    url: "",
    branch: "main",
    localPath: "C:\\Users\\Tiresia\\Documents\\Gerson\\repositoriosGIT\\tupedidoenlinea",
    token: "",
  },
]

function withStarterRepos(repos: PlannerRepo[]): PlannerRepo[] {
  if (repos.length > 0) return repos
  return STARTER_REPOS.map((r) => ({ ...r, id: crypto.randomUUID() }))
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  anthropicApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  minimaxApiKey: "",
  repos: [],
}

export function loadPlannerSettings(): PlannerSettings {
  if (typeof window === "undefined") return DEFAULT_PLANNER_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_PLANNER_SETTINGS, repos: withStarterRepos([]) }
    }
    const parsed = JSON.parse(raw) as PlannerSettings
    const merged = { ...DEFAULT_PLANNER_SETTINGS, ...parsed }
    merged.repos = withStarterRepos(merged.repos ?? [])
    return merged
  } catch {
    return DEFAULT_PLANNER_SETTINGS
  }
}

export function savePlannerSettings(settings: PlannerSettings): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}
