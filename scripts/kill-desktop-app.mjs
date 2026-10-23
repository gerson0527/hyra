import { execFileSync } from 'node:child_process'

if (process.platform === 'win32') {
  try {
    execFileSync('taskkill', ['/F', '/IM', 'Hyra Docker Manager.exe', '/T'], { stdio: 'ignore' })
  } catch {
    // no estaba en ejecución
  }
}
