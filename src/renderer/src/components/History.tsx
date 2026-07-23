import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ExamHistoryEntry, TurnRecord } from '../../../shared/types'
import ExamReportView from './ExamReportView'

type SubTab = 'practice' | 'exam'

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

export default function History() {
  const [subTab, setSubTab] = useState<SubTab>('practice')
  const [turns, setTurns] = useState<TurnRecord[]>([])
  const [examHistory, setExamHistory] = useState<ExamHistoryEntry[]>([])

  const practiceViewportRef = useRef<HTMLDivElement>(null)
  const examViewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getHistory(50).then(setTurns)
    window.api.examHistory(20).then(setExamHistory)
  }, [])

  const practiceVirtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => practiceViewportRef.current,
    estimateSize: () => 110,
    overscan: 5,
    getItemKey: (index) => turns[index].id
  })

  const examVirtualizer = useVirtualizer({
    count: examHistory.length,
    getScrollElement: () => examViewportRef.current,
    estimateSize: () => 500,
    overscan: 3,
    getItemKey: (index) => examHistory[index].session.id
  })

  async function handleDeleteTurn(id: number): Promise<void> {
    await window.api.deleteTurn(id)
    setTurns((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleDeleteExam(id: number): Promise<void> {
    if (!confirm('Delete this exam session? This cannot be undone.')) return
    await window.api.deleteExamSession(id)
    setExamHistory((prev) => prev.filter((e) => e.session.id !== id))
  }

  return (
    <div className="screen history-screen">
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
        <div className="history-panel">
          {turns.length === 0 && <p className="hint">No sessions yet - go practice first.</p>}
          {turns.length > 0 && (
            <div ref={practiceViewportRef} className="history-viewport">
              <div style={{ height: practiceVirtualizer.getTotalSize(), position: 'relative' }}>
                {practiceVirtualizer.getVirtualItems().map((virtualRow) => {
                  const turn = turns[virtualRow.index]
                  return (
                    <div
                      key={turn.id}
                      ref={practiceVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="virtual-row"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div className="history-item">
                        <div className="history-header">
                          <span>{new Date(turn.created_at).toLocaleString()}</span>
                          <span className="history-header-right">
                            <span className="value">{turn.overall_score.toFixed(1)}</span>
                            <button
                              className="icon-button"
                              aria-label="Delete turn"
                              onClick={() => handleDeleteTurn(turn.id)}
                            >
                              <TrashIcon />
                            </button>
                          </span>
                        </div>
                        <p>{turn.transcript}</p>
                        <span className="accent-tag">{turn.accent}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'exam' && (
        <div className="history-panel">
          {examHistory.length === 0 && <p className="hint">No mock exams yet - try the Exam tab.</p>}
          {examHistory.length > 0 && (
            <div ref={examViewportRef} className="history-viewport">
              <div style={{ height: examVirtualizer.getTotalSize(), position: 'relative' }}>
                {examVirtualizer.getVirtualItems().map((virtualRow) => {
                  const entry = examHistory[virtualRow.index]
                  return (
                    <div
                      key={entry.session.id}
                      ref={examVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="virtual-row"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div className="history-item">
                        <div className="history-header">
                          <span>{new Date(entry.session.created_at).toLocaleString()}</span>
                          <button
                            className="icon-button"
                            aria-label="Delete exam session"
                            onClick={() => handleDeleteExam(entry.session.id)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                        {entry.report ? (
                          <ExamReportView report={entry.report} turns={entry.turns} />
                        ) : (
                          <p className="hint">Not completed ({entry.turns.length} of 8 questions answered)</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
