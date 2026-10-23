import { NextResponse } from 'next/server'

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Petición inválida.',
  401: 'Sesión de usuario no válida.',
  404: 'No encontrado.',
  409: 'Conflicto.',
  502: 'Error del servidor.',
}

export function apiError(error: unknown, status = 502): NextResponse {
  const message =
    error instanceof Error ? error.message :
    typeof error === 'string' ? error :
    STATUS_MESSAGES[status]
  return NextResponse.json({ error: message }, { status })
}
