import type { CaptionGroup, CaptionWord, GroupingSettings, TranscriptionResult } from '../../contracts/captions'
import { normalizeGroupingSettings } from '../../domain/captions'

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

export type CachedTranscription = {
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

export const getTranscriptionCacheMeta = (audioFingerprint: string, language: string) => {
  const key = getTranscriptionCacheKey(audioFingerprint, language)

  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { key, exists: false, bytes: 0, words: 0, groups: 0 }

    const cachedTranscription = JSON.parse(raw) as CachedTranscription
    const counts = getStoredTranscriptCounts(cachedTranscription.result)
    return {
      key,
      exists: true,
      bytes: raw.length,
      savedAt: cachedTranscription.savedAt,
      fileName: cachedTranscription.fileName,
      fileSize: cachedTranscription.fileSize,
      words: counts.words,
      groups: counts.groups,
    }
  } catch {
    return { key, exists: false, bytes: 0, words: 0, groups: 0, unreadable: true }
  }
}

export const saveTranscriptionCache = (
  audioFingerprint: string,
  file: File,
  language: string,
  result: TranscriptionResult,
) => {
  const before = getTranscriptionCacheMeta(audioFingerprint, language)
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
    const raw = JSON.stringify(cachedTranscription)
    localStorage.setItem(getTranscriptionCacheKey(audioFingerprint, language), raw)
    return {
      ok: true,
      key: before.key,
      bytes: raw.length,
      overwrote: before.exists,
      previousWords: before.words,
      previousGroups: before.groups,
    }
  } catch {
    return {
      ok: false,
      key: before.key,
      bytes: 0,
      overwrote: before.exists,
      previousWords: before.words,
      previousGroups: before.groups,
    }
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
