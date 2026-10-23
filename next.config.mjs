import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingExcludes: {
    '*': ['./release/**', './release-build/**', './.git/**'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['127.0.0.1'],
  // ssh2 usa módulos nativos de Node; no debe empaquetarse con Turbopack.
  serverExternalPackages: ['ssh2', 'ppk-to-openssh', 'mysql2'],
  turbopack: {
    root: projectRoot,
  },
}

export default nextConfig
