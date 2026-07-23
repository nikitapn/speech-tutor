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
