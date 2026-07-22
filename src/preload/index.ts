import { contextBridge, ipcRenderer } from 'electron'
import type { SessionStats, SubmitTurnResult, TurnRecord } from '../shared/types'

const api = {
  submitTurn: (audio: ArrayBuffer): Promise<SubmitTurnResult> =>
    ipcRenderer.invoke('turn:submit', audio),
  getHistory: (limit?: number): Promise<TurnRecord[]> => ipcRenderer.invoke('history:get', limit),
  getStats: (): Promise<SessionStats> => ipcRenderer.invoke('stats:get')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
