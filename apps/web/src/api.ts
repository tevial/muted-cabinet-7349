import type { TranscriptionResult } from './types'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

export const transcribeFile = async (file: File, language: string) => {
  const body = new FormData()
  body.append('file', file)
  if (language.trim()) body.append('language', language.trim())

  const response = await fetch(`${apiBase}/api/transcribe`, {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Transcription failed.')
  }

  return (await response.json()) as TranscriptionResult
}

