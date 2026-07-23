import type { TutorFeedback } from '../shared/types'

const OLLAMA_URL = 'http://localhost:11434/v1/chat/completions'
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
8. Guess the speaker's accent/regional variety of English from pronunciation alone (e.g. "American
   English", "British English", "Indian English", "Australian English"). This is inherently
   uncertain from a short clip - give your best single guess as a short label, not a paragraph. If
   there truly isn't enough signal, say "Unclear".

Respond with ONLY a JSON object matching this exact shape, no markdown fences, no commentary:
{
  "transcript": string,
  "corrected_transcript": string,
  "errors": [{ "type": "grammar"|"word-choice"|"tense"|"preposition"|"other", "original": string, "correction": string, "explanation": string }],
  "grammar_score": number,
  "vocabulary_score": number,
  "fluency_notes": string,
  "overall_score": number,
  "accent": string
}`

/**
 * Uses Ollama's OpenAI-compatible endpoint with a proper "input_audio" content part (audio goes
 * in as base64 with an explicit format, not stuffed into the generic vision-model "images" field).
 * This matters beyond just being the more correct API shape: gemma4 has a "thinking" capability,
 * and this endpoint returns that reasoning in a separate `message.reasoning` field instead of
 * mixing it into the answer - forcing an immediate structured JSON reply without room to "think"
 * first (which is what /api/generate + format:"json" effectively does) measurably made the model
 * silently normalize the transcript before scoring it, which meant grammar mistakes were graded
 * against an already-corrected transcript (falsely high scores). Confirmed via direct comparison:
 * this endpoint preserved an intentional tense mistake in testing and scored it correctly (3/10),
 * where /api/generate consistently corrected the mistake in the transcript itself and scored 9-10/10.
 * Note: Ollama's native /api/chat with an "images" field does NOT work for audio on this model
 * ("I could not find the specified audio") - it has to be this endpoint with this content shape.
 */
function buildRequestBody(audioBase64: string): Record<string, unknown> {
  return {
    model: MODEL,
    options: {
      num_ctx: 8192
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: SYSTEM_PROMPT },
          { type: 'input_audio', input_audio: { data: audioBase64, format: 'wav' } }
        ]
      }
    ],
    response_format: { type: 'json_object' }
  }
}

interface OllamaChatCompletionResponse {
  choices: { message: { content: string } }[]
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

  const data = (await res.json()) as OllamaChatCompletionResponse
  const content = data.choices[0]?.message.content ?? ''

  let parsed: TutorFeedback
  try {
    parsed = JSON.parse(content) as TutorFeedback
  } catch {
    throw new Error(`Model did not return valid JSON: ${content.slice(0, 500)}`)
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
    overall_score: clamp(raw.overall_score),
    accent: raw.accent || 'Unclear'
  }
}
