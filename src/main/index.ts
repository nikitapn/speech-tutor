import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { getHistory, getOrCreateActiveSession, getStats, initDb, saveTurn } from './db'
import { transcribeAndScore } from './ollama'
import type { SubmitTurnResult } from '../shared/types'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (details) => {
      console.log(`[renderer:${details.level}] ${details.message}`)
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('turn:submit', async (_event, audioArrayBuffer: ArrayBuffer): Promise<SubmitTurnResult> => {
    const audioBuffer = Buffer.from(audioArrayBuffer)
    const feedback = await transcribeAndScore(audioBuffer)
    const sessionId = getOrCreateActiveSession('en')
    const turn = saveTurn(sessionId, feedback)
    return { turn, feedback }
  })

  ipcMain.handle('history:get', async (_event, limit?: number) => {
    return getHistory(limit)
  })

  ipcMain.handle('stats:get', async () => {
    return getStats()
  })
}

app.whenReady().then(() => {
  initDb()
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
