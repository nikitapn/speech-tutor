import { useCallback, useRef, useState } from 'react'
import { encodeWav } from './wav'

export type RecorderStatus = 'idle' | 'recording' | 'processing'

const SAMPLE_RATE = 16000

export function useRecorder(): {
  status: RecorderStatus
  start: () => Promise<void>
  stop: () => Promise<ArrayBuffer>
  finish: () => void
} {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Float32Array[]>([])

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    chunksRef.current = []

    // Ollama can't decode the webm/opus MediaRecorder produces ("Failed to load image or
    // audio file") - capturing raw PCM here and writing a WAV header ourselves avoids depending
    // on any external transcoder (e.g. ffmpeg) being installed on the user's machine.
    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    audioContextRef.current = audioContext

    const source = audioContext.createMediaStreamSource(stream)
    sourceRef.current = source

    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    processorRef.current = processor

    source.connect(processor)
    processor.connect(audioContext.destination)
    setStatus('recording')
  }, [])

  const stop = useCallback(async (): Promise<ArrayBuffer> => {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((track) => track.stop())

    const sampleRate = audioContextRef.current?.sampleRate ?? SAMPLE_RATE
    await audioContextRef.current?.close()

    setStatus('processing')

    const totalLength = chunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    return encodeWav(merged, sampleRate)
  }, [])

  const finish = useCallback(() => setStatus('idle'), [])

  return { status, start, stop, finish }
}
