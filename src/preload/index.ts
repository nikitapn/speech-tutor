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
  examFinish: (
    sessionId: number,
    qaPairs: ExamQaPair[],
    representativeAudio: ArrayBuffer
  ): Promise<ExamReportRecord> =>
    ipcRenderer.invoke('exam:finish', sessionId, qaPairs, representativeAudio),
  examHistory: (limit?: number): Promise<ExamHistoryEntry[]> =>
    ipcRenderer.invoke('exam:history', limit)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
