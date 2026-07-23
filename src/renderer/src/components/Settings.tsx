import { useCallback, useEffect, useState } from 'react'
import { getStoredDeviceId, setStoredDeviceId } from '../lib/audioDevices'

export default function Settings() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selected, setSelected] = useState(getStoredDeviceId())
  const [hasLabels, setHasLabels] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ollamaHost, setOllamaHostInput] = useState('')
  const [savedHost, setSavedHost] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const loadDevices = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices()
    const inputs = list.filter((d) => d.kind === 'audioinput')
    setDevices(inputs)
    setHasLabels(inputs.some((d) => d.label !== ''))
  }, [])

  useEffect(() => {
    loadDevices()
    navigator.mediaDevices.addEventListener('devicechange', loadDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
  }, [loadDevices])

  useEffect(() => {
    window.api.getOllamaHost().then((host) => {
      setOllamaHostInput(host)
      setSavedHost(host)
    })
  }, [])

  async function handleSaveHost(): Promise<void> {
    await window.api.setOllamaHost(ollamaHost)
    setSavedHost(ollamaHost)
    setConnectionStatus(null)
  }

  async function handleTestConnection(): Promise<void> {
    setTesting(true)
    setConnectionStatus(null)
    try {
      const result = await window.api.testOllamaConnection(ollamaHost)
      setConnectionStatus(result)
    } finally {
      setTesting(false)
    }
  }

  async function requestPermission(): Promise<void> {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      await loadDevices()
    } catch {
      setError('Could not access the microphone. Check your OS permissions and try again.')
    }
  }

  function handleSelect(deviceId: string): void {
    setSelected(deviceId)
    setStoredDeviceId(deviceId)
  }

  return (
    <div className="screen">
      <h1>Settings</h1>

      <section>
        <h2>Microphone</h2>

        {!hasLabels && (
          <button className="button-secondary" onClick={requestPermission}>
            Grant microphone access to list devices
          </button>
        )}

        {hasLabels && (
          <select
            className="device-select"
            value={selected}
            onChange={(e) => handleSelect(e.target.value)}
          >
            <option value="">System default</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId}
              </option>
            ))}
          </select>
        )}

        {error && <p className="error">{error}</p>}

        <p className="hint">
          Changes apply the next time you start a recording. If you plug in a headset, this list
          updates automatically - re-select it here.
        </p>
      </section>

      <section>
        <h2>Ollama server</h2>

        <input
          className="device-select"
          type="text"
          value={ollamaHost}
          onChange={(e) => setOllamaHostInput(e.target.value)}
          placeholder="http://localhost:11434"
        />

        <div className="ollama-host-actions">
          <button className="button-secondary" onClick={handleSaveHost} disabled={ollamaHost === savedHost}>
            Save
          </button>
          <button className="button-secondary" onClick={handleTestConnection} disabled={testing}>
            {testing ? 'Testing...' : 'Test connection'}
          </button>
        </div>

        {connectionStatus && (
          <p className={connectionStatus.ok ? 'hint' : 'error'}>{connectionStatus.message}</p>
        )}

        <p className="hint">
          Where the app looks for Ollama - change this if it's running on another machine or a
          non-default port. Takes effect immediately once saved.
        </p>
      </section>
    </div>
  )
}
