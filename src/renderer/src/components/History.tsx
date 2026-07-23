import { useEffect, useState } from 'react'
import type { TurnRecord } from '../../../shared/types'

export default function History() {
  const [turns, setTurns] = useState<TurnRecord[]>([])

  useEffect(() => {
    window.api.getHistory(50).then(setTurns)
  }, [])

  return (
    <div className="screen">
      <h1>History</h1>
      {turns.length === 0 && <p>No sessions yet - go practice first.</p>}
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
    </div>
  )
}
