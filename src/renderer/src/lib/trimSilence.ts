const WINDOW_MS = 20
const RELATIVE_THRESHOLD = 0.1
const MIN_THRESHOLD = 0.01
const LEAD_PADDING_MS = 300
const TRAIL_PADDING_MS = 800

/**
 * Trims leading/trailing silence - mainly for Bluetooth headsets, where there's a real delay
 * between pressing "record" and the mic actually going live, leaving dead air at the start of
 * every clip. The threshold is relative to the clip's own peak amplitude (not a fixed number) so
 * it adapts across different mic gains/environments instead of over- or under-triggering.
 */
export function trimSilence(samples: Float32Array, sampleRate: number): Float32Array {
  if (samples.length === 0) return samples

  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i])
    if (abs > peak) peak = abs
  }
  const threshold = Math.max(MIN_THRESHOLD, peak * RELATIVE_THRESHOLD)
  const windowSize = Math.max(1, Math.floor((sampleRate * WINDOW_MS) / 1000))

  const windowRms = (start: number): number => {
    const end = Math.min(start + windowSize, samples.length)
    let sum = 0
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / (end - start))
  }

  let start = 0
  while (start < samples.length && windowRms(start) < threshold) {
    start += windowSize
  }
  if (start >= samples.length) return samples // entirely below threshold - leave untouched

  let end = samples.length
  while (end > start + windowSize && windowRms(end - windowSize) < threshold) {
    end -= windowSize
  }

  const leadPad = Math.floor((sampleRate * LEAD_PADDING_MS) / 1000)
  const trailPad = Math.floor((sampleRate * TRAIL_PADDING_MS) / 1000)

  const trimmedStart = Math.max(0, start - leadPad)
  const trimmedEnd = Math.min(samples.length, end + trailPad)

  return samples.slice(trimmedStart, trimmedEnd)
}
