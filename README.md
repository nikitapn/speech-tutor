# Speech Tutor

A local speech-practice tutor powered by [Gemma](https://ai.google.dev/gemma) (via [Ollama](https://ollama.com)). Practice free-form speaking with instant grammar, vocabulary, and accent feedback, or take a full mock IELTS Speaking exam (Parts 1–3) scored against the real IELTS band descriptors. Everything runs locally — your audio only ever goes to your own Ollama server.

## Prerequisites

- **Node.js 20 or newer** and npm
- **[Ollama](https://ollama.com)**, running locally (or reachable on your network), with the `gemma4:e4b` model pulled:
  ```
  ollama pull gemma4:e4b
  ```
- A working microphone

## Getting started (development)

These steps are the same on Windows and Linux — run them in whatever terminal you use (PowerShell, cmd, or a Unix shell):

```
git clone <repo-url>
cd speech-tutor
npm install
npm run dev
```

`npm install` also compiles `better-sqlite3` (a native module) for Electron's Node ABI and downloads Electron's own runtime binary. If npm prompts about approving install scripts, that's expected the first time — approve `electron`, `better-sqlite3`, and `esbuild`.

## Building a distributable app

```
npm run dist:linux   # → dist/Speech Tutor-<version>.AppImage
npm run dist:win     # → dist/Speech Tutor <version>.exe
npm run dist         # builds for whichever platform you're currently on
```

Both platforms produce a single portable executable, no installation step:

- **Linux**: an [AppImage](https://appimage.org/) - `chmod +x` it and run it directly.
- **Windows**: a portable `.exe` - just run it; nothing gets installed to Program Files.

Both of the above were built and smoke-tested from a Linux machine (electron-builder can cross-build Windows executables via Wine, and `better-sqlite3` ships prebuilt binaries for both platforms), but if you run into native-module issues, building natively on the target OS is the more standard, reliable path.

## Releases (GitHub Actions)

- **`.github/workflows/ci.yml`** runs on every push/PR to `main`: installs, typechecks, and builds on both Ubuntu and Windows runners, so cross-platform breakage shows up before it ships.
- **`.github/workflows/release.yml`** runs when you push a tag matching `v*.*.*` (e.g. `v0.1.0`, matching the `version` in `package.json`). It builds the portable Linux and Windows executables and publishes them as assets on a GitHub Release for that tag, via `electron-builder --publish always` and the repo's automatic `GITHUB_TOKEN`.

To cut a release:

```
git tag v0.1.0
git push origin v0.1.0
```

## Configuration

Open the **Settings** tab in the running app to:

- Pick which microphone input to record from
- Point the app at a different Ollama host/port (defaults to `http://localhost:11434`) — useful if Ollama runs on another machine or a non-default port. Use **Test connection** to confirm the server is reachable and that `gemma4:e4b` is available.

## Notes

- Recordings are capped at 30 seconds per turn (Ollama silently truncates longer audio rather than erroring). The Part 2 long-turn answer works around this by recording in manually-ended chunks that get transcribed and stitched back together.
- All practice/exam history is stored locally in SQLite, under Electron's per-OS user data directory - nothing is uploaded anywhere.
