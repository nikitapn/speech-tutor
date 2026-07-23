import { useCallback, useEffect, useRef, useState } from 'react'
import { getStoredDeviceId } from './audioDevices'
import { trimSilence } from './trimSilence'
import { encodeWav } from './wav'

export type RecorderStatus = 'idle' | 'recording' | 'processing'

const SAMPLE_RATE = 16000

// Ollama silently truncates audio beyond roughly this length instead of erroring (confirmed: an
// ~80s clip only transcribed its first ~30s, with no error and a suspiciously fast response) - the
// countdown gives a hard visual cue to wrap up, and stop() is auto-triggered at 0 as a backstop.
const RECORDING_LIMIT_SECONDS = 30

export function useRecorder(): {
  status: RecorderStatus
  secondsRemaining: number | null
  start: () => Promise<void>
  stop: () => Promise<ArrayBuffer>
  finish: () => void
} {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const silentGainRef = useRef<GainNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const isRecordingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const start = useCallback(async () => {
    // Chromium enables WebRTC-style echo cancellation/auto-gain/noise-suppression by default for
    // any getUserMedia audio track. Those are built for voice calls and actively distort the
    // signal (adaptive gain pumping, spectral suppression) - measurably so (confirmed: a captured
    // clip correlated only ~0.8 against a clean reference of identical source audio, with visibly
    // inflated RMS). Gemma's own audio guidance wants an unmodified waveform, so all three are
    // turned off here for the rawest possible capture.
    const deviceId = getStoredDeviceId()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    streamRef.current = stream
    chunksRef.current = []

    // Ollama can't decode the webm/opus MediaRecorder produces ("Failed to load image or
    // audio file") - capturing raw PCM here and writing a WAV header ourselves avoids depending
    // on any external transcoder (e.g. ffmpeg) being installed on the user's machine.
    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    audioContextRef.current = audioContext
    // AudioContexts can come up 'suspended' - by the time getUserMedia's permission prompt
    // resolves, the synchronous user-gesture window from the click has often already closed, so
    // this doesn't reliably auto-start. Without an explicit resume(), onaudioprocess never fires
    // and the "recording" is silently empty (no error, just a zero-length WAV with no duration).
    await audioContext.resume()

    const source = audioContext.createMediaStreamSource(stream)
    sourceRef.current = source

    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    processorRef.current = processor

    // ScriptProcessorNode only fires onaudioprocess while connected through to a live
    // destination, but connecting straight to audioContext.destination plays the mic back out the
    // speakers live while recording. Routing through a zero-gain node keeps the graph "pulled"
    // (satisfying that requirement) without any audible monitoring/feedback loop.
    const silentGain = audioContext.createGain()
    silentGain.gain.value = 0
    silentGainRef.current = silentGain

    source.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(audioContext.destination)

    isRecordingRef.current = true
    setStatus('recording')
    setSecondsRemaining(RECORDING_LIMIT_SECONDS)
    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => (prev !== null ? Math.max(0, prev - 1) : prev))
    }, 1000)
  }, [])

  const stop = useCallback(async (): Promise<ArrayBuffer> => {
    if (!isRecordingRef.current) {
      throw new Error('Not currently recording')
    }
    isRecordingRef.current = false

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setSecondsRemaining(null)

    processorRef.current?.disconnect()
    silentGainRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((track) => track.stop())

    const sampleRate = audioContextRef.current?.sampleRate ?? SAMPLE_RATE
    await audioContextRef.current?.close()

    setStatus('processing')

    const totalLength = chunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0)
    if (totalLength === 0) {
      throw new Error('No audio was captured - check your microphone input and try again.')
    }

    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    const trimmed = trimSilence(merged, sampleRate)
    return encodeWav(trimmed, sampleRate)
  }, [])

  const finish = useCallback(() => setStatus('idle'), [])

  return { status, secondsRemaining, start, stop, finish }
}
