import { useEffect, useRef, useState } from 'react'
import type {
  ExamQaPair,
  ExamReportRecord,
  ExamQuestionRef,
  ExamScript,
  Part2TaskCard
} from '../../../shared/types'
import { useRecorder } from '../lib/useRecorder'
import ExamReportView from './ExamReportView'

type Phase =
  | 'idle'
  | 'loading-script'
  | 'question'
  | 'submitting'
  | 'part2-prep'
  | 'part2-speaking'
  | 'part2-finishing'
  | 'part2-question'
  | 'part2-submitting'
  | 'part3-intro'
  | 'part3-loading-question'
  | 'part3-question'
  | 'part3-submitting'
  | 'scoring'
  | 'report'

interface Answer {
  topic: string
  question: string
  transcript: string
  audio: ArrayBuffer
}

interface PendingChunk {
  audio: ArrayBuffer
  promise: Promise<string>
}

const PART2_PREP_SECONDS = 60
const PART3_QUESTION_COUNT = 6

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

function TaskCardView({ card }: { card: Part2TaskCard }) {
  return (
    <div className="task-card">
      <p className="exam-question">{card.topic}</p>
      <p className="hint">You should say:</p>
      <ul className="task-card-points">
        {card.points.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>
    </div>
  )
}

export default function Exam() {
  const { status: recorderStatus, secondsRemaining, start, stop, finish } = useRecorder()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState<number | null>(null)
  const [script, setScript] = useState<ExamScript | null>(null)
  const [questions, setQuestions] = useState<ExamQuestionRef[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [report, setReport] = useState<ExamReportRecord | null>(null)

  const [prepSecondsRemaining, setPrepSecondsRemaining] = useState(PART2_PREP_SECONDS)
  const [chunkCount, setChunkCount] = useState(0)
  const chunksRef = useRef<PendingChunk[]>([])
  const [part2LongTurnAnswer, setPart2LongTurnAnswer] = useState<Answer | null>(null)
  const [roundingOffIndex, setRoundingOffIndex] = useState(0)
  const [roundingOffAnswers, setRoundingOffAnswers] = useState<Answer[]>([])

  const [currentPart3Question, setCurrentPart3Question] = useState<string | null>(null)
  const [part3QuestionIndex, setPart3QuestionIndex] = useState(0)
  const [part3Answers, setPart3Answers] = useState<Answer[]>([])

  const currentQuestion = questions[currentIndex]
  const showIntro = currentQuestion?.questionIndex === 0
  const roundingOffQuestion = script?.part2.roundingOffQuestions[roundingOffIndex]

  useEffect(() => {
    if (recorderStatus !== 'recording' || secondsRemaining !== 0) return
    if (phase === 'question') handleRecordClick()
    else if (phase === 'part2-speaking') handleChunkButtonClick()
    else if (phase === 'part2-question') handleRoundingOffClick()
    else if (phase === 'part3-question') handlePart3Click()
    // eslint: handlers close over current state each render, safe to call directly here
  }, [secondsRemaining, recorderStatus, phase])

  useEffect(() => {
    if (phase !== 'part2-prep') return
    if (prepSecondsRemaining <= 0) {
      handleStartSpeaking()
      return
    }
    const t = setTimeout(() => setPrepSecondsRemaining((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, prepSecondsRemaining])

  async function handleStart(): Promise<void> {
    setError(null)
    setPhase('loading-script')
    try {
      const { sessionId: id, script: newScript } = await window.api.examStart()
      setSessionId(id)
      setScript(newScript)
      setQuestions(flattenScript(newScript))
      setCurrentIndex(0)
      setAnswers([])
      setReport(null)
      chunksRef.current = []
      setChunkCount(0)
      setPart2LongTurnAnswer(null)
      setRoundingOffIndex(0)
      setRoundingOffAnswers([])
      setCurrentPart3Question(null)
      setPart3QuestionIndex(0)
      setPart3Answers([])
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
          setPrepSecondsRemaining(PART2_PREP_SECONDS)
          setPhase('part2-prep')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong submitting your answer.')
        setPhase('question')
      } finally {
        finish()
      }
    }
  }

  async function handleStartSpeaking(): Promise<void> {
    setError(null)
    setPhase('part2-speaking')
    chunksRef.current = []
    setChunkCount(0)
    try {
      await start()
    } catch {
      setError('Could not access the microphone. Check permissions and try again.')
    }
  }

  async function handleChunkButtonClick(): Promise<void> {
    setError(null)
    if (recorderStatus === 'idle') {
      try {
        await start()
      } catch {
        setError('Could not access the microphone. Check permissions and try again.')
      }
      return
    }

    if (recorderStatus === 'recording') {
      try {
        const audio = await stop()
        const promise = window.api.examTranscribeChunk(audio)
        chunksRef.current.push({ audio, promise })
        setChunkCount((c) => c + 1)
        await start()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong recording that chunk.')
      }
    }
  }

  async function handleDoneSpeaking(): Promise<void> {
    if (sessionId === null || !script) return
    setError(null)
    setPhase('part2-finishing')
    try {
      if (recorderStatus === 'recording') {
        const audio = await stop()
        const promise = window.api.examTranscribeChunk(audio)
        chunksRef.current.push({ audio, promise })
        setChunkCount((c) => c + 1)
      }

      const chunks = chunksRef.current
      if (chunks.length === 0) {
        throw new Error('Record at least part of your answer before finishing.')
      }

      const transcripts = await Promise.all(chunks.map((c) => c.promise))
      const combinedTranscript = transcripts.join(' ').trim()

      let bestAudio = chunks[0].audio
      let bestLen = -1
      transcripts.forEach((t, i) => {
        if (t.length > bestLen) {
          bestLen = t.length
          bestAudio = chunks[i].audio
        }
      })

      const seq = questions.length + 1
      const questionText = `${script.part2.topic} (should cover: ${script.part2.points.join('; ')})`
      const turn = await window.api.examSaveTurn(sessionId, seq, 'Long turn', questionText, combinedTranscript)

      setPart2LongTurnAnswer({ topic: 'Long turn', question: questionText, transcript: turn.transcript, audio: bestAudio })
      setRoundingOffIndex(0)
      setPhase('part2-question')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong finishing the long turn.')
      setPhase('part2-speaking')
    } finally {
      finish()
    }
  }

  async function handleRoundingOffClick(): Promise<void> {
    setError(null)
    if (recorderStatus === 'idle') {
      try {
        await start()
      } catch {
        setError('Could not access the microphone. Check permissions and try again.')
      }
      return
    }

    if (recorderStatus === 'recording' && sessionId !== null && script && roundingOffQuestion) {
      setPhase('part2-submitting')
      try {
        const audio = await stop()
        const seq = questions.length + 2 + roundingOffIndex
        const turn = await window.api.examSubmitAnswer(sessionId, seq, 'Rounding off', roundingOffQuestion, audio)

        const nextRoundingOff = [
          ...roundingOffAnswers,
          { topic: 'Rounding off', question: roundingOffQuestion, transcript: turn.transcript, audio }
        ]
        setRoundingOffAnswers(nextRoundingOff)

        if (roundingOffIndex + 1 < script.part2.roundingOffQuestions.length) {
          setRoundingOffIndex(roundingOffIndex + 1)
          setPhase('part2-question')
        } else {
          setPhase('part3-intro')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong submitting your answer.')
        setPhase('part2-question')
      } finally {
        finish()
      }
    }
  }

  async function startPart3(): Promise<void> {
    if (!script) return
    setError(null)
    setPhase('part3-loading-question')
    try {
      const question = await window.api.examGeneratePart3Question(script.part2.topic, [])
      setCurrentPart3Question(question)
      setPart3QuestionIndex(0)
      setPart3Answers([])
      setPhase('part3-question')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the next question.')
      setPhase('part3-intro')
    }
  }

  async function handlePart3Click(): Promise<void> {
    setError(null)
    if (recorderStatus === 'idle') {
      try {
        await start()
      } catch {
        setError('Could not access the microphone. Check permissions and try again.')
      }
      return
    }

    if (recorderStatus === 'recording' && sessionId !== null && script && currentPart3Question) {
      setPhase('part3-submitting')
      try {
        const audio = await stop()
        const seq = questions.length + 4 + part3QuestionIndex
        const turn = await window.api.examSubmitAnswer(sessionId, seq, 'Discussion', currentPart3Question, audio)

        const nextAnswers = [
          ...part3Answers,
          { topic: 'Discussion', question: currentPart3Question, transcript: turn.transcript, audio }
        ]
        setPart3Answers(nextAnswers)

        if (part3QuestionIndex + 1 < PART3_QUESTION_COUNT) {
          setPhase('part3-loading-question')
          const nextQuestion = await window.api.examGeneratePart3Question(
            script.part2.topic,
            nextAnswers.map((a) => ({ question: a.question, transcript: a.transcript }))
          )
          setCurrentPart3Question(nextQuestion)
          setPart3QuestionIndex(part3QuestionIndex + 1)
          setPhase('part3-question')
        } else {
          await finishExam(nextAnswers)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong submitting your answer.')
        setPhase('part3-question')
      } finally {
        finish()
      }
    }
  }

  async function finishExam(finalPart3Answers: Answer[]): Promise<void> {
    if (sessionId === null || !part2LongTurnAnswer) return
    setPhase('scoring')
    try {
      const allAnswers = [...answers, part2LongTurnAnswer, ...roundingOffAnswers, ...finalPart3Answers]
      const representative = allAnswers.reduce((longest, a) =>
        a.transcript.length > longest.transcript.length ? a : longest
      )
      const qaPairs: ExamQaPair[] = allAnswers.map((a) => ({
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
    setScript(null)
    setQuestions([])
    setCurrentIndex(0)
    setAnswers([])
    setReport(null)
    setError(null)
    chunksRef.current = []
    setChunkCount(0)
    setPart2LongTurnAnswer(null)
    setRoundingOffIndex(0)
    setRoundingOffAnswers([])
    setCurrentPart3Question(null)
    setPart3QuestionIndex(0)
    setPart3Answers([])
  }

  async function handleCancel(): Promise<void> {
    if (recorderStatus === 'recording') {
      try {
        await stop()
      } catch {
        // discarding this recording anyway
      }
      finish()
    }
    handleRestart()
  }

  const inProgress = phase !== 'idle' && phase !== 'loading-script' && phase !== 'scoring' && phase !== 'report'

  function progressLabel(): string {
    switch (phase) {
      case 'question':
      case 'submitting':
        return `Question ${currentIndex + 1} of ${questions.length}`
      case 'part2-prep':
        return 'Part 2 - Prepare your answer'
      case 'part2-speaking':
      case 'part2-finishing':
        return `Part 2 - Long turn (${chunkCount} chunk${chunkCount === 1 ? '' : 's'} recorded)`
      case 'part2-question':
      case 'part2-submitting':
        return `Part 2 - Rounding-off question ${roundingOffIndex + 1} of ${script?.part2.roundingOffQuestions.length ?? 2}`
      case 'part3-intro':
        return 'Part 3 - Discussion'
      case 'part3-loading-question':
      case 'part3-question':
      case 'part3-submitting':
        return `Part 3 - Discussion question ${part3QuestionIndex + 1} of ${PART3_QUESTION_COUNT}`
      default:
        return ''
    }
  }

  return (
    <div className="screen">
      <h1>IELTS Speaking Practice (Part 1, 2 &amp; 3)</h1>

      {phase === 'idle' && (
        <>
          <p className="hint">
            A mock IELTS interview - Part 1 (2 topics, 4 questions each), Part 2 (a one-minute
            prep, a long turn on a task card, and 2 rounding-off questions), then Part 3 (a
            two-way discussion that builds on your Part 2 topic). Get a full IELTS-style report
            at the end.
          </p>
          <button className="record-button" onClick={handleStart}>
            Start mock exam
          </button>
        </>
      )}

      {phase === 'loading-script' && <p className="hint">Preparing your interview questions...</p>}

      {inProgress && (
        <div className="exam-header-row">
          <p className="exam-progress">{progressLabel()}</p>
          <button className="button-secondary" onClick={handleCancel}>
            Cancel exam
          </button>
        </div>
      )}

      {(phase === 'question' || phase === 'submitting') && currentQuestion && (
        <>
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

      {phase === 'part2-prep' && script && (
        <>
          <TaskCardView card={script.part2} />
          <p className="exam-progress">Prepare your notes - {prepSecondsRemaining}s left</p>
          <button className="button-secondary" onClick={handleStartSpeaking}>
            Start speaking now
          </button>
        </>
      )}

      {(phase === 'part2-speaking' || phase === 'part2-finishing') && script && (
        <>
          <TaskCardView card={script.part2} />

          <button
            className={`record-button ${recorderStatus} ${secondsRemaining !== null && secondsRemaining <= 5 ? 'low-time' : ''}`}
            onClick={handleChunkButtonClick}
            disabled={phase === 'part2-finishing'}
          >
            {recorderStatus === 'idle' && phase === 'part2-speaking' && 'Hold to speak'}
            {recorderStatus === 'recording' && `Recording... click for next chunk (${secondsRemaining}s left)`}
            {phase === 'part2-finishing' && 'Finishing...'}
          </button>

          <button className="button-secondary" onClick={handleDoneSpeaking} disabled={phase === 'part2-finishing'}>
            Done speaking
          </button>
        </>
      )}

      {(phase === 'part2-question' || phase === 'part2-submitting') && roundingOffQuestion && (
        <>
          <p className="exam-question">{roundingOffQuestion}</p>

          <button
            className={`record-button ${recorderStatus} ${secondsRemaining !== null && secondsRemaining <= 5 ? 'low-time' : ''}`}
            onClick={handleRoundingOffClick}
            disabled={phase === 'part2-submitting'}
          >
            {recorderStatus === 'idle' && phase === 'part2-question' && 'Hold to speak'}
            {recorderStatus === 'recording' && `Recording... click to stop (${secondsRemaining}s left)`}
            {phase === 'part2-submitting' && 'Thinking...'}
          </button>
        </>
      )}

      {phase === 'part3-intro' && (
        <>
          <p className="exam-intro">
            Now let's move on to a wider discussion related to your Part 2 topic.
          </p>
          <button className="record-button" onClick={startPart3}>
            Continue
          </button>
        </>
      )}

      {phase === 'part3-loading-question' && <p className="hint">Preparing the next question...</p>}

      {(phase === 'part3-question' || phase === 'part3-submitting') && currentPart3Question && (
        <>
          <p className="exam-question">{currentPart3Question}</p>

          <button
            className={`record-button ${recorderStatus} ${secondsRemaining !== null && secondsRemaining <= 5 ? 'low-time' : ''}`}
            onClick={handlePart3Click}
            disabled={phase === 'part3-submitting'}
          >
            {recorderStatus === 'idle' && phase === 'part3-question' && 'Hold to speak'}
            {recorderStatus === 'recording' && `Recording... click to stop (${secondsRemaining}s left)`}
            {phase === 'part3-submitting' && 'Thinking...'}
          </button>
        </>
      )}

      {phase === 'scoring' && <p className="hint">Interview complete - preparing your report...</p>}

      {error && <p className="error">{error}</p>}

      {phase === 'report' && report && (
        <>
          <ExamReportView
            report={report}
            turns={[
              ...answers,
              ...(part2LongTurnAnswer ? [part2LongTurnAnswer] : []),
              ...roundingOffAnswers,
              ...part3Answers
            ]}
          />
          <button className="button-secondary" onClick={handleRestart}>
            Start another mock exam
          </button>
        </>
      )}
    </div>
  )
}
