import { useCallback, useEffect, useState } from 'react'
import { getStoredDeviceId, setStoredDeviceId } from '../lib/audioDevices'

export default function Settings() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selected, setSelected] = useState(getStoredDeviceId())
  const [hasLabels, setHasLabels] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    </div>
  )
}
