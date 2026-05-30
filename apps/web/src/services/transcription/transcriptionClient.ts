import type { TranscriptionResult } from '../../contracts/captions'
import { flowLog, flowWarn, summarizeFile } from '../../shared/observability/flowLogger'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

export const transcribeFile = async (file: File, language: string) => {
  const body = new FormData()
  body.append('file', file)
  if (language.trim()) body.append('language', language.trim())

  flowLog('api: POST /api/transcribe', {
    baseUrl: apiBase,
    file: summarizeFile(file),
    language: language.trim() || 'auto',
  })

  const response = await fetch(`${apiBase}/api/transcribe`, {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const message = await response.text()
    flowWarn('api: transcribe error', {
      status: response.status,
      message: message || 'Transcription failed.',
    })
    throw new Error(message || 'Transcription failed.')
  }

  const result = (await response.json()) as TranscriptionResult
  flowLog('api: transcribe ok', {
    status: response.status,
    words: result.words.length,
    groups: result.groups.length,
  })
  return result
}
