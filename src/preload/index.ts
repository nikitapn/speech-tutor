import { contextBridge, ipcRenderer } from 'electron'
import type {
  ExamHistoryEntry,
  ExamQaPair,
  ExamReportRecord,
  ExamScript,
  ExamTurnRecord,
  SessionStats,
  SubmitTurnResult,
  TurnRecord
} from '../shared/types'

const api = {
  submitTurn: (audio: ArrayBuffer): Promise<SubmitTurnResult> =>
    ipcRenderer.invoke('turn:submit', audio),
  getHistory: (limit?: number): Promise<TurnRecord[]> => ipcRenderer.invoke('history:get', limit),
  getStats: (): Promise<SessionStats> => ipcRenderer.invoke('stats:get'),
  deleteTurn: (id: number): Promise<void> => ipcRenderer.invoke('turn:delete', id),

  getOllamaHost: (): Promise<string> => ipcRenderer.invoke('settings:getOllamaHost'),
  setOllamaHost: (host: string): Promise<void> => ipcRenderer.invoke('settings:setOllamaHost', host),
  testOllamaConnection: (hostOverride?: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('settings:testOllamaConnection', hostOverride),

  examStart: (): Promise<{ sessionId: number; script: ExamScript }> =>
    ipcRenderer.invoke('exam:start'),
  examSubmitAnswer: (
    sessionId: number,
    seq: number,
    topic: string,
    question: string,
    audio: ArrayBuffer
  ): Promise<ExamTurnRecord> =>
    ipcRenderer.invoke('exam:submitAnswer', sessionId, seq, topic, question, audio),
  examTranscribeChunk: (audio: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('exam:transcribeChunk', audio),
  examSaveTurn: (
    sessionId: number,
    seq: number,
    topic: string,
    question: string,
    transcript: string
  ): Promise<ExamTurnRecord> =>
    ipcRenderer.invoke('exam:saveTurn', sessionId, seq, topic, question, transcript),
  examGeneratePart3Question: (
    part2Topic: string,
    history: { question: string; transcript: string }[]
  ): Promise<string> => ipcRenderer.invoke('exam:generatePart3Question', part2Topic, history),
  examFinish: (
    sessionId: number,
    qaPairs: ExamQaPair[],
    representativeAudio: ArrayBuffer
  ): Promise<ExamReportRecord> =>
    ipcRenderer.invoke('exam:finish', sessionId, qaPairs, representativeAudio),
  examHistory: (limit?: number): Promise<ExamHistoryEntry[]> =>
    ipcRenderer.invoke('exam:history', limit),
  deleteExamSession: (id: number): Promise<void> => ipcRenderer.invoke('exam:delete', id)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
