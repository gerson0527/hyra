export type SshPreset = {
  id: string
  label: string
  container: string
  commands: string[]
}

const STORAGE_KEY = 'hyra_ssh_presets'

const ERP_COMMANDS = [
  'pkill -f /var/wsexternal || true',
  'cd /var/wsexternal && perl launch.pl',
  'cd /var/wsexternal_http && perl launch.pl',
  'gService restart || true',
]

const POS_COMMANDS = [
  'sh /usr/bin/permisos.sh',
  'service apache2 restart',
  'sieadmin restart',
]

const SUCURSAL_COMMANDS = ['sh /usr/bin/permisos.sh', 'gService restart']

/** Contenedores conocidos en instancias Hyra (UNIMAIAPOS-1080-DEV y similares). */
export const KNOWN_DOCKER_CONTAINERS = [
  'apibiometricos',
  'apirappi',
  'apizubale',
  'erpunidrogas',
  'erpdropopular',
  'posunidrogas',
  'sucursalunidrogas',
  'sucursaldropopular',
  'sucdroDIP0001',
  'sucdroALN0276',
  'sucdroALN0271',
  'sucuniING0102',
  'sucuniALE0076',
  'tupedidoenlinea',
] as const

export const DEFAULT_SSH_PRESETS: SshPreset[] = [
  {
    id: 'erp',
    label: 'ERP',
    container: 'erpunidrogas',
    commands: ERP_COMMANDS,
  },
  {
    id: 'erpdropopular',
    label: 'ERP Dropopular',
    container: 'erpdropopular',
    commands: ERP_COMMANDS,
  },
  {
    id: 'pos',
    label: 'POS',
    container: 'posunidrogas',
    commands: POS_COMMANDS,
  },
  {
    id: 'sucursalunidrogas',
    label: 'SucursalUnidrogas',
    container: 'sucursalunidrogas',
    commands: SUCURSAL_COMMANDS,
  },
  {
    id: 'sucursaldropopular',
    label: 'SucursalDropopular',
    container: 'sucursaldropopular',
    commands: SUCURSAL_COMMANDS,
  },
  {
    id: 'ale0076',
    label: 'ALE0076',
    container: 'sucuniALE0076',
    commands: POS_COMMANDS,
  },
  {
    id: 'ing0102',
    label: 'ING0102',
    container: 'sucuniING0102',
    commands: POS_COMMANDS,
  },
  {
    id: 'sucdro_dip0001',
    label: 'sucdroDIP0001',
    container: 'sucdroDIP0001',
    commands: POS_COMMANDS,
  },
  {
    id: 'sucdro_aln0276',
    label: 'sucdroALN0276',
    container: 'sucdroALN0276',
    commands: POS_COMMANDS,
  },
  {
    id: 'sucdro_aln0271',
    label: 'sucdroALN0271',
    container: 'sucdroALN0271',
    commands: POS_COMMANDS,
  },
  {
    id: 'tupedidoenlinea',
    label: 'TuPedidoEnLinea',
    container: 'tupedidoenlinea',
    commands: SUCURSAL_COMMANDS,
  },
  {
    id: 'apibiometricos',
    label: 'API Biométricos',
    container: 'apibiometricos',
    commands: ['pm2 restart all || true'],
  },
  {
    id: 'apirappi',
    label: 'API Rappi',
    container: 'apirappi',
    commands: ['pm2 restart all || true'],
  },
  {
    id: 'apizubale',
    label: 'API Zubale',
    container: 'apizubale',
    commands: ['pm2 restart all || true'],
  },
  {
    id: 'docker-ps',
    label: 'docker ps',
    container: '',
    commands: ['docker ps'],
  },
  {
    id: 'docker-ps-a',
    label: 'docker ps -a',
    container: '',
    commands: ['docker ps -a'],
  },
  {
    id: 'apache-restart',
    label: 'Reiniciar Apache',
    container: '',
    commands: ['service apache2 restart'],
  },
]

export function loadSshPresets(): SshPreset[] {
  if (typeof window === 'undefined') return DEFAULT_SSH_PRESETS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SSH_PRESETS
    const parsed = JSON.parse(raw) as SshPreset[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SSH_PRESETS
    return parsed
  } catch {
    return DEFAULT_SSH_PRESETS
  }
}

export function resetSshPresets(): SshPreset[] {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SSH_PRESETS))
  }
  return DEFAULT_SSH_PRESETS
}

export function saveSshPresets(presets: SshPreset[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export type DockerExecStyle = 'default' | 'preset'

function shellQuoteSingle(inner: string): string {
  return inner.trim().replace(/'/g, `'\"'\"'`)
}

function shellGlob(prefix: string): string {
  if (!prefix) return '*'
  let escaped = ''
  for (const ch of prefix) {
    if ('*?[\\'.includes(ch)) escaped += `\\${ch}`
    else escaped += ch
  }
  return `${escaped}*`
}

function joinCwd(cwd: string, rel: string): string {
  if (!rel) return cwd || '/'
  if (rel.startsWith('/')) return rel
  const base = (cwd || '/').replace(/\/$/, '')
  if (base === '' || base === '~') {
    return base === '~' ? `~/${rel}` : `/${rel}`
  }
  return `${base}/${rel}`
}

function cdTarget(cwd: string): string {
  if (cwd === '~') {
    return 'cd ~ 2>/dev/null || cd "${HOME:-/}" 2>/dev/null || cd /'
  }
  const quoted = `'${cwd.replace(/'/g, `'\"'\"'`)}'`
  return `cd ${quoted} 2>/dev/null || cd /`
}

function runB64Bash(script: string, container?: string | null, useSudo = false): string {
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(script, 'utf-8').toString('base64')
      : btoa(unescape(encodeURIComponent(script)))
  const runner = `echo ${b64} | base64 -d | bash`
  const inner = shellQuoteSingle(runner)
  if (container?.trim()) {
    const prefix = useSudo ? 'sudo ' : ''
    return `${prefix}docker exec ${quoteDockerName(container)} bash -lc '${inner}'`
  }
  const host = `bash -lc '${inner}'`
  return useSudo ? `sudo ${host}` : host
}

/** Lista archivos/rutas o comandos que coinciden con prefix (autocompletado Tab). */
export function buildCompletionCommand(
  cwd: string,
  prefix: string,
  options?: { container?: string | null; useSudo?: boolean },
): string {
  let workCwd = cwd || '/'
  let workPrefix = prefix || ''
  if (workPrefix.includes('/')) {
    const idx = workPrefix.lastIndexOf('/')
    const dirPart = workPrefix.slice(0, idx)
    workPrefix = workPrefix.slice(idx + 1)
    workCwd = joinCwd(workCwd, dirPart)
  }

  const globPat = shellGlob(workPrefix)
  const quotedPrefix = workPrefix.replace(/'/g, `'\"'\"'`)
  const script = `${cdTarget(workCwd)}
shopt -s nullglob 2>/dev/null || true
prefix='${quotedPrefix}'
if [ -n "$prefix" ] && [[ "$prefix" != */* ]]; then
  compgen -ab -- "$prefix" 2>/dev/null
fi
for f in ${globPat}; do
  [ -e "$f" ] || continue
  if [ -d "$f" ]; then echo "$f/"; else echo "$f"; fi
done
`
  return runB64Bash(script, options?.container, options?.useSudo ?? false)
}

export function quoteDockerName(name: string): string {
  const trimmed = name.trim()
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) return trimmed
  return `'${shellQuoteSingle(trimmed)}'`
}

/** Como docker_manager: docker start nombre (idempotente si ya corre). */
export function wrapPresetDockerStart(container: string, useSudo = false): string {
  const prefix = useSudo ? 'sudo ' : ''
  return `${prefix}docker start ${quoteDockerName(container)}`
}

/** Preset/host: sudo bash -lc solo cuando hace falta (evitar sudo -i con Docker). */
export function wrapPresetHostCommand(cmd: string, useSudo = false): string {
  const inner = shellQuoteSingle(cmd)
  if (useSudo) return `sudo bash -lc '${inner}'`
  return `bash -lc '${inner}'`
}

function withGServiceDelay(cmd: string): string {
  const trimmed = cmd.trim()
  if (trimmed.includes('gService') && !trimmed.includes('sleep')) {
    return `${trimmed}; sleep 4`
  }
  return trimmed
}

/** @deprecated Usar wrapPresetDockerStart */
export function wrapPresetEnsureContainerRunning(container: string, useSudo = false): string {
  return wrapPresetDockerStart(container, useSudo)
}

export function wrapContainerExec(
  container: string,
  cmd: string,
  useSudo = false,
  tty = false,
  style: DockerExecStyle = 'default',
): string {
  const inner = shellQuoteSingle(withGServiceDelay(cmd))
  const name = quoteDockerName(container)

  if (style === 'preset') {
    const prefix = useSudo ? 'sudo ' : ''
    return `${prefix}docker exec ${name} bash -lc '${inner}'`
  }

  const prefix = useSudo ? 'sudo ' : ''
  const ttyFlag = tty ? '-t ' : ''
  return `${prefix}docker exec ${ttyFlag}${name} bash -lc '${inner}'`
}

export function buildPresetCommands(
  preset: SshPreset,
  useSudo = false,
): { container: string | null; commands: string[] } {
  const container = preset.container?.trim() || null
  const raw = preset.commands.map((cmd) => cmd.trim()).filter(Boolean)

  if (!container) {
    return { container, commands: raw.map((cmd) => wrapPresetHostCommand(cmd, useSudo)) }
  }

  const commands = [wrapPresetDockerStart(container, useSudo)]
  for (const cmd of raw) {
    commands.push(wrapContainerExec(container, cmd, useSudo, false, 'preset'))
  }
  return { container, commands }
}
