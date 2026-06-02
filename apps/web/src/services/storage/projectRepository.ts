import type { CaptionGroup, CaptionWord, GroupingSettings, TranscriptionResult } from '../../contracts/captions'
import { normalizeGroupingSettings, type EmptyZoneCut } from '../../domain/captions'

export const projectStorageKey = 'capcut-caption-project-v1'
const projectBySourceStoragePrefix = 'capcut-caption-project-v2'
const transcriptionCachePrefix = 'capcut-caption-transcription-v3'

export type SavedCapCutProjectSource = {
  durationUs: number
  mainTimelineId: string
  projectName: string
  projectPath: string
}

export type SavedProjectSource = {
  audioFingerprint?: string
  capCutProject?: SavedCapCutProjectSource
  fileName?: string
  fileSize?: number
  sourceKind?: 'file' | 'capcutProject'
}

export type SavedProject = {
  version: 1
  savedAt: string
  language: string
  words: CaptionWord[]
  groups: CaptionGroup[]
  settings: GroupingSettings
  manualGrouping?: boolean
  skipState?: SavedTimelineSkipState
} & SavedProjectSource

export type SavedTimelineSkipStateEdit = {
  id: string
  start: number
  end: number
}

export type SavedTimelineSkipState = {
  deletedAutoIds: string[]
  edits: SavedTimelineSkipStateEdit[]
  manualCuts: EmptyZoneCut[]
  signature: string
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

const getStableStorageHash = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

const getProjectSourceStorageKey = (source: SavedProjectSource) => {
  if (source.sourceKind === 'capcutProject' && source.capCutProject?.projectPath) {
    const { mainTimelineId, projectPath } = source.capCutProject
    return `capcut:${getStableStorageHash(`${projectPath}|${mainTimelineId}`)}`
  }

  if (source.audioFingerprint) {
    return `file:${source.audioFingerprint}`
  }

  return undefined
}

export const getSavedProjectSourceKey = (source: SavedProjectSource) => getProjectSourceStorageKey(source)

const getProjectBySourceStorageKey = (source: SavedProjectSource) => {
  const sourceKey = getProjectSourceStorageKey(source)
  return sourceKey ? `${projectBySourceStoragePrefix}:${sourceKey}` : undefined
}

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

const getFiniteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const normalizeSavedCut = (value: unknown): EmptyZoneCut | undefined => {
  if (!value || typeof value !== 'object') return undefined

  const candidate = value as Partial<EmptyZoneCut>
  const start = getFiniteNumber(candidate.start)
  const end = getFiniteNumber(candidate.end)
  if (typeof candidate.id !== 'string' || start === undefined || end === undefined || end <= start) return undefined

  return {
    id: candidate.id,
    start,
    end,
    duration: getFiniteNumber(candidate.duration) ?? end - start,
  }
}

const normalizeSavedEdit = (value: unknown): SavedTimelineSkipStateEdit | undefined => {
  if (!value || typeof value !== 'object') return undefined

  const candidate = value as Partial<SavedTimelineSkipStateEdit>
  const start = getFiniteNumber(candidate.start)
  const end = getFiniteNumber(candidate.end)
  if (typeof candidate.id !== 'string' || start === undefined || end === undefined || end <= start) return undefined

  return { id: candidate.id, start, end }
}

const normalizeSavedTimelineSkipState = (value: unknown): SavedTimelineSkipState | undefined => {
  if (!value || typeof value !== 'object') return undefined

  const candidate = value as Partial<SavedTimelineSkipState>
  const deletedAutoIds = Array.isArray(candidate.deletedAutoIds)
    ? candidate.deletedAutoIds.filter((id): id is string => typeof id === 'string')
    : []
  const edits = Array.isArray(candidate.edits)
    ? candidate.edits.flatMap((item) => {
        const edit = normalizeSavedEdit(item)
        return edit ? [edit] : []
      })
    : []
  const manualCuts = Array.isArray(candidate.manualCuts)
    ? candidate.manualCuts.flatMap((item) => {
        const cut = normalizeSavedCut(item)
        return cut ? [cut] : []
      })
    : []
  const signature = typeof candidate.signature === 'string' ? candidate.signature : ''

  if (!deletedAutoIds.length && !edits.length && !manualCuts.length && !signature) return undefined

  return {
    deletedAutoIds,
    edits,
    manualCuts,
    signature,
  }
}

const normalizeSavedCapCutProjectSource = (value: unknown): SavedCapCutProjectSource | undefined => {
  if (!value || typeof value !== 'object') return undefined

  const candidate = value as Partial<SavedCapCutProjectSource>
  if (typeof candidate.projectPath !== 'string' || typeof candidate.mainTimelineId !== 'string') return undefined

  return {
    durationUs: getFiniteNumber(candidate.durationUs) ?? 0,
    mainTimelineId: candidate.mainTimelineId,
    projectName: typeof candidate.projectName === 'string' && candidate.projectName
      ? candidate.projectName
      : candidate.projectPath.split('/').at(-1) ?? 'CapCut project',
    projectPath: candidate.projectPath,
  }
}

const normalizeSavedProject = (project: SavedProject): SavedProject | null => {
  if (project.version !== 1 || !Array.isArray(project.words) || !Array.isArray(project.groups)) {
    return null
  }

  const capCutProject = normalizeSavedCapCutProjectSource(project.capCutProject)
  const sourceKind = project.sourceKind === 'capcutProject' && capCutProject
    ? 'capcutProject'
    : project.audioFingerprint
      ? 'file'
      : undefined

  return {
    ...project,
    ...(sourceKind ? { sourceKind } : {}),
    ...(capCutProject ? { capCutProject } : {}),
    settings: normalizeGroupingSettings(project.settings),
    manualGrouping: project.manualGrouping === true,
    skipState: normalizeSavedTimelineSkipState(project.skipState),
  }
}

export const createSavedProject = (
  language: string,
  words: CaptionWord[],
  groups: CaptionGroup[],
  settings: GroupingSettings,
  source?: SavedProjectSource,
  skipState?: SavedTimelineSkipState,
  manualGrouping = false,
): SavedProject => ({
  version: 1,
  savedAt: new Date().toISOString(),
  ...source,
  language,
  words,
  groups,
  settings,
  ...(manualGrouping ? { manualGrouping: true } : {}),
  ...(skipState ? { skipState } : {}),
})

export const saveProject = (project: SavedProject) => {
  try {
    localStorage.setItem(projectStorageKey, JSON.stringify(project))
    const sourceStorageKey = getProjectBySourceStorageKey(project)
    if (sourceStorageKey) {
      localStorage.setItem(sourceStorageKey, JSON.stringify(project))
    }
    return true
  } catch {
    return false
  }
}

export const loadProjectBySource = (source: SavedProjectSource): SavedProject | null => {
  const sourceStorageKey = getProjectBySourceStorageKey(source)
  if (!sourceStorageKey) return null

  try {
    const raw = localStorage.getItem(sourceStorageKey)
    if (!raw) return null

    return normalizeSavedProject(JSON.parse(raw) as SavedProject)
  } catch {
    return null
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

    return normalizeSavedProject(JSON.parse(raw) as SavedProject)
  } catch {
    return null
  }
}
