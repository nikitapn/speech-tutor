import { useState } from 'react'
import type { SubmitTurnResult } from '../../../shared/types'
import { useRecorder } from '../lib/useRecorder'

export default function Practice() {
  const { status, start, stop, finish } = useRecorder()
  const [result, setResult] = useState<SubmitTurnResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRecordClick(): Promise<void> {
    setError(null)
    if (status === 'idle') {
      try {
        await start()
      } catch {
        setError('Could not access the microphone. Check permissions and try again.')
      }
      return
    }

    if (status === 'recording') {
      try {
        const audio = await stop()
        const res = await window.api.submitTurn(audio)
        setResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong talking to the tutor.')
      } finally {
        finish()
      }
    }
  }

  return (
    <div className="screen">
      <h1>Practice</h1>
      <button
        className={`record-button ${status}`}
        onClick={handleRecordClick}
        disabled={status === 'processing'}
      >
        {status === 'idle' && 'Hold to speak'}
        {status === 'recording' && 'Recording... click to stop'}
        {status === 'processing' && 'Thinking...'}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="feedback">
          <section>
            <h2>Transcript</h2>
            <p>{result.feedback.transcript}</p>
          </section>

          <section>
            <h2>Corrected</h2>
            <p>{result.feedback.corrected_transcript}</p>
          </section>

          {result.feedback.errors.length > 0 && (
            <section>
              <h2>Errors</h2>
              <ul>
                {result.feedback.errors.map((err, i) => (
                  <li key={i}>
                    <strong>{err.type}</strong>: <s>{err.original}</s> &rarr; {err.correction}
                    <div className="explanation">{err.explanation}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="scores">
            <div className="score-card">
              <span className="label">Grammar</span>
              <span className="value">{result.feedback.grammar_score.toFixed(1)}</span>
            </div>
            <div className="score-card">
              <span className="label">Vocabulary</span>
              <span className="value">{result.feedback.vocabulary_score.toFixed(1)}</span>
            </div>
            <div className="score-card">
              <span className="label">Overall</span>
              <span className="value">{result.feedback.overall_score.toFixed(1)}</span>
            </div>
          </section>

          <section>
            <h2>Fluency notes</h2>
            <p>{result.feedback.fluency_notes}</p>
          </section>
        </div>
      )}
    </div>
  )
}
