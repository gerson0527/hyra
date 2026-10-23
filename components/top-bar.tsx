"use client"

import Link from "next/link"
import { Boxes, LogOut, ArrowLeftRight } from "lucide-react"
import { logoutAction } from "@/app/actions/auth"
import { Button, buttonVariants } from "@/components/ui/button"
import { getInitials, type SessionUser } from "@/lib/user"
import { cn } from "@/lib/utils"

export function TopBar({
  user,
  managedEnvName,
}: {
  user: SessionUser
  managedEnvName: string
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-sidebar px-4">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Boxes className="size-4" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold">Hyra Docker Manager</p>
          <p className="truncate text-[11px] text-muted-foreground">{managedEnvName}</p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/instancias"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden sm:inline-flex")}
        >
          <ArrowLeftRight />
          Cambiar instancia
        </Link>
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
          <div className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
            {getInitials(user.name)}
          </div>
          <span className="hidden max-w-[140px] truncate text-xs text-muted-foreground sm:inline">
            {user.email.split("@")[0]}
          </span>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Cerrar sesión">
            <LogOut />
          </Button>
        </form>
      </div>
    </header>
  )
}
