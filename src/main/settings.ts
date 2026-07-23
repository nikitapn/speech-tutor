import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface AppSettings {
  ollamaHost: string
}

const DEFAULT_SETTINGS: AppSettings = {
  ollamaHost: 'http://localhost:11434'
}

let cached: AppSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function loadSettings(): AppSettings {
  if (cached) return cached

  let loaded: AppSettings = { ...DEFAULT_SETTINGS }
  if (existsSync(settingsPath())) {
    try {
      const raw = JSON.parse(readFileSync(settingsPath(), 'utf-8')) as Partial<AppSettings>
      loaded = { ...DEFAULT_SETTINGS, ...raw }
    } catch {
      // fall through to defaults
    }
  }

  cached = loaded
  return loaded
}

export function getOllamaHost(): string {
  return loadSettings().ollamaHost
}

export function setOllamaHost(host: string): void {
  const normalized = normalizeHost(host)
  const settings = loadSettings()
  settings.ollamaHost = normalized
  cached = settings
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
}

export function normalizeHost(host: string): string {
  let normalized = host.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`
  }
  return normalized
}
