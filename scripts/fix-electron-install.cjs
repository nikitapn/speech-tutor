#!/usr/bin/env node
// Electron >=43 no longer registers its own npm postinstall lifecycle hook, so downloading/
// extracting the platform binary has to be triggered explicitly - this script does that.
// It also guards against a real bug hit on some Electron/Node combos where the old JS-based
// unzip step (yauzl/fd-slicer) silently truncates output with no error (confirmed: a partially
// written file, process exits 0, nothing logged). If electron's own installer still leaves the
// binary missing/broken, fall back to extracting the cached zip with the system `unzip` binary.
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { execFileSync } = require('node:child_process')

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron')
if (!fs.existsSync(electronDir)) process.exit(0)

const { version } = require(path.join(electronDir, 'package.json'))

function getPlatformPath() {
  switch (os.platform()) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'win32':
      return 'electron.exe'
    default:
      return 'electron'
  }
}

const platformPath = getPlatformPath()
const distDir = path.join(electronDir, 'dist')
const binaryPath = path.join(distDir, platformPath)
const pathTxt = path.join(electronDir, 'path.txt')

function isInstalled() {
  try {
    const distVersion = fs.readFileSync(path.join(distDir, 'version'), 'utf-8').replace(/^v/, '')
    if (distVersion !== version) return false
    if (fs.readFileSync(pathTxt, 'utf-8') !== platformPath) return false
    return fs.existsSync(binaryPath)
  } catch {
    return false
  }
}

async function main() {
  if (isInstalled()) return

  console.log("[fix-electron-install] running electron's own installer...")
  try {
    execFileSync(process.execPath, [path.join(electronDir, 'install.js')], { stdio: 'inherit' })
  } catch (e) {
    console.warn('[fix-electron-install] install.js exited with an error, checking result anyway:', e.message)
  }

  if (isInstalled()) return

  console.log('[fix-electron-install] binary still missing/incomplete, falling back to manual extraction via system unzip...')
  const { downloadArtifact } = await import('@electron/get')
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: os.platform(),
    arch: process.env.npm_config_arch || os.arch()
  })

  fs.rmSync(distDir, { recursive: true, force: true })
  fs.mkdirSync(distDir, { recursive: true })
  execFileSync('unzip', ['-q', '-o', zipPath, '-d', distDir], { stdio: 'inherit' })
  fs.writeFileSync(pathTxt, platformPath)

  if (!isInstalled()) {
    throw new Error(`extraction finished but ${binaryPath} is still missing/invalid`)
  }
  console.log('[fix-electron-install] repaired successfully via fallback path.')
}

main().catch((err) => {
  console.error('[fix-electron-install] failed:', err)
  process.exit(1)
})
