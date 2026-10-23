'use client'

import { useActionState, useEffect, useState } from 'react'
import { Boxes, Loader2, Lock, Mail } from 'lucide-react'
import { loginAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { loadSavedLogin, persistSavedLogin } from '@/lib/saved-login'
import { cn } from '@/lib/utils'

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(loginAction, {})
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    const saved = loadSavedLogin()
    if (!saved) return
    setEmail(saved.email)
    setPassword(saved.password)
    setRemember(true)
  }, [])

  function handleRemember() {
    persistSavedLogin({ remember, email, password })
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Boxes className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">Hyra Docker Manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">Inicia sesión para continuar</p>
      </div>

      <form action={formAction} onSubmit={handleRemember} className="space-y-4">
        <input type="hidden" name="from" value={redirectTo} />

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
            Correo
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@tiresia.com.co"
              className={cn(
                'h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none',
                'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={cn(
                'h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none',
                'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={pending}
            className="size-4 rounded border-border bg-background accent-primary"
          />
          Recordar correo y contraseña
        </label>

        {state.error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Ingresando...
            </>
          ) : (
            'Ingresar'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        Plataforma interna · idp.tiresia.com.co
        {remember && (
          <>
            <br />
            Los datos se guardan solo en este equipo.
          </>
        )}
      </p>
    </div>
  )
}
