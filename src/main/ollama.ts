import type { TutorFeedback } from '../shared/types'

const OLLAMA_URL = 'http://localhost:11434/api/generate'
const MODEL = 'gemma4:e4b'

const SYSTEM_PROMPT = `You are an English speaking tutor. You will be given a short audio clip of a
student speaking. Do the following:
1. Transcribe VERBATIM exactly what was said, including any grammar mistakes, wrong words, or
   disfluencies, precisely as spoken. Do NOT silently correct or clean up the language in this
   field - an unaltered transcript is required so mistakes can be identified in step 3.
2. Produce a corrected version of the transcript (fix grammar, tense, word choice, prepositions).
3. List each individual error found, with the original fragment, the correction, and a one-sentence
   explanation a learner would understand.
4. Score grammar accuracy from 1-10 (10 = no errors).
5. Score vocabulary range/richness from 1-10 (10 = varied, precise, natural vocabulary for the context).
6. Give one or two sentences of fluency/tone notes (pacing, hesitation, register).
7. Give an overall score from 1-10.

Respond with ONLY a JSON object matching this exact shape, no markdown fences, no commentary:
{
  "transcript": string,
  "corrected_transcript": string,
  "errors": [{ "type": "grammar"|"word-choice"|"tense"|"preposition"|"other", "original": string, "correction": string, "explanation": string }],
  "grammar_score": number,
  "vocabulary_score": number,
  "fluency_notes": string,
  "overall_score": number
}`

/**
 * Confirmed against the local Ollama server: audio goes in the same top-level "images": string[]
 * field used for vision models (base64, no data URI prefix). Ollama's media loader only accepts
 * formats it can decode itself - webm/opus (what the browser's MediaRecorder produces) fails with
 * "Failed to load image or audio file"; a plain WAV (PCM) works. The renderer captures raw PCM via
 * the Web Audio API and encodes it to WAV itself (src/renderer/src/lib/wav.ts) rather than sending
 * MediaRecorder output, specifically to match this.
 */
function buildRequestBody(audioBase64: string): Record<string, unknown> {
  return {
    model: MODEL,
    prompt: SYSTEM_PROMPT,
    images: [audioBase64],
    format: 'json',
    stream: false
  }
}

interface OllamaGenerateResponse {
  response: string
}

export async function transcribeAndScore(audioBuffer: Buffer): Promise<TutorFeedback> {
  const audioBase64 = audioBuffer.toString('base64')

  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequestBody(audioBase64))
  })

  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status} ${res.statusText} - ${await res.text()}`)
  }

  const data = (await res.json()) as OllamaGenerateResponse

  let parsed: TutorFeedback
  try {
    parsed = JSON.parse(data.response) as TutorFeedback
  } catch {
    throw new Error(`Model did not return valid JSON: ${data.response.slice(0, 500)}`)
  }

  return normalizeFeedback(parsed)
}

function normalizeFeedback(raw: TutorFeedback): TutorFeedback {
  const clamp = (n: unknown): number => {
    const num = typeof n === 'number' ? n : Number(n)
    if (Number.isNaN(num)) return 0
    return Math.min(10, Math.max(0, num))
  }

  return {
    transcript: raw.transcript ?? '',
    corrected_transcript: raw.corrected_transcript ?? raw.transcript ?? '',
    errors: Array.isArray(raw.errors) ? raw.errors : [],
    grammar_score: clamp(raw.grammar_score),
    vocabulary_score: clamp(raw.vocabulary_score),
    fluency_notes: raw.fluency_notes ?? '',
    overall_score: clamp(raw.overall_score)
  }
}
