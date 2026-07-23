export interface GrammarError {
  type: 'grammar' | 'word-choice' | 'tense' | 'preposition' | 'other'
  original: string
  correction: string
  explanation: string
}

export interface TutorFeedback {
  transcript: string
  corrected_transcript: string
  errors: GrammarError[]
  grammar_score: number
  vocabulary_score: number
  fluency_notes: string
  overall_score: number
  accent: string
}

export interface TurnRecord {
  id: number
  session_id: number
  seq: number
  transcript: string
  corrected_transcript: string
  feedback_json: string
  grammar_score: number
  vocabulary_score: number
  overall_score: number
  accent: string
  created_at: string
}

export interface SessionStats {
  totalTurns: number
  avgOverallScore: number
  avgGrammarScore: number
  avgVocabularyScore: number
  scoreHistory: { created_at: string; overall_score: number }[]
  topErrorCategories: { type: string; count: number }[]
}

export interface SubmitTurnResult {
  turn: TurnRecord
  feedback: TutorFeedback
}
