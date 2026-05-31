import type { AlignmentResult } from '../../contracts/captions'
import { flowLog, flowWarn, summarizeFile } from '../../shared/observability/flowLogger'
import { apiBase } from '../api/apiConfig'

const readApiError = async (response: Response, fallback: string) => {
  const message = await response.text()
  if (!message) return fallback

  try {
    const parsed = JSON.parse(message) as { detail?: unknown }
    return typeof parsed.detail === 'string' ? parsed.detail : message
  } catch {
    return message
  }
}

export class AlignmentRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AlignmentRequestError'
    this.status = status
  }
}

export const isAlignmentServiceError = (error: unknown) =>
  error instanceof AlignmentRequestError && error.status >= 500

/**
 * Ask the local API to run MFA forced alignment for known caption text inside a
 * selected media range.
 */
export const alignFileSegment = async (
  file: File,
  language: string,
  start: number,
  end: number,
  text: string,
) => {
  const body = new FormData()
  body.append('file', file)
  body.append('start', start.toFixed(3))
  body.append('end', end.toFixed(3))
  body.append('text', text)
  if (language.trim()) body.append('language', language.trim())

  flowLog('api: POST /api/align/segment', {
    baseUrl: apiBase,
    end,
    file: summarizeFile(file),
    language: language.trim() || 'auto',
    start,
    words: text.trim().split(/\s+/).filter(Boolean).length,
  })

  const response = await fetch(`${apiBase}/api/align/segment`, {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const message = await readApiError(response, 'MFA alignment failed.')
    flowWarn('api: mfa alignment error', {
      status: response.status,
      message,
    })
    throw new AlignmentRequestError(message, response.status)
  }

  const result = (await response.json()) as AlignmentResult
  flowLog('api: mfa alignment ok', {
    end,
    start,
    status: response.status,
    unmatchedWords: result.unmatchedWords.length,
    words: result.words.length,
  })
  return result
}
