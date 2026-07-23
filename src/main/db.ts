import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import type { GrammarError, SessionStats, TurnRecord, TutorFeedback } from '../shared/types'

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
