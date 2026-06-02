import type { TranscriptionResult } from '../../contracts/captions'
import { flowLog, flowWarn, summarizeFile } from '../../shared/observability/flowLogger'
import { apiBase } from '../api/apiConfig'
import { readApiErrorMessage } from '../api/errors'

export type TranscriptionSegmentRange = {
  end: number
  start: number
}

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
    const message = await readApiErrorMessage(response, 'Transcription failed.')
    flowWarn('api: transcribe error', {
      status: response.status,
      message,
    })
    throw new Error(message)
  }

  const result = (await response.json()) as TranscriptionResult
  flowLog('api: transcribe ok', {
    status: response.status,
    words: result.words.length,
    groups: result.groups.length,
  })
  return result
}

export const transcribeFileSegment = async (
  file: File,
  language: string,
  start: number,
  end: number,
) => {
  const body = new FormData()
  body.append('file', file)
  body.append('start', start.toFixed(3))
  body.append('end', end.toFixed(3))
  if (language.trim()) body.append('language', language.trim())

  flowLog('api: POST /api/transcribe/segment', {
    baseUrl: apiBase,
    end,
    file: summarizeFile(file),
    language: language.trim() || 'auto',
    start,
  })

  const response = await fetch(`${apiBase}/api/transcribe/segment`, {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const message = await readApiErrorMessage(response, 'Segment transcription failed.')
    flowWarn('api: segment transcribe error', {
      status: response.status,
      message,
    })
    throw new Error(message)
  }

  const result = (await response.json()) as TranscriptionResult
  flowLog('api: segment transcribe ok', {
    end,
    start,
    status: response.status,
    words: result.words.length,
    groups: result.groups.length,
  })
  return result
}

export const transcribeFileSegments = async (
  file: File,
  language: string,
  ranges: TranscriptionSegmentRange[],
) => {
  const body = new FormData()
  body.append('file', file)
  body.append('ranges', JSON.stringify(ranges.map((range) => ({
    start: Number(range.start.toFixed(3)),
    end: Number(range.end.toFixed(3)),
  }))))
  if (language.trim()) body.append('language', language.trim())

  flowLog('api: POST /api/transcribe/segments', {
    baseUrl: apiBase,
    file: summarizeFile(file),
    language: language.trim() || 'auto',
    ranges: ranges.length,
  })

  const response = await fetch(`${apiBase}/api/transcribe/segments`, {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const message = await readApiErrorMessage(response, 'Segment batch transcription failed.')
    flowWarn('api: segments transcribe error', {
      status: response.status,
      message,
    })
    throw new Error(message)
  }

  const result = (await response.json()) as TranscriptionResult
  flowLog('api: segments transcribe ok', {
    ranges: ranges.length,
    status: response.status,
    words: result.words.length,
    groups: result.groups.length,
  })
  return result
}
