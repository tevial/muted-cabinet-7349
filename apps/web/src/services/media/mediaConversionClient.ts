import { flowLog, flowWarn, summarizeFile } from '../../shared/observability/flowLogger'
import { apiBase } from '../api/apiConfig'
import { readApiErrorMessage } from '../api/errors'

const videoFileExtensions = new Set([
  'avi',
  'flv',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'webm',
  'wmv',
])

export type PreparedSourceMedia = {
  file: File
  originalFile?: File
  sourceKind: 'audio' | 'video'
}

const getFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? ''

const getExtractedAudioFileName = (file: File) => {
  const stem = file.name.replace(/\.[^.]*$/, '').trim()
  return `${stem || 'source-media'}-audio.mp3`
}

export const isVideoSourceFile = (file: File) =>
  file.type.startsWith('video/') || videoFileExtensions.has(getFileExtension(file.name))

export const extractEditorAudioFromVideo = async (file: File): Promise<File> => {
  const body = new FormData()
  body.append('file', file)

  flowLog('api: POST /api/media/extract-audio', {
    baseUrl: apiBase,
    file: summarizeFile(file),
  })

  const response = await fetch(`${apiBase}/api/media/extract-audio`, {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const message = await readApiErrorMessage(response, 'Video audio extraction failed.')
    flowWarn('api: media extract audio error', {
      status: response.status,
      message,
    })
    throw new Error(message)
  }

  const blob = await response.blob()
  const audioFile = new File([blob], getExtractedAudioFileName(file), {
    type: blob.type || 'audio/mpeg',
  })

  flowLog('api: media extract audio ok', {
    input: summarizeFile(file),
    output: summarizeFile(audioFile),
    bitrate: response.headers.get('x-editor-audio-bitrate') ?? undefined,
  })

  return audioFile
}

export const prepareSourceMediaFile = async (file: File): Promise<PreparedSourceMedia> => {
  if (!isVideoSourceFile(file)) {
    return {
      file,
      sourceKind: 'audio',
    }
  }

  return {
    file: await extractEditorAudioFromVideo(file),
    originalFile: file,
    sourceKind: 'video',
  }
}
