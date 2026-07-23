import type { ExamReportRecord } from '../../../shared/types'

interface ExamReportViewProps {
  report: ExamReportRecord
  turns: { question: string; transcript: string }[]
}

export default function ExamReportView({ report, turns }: ExamReportViewProps) {
  return (
    <div className="feedback">
      <section className="scores">
        <div className="score-card">
          <span className="label">Band estimate</span>
          <span className="value">{report.band_estimate.toFixed(1)}</span>
        </div>
      </section>

      <section>
        <h2>Fluency and coherence</h2>
        <p>{report.fluency_coherence}</p>
      </section>

      <section>
        <h2>Lexical resource</h2>
        <p>{report.lexical_resource}</p>
      </section>

      <section>
        <h2>Grammatical range and accuracy</h2>
        <p>{report.grammatical_range_accuracy}</p>
      </section>

      <section>
        <h2>Pronunciation</h2>
        <p>{report.pronunciation}</p>
      </section>

      <section>
        <h2>Summary</h2>
        <p>{report.summary}</p>
      </section>

      <section>
        <h2>Full transcript</h2>
        <ul>
          {turns.map((t, i) => (
            <li key={i}>
              <strong>{t.question}</strong>
              <div className="explanation">{t.transcript}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
