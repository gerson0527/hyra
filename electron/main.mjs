import { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, Notification, nativeImage } from 'electron'
import { spawn, execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const PORT = process.env.HYRA_PORT ?? (isDev ? '3000' : '3847')

let mainWindow = null
let nextProcess = null
let tray = null
let isQuitting = false
let trayHintShown = false

function getTrayIcon() {
  const iconPath = path.join(__dirname, 'tray-icon.png')
  try {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) return img
  } catch { /* fallback */ }
  return nativeImage.createEmpty()
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('Hyra Docker Manager', message)
    })
    return
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function createTray() {
  if (tray) return
  const icon = getTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Hyra Docker Manager')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar',
      click: () => {
        if (!mainWindow) {
          createWindow().catch(() => {})
          return
        }
        mainWindow.show()
        mainWindow.focus()
      },
    },
    {
      label: 'Ocultar',
      click: () => {
        if (mainWindow) mainWindow.hide()
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)
  tray.on('click', toggleWindow)
  tray.on('double-click', toggleWindow)
}

function notifyMinimizedToTray() {
  if (trayHintShown) return
  trayHintShown = true
  try {
    const note = new Notification({
      title: 'Hyra Docker Manager',
      body: 'La aplicación sigue ejecutándose en la bandeja del sistema.',
    })
    note.show()
  } catch { /* notificaciones no disponibles */ }
}

function getAppRoot() {
  return isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'app')
}

function waitForServer(url, retries = 120) {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const check = () => {
      const request = http.get(url, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
          resolve()
          return
        }
        retry()
      })

      request.on('error', retry)
    }

    const retry = () => {
      attempts += 1
      if (attempts >= retries) {
        reject(new Error(`No se pudo conectar al servidor en ${url}`))
        return
      }
      setTimeout(check, 500)
    }

    check()
  })
}

function startNextServer() {
  const appRoot = getAppRoot()
  const serverEntry = path.join(appRoot, 'server.js')

  if (!fsSync.existsSync(serverEntry)) {
    throw new Error(`No se encontró el servidor en ${serverEntry}`)
  }

  nextProcess = spawn(
    process.execPath,
    [serverEntry],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        PORT,
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: 'inherit',
    },
  )

  nextProcess.on('error', (error) => {
    console.error('Error al iniciar Next.js:', error)
  })

  nextProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null && mainWindow === null) {
      console.error(`Next.js terminó con código ${code}${signal ? ` (${signal})` : ''}`)
    }
  })
}


async function createWindow() {
  const url = `http://127.0.0.1:${PORT}`

  if (!isDev) {
    startNextServer()
  }

  await waitForServer(url)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Hyra Docker Manager',
    icon: getTrayIcon(),
    autoHideMenuBar: true,
    show: false,
    fullscreen: false,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.setFullScreen(false)
    mainWindow.maximize()
    mainWindow.show()
  })

  await mainWindow.loadURL(url)

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith('http')) {
      shell.openExternal(targetUrl)
    }
    return { action: 'deny' }
  })

  // Minimizar a la bandeja en lugar de cerrar
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      notifyMinimizedToTray()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function formatLocalSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const WINDOWS_HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts'

function registerHostsHandlers() {
  ipcMain.handle('hyra:read-hosts', async () => {
    const hostsPath = process.env.HYRA_HOSTS_PATH?.trim() || WINDOWS_HOSTS_PATH
    const content = await fs.readFile(hostsPath, 'utf-8')
    return { path: hostsPath, content }
  })

  ipcMain.handle('hyra:open-hosts-file', async () => {
    const hostsPath = process.env.HYRA_HOSTS_PATH?.trim() || WINDOWS_HOSTS_PATH
    const err = await shell.openPath(hostsPath)
    if (err) return { ok: false, error: err }
    return { ok: true }
  })

  ipcMain.handle('hyra:write-hosts', async (_event, content) => {
    const hostsPath = process.env.HYRA_HOSTS_PATH?.trim() || WINDOWS_HOSTS_PATH
    const text = String(content ?? '')

    try {
      await fs.writeFile(hostsPath, text, 'utf-8')
      return { ok: true, elevated: false }
    } catch (directError) {
      if (process.platform !== 'win32') {
        return {
          ok: false,
          error: directError instanceof Error ? directError.message : String(directError),
        }
      }

      try {
        await writeHostsElevatedWindows(hostsPath, text)
        return { ok: true, elevated: true }
      } catch (elevatedError) {
        const msg = elevatedError instanceof Error ? elevatedError.message : String(elevatedError)
        const direct = directError instanceof Error ? directError.message : String(directError)
        return {
          ok: false,
          error: `${msg}\n(${direct})`,
        }
      }
    }
  })
}

function writeHostsElevatedWindows(hostsPath, content) {
  const tmpPath = path.join(app.getPath('temp'), `hyra-hosts-${Date.now()}.txt`)
  return fs.writeFile(tmpPath, content, 'utf-8').then(
    () =>
      new Promise((resolve, reject) => {
        const psScript = [
          `$src = '${tmpPath.replace(/'/g, "''")}'`,
          `$dst = '${hostsPath.replace(/'/g, "''")}'`,
          'Copy-Item -LiteralPath $src -Destination $dst -Force',
        ].join('; ')

        const args = [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','${psScript.replace(/'/g, "''")}'`,
        ]

        execFile('powershell.exe', args, { windowsHide: true }, (error, _stdout, stderr) => {
          fs.unlink(tmpPath).catch(() => {})
          if (error) {
            reject(new Error(stderr?.trim() || error.message || 'Escritura cancelada o sin permisos'))
            return
          }
          if (!fsSync.existsSync(hostsPath)) {
            reject(new Error('No se pudo verificar el archivo hosts tras la elevación'))
            return
          }
          resolve()
        })
      }),
  )
}

function registerLocalFsHandlers() {
  ipcMain.handle('hyra:local-documents', () => app.getPath('documents'))

  ipcMain.handle('hyra:default-local-path', () => {
    const custom = process.env.HYRA_LOCAL_DEFAULT?.trim()
    if (custom) return custom
    return 'C:\\Users\\TIRESIA\\Documents\\Gerson\\repositoriosGIT'
  })

  ipcMain.handle('hyra:pick-local-folder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('hyra:list-local-dir', async (_event, dirPath) => {
    const normalized = path.resolve(String(dirPath || app.getPath('documents')))
    const stat = await fs.stat(normalized)
    if (!stat.isDirectory()) {
      throw new Error(`No es una carpeta: ${normalized}`)
    }

    const dirents = await fs.readdir(normalized, { withFileTypes: true })
    const entries = []

    for (const dirent of dirents.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))) {
      const fullPath = path.join(normalized, dirent.name)
      try {
        const info = await fs.stat(fullPath)
        const isDir = info.isDirectory()
        entries.push({
          name: dirent.name,
          type: isDir ? 'dir' : 'file',
          size: isDir ? '—' : formatLocalSize(info.size),
          modified: info.mtime.toLocaleString('es-CO', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
          fullPath,
          sizeBytes: isDir ? 0 : info.size,
          mtimeMs: info.mtimeMs,
        })
      } catch {
        // omitir entradas inaccesibles
      }
    }

    return { path: normalized, entries }
  })
}

function shutdown() {
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill()
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      createWindow().catch(() => {})
      return
    }
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  })
}

app.whenReady().then(() => {
  registerLocalFsHandlers()
  registerHostsHandlers()
  createTray()
  createWindow().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox(
      'Hyra Docker Manager',
      `No se pudo iniciar la aplicación.\n\n${message}\n\nReinstala la aplicación o contacta soporte.`,
    )
    app.quit()
  })
})

app.on('window-all-closed', () => {
  // No salir: quedarse en el System Tray. Solo salir desde "Salir" del menú
  // de la bandeja o en macOS con Cmd+Q (before-quit).
  if (process.platform === 'darwin' && isQuitting) {
    shutdown()
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('Hyra Docker Manager', message)
      app.quit()
    })
  }
})

app.on('before-quit', () => {
  isQuitting = true
  if (tray) {
    try { tray.destroy() } catch { /* ignore */ }
    tray = null
  }
  shutdown()
})
