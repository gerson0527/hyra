import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const parts = pkg.version.split('.').map(Number)
parts[2] = (parts[2] || 0) + 1
if (parts[2] > 99) { parts[2] = 0; parts[1] = (parts[1] || 0) + 1 }
if (parts[1] > 99) { parts[1] = 0; parts[0] = (parts[0] || 0) + 1 }
pkg.version = parts.join('.')

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`Versión bump: ${pkg.version}`)
