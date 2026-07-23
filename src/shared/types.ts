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

export interface ExamTopic {
  topic: string
  intro: string
  questions: string[]
}

export interface ExamScript {
  topics: ExamTopic[]
}

export interface ExamQuestionRef {
  topicIndex: number
  questionIndex: number
  topic: string
  intro: string
  question: string
}

export interface ExamReport {
  fluency_coherence: string
  lexical_resource: string
  grammatical_range_accuracy: string
  pronunciation: string
  band_estimate: number
  summary: string
}

export interface ExamSessionRecord {
  id: number
  script_json: string
  created_at: string
}

export interface ExamTurnRecord {
  id: number
  exam_session_id: number
  seq: number
  topic: string
  question: string
  transcript: string
  created_at: string
}

export interface ExamReportRecord {
  id: number
  exam_session_id: number
  fluency_coherence: string
  lexical_resource: string
  grammatical_range_accuracy: string
  pronunciation: string
  band_estimate: number
  summary: string
  created_at: string
}

export interface ExamHistoryEntry {
  session: ExamSessionRecord
  turns: ExamTurnRecord[]
  report: ExamReportRecord | null
}

export interface ExamQaPair {
  topic: string
  question: string
  transcript: string
}
