import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import type {
  ExamHistoryEntry,
  ExamReport,
  ExamReportRecord,
  ExamScript,
  ExamSessionRecord,
  ExamTurnRecord,
  GrammarError,
  SessionStats,
  TurnRecord,
  TutorFeedback
} from '../shared/types'

let db: Database.Database

export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'speech-tutor.sqlite3')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      language TEXT NOT NULL DEFAULT 'en',
      started_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      seq INTEGER NOT NULL,
      transcript TEXT NOT NULL,
      corrected_transcript TEXT NOT NULL,
      feedback_json TEXT NOT NULL,
      grammar_score REAL NOT NULL,
      vocabulary_score REAL NOT NULL,
      overall_score REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS error_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id INTEGER NOT NULL REFERENCES turns(id),
      category TEXT NOT NULL,
      detail TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exam_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_session_id INTEGER NOT NULL REFERENCES exam_sessions(id),
      seq INTEGER NOT NULL,
      topic TEXT NOT NULL,
      question TEXT NOT NULL,
      transcript TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exam_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_session_id INTEGER NOT NULL REFERENCES exam_sessions(id),
      fluency_coherence TEXT NOT NULL,
      lexical_resource TEXT NOT NULL,
      grammatical_range_accuracy TEXT NOT NULL,
      pronunciation TEXT NOT NULL,
      band_estimate REAL NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const turnColumns = db.prepare("PRAGMA table_info(turns)").all() as { name: string }[]
  if (!turnColumns.some((col) => col.name === 'accent')) {
    db.exec(`ALTER TABLE turns ADD COLUMN accent TEXT NOT NULL DEFAULT 'Unclear'`)
  }
}

export function getOrCreateActiveSession(language = 'en'): number {
  const row = db
    .prepare('SELECT id FROM sessions WHERE language = ? ORDER BY id DESC LIMIT 1')
    .get(language) as { id: number } | undefined

  if (row) return row.id

  const result = db.prepare('INSERT INTO sessions (language) VALUES (?)').run(language)
  return Number(result.lastInsertRowid)
}

export function saveTurn(sessionId: number, feedback: TutorFeedback): TurnRecord {
  const seqRow = db
    .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM turns WHERE session_id = ?')
    .get(sessionId) as { next: number }

  const insert = db.prepare(`
    INSERT INTO turns
      (session_id, seq, transcript, corrected_transcript, feedback_json, grammar_score, vocabulary_score, overall_score, accent)
    VALUES (@session_id, @seq, @transcript, @corrected_transcript, @feedback_json, @grammar_score, @vocabulary_score, @overall_score, @accent)
  `)

  const result = insert.run({
    session_id: sessionId,
    seq: seqRow.next,
    transcript: feedback.transcript,
    corrected_transcript: feedback.corrected_transcript,
    feedback_json: JSON.stringify(feedback),
    grammar_score: feedback.grammar_score,
    vocabulary_score: feedback.vocabulary_score,
    overall_score: feedback.overall_score,
    accent: feedback.accent
  })

  const turnId = Number(result.lastInsertRowid)

  const insertTag = db.prepare('INSERT INTO error_tags (turn_id, category, detail) VALUES (?, ?, ?)')
  const tagTx = db.transaction((errors: GrammarError[]) => {
    for (const err of errors) {
      insertTag.run(turnId, err.type, `${err.original} -> ${err.correction}`)
    }
  })
  tagTx(feedback.errors)

  return db.prepare('SELECT * FROM turns WHERE id = ?').get(turnId) as TurnRecord
}

export function getHistory(limit = 50): TurnRecord[] {
  return db
    .prepare('SELECT * FROM turns ORDER BY id DESC LIMIT ?')
    .all(limit) as TurnRecord[]
}

export function getStats(): SessionStats {
  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS totalTurns,
        COALESCE(AVG(overall_score), 0) AS avgOverallScore,
        COALESCE(AVG(grammar_score), 0) AS avgGrammarScore,
        COALESCE(AVG(vocabulary_score), 0) AS avgVocabularyScore
      FROM turns`
    )
    .get() as {
    totalTurns: number
    avgOverallScore: number
    avgGrammarScore: number
    avgVocabularyScore: number
  }

  const scoreHistory = db
    .prepare('SELECT created_at, overall_score FROM turns ORDER BY id ASC')
    .all() as { created_at: string; overall_score: number }[]

  const topErrorCategories = db
    .prepare(
      `SELECT category AS type, COUNT(*) AS count
       FROM error_tags
       GROUP BY category
       ORDER BY count DESC
       LIMIT 5`
    )
    .all() as { type: string; count: number }[]

  return { ...totals, scoreHistory, topErrorCategories }
}

export function createExamSession(script: ExamScript): number {
  const result = db
    .prepare('INSERT INTO exam_sessions (script_json) VALUES (?)')
    .run(JSON.stringify(script))
  return Number(result.lastInsertRowid)
}

export function saveExamTurn(
  examSessionId: number,
  seq: number,
  topic: string,
  question: string,
  transcript: string
): ExamTurnRecord {
  const result = db
    .prepare(
      `INSERT INTO exam_turns (exam_session_id, seq, topic, question, transcript)
       VALUES (@exam_session_id, @seq, @topic, @question, @transcript)`
    )
    .run({ exam_session_id: examSessionId, seq, topic, question, transcript })

  return db.prepare('SELECT * FROM exam_turns WHERE id = ?').get(Number(result.lastInsertRowid)) as ExamTurnRecord
}

export function saveExamReport(examSessionId: number, report: ExamReport): ExamReportRecord {
  const result = db
    .prepare(
      `INSERT INTO exam_reports
        (exam_session_id, fluency_coherence, lexical_resource, grammatical_range_accuracy, pronunciation, band_estimate, summary)
       VALUES (@exam_session_id, @fluency_coherence, @lexical_resource, @grammatical_range_accuracy, @pronunciation, @band_estimate, @summary)`
    )
    .run({
      exam_session_id: examSessionId,
      fluency_coherence: report.fluency_coherence,
      lexical_resource: report.lexical_resource,
      grammatical_range_accuracy: report.grammatical_range_accuracy,
      pronunciation: report.pronunciation,
      band_estimate: report.band_estimate,
      summary: report.summary
    })

  return db
    .prepare('SELECT * FROM exam_reports WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as ExamReportRecord
}

export function getExamHistory(limit = 20): ExamHistoryEntry[] {
  const sessions = db
    .prepare('SELECT * FROM exam_sessions ORDER BY id DESC LIMIT ?')
    .all(limit) as ExamSessionRecord[]

  const turnsStmt = db.prepare('SELECT * FROM exam_turns WHERE exam_session_id = ? ORDER BY seq ASC')
  const reportStmt = db.prepare('SELECT * FROM exam_reports WHERE exam_session_id = ?')

  return sessions.map((session) => ({
    session,
    turns: turnsStmt.all(session.id) as ExamTurnRecord[],
    report: (reportStmt.get(session.id) as ExamReportRecord | undefined) ?? null
  }))
}
