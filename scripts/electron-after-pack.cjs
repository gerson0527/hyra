const fs = require('node:fs/promises')
const path = require('node:path')

/** electron-builder omite node_modules al copiar extraResources; lo añadimos aquí. */
exports.default = async function afterPack(context) {
  const projectDir = context.packager.projectDir
  const appResources = path.join(context.appOutDir, 'resources', 'app')
  const srcModules = path.join(projectDir, '.next', 'standalone', 'node_modules')
  const destModules = path.join(appResources, 'node_modules')

  await fs.rm(destModules, { recursive: true, force: true })
  await fs.cp(srcModules, destModules, { recursive: true })
  console.log('afterPack: node_modules copiado a resources/app')
}
