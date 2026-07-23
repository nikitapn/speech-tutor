import { useEffect, useState } from 'react'
import type { ExamQaPair, ExamReportRecord, ExamQuestionRef, ExamScript } from '../../../shared/types'
import { useRecorder } from '../lib/useRecorder'
import ExamReportView from './ExamReportView'

type Phase = 'idle' | 'loading-script' | 'question' | 'submitting' | 'scoring' | 'report'

interface Answer {
  topic: string
  question: string
  transcript: string
  audio: ArrayBuffer
}

function flattenScript(script: ExamScript): ExamQuestionRef[] {
  const flat: ExamQuestionRef[] = []
  script.topics.forEach((topicGroup, topicIndex) => {
    topicGroup.questions.forEach((question, questionIndex) => {
      flat.push({
        topicIndex,
        questionIndex,
        topic: topicGroup.topic,
        intro: topicGroup.intro,
        question
      })
    })
  })
  return flat
}

export default function Exam() {
  const { status: recorderStatus, secondsRemaining, start, stop, finish } = useRecorder()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState<number | null>(null)
  const [questions, setQuestions] = useState<ExamQuestionRef[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [report, setReport] = useState<ExamReportRecord | null>(null)

  const currentQuestion = questions[currentIndex]
  const showIntro = currentQuestion?.questionIndex === 0

  useEffect(() => {
    if (recorderStatus === 'recording' && secondsRemaining === 0) {
      handleRecordClick()
    }
  }, [secondsRemaining, recorderStatus])

  async function handleStart(): Promise<void> {
    setError(null)
    setPhase('loading-script')
    try {
      const { sessionId: id, script } = await window.api.examStart()
      setSessionId(id)
      setQuestions(flattenScript(script))
      setCurrentIndex(0)
      setAnswers([])
      setReport(null)
      setPhase('question')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the exam.')
      setPhase('idle')
    }
  }

  async function handleRecordClick(): Promise<void> {
    setError(null)
    if (recorderStatus === 'idle') {
      try {
        await start()
      } catch {
        setError('Could not access the microphone. Check permissions and try again.')
      }
      return
    }

    if (recorderStatus === 'recording' && sessionId !== null && currentQuestion) {
      setPhase('submitting')
      try {
        const audio = await stop()
        const seq = currentIndex + 1
        const turn = await window.api.examSubmitAnswer(
          sessionId,
          seq,
          currentQuestion.topic,
          currentQuestion.question,
          audio
        )

        const nextAnswers = [
          ...answers,
          { topic: currentQuestion.topic, question: currentQuestion.question, transcript: turn.transcript, audio }
        ]
        setAnswers(nextAnswers)

        if (currentIndex + 1 < questions.length) {
          setCurrentIndex(currentIndex + 1)
          setPhase('question')
        } else {
          await finishExam(nextAnswers)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong submitting your answer.')
        setPhase('question')
      } finally {
        finish()
      }
    }
  }

  async function finishExam(finalAnswers: Answer[]): Promise<void> {
    if (sessionId === null) return
    setPhase('scoring')
    try {
      const representative = finalAnswers.reduce((longest, a) =>
        a.transcript.length > longest.transcript.length ? a : longest
      )
      const qaPairs: ExamQaPair[] = finalAnswers.map((a) => ({
        topic: a.topic,
        question: a.question,
        transcript: a.transcript
      }))
      const savedReport = await window.api.examFinish(sessionId, qaPairs, representative.audio)
      setReport(savedReport)
      setPhase('report')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong scoring the exam.')
      setPhase('report')
    }
  }

  function handleRestart(): void {
    setPhase('idle')
    setSessionId(null)
    setQuestions([])
    setCurrentIndex(0)
    setAnswers([])
    setReport(null)
    setError(null)
  }

  return (
    <div className="screen">
      <h1>IELTS Speaking Practice (Part 1)</h1>

      {phase === 'idle' && (
        <>
          <p className="hint">
            A mock IELTS Part 1 interview - the examiner asks 2 topics with 4 questions each. Answer
            each one out loud, then get a full IELTS-style report at the end.
          </p>
          <button className="record-button" onClick={handleStart}>
            Start mock exam
          </button>
        </>
      )}

      {phase === 'loading-script' && <p className="hint">Preparing your interview questions...</p>}

      {(phase === 'question' || phase === 'submitting') && currentQuestion && (
        <>
          <p className="exam-progress">
            Question {currentIndex + 1} of {questions.length}
          </p>

          {showIntro && <p className="exam-intro">{currentQuestion.intro}</p>}

          <p className="exam-question">{currentQuestion.question}</p>

          <button
            className={`record-button ${recorderStatus} ${secondsRemaining !== null && secondsRemaining <= 5 ? 'low-time' : ''}`}
            onClick={handleRecordClick}
            disabled={phase === 'submitting'}
          >
            {recorderStatus === 'idle' && phase === 'question' && 'Hold to speak'}
            {recorderStatus === 'recording' && `Recording... click to stop (${secondsRemaining}s left)`}
            {phase === 'submitting' && 'Thinking...'}
          </button>
        </>
      )}

      {phase === 'scoring' && <p className="hint">Interview complete - preparing your report...</p>}

      {error && <p className="error">{error}</p>}

      {phase === 'report' && report && (
        <>
          <ExamReportView report={report} turns={answers} />
          <button className="button-secondary" onClick={handleRestart}>
            Start another mock exam
          </button>
        </>
      )}
    </div>
  )
}
