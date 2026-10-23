import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const standalone = path.join(root, '.next', 'standalone')

async function copyDir(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.cp(src, dest, { recursive: true })
}

async function main() {
  const serverJs = path.join(standalone, 'server.js')
  try {
    await fs.access(serverJs)
  } catch {
    console.error('No se encontró .next/standalone/server.js. ¿Ejecutaste "next build" con output: "standalone"?')
    process.exit(1)
  }

  await copyDir(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'))
  await copyDir(path.join(root, 'public'), path.join(standalone, 'public'))

  for (const folder of ['release', 'release-build']) {
    await fs.rm(path.join(standalone, folder), { recursive: true, force: true })
  }

  console.log('Desktop bundle listo en .next/standalone')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
