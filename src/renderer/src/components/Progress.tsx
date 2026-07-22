import { useEffect, useMemo, useState } from 'react'
import type { SessionStats } from '../../../shared/types'

const WIDTH = 640
const HEIGHT = 220
const PAD = 32

export default function Progress() {
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  useEffect(() => {
    window.api.getStats().then(setStats)
  }, [])

  const points = useMemo(() => {
    if (!stats || stats.scoreHistory.length === 0) return []
    const n = stats.scoreHistory.length
    const xStep = n > 1 ? (WIDTH - PAD * 2) / (n - 1) : 0
    return stats.scoreHistory.map((h, i) => ({
      x: PAD + i * xStep,
      y: HEIGHT - PAD - (h.overall_score / 10) * (HEIGHT - PAD * 2),
      score: h.overall_score,
      date: h.created_at
    }))
  }, [stats])

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  if (!stats) {
    return (
      <div className="screen">
        <h1>Progress</h1>
      </div>
    )
  }

  if (stats.totalTurns === 0) {
    return (
      <div className="screen">
        <h1>Progress</h1>
        <p>No data yet - complete a few practice turns to see trends here.</p>
      </div>
    )
  }

  const maxCount = Math.max(...stats.topErrorCategories.map((c) => c.count), 1)

  return (
    <div className="screen viz-root">
      <h1>Progress</h1>

      <section className="stat-row">
        <div className="stat-tile">
          <span className="label">Turns practiced</span>
          <span className="hero">{stats.totalTurns}</span>
        </div>
        <div className="stat-tile">
          <span className="label">Avg overall score</span>
          <span className="hero">{stats.avgOverallScore.toFixed(1)}</span>
        </div>
        <div className="stat-tile">
          <span className="label">Avg grammar score</span>
          <span className="hero">{stats.avgGrammarScore.toFixed(1)}</span>
        </div>
        <div className="stat-tile">
          <span className="label">Avg vocabulary score</span>
          <span className="hero">{stats.avgVocabularyScore.toFixed(1)}</span>
        </div>
      </section>

      <section>
        <h2>Overall score over time</h2>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="chart"
          role="img"
          aria-label="Overall score trend over time"
        >
          {[0, 2.5, 5, 7.5, 10].map((tick) => {
            const y = HEIGHT - PAD - (tick / 10) * (HEIGHT - PAD * 2)
            return (
              <g key={tick}>
                <line x1={PAD} y1={y} x2={WIDTH - PAD} y2={y} className="gridline" />
                <text x={PAD - 8} y={y + 4} textAnchor="end" className="axis-label">
                  {tick}
                </text>
              </g>
            )
          })}

          <path d={linePath} className="score-line" fill="none" />

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoverIndex === i ? 6 : 4}
                className="score-point"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            </g>
          ))}

          {hoverIndex !== null && points[hoverIndex] && (
            <g>
              <line
                x1={points[hoverIndex].x}
                y1={PAD}
                x2={points[hoverIndex].x}
                y2={HEIGHT - PAD}
                className="crosshair"
              />
              <text x={points[hoverIndex].x} y={PAD - 12} textAnchor="middle" className="tooltip-text">
                {points[hoverIndex].score.toFixed(1)} on{' '}
                {new Date(points[hoverIndex].date).toLocaleDateString()}
              </text>
            </g>
          )}
        </svg>
      </section>

      {stats.topErrorCategories.length > 0 && (
        <section>
          <h2>Most common mistakes</h2>
          <div className="bar-chart">
            {stats.topErrorCategories.map((cat) => (
              <div className="bar-row" key={cat.type}>
                <span className="bar-label">{cat.type}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(cat.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="bar-value">{cat.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
