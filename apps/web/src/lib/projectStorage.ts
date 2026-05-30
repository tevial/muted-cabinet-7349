import type { CaptionGroup, CaptionWord, GroupingSettings, TranscriptionResult } from '../types'
import { normalizeGroupingSettings } from './captioning'

export const projectStorageKey = 'capcut-caption-project-v1'
const transcriptionCachePrefix = 'capcut-caption-transcription-v1'

export type SavedProject = {
  version: 1
  savedAt: string
  audioFingerprint?: string
  fileName?: string
  fileSize?: number
  language: string
  words: CaptionWord[]
  groups: CaptionGroup[]
  settings: GroupingSettings
}

type CachedTranscription = {
  version: 1
  savedAt: string
  audioFingerprint: string
  fileName: string
  fileSize: number
  language: string
  result: TranscriptionResult
}

const getTranscriptionCacheKey = (audioFingerprint: string, language: string) =>
  `${transcriptionCachePrefix}:${language.trim().toLowerCase() || 'auto'}:${audioFingerprint}`

const getStoredTranscriptCounts = (value: unknown) => {
  if (!value || typeof value !== 'object') return { words: 0, groups: 0 }

  const candidate = value as { words?: unknown; groups?: unknown; result?: { words?: unknown; groups?: unknown } }
  const directWords = Array.isArray(candidate.words) ? candidate.words.length : 0
  const directGroups = Array.isArray(candidate.groups) ? candidate.groups.length : 0
  const resultWords = Array.isArray(candidate.result?.words) ? candidate.result.words.length : 0
  const resultGroups = Array.isArray(candidate.result?.groups) ? candidate.result.groups.length : 0

  return {
    words: directWords || resultWords,
    groups: directGroups || resultGroups,
  }
}

export const createSavedProject = (
  language: string,
  words: CaptionWord[],
  groups: CaptionGroup[],
  settings: GroupingSettings,
  source?: Pick<SavedProject, 'audioFingerprint' | 'fileName' | 'fileSize'>,
): SavedProject => ({
  version: 1,
  savedAt: new Date().toISOString(),
  ...source,
  language,
  words,
  groups,
  settings,
})

export const saveProject = (project: SavedProject) => {
  try {
    localStorage.setItem(projectStorageKey, JSON.stringify(project))
    return true
  } catch {
    return false
  }
}

export const saveTranscriptionCache = (
  audioFingerprint: string,
  file: File,
  language: string,
  result: TranscriptionResult,
) => {
  const cachedTranscription: CachedTranscription = {
    version: 1,
    savedAt: new Date().toISOString(),
    audioFingerprint,
    fileName: file.name,
    fileSize: file.size,
    language,
    result,
  }

  try {
    localStorage.setItem(getTranscriptionCacheKey(audioFingerprint, language), JSON.stringify(cachedTranscription))
    return true
  } catch {
    return false
  }
}

export const loadTranscriptionCache = (audioFingerprint: string, language: string): CachedTranscription | null => {
  try {
    const raw = localStorage.getItem(getTranscriptionCacheKey(audioFingerprint, language))
    if (!raw) return null

    const cachedTranscription = JSON.parse(raw) as CachedTranscription
    const result = cachedTranscription.result

    if (
      cachedTranscription.version !== 1 ||
      cachedTranscription.audioFingerprint !== audioFingerprint ||
      !Array.isArray(result?.words) ||
      !Array.isArray(result?.groups)
    ) {
      return null
    }

    return cachedTranscription
  } catch {
    return null
  }
}

export const loadProject = (): SavedProject | null => {
  try {
    const raw = localStorage.getItem(projectStorageKey)
    if (!raw) return null

    const project = JSON.parse(raw) as SavedProject
    if (project.version !== 1 || !Array.isArray(project.words) || !Array.isArray(project.groups)) {
      return null
    }
    return {
      ...project,
      settings: normalizeGroupingSettings(project.settings),
    }
  } catch {
    return null
  }
}

export const getStorageDebugSnapshot = () => {
  try {
    return Object.keys(localStorage)
      .filter((key) => key === projectStorageKey || key.startsWith(transcriptionCachePrefix))
      .sort()
      .map((key) => {
        const raw = localStorage.getItem(key) ?? ''
        const parsed = JSON.parse(raw) as Partial<SavedProject & CachedTranscription>
        const result = 'result' in parsed ? parsed.result : undefined
        const counts = getStoredTranscriptCounts(result ?? parsed)

        return {
          key,
          bytes: raw.length,
          version: parsed.version ?? null,
          savedAt: parsed.savedAt ?? null,
          audioFingerprint: parsed.audioFingerprint ?? null,
          fileName: parsed.fileName ?? null,
          fileSize: parsed.fileSize ?? null,
          language: parsed.language ?? null,
          words: counts.words,
          groups: counts.groups,
        }
      })
  } catch {
    return []
  }
}
