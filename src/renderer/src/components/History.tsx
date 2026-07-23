import { useEffect, useState } from 'react'
import type { ExamHistoryEntry, TurnRecord } from '../../../shared/types'
import ExamReportView from './ExamReportView'

type SubTab = 'practice' | 'exam'

export default function History() {
  const [subTab, setSubTab] = useState<SubTab>('practice')
  const [turns, setTurns] = useState<TurnRecord[]>([])
  const [examHistory, setExamHistory] = useState<ExamHistoryEntry[]>([])

  useEffect(() => {
    window.api.getHistory(50).then(setTurns)
    window.api.examHistory(20).then(setExamHistory)
  }, [])

  return (
    <div className="screen">
      <h1>History</h1>

      <div className="sub-tabs">
        <button className={subTab === 'practice' ? 'active' : ''} onClick={() => setSubTab('practice')}>
          Practice
        </button>
        <button className={subTab === 'exam' ? 'active' : ''} onClick={() => setSubTab('exam')}>
          Exam
        </button>
      </div>

      {subTab === 'practice' && (
        <>
          {turns.length === 0 && <p className="hint">No sessions yet - go practice first.</p>}
          <ul className="history-list">
            {turns.map((turn) => (
              <li key={turn.id} className="history-item">
                <div className="history-header">
                  <span>{new Date(turn.created_at).toLocaleString()}</span>
                  <span className="value">{turn.overall_score.toFixed(1)}</span>
                </div>
                <p>{turn.transcript}</p>
                <span className="accent-tag">{turn.accent}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {subTab === 'exam' && (
        <>
          {examHistory.length === 0 && <p className="hint">No mock exams yet - try the Exam tab.</p>}
          <ul className="history-list">
            {examHistory.map((entry) => (
              <li key={entry.session.id} className="history-item">
                <div className="history-header">
                  <span>{new Date(entry.session.created_at).toLocaleString()}</span>
                </div>
                {entry.report ? (
                  <ExamReportView report={entry.report} turns={entry.turns} />
                ) : (
                  <p className="hint">Not completed ({entry.turns.length} of 8 questions answered)</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
