import { getShell, subscribeShell, subscribeShellClose } from '@/lib/ssh-shell-store'
import { resolveSshSessionKey } from '@/lib/ssh-session'
import { resolveShellStoreKey } from '@/lib/ssh-shell'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sseEncode(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export async function GET(request: Request) {
  const sessionKey = await resolveSshSessionKey()
  if (!sessionKey) {
    return new Response(sseEncode({ type: 'error', message: 'Sesión no válida.' }), {
      status: 401,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const shellId = new URL(request.url).searchParams.get('shellId')?.trim() || 'general'
  const storeKey = resolveShellStoreKey(sessionKey.key, shellId)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEncode(payload)))
      }

      if (!getShell(storeKey)) {
        send({ type: 'error', message: 'Shell no iniciada.' })
        controller.close()
        return
      }

      send({ type: 'ready' })

      let unsubscribe = () => {}
      let unsubscribeClose = () => {}

      function abort() {
        unsubscribe()
        unsubscribeClose()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      unsubscribe = subscribeShell(storeKey, (data) => {
        send({ type: 'data', data })
      })

      unsubscribeClose = subscribeShellClose(storeKey, () => {
        send({ type: 'close' })
        abort()
      })

      request.signal.addEventListener('abort', abort)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
