import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { INSTANCE_COOKIE } from '@/lib/entorno'

const PUBLIC_PATHS = ['/login']
const INSTANCE_SELECTION_PATH = '/instancias'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token) : null
  const selectedInstance = request.cookies.get(INSTANCE_COOKIE)?.value

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    if (session) {
      const target = selectedInstance ? '/' : INSTANCE_SELECTION_PATH
      return NextResponse.redirect(new URL(target, request.url))
    }
    return NextResponse.next()
  }

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('from', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === INSTANCE_SELECTION_PATH) {
    return NextResponse.next()
  }

  if (!selectedInstance && pathname !== INSTANCE_SELECTION_PATH) {
    return NextResponse.redirect(new URL(INSTANCE_SELECTION_PATH, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:png|svg|ico|jpg|jpeg|webp)$).*)',
  ],
}
