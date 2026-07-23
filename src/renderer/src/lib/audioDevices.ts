const STORAGE_KEY = 'speech-tutor:inputDeviceId'

export function getStoredDeviceId(): string {
  return localStorage.getItem(STORAGE_KEY) ?? ''
}

export function setStoredDeviceId(deviceId: string): void {
  if (deviceId) {
    localStorage.setItem(STORAGE_KEY, deviceId)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}
