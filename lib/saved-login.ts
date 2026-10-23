const STORAGE_KEY = 'hyra_saved_login'

export type SavedLogin = {
  remember: boolean
  email: string
  password: string
}

export function loadSavedLogin(): SavedLogin | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const data = JSON.parse(raw) as Partial<SavedLogin>
    if (!data.remember || !data.email) return null

    return {
      remember: true,
      email: data.email,
      password: typeof data.password === 'string' ? data.password : '',
    }
  } catch {
    return null
  }
}

export function persistSavedLogin(data: SavedLogin): void {
  if (typeof window === 'undefined') return

  if (data.remember) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        remember: true,
        email: data.email,
        password: data.password,
      }),
    )
    return
  }

  localStorage.removeItem(STORAGE_KEY)
}
