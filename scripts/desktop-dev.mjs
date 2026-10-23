import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(here, '..')

function run(cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
  return child
}

const portProc = spawn(process.execPath, ['scripts/find-free-port.mjs'], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'inherit'],
})

if (!portProc.stdout) {
  console.error('[hyra] No se pudo iniciar el detector de puertos.')
  process.exit(1)
}

let port = null
let buffered = ''

portProc.stdout.on('data', (chunk) => {
  buffered += chunk.toString()
  const match = buffered.match(/^(\d{4,5})\s*$/)
  if (match) {
    port = match[1]
    buffered = ''
    portProc.kill()
    startDev(port)
  }
})

portProc.on('exit', (code) => {
  if (!port && code !== 0) process.exit(code ?? 1)
})

function startDev(devPort) {
  console.log(`[hyra] Iniciando Next.js en puerto ${devPort}`)

  const next = run('npx.cmd', ['next', 'dev', '-p', devPort], { shell: true })
  const wait = run('npx.cmd', ['wait-on', `http://127.0.0.1:${devPort}`], { shell: true })

  if (next.stdout) next.stdout.pipe(process.stdout)
  if (next.stderr) next.stderr.pipe(process.stderr)
  if (wait.stdout) wait.stdout.pipe(process.stdout)
  if (wait.stderr) wait.stderr.pipe(process.stderr)

  wait.on('exit', (code) => {
    if (code !== 0) return
    const electron = run('npx.cmd', ['electron', '.'], {
      shell: true,
      env: { ...process.env, HYRA_PORT: devPort },
    })
    if (electron.stdout) electron.stdout.pipe(process.stdout)
    if (electron.stderr) electron.stderr.pipe(process.stderr)

    process.on('SIGINT', () => {
      next.kill('SIGINT')
      wait.kill('SIGINT')
      electron.kill('SIGINT')
    })
    process.on('SIGTERM', () => {
      next.kill('SIGTERM')
      wait.kill('SIGTERM')
      electron.kill('SIGTERM')
    })
  })

  process.on('SIGINT', () => {
    next.kill('SIGINT')
    wait.kill('SIGINT')
  })
  process.on('SIGTERM', () => {
    next.kill('SIGTERM')
    wait.kill('SIGTERM')
  })
}