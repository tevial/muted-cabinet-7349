import type { TranscriptionResult } from '../types'

const flowPrefix = '[CC flow]'

export const shortFingerprint = (fingerprint?: string) =>
  fingerprint ? `${fingerprint.slice(0, 10)}...${fingerprint.slice(-6)}` : null

export const summarizeFile = (file?: File) =>
  file
    ? {
        name: file.name,
        sizeMb: Math.round((file.size / 1024 / 1024) * 100) / 100,
        type: file.type || 'unknown',
      }
    : null

export const summarizeTranscription = (result?: TranscriptionResult) =>
  result
    ? {
        words: result.words.length,
        groups: result.groups.length,
        textChars: result.text.length,
        duration: result.duration ?? null,
        language: result.language ?? null,
      }
    : null

export const flowLog = (event: string, details?: Record<string, unknown>) => {
  if (details) {
    console.info(`${flowPrefix} ${event}`, details)
    return
  }

  console.info(`${flowPrefix} ${event}`)
}

export const flowWarn = (event: string, details?: Record<string, unknown>) => {
  if (details) {
    console.warn(`${flowPrefix} ${event}`, details)
    return
  }

  console.warn(`${flowPrefix} ${event}`)
}
