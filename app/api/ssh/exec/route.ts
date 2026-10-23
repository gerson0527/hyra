import { NextResponse } from 'next/server'
import { resolveSelectedEntorno, resolveSelectedEntornoId } from '@/lib/entorno-server'
import { prepareSshCommands } from '@/lib/ssh-exec'
import { getEntorno } from '@/lib/idp'
import { verifySessionPayload, SESSION_COOKIE } from '@/lib/auth'
import { cookies } from 'next/headers'
import { execOnClient } from '@/lib/ssh-server'
import { getSshSession, removeSshSession, resolveSshSessionKey } from '@/lib/ssh-session'

export const runtime = 'nodejs'

type ExecBody = {
  command?: string
  commands?: string[]
  container?: string | null
  prepared?: boolean
  presetDocker?: boolean
  entornoId?: string
  settings?: {
    useSudoDocker?: boolean
  }
}

export async function POST(request: Request) {
  const sessionKey = await resolveSshSessionKey()

  if (!sessionKey) {
    return NextResponse.json({ error: 'Sesión de usuario no válida.' }, { status: 401 })
  }

  let body: ExecBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  if (body.entornoId && body.entornoId !== sessionKey.entornoId) {
    return NextResponse.json({ error: 'La instancia seleccionada no coincide.' }, { status: 400 })
  }

  const session = getSshSession(sessionKey.key)
  if (!session || session.entornoId !== sessionKey.entornoId) {
    return NextResponse.json(
      {
        error: 'No hay conexión SSH activa. En General pulsa «Probar SSH» y espera SSH OK.',
      },
      { status: 409 },
    )
  }

  const commands: string[] = []
  if (body.command?.trim()) commands.push(body.command.trim())
  if (Array.isArray(body.commands)) {
    commands.push(...body.commands.map((c) => c.trim()).filter(Boolean))
  }

  if (commands.length === 0) {
    return NextResponse.json({ error: 'No hay comando para ejecutar.' }, { status: 400 })
  }

  const prepared = prepareSshCommands(commands, {
    container: body.container,
    useSudo: Boolean(body.settings?.useSudoDocker),
    presetDocker: Boolean(body.presetDocker),
    prepared: Boolean(body.prepared),
  })

  try {
    const chunks: string[] = []

    for (const cmd of prepared) {
      if (cmd === '__CLEAR__') {
        chunks.push('__CLEAR__')
        continue
      }
      const result = await execOnClient(session.client, cmd)
      const block = [result.stdout, result.stderr].filter(Boolean).join('\n').trimEnd()
      if (block) chunks.push(block)
      if (result.code !== 0 && !block) {
        chunks.push(`(código de salida ${result.code})`)
      }
      if (result.code !== 0 && /\bdocker start\b/.test(cmd)) {
        chunks.push('(preset detenido: no se pudo iniciar el contenedor)')
        break
      }
    }

    return NextResponse.json({
      output: chunks,
      host: session.host,
      username: session.username,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al ejecutar comando.'
    // Solo remover la sesión si el error es de conexión, no transitorio
    if (message.includes('connect') || message.includes('Not connected') || message.includes('timeout')) {
      removeSshSession(sessionKey.key)
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
