import type { ExamQaPair, ExamReport, ExamScript, TutorFeedback } from '../shared/types'
import { getOllamaHost, normalizeHost } from './settings'

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

const TRANSCRIBE_ONLY_PROMPT = `Transcribe VERBATIM exactly what was said in this audio clip,
including any grammar mistakes, wrong words, filler words, or disfluencies, precisely as spoken.
Do not correct, clean up, or paraphrase the language.

Respond with ONLY a JSON object, no markdown fences, no commentary: { "transcript": string }`

const EXAM_SCRIPT_PROMPT = `You are an IELTS Speaking examiner preparing a full test script covering
Part 1 (the "Introduction and interview" section) and Part 2 (the "Individual long turn" section).

For Part 1: generate a fresh, natural set of questions in the authentic IELTS style. Produce
exactly 2 topic groups from everyday, familiar subjects (e.g. hometown, family, work, studies,
hobbies, daily routine, food, free time, technology, travel, weather, shopping - pick 2 different
ones each time, varied rather than always defaulting to the same pair). For each topic group write:
- a short, natural transition sentence introducing the topic, in the examiner's voice (e.g.
  "Let's talk about your hometown.")
- exactly 4 follow-up questions, in the direct, conversational style a real IELTS examiner uses

For Part 2: generate one task card in the authentic IELTS style (e.g. "Describe something you own
which is very important to you."). Give:
- the topic/prompt sentence
- exactly 3 "you should say" points the candidate should cover (short phrases, not full sentences,
  e.g. "where you got it from", "how long you have had it", "what you use it for")
- exactly 2 short "rounding off" follow-up questions the examiner asks after the candidate finishes
  speaking, related to the same topic (e.g. "Is it valuable in terms of money?")

Respond with ONLY a JSON object matching this exact shape, no markdown fences, no commentary:
{
  "topics": [
    { "topic": string, "intro": string, "questions": [string, string, string, string] },
    { "topic": string, "intro": string, "questions": [string, string, string, string] }
  ],
  "part2": {
    "topic": string,
    "points": [string, string, string],
    "roundingOffQuestions": [string, string]
  }
}`

interface OllamaChatCompletionResponse {
  choices: { message: { content: string } }[]
}

interface ContentPart {
  type: string
  text?: string
  input_audio?: { data: string; format: string }
}

async function chatCompletion(content: string | ContentPart[]): Promise<string> {
  const res = await fetch(`${getOllamaHost()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      options: { num_ctx: 8192 },
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' }
    })
  })

  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status} ${res.statusText} - ${await res.text()}`)
  }

  const data = (await res.json()) as OllamaChatCompletionResponse
  return data.choices[0]?.message.content ?? ''
}

export async function testOllamaConnection(hostOverride?: string): Promise<{ ok: boolean; message: string }> {
  const host = hostOverride ? normalizeHost(hostOverride) : getOllamaHost()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${host}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      return { ok: false, message: `Server responded with ${res.status} ${res.statusText}` }
    }

    const data = (await res.json()) as { models?: { name: string }[] }
    const hasModel = (data.models ?? []).some((m) => m.name === MODEL || m.name.startsWith(`${MODEL.split(':')[0]}:`))
    if (!hasModel) {
      return { ok: true, message: `Connected, but "${MODEL}" was not found in the model list.` }
    }
    return { ok: true, message: `Connected - "${MODEL}" is available.` }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Could not reach ${host}: ${reason}` }
  }
}

/**
 * The model occasionally appends stray artifacts after an otherwise valid JSON object (observed:
 * a trailing "<tool_call|>" token - gemma4 has a tool-calling capability, and something leaks
 * through even though this endpoint has no tools defined). Fall back to the substring between the
 * first '{' and the last '}' before giving up, rather than failing the whole turn over that.
 */
function parseJson<T>(content: string, label: string): T {
  try {
    return JSON.parse(content) as T
  } catch {
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1)) as T
      } catch {
        // fall through to the error below
      }
    }
    throw new Error(`${label}: model did not return valid JSON: ${content.slice(0, 500)}`)
  }
}

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
export async function transcribeAndScore(audioBuffer: Buffer): Promise<TutorFeedback> {
  const content = await chatCompletion([
    { type: 'text', text: SYSTEM_PROMPT },
    { type: 'input_audio', input_audio: { data: audioBuffer.toString('base64'), format: 'wav' } }
  ])

  return normalizeFeedback(parseJson<TutorFeedback>(content, 'transcribeAndScore'))
}

/**
 * Lightweight per-turn transcription for exam mode - deliberately skips grammar/vocab scoring so
 * each answer in the interview comes back fast and doesn't interrupt the flow. The full IELTS-style
 * assessment happens once at the end, in scoreExamSession(), against the whole conversation.
 */
export async function transcribeOnly(audioBuffer: Buffer): Promise<string> {
  const content = await chatCompletion([
    { type: 'text', text: TRANSCRIBE_ONLY_PROMPT },
    { type: 'input_audio', input_audio: { data: audioBuffer.toString('base64'), format: 'wav' } }
  ])

  const parsed = parseJson<{ transcript?: string }>(content, 'transcribeOnly')
  return parsed.transcript ?? ''
}

/**
 * Part 3 ("Two-way discussion") is adaptive - a real examiner's next question responds to what the
 * candidate just said, rather than following a fixed list. This is called once before the first
 * Part 3 question (with an empty history, seeded only by the Part 2 topic) and again after every
 * subsequent answer, each time with the growing conversation so far. Text-only - no audio needed,
 * since deciding the next question only depends on what was said, not how it sounded.
 */
export async function generatePart3Question(
  part2Topic: string,
  history: { question: string; transcript: string }[]
): Promise<string> {
  const historyBlock =
    history.length === 0
      ? ''
      : `\n\nThe discussion so far:\n${history.map((h) => `Examiner: ${h.question}\nCandidate: ${h.transcript}`).join('\n\n')}`

  const instruction =
    history.length === 0
      ? `This is the opening question of Part 3. Ask one broader, more abstract question that builds
on the Part 2 topic (not the transition sentence itself - just the question).`
      : `Ask ONE natural follow-up question that responds directly to what the candidate just said -
probe deeper, ask them to elaborate or justify their view, gently challenge it, or pivot to a
related abstract angle. Match the analytical, discursive style of real IELTS Part 3 (discussing
issues, speculating, analysing - not simple factual recall).`

  const prompt = `You are an IELTS Speaking examiner conducting Part 3 (the "Two-way discussion"
section), which follows on from the Part 2 topic in a more general, abstract, and in-depth way.

The Part 2 topic was: "${part2Topic}"
${historyBlock}

${instruction}

Respond with ONLY a JSON object, no markdown fences, no commentary: { "question": string }`

  const content = await chatCompletion(prompt)
  const parsed = parseJson<{ question?: string }>(content, 'generatePart3Question')

  if (!parsed.question) {
    throw new Error('generatePart3Question: model did not return a question')
  }

  return parsed.question
}

export async function generateExamScript(): Promise<ExamScript> {
  const content = await chatCompletion(EXAM_SCRIPT_PROMPT)
  const parsed = parseJson<ExamScript>(content, 'generateExamScript')

  if (!Array.isArray(parsed.topics) || parsed.topics.length === 0) {
    throw new Error('generateExamScript: model did not return any topics')
  }
  if (!parsed.part2 || !Array.isArray(parsed.part2.points) || !Array.isArray(parsed.part2.roundingOffQuestions)) {
    throw new Error('generateExamScript: model did not return a valid Part 2 task card')
  }

  return parsed
}

/**
 * Scores a full Part 1 interview at once, against the real IELTS Speaking band descriptors, rather
 * than per-answer - mirrors how an actual examiner assesses across the whole conversation. Takes
 * one representative audio clip (the longest answer) alongside the full text transcript so the
 * model has some direct audio signal for pronunciation, not just text.
 */
export async function scoreExamSession(
  qaPairs: ExamQaPair[],
  representativeAudio: Buffer
): Promise<ExamReport> {
  const transcriptBlock = qaPairs
    .map((qa) => `Examiner: ${qa.question}\nCandidate: ${qa.transcript}`)
    .join('\n\n')

  const prompt = `You are an IELTS Speaking examiner. Below is the full transcript of a Speaking
test session between an examiner and a candidate, covering Part 1 (introduction and interview),
Part 2 (individual long turn plus rounding-off questions), and Part 3 (two-way discussion). Score
the candidate's overall performance using the official IELTS Speaking band descriptors, across
these four criteria:
- Fluency and coherence
- Lexical resource
- Grammatical range and accuracy
- Pronunciation

One audio clip from the session is attached so you can assess pronunciation and fluency directly,
not just from the text below.

Transcript:
${transcriptBlock}

For each of the four criteria, write 1-2 sentences of specific, constructive feedback that
references things the candidate actually said. Then give a single overall band score estimate
from 1-9 on the IELTS band scale (half-point increments are fine), and a short 2-3 sentence
overall summary.

Respond with ONLY a JSON object matching this exact shape, no markdown fences, no commentary:
{
  "fluency_coherence": string,
  "lexical_resource": string,
  "grammatical_range_accuracy": string,
  "pronunciation": string,
  "band_estimate": number,
  "summary": string
}`

  const content = await chatCompletion([
    { type: 'text', text: prompt },
    { type: 'input_audio', input_audio: { data: representativeAudio.toString('base64'), format: 'wav' } }
  ])

  return normalizeExamReport(parseJson<ExamReport>(content, 'scoreExamSession'))
}

function normalizeExamReport(raw: ExamReport): ExamReport {
  const band = typeof raw.band_estimate === 'number' ? raw.band_estimate : Number(raw.band_estimate)
  return {
    fluency_coherence: raw.fluency_coherence ?? '',
    lexical_resource: raw.lexical_resource ?? '',
    grammatical_range_accuracy: raw.grammatical_range_accuracy ?? '',
    pronunciation: raw.pronunciation ?? '',
    band_estimate: Number.isNaN(band) ? 0 : Math.min(9, Math.max(0, band)),
    summary: raw.summary ?? ''
  }
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
