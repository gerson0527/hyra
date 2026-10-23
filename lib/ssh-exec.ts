import { wrapContainerExec, wrapPresetDockerStart, wrapPresetHostCommand } from '@/lib/ssh-presets'

export function prepareSshCommands(
  commands: string[],
  options: {
    container?: string | null
    useSudo?: boolean
    presetDocker?: boolean
    prepared?: boolean
  },
): string[] {
  if (options.prepared) return commands

  const container = options.container?.trim() || null
  const useSudo = Boolean(options.useSudo)
  const presetDocker = Boolean(options.presetDocker)

  const prepared = commands.map((cmd) => {
    if (cmd === 'clear') return '__CLEAR__'
    if (
      cmd.includes('docker exec') ||
      cmd.includes('docker start') ||
      cmd.includes('docker inspect') ||
      cmd.startsWith('sudo -i')
    ) {
      return cmd
    }
    if (container) {
      return wrapContainerExec(container, cmd, useSudo, false, presetDocker ? 'preset' : 'default')
    }
    if (presetDocker && !cmd.startsWith('sudo ')) return wrapPresetHostCommand(cmd, useSudo)
    if (useSudo && !cmd.startsWith('sudo ')) return `sudo ${cmd}`
    return cmd
  })

  if (presetDocker && container) {
    return [wrapPresetDockerStart(container, useSudo), ...prepared]
  }

  return prepared
}
