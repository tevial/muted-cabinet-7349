import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { transcribeFile, transcribeFileSegment } from '../../services/transcription/transcriptionClient'
import {
  buildCapCutPatchManifest,
  defaultGroupingSettings,
  exportSrt,
  groupWords,
  ingestTranscription,
  normalizeGroupTimings,
  nudgeGroupEndBoundary,
  nudgeGroupStartBoundary,
  rebuildGroupTiming,
  sanitizeCaptionWords,
  setGroupBoundary,
  timingNudgeStep,
} from '../../domain/captions'
import { createAudioFingerprint } from '../../services/audio/audioFingerprint'
import { downloadTextFile } from '../../shared/browser/downloadTextFile'
import {
  flowLog,
  flowTimedTable,
  flowWarn,
  shortFingerprint,
  summarizeFile,
  summarizeTimedItems,
  summarizeTimestampDiagnostics,
  summarizeTranscription,
} from '../../shared/observability/flowLogger'
import {
  createSavedProject,
  getTranscriptionCacheMeta,
  loadProject,
  loadTranscriptionCache,
  saveProject,
  saveTranscriptionCache,
  type SavedTimelineSkipState,
} from '../../services/storage/projectRepository'
import {
  dryRunCapCutPatch,
  importCapCutProject,
  listCapCutProjects,
  patchCapCutProject,
  type CapCutLocalAgentStatus,
  type CapCutPatchSummary,
  type CapCutProjectSummary,
} from '../../services/capcut/capcutClient'
import type { CaptionGroup, CaptionWord, GroupingSettings } from '../../contracts/captions'
import type { CapCutProjectImport } from '../../contracts/capcut'
import {
  cloneTimelineSkipState,
  createTimelineSkipState,
  useWaveSurferTimeline,
  type TimelineRange,
  type TimelineSkipState,
} from './model/useWaveSurferTimeline'
import {
  createPendingChunkGroups,
  getKeptChunkTranscriptionConcurrency,
  mergeGroupsWithPendingChunks,
  runWithConcurrency,
} from './model/chunkTranscription'
import { formatZoomLabel, timelineZoomConfig } from './model/waveSurferTimelineConfig'
import { CaptionWorkbenchScreen } from './ui/CaptionWorkbenchScreen'

const isEditableShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

const getTextWordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

const getTextOverride = (text: string) => {
  const trimmedText = text.trim()
  return trimmedText ? trimmedText : undefined
}

const getGroupDisplayText = (group: CaptionGroup) => group.textOverride ?? group.text

const getCombinedTextOverride = (first: CaptionGroup, second: CaptionGroup) => {
  if (first.textOverride === undefined && second.textOverride === undefined) return undefined

  return getTextOverride(`${getGroupDisplayText(first)} ${getGroupDisplayText(second)}`)
}

const getTranscriptionWriteSettings = (settings: GroupingSettings): GroupingSettings =>
  settings.trimEmptyZones ? { ...settings, trimEmptyZones: false } : settings

type TranscriptSource = {
  audioFingerprint?: string
  fileName?: string
  fileSize?: number
}

type EditorHistorySnapshot = {
  groups: CaptionGroup[]
  selectedGroupId?: string
  settings: GroupingSettings
  skipState: TimelineSkipState
  words: CaptionWord[]
}

type EditorHistoryState = {
  past: EditorHistorySnapshot[]
  future: EditorHistorySnapshot[]
}

const historyLimit = 20
const minChunkTranscriptionDuration = 0.25
const keptChunkTranscriptionConcurrency = getKeptChunkTranscriptionConcurrency()

const cloneWords = (sourceWords: CaptionWord[]) => sourceWords.map((word) => ({ ...word }))

const cloneGroups = (sourceGroups: CaptionGroup[]) =>
  sourceGroups.map((group) => ({
    ...group,
    wordIds: [...group.wordIds],
  }))

const cloneSettings = (sourceSettings: GroupingSettings) => ({ ...sourceSettings })

const cloneHistorySnapshot = (snapshot: EditorHistorySnapshot): EditorHistorySnapshot => ({
  groups: cloneGroups(snapshot.groups),
  selectedGroupId: snapshot.selectedGroupId,
  settings: cloneSettings(snapshot.settings),
  skipState: cloneTimelineSkipState(snapshot.skipState),
  words: cloneWords(snapshot.words),
})

const getSkipStateSignature = (state: TimelineSkipState) =>
  JSON.stringify({
    deletedAutoIds: Array.from(state.deletedAutoIds).sort(),
    edits: Array.from(state.edits.entries()).sort(([left], [right]) => left.localeCompare(right)),
    manualCuts: state.manualCuts,
    signature: state.signature,
    sourceUrl: state.sourceUrl,
  })

const serializeTimelineSkipState = (state: TimelineSkipState): SavedTimelineSkipState | undefined => {
  const deletedAutoIds = Array.from(state.deletedAutoIds).sort()
  const edits = Array.from(state.edits.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, range]) => ({
      id,
      start: range.start,
      end: range.end,
    }))
  const manualCuts = state.manualCuts.map((cut) => ({ ...cut }))

  if (!deletedAutoIds.length && !edits.length && !manualCuts.length && !state.signature) return undefined

  return {
    deletedAutoIds,
    edits,
    manualCuts,
    signature: state.signature,
  }
}

const restoreTimelineSkipState = (
  savedSkipState: SavedTimelineSkipState | undefined,
  sourceUrl?: string,
): TimelineSkipState => {
  if (!savedSkipState) return createTimelineSkipState(sourceUrl)

  return {
    deletedAutoIds: new Set(savedSkipState.deletedAutoIds),
    edits: new Map(savedSkipState.edits.map((edit) => [edit.id, { start: edit.start, end: edit.end }])),
    manualCuts: savedSkipState.manualCuts.map((cut) => ({ ...cut })),
    signature: savedSkipState.signature,
    sourceUrl,
  }
}

const getHistorySignature = (snapshot: EditorHistorySnapshot) =>
  JSON.stringify({
    groups: snapshot.groups,
    selectedGroupId: snapshot.selectedGroupId,
    settings: snapshot.settings,
    skipState: getSkipStateSignature(snapshot.skipState),
    words: snapshot.words,
  })

const createWordIdFactory = (prefix: string) => {
  const runId = Date.now().toString(36)

  return (index: number) => `${prefix}_${runId}_${index.toString().padStart(5, '0')}`
}

const doesTimedItemOverlapRange = (item: Pick<CaptionWord, 'start' | 'end'>, range: TimelineRange) =>
  item.end > range.start && item.start < range.end

const getVisibleCaptionGroups = (groups: CaptionGroup[], keptRanges: TimelineRange[]) =>
  groups.filter((group) => keptRanges.some((range) => doesTimedItemOverlapRange(group, range)))

const mergeTranscribedWordsIntoRanges = (
  currentWords: CaptionWord[],
  transcribedWords: CaptionWord[],
  ranges: TimelineRange[],
  createWordId: (index: number) => string,
) => {
  const replacementWords = sanitizeCaptionWords(transcribedWords).map((word, index) => ({
    ...word,
    id: createWordId(index + 1),
  }))
  const outsideWords = currentWords.filter((word) => !ranges.some((range) => doesTimedItemOverlapRange(word, range)))

  return [...outsideWords, ...replacementWords].sort((left, right) => left.start - right.start || left.end - right.end)
}

const mergeTranscribedSegmentWords = (
  currentWords: CaptionWord[],
  segmentWords: CaptionWord[],
  start: number,
  end: number,
) => mergeTranscribedWordsIntoRanges(currentWords, segmentWords, [{ start, end }], createWordIdFactory('seg'))

const mergeTranscribedChunkWords = (
  currentWords: CaptionWord[],
  segmentWords: CaptionWord[],
  range: TimelineRange,
  chunkIndex: number,
) => mergeTranscribedWordsIntoRanges(
  currentWords,
  segmentWords,
  [range],
  createWordIdFactory(`chunk_${String(chunkIndex + 1).padStart(4, '0')}`),
)

export function CaptionWorkbench() {
  const [savedProject] = useState(() => loadProject())
  const initialWords: CaptionWord[] = []
  const initialGroups: CaptionGroup[] = []
  const [words, setWords] = useState<CaptionWord[]>(initialWords)
  const [groups, setGroups] = useState<CaptionGroup[]>(initialGroups)
  const [settings, setSettings] = useState<GroupingSettings>(savedProject?.settings ?? defaultGroupingSettings)
  const [skipState, setSkipState] = useState(createTimelineSkipState)
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(initialGroups[0]?.id)
  const [file, setFile] = useState<File | undefined>()
  const [audioFingerprint, setAudioFingerprint] = useState<string | undefined>()
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSource | undefined>()
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [language, setLanguage] = useState(savedProject?.language ?? 'uk')
  const [, setStatus] = useState(
    savedProject ? 'Saved transcription is available after selecting its source file.' : 'Upload audio when ready.',
  )
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isCapCutPatchOpen, setIsCapCutPatchOpen] = useState(false)
  const [isCapCutPatchBusy, setIsCapCutPatchBusy] = useState(false)
  const [isCapCutImportOpen, setIsCapCutImportOpen] = useState(false)
  const [isCapCutImportBusy, setIsCapCutImportBusy] = useState(false)
  const [isLoadingCapCutProjects, setIsLoadingCapCutProjects] = useState(false)
  const [capCutAgent, setCapCutAgent] = useState<CapCutLocalAgentStatus | undefined>()
  const [capCutProjects, setCapCutProjects] = useState<CapCutProjectSummary[]>([])
  const [capCutProjectPath, setCapCutProjectPath] = useState('')
  const [capCutPatchSummary, setCapCutPatchSummary] = useState<CapCutPatchSummary | undefined>()
  const [capCutProjectImport, setCapCutProjectImport] = useState<CapCutProjectImport | undefined>()
  const [capCutPatchError, setCapCutPatchError] = useState<string | undefined>()
  const autosaveLogKeyRef = useRef<string | undefined>(undefined)
  const historySignatureRef = useRef<string | undefined>(undefined)
  const wordMutationSourceRef = useRef('boot')
  const groupMutationSourceRef = useRef('boot')
  const wordSnapshotRef = useRef<string | undefined>(undefined)
  const groupSnapshotRef = useRef<string | undefined>(undefined)
  const settingsSnapshotRef = useRef<string | undefined>(undefined)
  const bootFlowLogRef = useRef({
    restoredProject: Boolean(savedProject),
    words: initialWords.length,
    groups: initialGroups.length,
    source: transcriptSource
      ? {
          fingerprint: shortFingerprint(transcriptSource.audioFingerprint),
          fileName: transcriptSource.fileName ?? null,
          fileSize: transcriptSource.fileSize ?? null,
        }
      : null,
    language,
  })

  const ensureAudioFingerprint = useCallback(async (nextFile: File) => {
    if (audioFingerprint && file === nextFile) return audioFingerprint

    const fingerprint = await createAudioFingerprint(nextFile)
    setAudioFingerprint(fingerprint)
    return fingerprint
  }, [audioFingerprint, file])

  const totalDuration = useMemo(() => Math.max(...groups.map((group) => group.end), 0), [groups])
  const [history, setHistory] = useState<EditorHistoryState>({ past: [], future: [] })
  const getEditorSnapshot = useCallback((): EditorHistorySnapshot => ({
    groups: cloneGroups(groups),
    selectedGroupId,
    settings: cloneSettings(settings),
    skipState: cloneTimelineSkipState(skipState),
    words: cloneWords(words),
  }), [groups, selectedGroupId, settings, skipState, words])
  const commitHistory = useCallback((source: string) => {
    const snapshot = getEditorSnapshot()
    const signature = getHistorySignature(snapshot)
    if (signature === historySignatureRef.current) return

    historySignatureRef.current = signature
    flowLog('history: commit', {
      source,
      groups: snapshot.groups.length,
      words: snapshot.words.length,
    })
    setHistory((current) => ({
      past: [...current.past, snapshot].slice(-historyLimit),
      future: [],
    }))
  }, [getEditorSnapshot])
  const applyHistorySnapshot = useCallback((snapshot: EditorHistorySnapshot, source: string) => {
    const nextSnapshot = cloneHistorySnapshot(snapshot)
    historySignatureRef.current = getHistorySignature(nextSnapshot)
    wordMutationSourceRef.current = source
    groupMutationSourceRef.current = source
    settingsSnapshotRef.current = JSON.stringify(nextSnapshot.settings)
    setWords(nextSnapshot.words)
    setGroups(nextSnapshot.groups)
    setSettings(nextSnapshot.settings)
    setSkipState(nextSnapshot.skipState)
    setSelectedGroupId(nextSnapshot.selectedGroupId)
  }, [])
  const undo = useCallback(() => {
    const previous = history.past.at(-1)
    if (!previous) return

    const present = getEditorSnapshot()
    applyHistorySnapshot(previous, 'history: undo')
    setHistory({
      past: history.past.slice(0, -1),
      future: [present, ...history.future].slice(0, historyLimit),
    })
    setStatus('Undid last editor action.')
  }, [applyHistorySnapshot, getEditorSnapshot, history])
  const redo = useCallback(() => {
    const next = history.future[0]
    if (!next) return

    const present = getEditorSnapshot()
    applyHistorySnapshot(next, 'history: redo')
    setHistory({
      past: [...history.past, present].slice(-historyLimit),
      future: history.future.slice(1),
    })
    setStatus('Redid editor action.')
  }, [applyHistorySnapshot, getEditorSnapshot, history])
  const handleTranscribeRange = useCallback(async (start: number, end: number) => {
    if (!file) {
      throw new Error('Upload audio or video before transcribing a selected range.')
    }

    setIsTranscribing(true)
    setStatus(`Transcribing ${start.toFixed(2)}s - ${end.toFixed(2)}s...`)

    try {
      const fingerprint = await ensureAudioFingerprint(file)
      const rawResult = await transcribeFileSegment(file, language, start, end)
      const segmentWords = sanitizeCaptionWords(rawResult.words)
      if (!segmentWords.length) {
        throw new Error('No words were detected in the selected range.')
      }

      const nextWords = mergeTranscribedSegmentWords(words, segmentWords, start, end)
      const transcriptionSettings = getTranscriptionWriteSettings(settings)
      const nextGroups = normalizeGroupTimings(groupWords(nextWords, transcriptionSettings))
      commitHistory('segment transcribe')
      if (transcriptionSettings !== settings) setSettings(transcriptionSettings)
      wordMutationSourceRef.current = 'segment transcribe'
      groupMutationSourceRef.current = 'segment transcribe'
      setWords(nextWords)
      setGroups(nextGroups)
      setSelectedGroupId(nextGroups.find((group) => group.start >= start && group.start < end)?.id)
      setTranscriptSource({
        audioFingerprint: fingerprint,
        fileName: file.name,
        fileSize: file.size,
      })

      const cacheResult = {
        text: nextWords.map((word) => word.text).join(' '),
        words: nextWords,
        groups: nextGroups,
      }
      const cacheWrite = saveTranscriptionCache(fingerprint, file, language, cacheResult)
      flowLog('segment transcribe: applied', {
        cacheWriteOk: cacheWrite.ok,
        end,
        fingerprint: shortFingerprint(fingerprint),
        incomingWords: segmentWords.length,
        start,
        totalGroups: nextGroups.length,
        totalWords: nextWords.length,
      })
    } catch (error) {
      flowWarn('segment transcribe: failed', {
        end,
        message: error instanceof Error ? error.message : 'Unknown error',
        start,
      })
      throw error
    } finally {
      setIsTranscribing(false)
    }
  }, [commitHistory, ensureAudioFingerprint, file, language, settings, words])
  const updateGroupTiming = useCallback((groupId: string, start: number, end: number) => {
    commitHistory('group timing edit')
    groupMutationSourceRef.current = 'group timing edit'
    setGroups((current) => setGroupBoundary(current, groupId, start, end))
  }, [commitHistory])
  const {
    addSkipRegion,
    captionContainerRef,
    confirmDetectedSilentSkipRegions,
    deleteSelectedSkipRegion,
    detectSilentSkipRegions,
    detectedSilenceAdjustment,
    hasDetectedSilenceDraft,
    isPlaying,
    isReady: isTimelineReady,
    keptTimelineRanges,
    loopedGroupId,
    playGroup,
    resetPlaybackPosition,
    selectedSkipRegionId,
    setDetectedSilenceAdjustment,
    setZoomLevel,
    silenceAdjustmentConfig,
    startLoopGroup,
    stopPlayback,
    timelineContainerRef,
    togglePlayback,
    waveformContainerRef,
    zoomLevel,
  } = useWaveSurferTimeline({
    audioUrl,
    capCutTimelineMap: capCutProjectImport?.timelineMap,
    contentDuration: totalDuration,
    groups,
    selectedGroupId,
    skipState,
    setSkipState,
    setSelectedGroupId,
    setStatus,
    settings,
    words,
    onHistoryCommit: commitHistory,
    onGroupTimingChange: updateGroupTiming,
    onTranscribeRange: handleTranscribeRange,
  })
  const transcribableKeptRanges = useMemo(
    () => keptTimelineRanges.filter((range) => range.end - range.start >= minChunkTranscriptionDuration),
    [keptTimelineRanges],
  )
  const visibleCaptionGroups = useMemo(
    () => getVisibleCaptionGroups(groups, keptTimelineRanges),
    [groups, keptTimelineRanges],
  )
  const visibleSelectedGroupId = visibleCaptionGroups.some((group) => group.id === selectedGroupId)
    ? selectedGroupId
    : undefined
  const handleTranscribeKeptChunks = useCallback(async () => {
    if (!file) {
      flowWarn('chunk transcribe: blocked, no file')
      setStatus('Upload audio or video before transcribing kept chunks.')
      return
    }
    if (!transcribableKeptRanges.length) {
      setStatus('No kept audio chunks are available to transcribe.')
      return
    }

    stopPlayback()
    setIsTranscribing(true)
    setStatus(
      `Transcribing ${transcribableKeptRanges.length} kept chunks with ${keptChunkTranscriptionConcurrency} parallel requests...`,
    )

    try {
      const fingerprint = await ensureAudioFingerprint(file)
      const transcriptionSettings = getTranscriptionWriteSettings(settings)
      const ranges = transcribableKeptRanges.map((range) => ({ ...range }))
      let nextWords = words.filter((word) => !ranges.some((range) => doesTimedItemOverlapRange(word, range)))
      let incomingWords = 0
      const completedRangeIndexes = new Set<number>()

      const applyChunkProgress = (source: string) => {
        const pendingRanges = ranges.filter((_, index) => !completedRangeIndexes.has(index))
        const pendingGroups = createPendingChunkGroups(pendingRanges)
        const nextRealGroups = normalizeGroupTimings(groupWords(nextWords, transcriptionSettings))
        const nextGroups = mergeGroupsWithPendingChunks(nextRealGroups, pendingGroups)

        wordMutationSourceRef.current = source
        groupMutationSourceRef.current = source
        setWords(nextWords)
        setGroups(nextGroups)
        setSelectedGroupId((current) =>
          current && nextGroups.some((group) => group.id === current)
            ? current
            : nextGroups.find((group) =>
              pendingRanges.some((range) => group.start >= range.start && group.start < range.end),
            )?.id ?? nextGroups.find((group) =>
              ranges.some((range) => group.start >= range.start && group.start < range.end),
            )?.id,
        )
      }

      flowLog('chunk transcribe: request', {
        chunks: ranges.length,
        concurrency: keptChunkTranscriptionConcurrency,
        fingerprint: shortFingerprint(fingerprint),
        language,
        ranges,
      })

      commitHistory('transcribe kept chunks')
      if (transcriptionSettings !== settings) setSettings(transcriptionSettings)
      applyChunkProgress('transcribe kept chunks: pending')

      await runWithConcurrency(ranges, keptChunkTranscriptionConcurrency, async (range, index) => {
        const rawResult = await transcribeFileSegment(file, language, range.start, range.end)
        const segmentWords = sanitizeCaptionWords(rawResult.words)

        if (segmentWords.length) {
          nextWords = mergeTranscribedChunkWords(nextWords, segmentWords, range, index)
          incomingWords += segmentWords.length
        }

        completedRangeIndexes.add(index)
        applyChunkProgress('transcribe kept chunks: progress')
        setStatus(
          `Transcribed ${completedRangeIndexes.size}/${ranges.length} kept chunks (${incomingWords} words so far).`,
        )
      })

      if (!incomingWords) {
        throw new Error('No words were detected in the kept chunks.')
      }

      const nextGroups = normalizeGroupTimings(groupWords(nextWords, transcriptionSettings))
      wordMutationSourceRef.current = 'transcribe kept chunks'
      groupMutationSourceRef.current = 'transcribe kept chunks'
      setWords(nextWords)
      setGroups(nextGroups)
      setSelectedGroupId(nextGroups.find((group) =>
        ranges.some((range) => group.start >= range.start && group.start < range.end),
      )?.id)
      setTranscriptSource({
        audioFingerprint: fingerprint,
        fileName: file.name,
        fileSize: file.size,
      })

      const cacheResult = {
        text: nextWords.map((word) => word.text).join(' '),
        words: nextWords,
        groups: nextGroups,
      }
      const cacheWrite = saveTranscriptionCache(fingerprint, file, language, cacheResult)
      flowLog('chunk transcribe: applied', {
        cacheWriteOk: cacheWrite.ok,
        chunks: ranges.length,
        concurrency: keptChunkTranscriptionConcurrency,
        fingerprint: shortFingerprint(fingerprint),
        incomingWords,
        totalGroups: nextGroups.length,
        totalWords: nextWords.length,
      })
      setStatus(
        cacheWrite.ok
          ? `Transcribed ${ranges.length} kept chunks and cached the result.`
          : `Transcribed ${ranges.length} kept chunks. Local transcription cache failed.`,
      )
    } catch (error) {
      wordMutationSourceRef.current = 'transcribe kept chunks: failed restore'
      groupMutationSourceRef.current = 'transcribe kept chunks: failed restore'
      setSettings(settings)
      setWords(words)
      setGroups(groups)
      flowWarn('chunk transcribe: failed', {
        chunks: transcribableKeptRanges.length,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      setStatus(error instanceof Error ? error.message : 'Kept chunk transcription failed.')
    } finally {
      setIsTranscribing(false)
    }
  }, [
    commitHistory,
    ensureAudioFingerprint,
    file,
    groups,
    language,
    settings,
    stopPlayback,
    transcribableKeptRanges,
    words,
  ])
  const averageWords = groups.length ? (words.length / groups.length).toFixed(1) : '0'
  const captionStats = useMemo(
    () => ({
      words: words.length,
      groups: groups.length,
      averageWords,
      duration: `${totalDuration.toFixed(1)}s`,
    }),
    [averageWords, groups.length, totalDuration, words.length],
  )
  const savedSkipState = useMemo(() => serializeTimelineSkipState(skipState), [skipState])
  const currentProject = useMemo(
    () =>
      createSavedProject(language, words, groups, settings, transcriptSource, savedSkipState),
    [groups, language, savedSkipState, settings, transcriptSource, words],
  )
  const canAutosaveProject = Boolean(transcriptSource?.audioFingerprint)
  const buildCurrentCapCutManifest = useCallback(
    () =>
      buildCapCutPatchManifest({
        groups,
        keptRanges: keptTimelineRanges,
        source: transcriptSource,
      }),
    [groups, keptTimelineRanges, transcriptSource],
  )
  const refreshCapCutProjects = useCallback(async () => {
    setIsLoadingCapCutProjects(true)
    setCapCutPatchError(undefined)
    try {
      const result = await listCapCutProjects()
      setCapCutAgent(result.agent)
      setCapCutProjects(result.projects)
      setCapCutProjectPath((current) => current || result.projects.find((project) => project.supported)?.projectPath || '')
    } catch (error) {
      setCapCutPatchError(error instanceof Error ? error.message : 'CapCut project scan failed.')
      setCapCutProjects([])
    } finally {
      setIsLoadingCapCutProjects(false)
    }
  }, [])
  const openCapCutPatchDialog = useCallback(() => {
    setIsCapCutPatchOpen(true)
    setCapCutPatchSummary(undefined)
    setCapCutPatchError(undefined)
    void refreshCapCutProjects()
  }, [refreshCapCutProjects])
  const openCapCutImportDialog = useCallback(() => {
    setIsCapCutImportOpen(true)
    setCapCutPatchError(undefined)
    void refreshCapCutProjects()
  }, [refreshCapCutProjects])
  const runCapCutImport = useCallback(async () => {
    const projectPath = capCutProjectPath.trim()
    if (!projectPath) {
      setCapCutPatchError('Select or enter a CapCut project path.')
      return
    }

    setIsCapCutImportBusy(true)
    setCapCutPatchError(undefined)
    stopPlayback()

    try {
      const result = await importCapCutProject(projectPath)
      const firstStem = result.stems[0]
      if (!firstStem) {
        throw new Error('No audible stems were rendered from this CapCut project.')
      }

      setCapCutProjectImport(result)
      setAudioUrl(firstStem.url)
      setFile(undefined)
      setAudioFingerprint(undefined)
      setTranscriptSource({
        audioFingerprint: `capcut:${result.timelineMap.mainTimelineId}:${result.timelineMap.durationUs}`,
        fileName: result.timelineMap.projectPath.split('/').at(-1) ?? 'CapCut project',
        fileSize: 0,
      })
      setSkipState(createTimelineSkipState(firstStem.url))
      setIsCapCutImportOpen(false)
      setStatus(
        `Loaded CapCut project: ${result.timelineMap.tracks.length} tracks, ${result.stems.length} audio stem(s), ${result.timelineMap.sourceCutBoundaries.length} source cuts.`,
      )
    } catch (error) {
      setCapCutPatchError(error instanceof Error ? error.message : 'CapCut project import failed.')
    } finally {
      setIsCapCutImportBusy(false)
    }
  }, [capCutProjectPath, stopPlayback])
  const runCapCutPatchDryRun = useCallback(async () => {
    const projectPath = capCutProjectPath.trim()
    if (!projectPath) {
      setCapCutPatchError('Select or enter a CapCut project path.')
      return
    }

    setIsCapCutPatchBusy(true)
    setCapCutPatchError(undefined)
    try {
      const summary = await dryRunCapCutPatch(projectPath, buildCurrentCapCutManifest())
      setCapCutPatchSummary(summary)
      setStatus(`CapCut dry run: ${summary.videoSegments} video segments, ${summary.captionSegments} captions.`)
    } catch (error) {
      setCapCutPatchError(error instanceof Error ? error.message : 'CapCut dry run failed.')
    } finally {
      setIsCapCutPatchBusy(false)
    }
  }, [buildCurrentCapCutManifest, capCutProjectPath])
  const runCapCutPatch = useCallback(async () => {
    const projectPath = capCutProjectPath.trim()
    if (!projectPath) {
      setCapCutPatchError('Select or enter a CapCut project path.')
      return
    }

    setIsCapCutPatchBusy(true)
    setCapCutPatchError(undefined)
    try {
      const summary = await patchCapCutProject(projectPath, buildCurrentCapCutManifest())
      setCapCutPatchSummary(summary)
      setStatus(`CapCut project patched with ${summary.backups.length} backups.`)
      void refreshCapCutProjects()
    } catch (error) {
      setCapCutPatchError(error instanceof Error ? error.message : 'CapCut patch failed.')
    } finally {
      setIsCapCutPatchBusy(false)
    }
  }, [buildCurrentCapCutManifest, capCutProjectPath, refreshCapCutProjects])

  useEffect(() => {
    flowLog('boot', bootFlowLogRef.current)
  }, [])

  const shouldPrintStateTable = (source: string) =>
    source.includes('transcribe') || source.includes('cache') || source.includes('regroup')

  const getTimedSignature = (
    items: Array<Pick<CaptionWord, 'id' | 'start' | 'end' | 'text'> & { textOverride?: string }>,
  ) => items.map((item) => `${item.id}:${item.start}:${item.end}:${item.text}:${item.textOverride ?? ''}`).join('|')

  useEffect(() => {
    const signature = getTimedSignature(words)
    if (signature === wordSnapshotRef.current) return
    wordSnapshotRef.current = signature

    const source = wordMutationSourceRef.current
    flowLog('words state: committed', {
      source,
      summary: summarizeTimedItems(words),
      diagnostics: summarizeTimestampDiagnostics({ words }),
    })
    if (shouldPrintStateTable(source)) {
      flowTimedTable('words state table', words, { source })
    }
  }, [words])

  useEffect(() => {
    const signature = getTimedSignature(groups)
    if (signature === groupSnapshotRef.current) return
    groupSnapshotRef.current = signature

    const source = groupMutationSourceRef.current
    flowLog('groups state: committed', {
      source,
      summary: summarizeTimedItems(groups),
      diagnostics: summarizeTimestampDiagnostics({ groups }),
    })
    if (shouldPrintStateTable(source)) {
      flowTimedTable('groups state table', groups, { source })
    }
  }, [groups])

  useEffect(() => {
    const signature = JSON.stringify(settings)
    if (settingsSnapshotRef.current === undefined) {
      settingsSnapshotRef.current = signature
      return
    }
    if (signature === settingsSnapshotRef.current) return

    settingsSnapshotRef.current = signature
    flowLog('caption rules: changed', {
      settings,
      words: words.length,
      groups: groups.length,
      note: 'Groups are recalculated when Regroup runs.',
    })
  }, [groups.length, settings, words.length])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  useEffect(() => {
    if (!canAutosaveProject) {
      flowLog('project autosave: skipped', {
        reason: 'no active source media',
        restoredProject: Boolean(savedProject),
      })
      return
    }

    const didSave = saveProject(currentProject)
    const skipSignature = currentProject.skipState ? JSON.stringify(currentProject.skipState) : 'none'
    const logKey = [
      currentProject.audioFingerprint ?? 'none',
      currentProject.words.length,
      currentProject.groups.length,
      skipSignature,
    ].join(':')

    if (logKey !== autosaveLogKeyRef.current) {
      autosaveLogKeyRef.current = logKey
      flowLog('project autosave', {
        ok: didSave,
        words: currentProject.words.length,
        groups: currentProject.groups.length,
        skipZones: currentProject.skipState?.manualCuts.length ?? 0,
        transcriptFingerprint: shortFingerprint(currentProject.audioFingerprint),
        fileName: currentProject.fileName ?? null,
      })
    }
  }, [canAutosaveProject, currentProject, savedProject])

  const setActiveGroups = (
    nextGroups: CaptionGroup[],
    source = 'groups write',
    details?: Record<string, unknown>,
    options?: { recordHistory?: boolean },
  ) => {
    if (options?.recordHistory ?? true) {
      commitHistory(source)
    }
    const normalizedGroups = normalizeGroupTimings(nextGroups)
    groupMutationSourceRef.current = source
    flowLog('groups write: prepared', {
      source,
      ...details,
      incoming: summarizeTimedItems(nextGroups),
      normalized: summarizeTimedItems(normalizedGroups),
      incomingDiagnostics: summarizeTimestampDiagnostics({ groups: nextGroups }),
      normalizedDiagnostics: summarizeTimestampDiagnostics({ groups: normalizedGroups }),
    })
    if (shouldPrintStateTable(source)) {
      flowTimedTable('groups write table', normalizedGroups, { source })
    }
    setGroups(normalizedGroups)
    setSelectedGroupId((current) => current && normalizedGroups.some((group) => group.id === current) ? current : normalizedGroups[0]?.id)
  }

  const getTranscriptionSummary = (wordCount: number, groupCount: number) =>
    `${wordCount} words, ${groupCount} groups`

  const getCachedTranscription = useCallback((fingerprint: string) => {
    const cachedTranscription = loadTranscriptionCache(fingerprint, language)
    if (cachedTranscription) return cachedTranscription

    if (savedProject?.audioFingerprint !== fingerprint || savedProject.language !== language) return null

    return {
      fileName: savedProject.fileName ?? 'this audio',
      fileSize: savedProject.fileSize,
      result: {
        text: savedProject.words.map((word) => word.text).join(' '),
        words: savedProject.words,
        groups: savedProject.groups,
      },
    }
  }, [language, savedProject])

  const cachedTranscription = audioFingerprint ? getCachedTranscription(audioFingerprint) : null
  const hasCachedTranscript = Boolean(cachedTranscription)

  const loadCachedTranscription = (fingerprint: string, sourceFile?: File) => {
    flowLog('cache load: start', {
      fingerprint: shortFingerprint(fingerprint),
      language,
      file: summarizeFile(sourceFile),
    })

    const cachedTranscription = getCachedTranscription(fingerprint)
    if (!cachedTranscription) {
      flowWarn('cache load: miss', {
        fingerprint: shortFingerprint(fingerprint),
        language,
      })
      return false
    }

    const ingested = ingestTranscription(cachedTranscription.result, settings)
    flowLog('cache load: payload', {
      fingerprint: shortFingerprint(fingerprint),
      result: summarizeTranscription(cachedTranscription.result),
      ingested: summarizeTranscription(ingested.result),
      sourceGroups: ingested.sourceGroups,
      diagnostics: summarizeTimestampDiagnostics({
        words: ingested.result.words,
        groups: ingested.result.groups,
      }),
    })
    flowTimedTable('cache load words table', ingested.result.words, {
      fingerprint: shortFingerprint(fingerprint),
    })
    flowTimedTable('cache load groups table', ingested.result.groups, {
      fingerprint: shortFingerprint(fingerprint),
    })
    commitHistory('cache load')
    wordMutationSourceRef.current = 'cache load'
    setWords(ingested.result.words)
    setActiveGroups(ingested.result.groups, 'cache load', {
      fingerprint: shortFingerprint(fingerprint),
      fileName: cachedTranscription.fileName,
    }, { recordHistory: false })
    setTranscriptSource({
      audioFingerprint: fingerprint,
      fileName: sourceFile?.name ?? cachedTranscription.fileName,
      fileSize: sourceFile?.size ?? cachedTranscription.fileSize,
    })
    setSkipState(
      restoreTimelineSkipState(
        savedProject?.audioFingerprint === fingerprint && savedProject.language === language
          ? savedProject.skipState
          : undefined,
        audioUrl,
      ),
    )
    if (sourceFile) {
      const cacheWrite = saveTranscriptionCache(fingerprint, sourceFile, language, ingested.result)
      flowLog('cache load: normalized source cache', {
        ok: cacheWrite.ok,
        overwrote: cacheWrite.overwrote,
        key: cacheWrite.key,
      })
    }
    flowLog('cache load: applied', {
      fingerprint: shortFingerprint(fingerprint),
      fileName: cachedTranscription.fileName,
      result: summarizeTranscription(ingested.result),
      diagnostics: summarizeTimestampDiagnostics({
        words: ingested.result.words,
        groups: ingested.result.groups,
      }),
    })
    setStatus(
      `Loaded cached transcription for ${cachedTranscription.fileName}: ${getTranscriptionSummary(
        ingested.result.words.length,
        ingested.result.groups.length,
      )}. No API call needed.`,
    )
    return true
  }

  const handleLoadCachedTranscript = () => {
    if (!audioFingerprint) {
      flowWarn('cache load: blocked, no audio fingerprint')
      return
    }

    stopPlayback()
    if (!loadCachedTranscription(audioFingerprint, file)) {
      setStatus(
        'No cached transcription is available for this file and language. Use Transcribe to generate one.',
      )
    }
  }

  const handleFileChange = async (nextFile: File) => {
    stopPlayback()
    flowLog('upload: selected', {
      file: summarizeFile(nextFile),
      language,
    })
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setFile(nextFile)
    setAudioFingerprint(undefined)
    setAudioUrl(URL.createObjectURL(nextFile))
    resetPlaybackPosition()
    setStatus('Checking local transcription cache...')

    try {
      const fingerprint = await createAudioFingerprint(nextFile)
      setAudioFingerprint(fingerprint)
      const cacheMeta = getTranscriptionCacheMeta(fingerprint, language)
      const savedProjectFallback = savedProject?.audioFingerprint === fingerprint && savedProject.language === language
      const hasCache = cacheMeta.exists || savedProjectFallback
      const isSameTranscript = transcriptSource?.audioFingerprint === fingerprint

      flowLog('upload: fingerprint + cache check', {
        fingerprint: shortFingerprint(fingerprint),
        cacheHit: hasCache,
        cacheWords: cacheMeta.words,
        cacheGroups: cacheMeta.groups,
        savedProjectFallback,
        sameTranscript: isSameTranscript,
      })

      if (!isSameTranscript) {
        commitHistory('upload: clear stale transcript')
        wordMutationSourceRef.current = 'upload: clear stale transcript'
        groupMutationSourceRef.current = 'upload: clear stale transcript'
        setWords([])
        setGroups([])
        setSkipState(createTimelineSkipState())
        setSelectedGroupId(undefined)
        setTranscriptSource(undefined)
        flowLog('upload: cleared stale transcript', {
          previousFingerprint: shortFingerprint(transcriptSource?.audioFingerprint),
          nextFingerprint: shortFingerprint(fingerprint),
        })
      } else {
        flowLog('upload: kept current transcript', {
          fingerprint: shortFingerprint(fingerprint),
          words: words.length,
          groups: groups.length,
        })
      }

      setStatus(
        hasCache
          ? 'File staged. Cached transcription is available; use Load Cache or Transcribe fresh.'
          : 'File staged. No cached transcription found yet.',
      )
    } catch {
      flowWarn('upload: fingerprint failed', {
        file: summarizeFile(nextFile),
      })
      setStatus('File staged. Could not create a local cache fingerprint.')
    }
  }

  const handleRegroup = () => {
    stopPlayback()
    const nextGroups = groupWords(words, settings)
    flowLog('regroup: local rebuild', {
      words: words.length,
      previousGroups: groups.length,
      nextGroups: nextGroups.length,
      settings,
      diagnostics: summarizeTimestampDiagnostics({ words, groups: nextGroups }),
    })
    flowTimedTable('regroup source words table', words, { settings })
    setActiveGroups(nextGroups, 'regroup: local rebuild', {
      words: words.length,
      previousGroups: groups.length,
      settings,
    })
    setStatus('Groups rebuilt from original word timestamps. Manual text and timing edits in groups were reset.')
  }

  const handleTranscribe = async () => {
    if (!file) {
      flowWarn('transcribe: blocked, no file')
      return
    }
    stopPlayback()
    setIsTranscribing(true)
    setStatus('Sending audio to the local API...')

    try {
      const fingerprint = await ensureAudioFingerprint(file)
      const cacheBefore = getTranscriptionCacheMeta(fingerprint, language)
      flowLog('transcribe: request', {
        file: summarizeFile(file),
        language,
        fingerprint: shortFingerprint(fingerprint),
        cacheBefore: {
          exists: cacheBefore.exists,
          words: cacheBefore.words,
          groups: cacheBefore.groups,
        },
      })
      const rawResult = await transcribeFile(file, language)
      const ingested = ingestTranscription(rawResult, settings)
      flowLog('transcribe: response', {
        fingerprint: shortFingerprint(fingerprint),
        result: summarizeTranscription(rawResult),
        ingested: summarizeTranscription(ingested.result),
        sourceGroups: ingested.sourceGroups,
        diagnostics: summarizeTimestampDiagnostics({ words: ingested.result.words, groups: ingested.result.groups }),
      })
      flowTimedTable('transcribe received words table', ingested.result.words, {
        fingerprint: shortFingerprint(fingerprint),
      })
      flowTimedTable('transcribe received groups table', ingested.result.groups, {
        fingerprint: shortFingerprint(fingerprint),
      })
      const cacheWrite = saveTranscriptionCache(fingerprint, file, language, ingested.result)
      flowLog('cache write: transcription', {
        ok: cacheWrite.ok,
        overwrote: cacheWrite.overwrote,
        previousWords: cacheWrite.previousWords,
        previousGroups: cacheWrite.previousGroups,
        bytes: cacheWrite.bytes,
        key: cacheWrite.key,
      })
      commitHistory('transcribe: response')
      wordMutationSourceRef.current = 'transcribe: response'
      setWords(ingested.result.words)
      setActiveGroups(ingested.result.groups, 'transcribe: response', {
        fingerprint: shortFingerprint(fingerprint),
        cacheWriteOk: cacheWrite.ok,
      }, { recordHistory: false })
      setTranscriptSource({
        audioFingerprint: fingerprint,
        fileName: file.name,
        fileSize: file.size,
      })
      flowLog('transcribe: applied to editor', {
        fingerprint: shortFingerprint(fingerprint),
        words: ingested.result.words.length,
        groups: ingested.result.groups.length,
        autosaveSource: {
          fileName: file.name,
          fileSize: file.size,
        },
      })
      setStatus(
        cacheWrite.ok
          ? `Transcribed ${getTranscriptionSummary(ingested.result.words.length, ingested.result.groups.length)} and cached this audio locally.`
          : `Transcribed ${getTranscriptionSummary(ingested.result.words.length, ingested.result.groups.length)}. Local transcription cache failed.`,
      )
    } catch (error) {
      flowWarn('transcribe: failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      setStatus(error instanceof Error ? error.message : 'Transcription failed.')
    } finally {
      setIsTranscribing(false)
    }
  }

  const updateGroupText = (groupId: string, text: string) => {
    commitHistory('group text edit')
    groupMutationSourceRef.current = 'group text edit'
    setGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, textOverride: text } : group)),
    )
  }

  const nudgeGroupStart = useCallback((groupId: string, offset: number) => {
    commitHistory('group start nudge')
    groupMutationSourceRef.current = 'group start nudge'
    setGroups((current) => nudgeGroupStartBoundary(current, groupId, offset))
    setSelectedGroupId(groupId)
    setStatus(`Group start nudged 1 frame ${offset < 0 ? 'earlier' : 'later'}.`)
  }, [commitHistory])

  const nudgeGroupEnd = useCallback((groupId: string, offset: number) => {
    commitHistory('group end nudge')
    groupMutationSourceRef.current = 'group end nudge'
    setGroups((current) => nudgeGroupEndBoundary(current, groupId, offset))
    setSelectedGroupId(groupId)
    setStatus(`Group end nudged 1 frame ${offset < 0 ? 'earlier' : 'later'}.`)
  }, [commitHistory])

  const splitGroup = (groupId: string) => {
    const groupIndex = groups.findIndex((group) => group.id === groupId)
    const group = groups[groupIndex]
    if (!group || group.wordIds.length < 2) {
      setStatus('Single-word groups cannot be split further.')
      return
    }

    const splitAt = Math.ceil(group.wordIds.length / 2)
    const first = rebuildGroupTiming(
      {
        ...group,
        id: `${group.id}_a`,
        wordIds: group.wordIds.slice(0, splitAt),
        textOverride: undefined,
      },
      words,
    )
    const second = rebuildGroupTiming(
      {
        ...group,
        id: `${group.id}_b`,
        wordIds: group.wordIds.slice(splitAt),
        textOverride: undefined,
      },
      words,
    )
    setActiveGroups([...groups.slice(0, groupIndex), first, second, ...groups.slice(groupIndex + 1)], 'split group', {
      groupId,
    })
    setSelectedGroupId(second.id)
    setStatus('Group split while preserving word timestamps.')
  }

  const splitGroupAtCursor = (groupId: string, cursorIndex: number) => {
    const groupIndex = groups.findIndex((group) => group.id === groupId)
    const group = groups[groupIndex]
    if (!group || group.wordIds.length < 2) {
      setStatus('Single-word groups cannot be split further.')
      return false
    }

    const displayText = getGroupDisplayText(group)
    const splitAt = getTextWordCount(displayText.slice(0, cursorIndex))
    if (splitAt <= 0 || splitAt >= group.wordIds.length) {
      setStatus('Place the cursor between words to split this group.')
      return false
    }

    const firstText = getTextOverride(displayText.slice(0, cursorIndex))
    const secondText = getTextOverride(displayText.slice(cursorIndex))
    const first = rebuildGroupTiming(
      {
        ...group,
        id: `${group.id}_a`,
        wordIds: group.wordIds.slice(0, splitAt),
        textOverride: group.textOverride === undefined ? undefined : firstText,
      },
      words,
    )
    const second = rebuildGroupTiming(
      {
        ...group,
        id: `${group.id}_b`,
        wordIds: group.wordIds.slice(splitAt),
        textOverride: group.textOverride === undefined ? undefined : secondText,
      },
      words,
    )

    setActiveGroups([...groups.slice(0, groupIndex), first, second, ...groups.slice(groupIndex + 1)], 'split group at cursor', {
      groupId,
      splitAt,
    })
    setSelectedGroupId(second.id)
    setStatus('Group split from the text cursor.')
    return true
  }

  const mergeGroupWithPrevious = (groupId: string) => {
    const groupIndex = groups.findIndex((group) => group.id === groupId)
    const previous = groups[groupIndex - 1]
    const group = groups[groupIndex]
    if (!previous || !group) {
      setStatus('There is no previous group to merge.')
      return false
    }

    const merged = rebuildGroupTiming(
      {
        ...previous,
        id: `${previous.id}_m`,
        wordIds: [...previous.wordIds, ...group.wordIds],
        textOverride: getCombinedTextOverride(previous, group),
      },
      words,
    )
    setActiveGroups([...groups.slice(0, groupIndex - 1), merged, ...groups.slice(groupIndex + 1)], 'merge group with previous', {
      groupId,
    })
    setSelectedGroupId(merged.id)
    setStatus('Groups merged like a document line backspace.')
    return true
  }

  const mergeGroupWithNext = (groupId: string) => {
    const groupIndex = groups.findIndex((group) => group.id === groupId)
    const group = groups[groupIndex]
    const next = groups[groupIndex + 1]
    if (!group || !next) {
      setStatus('There is no next group to merge.')
      return
    }

    const merged = rebuildGroupTiming(
      {
        ...group,
        id: `${group.id}_m`,
        wordIds: [...group.wordIds, ...next.wordIds],
        textOverride: getCombinedTextOverride(group, next),
      },
      words,
    )
    setActiveGroups([...groups.slice(0, groupIndex), merged, ...groups.slice(groupIndex + 2)], 'merge group', {
      groupId,
    })
    setSelectedGroupId(merged.id)
    setStatus('Groups merged from their existing word timestamps.')
  }

  const handleSettingsChange = (nextSettings: GroupingSettings) => {
    commitHistory('settings change')
    setSettings(nextSettings)
  }

  const handleExportSrt = () => {
    const didSave = saveProject(currentProject)
    flowLog('export: SRT', {
      projectSaved: didSave,
      groups: groups.length,
      transcriptFingerprint: shortFingerprint(transcriptSource?.audioFingerprint),
    })
    downloadTextFile('capcut-caption-export.srt', exportSrt(groups))
    setStatus(didSave ? 'Project saved locally and SRT exported.' : 'SRT exported. Local project save failed.')
  }

  const handleExportCapCutManifest = () => {
    const manifest = buildCurrentCapCutManifest()
    const didSave = saveProject(currentProject)
    flowLog('export: CapCut patch manifest', {
      captions: manifest.captions.length,
      keptRanges: manifest.keptRanges.length,
      projectSaved: didSave,
      transcriptFingerprint: shortFingerprint(transcriptSource?.audioFingerprint),
    })
    downloadTextFile('capcut-caption-cut-manifest.json', JSON.stringify(manifest, null, 2))
    setStatus(
      didSave
        ? 'Project saved locally and CapCut cut manifest exported.'
        : 'CapCut cut manifest exported. Local project save failed.',
    )
  }

  const handleSaveProject = () => {
    if (!canAutosaveProject) {
      flowWarn('project save: blocked', {
        reason: 'no active source media',
        words: words.length,
        groups: groups.length,
      })
      setStatus('Select source media before saving this project.')
      return
    }

    const didSave = saveProject(currentProject)
    flowLog('project save: manual', {
      ok: didSave,
      words: words.length,
      groups: groups.length,
      transcriptFingerprint: shortFingerprint(transcriptSource?.audioFingerprint),
      fileName: transcriptSource?.fileName ?? null,
    })
    setStatus(didSave ? 'Project saved locally in this browser.' : 'Local project save failed.')
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const isCommandKey = event.metaKey || event.ctrlKey
      if (isCommandKey && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if ((isCommandKey && key === 'y') || (isCommandKey && event.shiftKey && key === 'z')) {
        event.preventDefault()
        redo()
        return
      }

      if (isEditableShortcutTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return

      if (selectedSkipRegionId && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        deleteSelectedSkipRegion()
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        if (!selectedGroupId) {
          void togglePlayback()
          return
        }

        if (loopedGroupId) {
          stopPlayback()
          return
        }

        void startLoopGroup(selectedGroupId)
        return
      }

      if (event.key === 'Tab') {
        if (!visibleCaptionGroups.length) return
        event.preventDefault()
        const offset = event.shiftKey ? -1 : 1
        const nextGroup = selectedGroupId
          ? visibleCaptionGroups[
              (
                Math.max(visibleCaptionGroups.findIndex((group) => group.id === selectedGroupId), 0)
                + offset
                + visibleCaptionGroups.length
              ) % visibleCaptionGroups.length
            ]
          : visibleCaptionGroups[event.shiftKey ? visibleCaptionGroups.length - 1 : 0]
        setSelectedGroupId(nextGroup.id)

        if (loopedGroupId) {
          void startLoopGroup(nextGroup.id)
        }
        return
      }

      if (!selectedGroupId) return

      if (event.code === 'KeyA' || key === 'a') {
        event.preventDefault()
        nudgeGroupStart(selectedGroupId, -timingNudgeStep)
        return
      }

      if (event.code === 'KeyD' || key === 'd') {
        event.preventDefault()
        nudgeGroupStart(selectedGroupId, timingNudgeStep)
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        nudgeGroupEnd(selectedGroupId, -timingNudgeStep)
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        nudgeGroupEnd(selectedGroupId, timingNudgeStep)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    deleteSelectedSkipRegion,
    loopedGroupId,
    nudgeGroupEnd,
    nudgeGroupStart,
    redo,
    selectedGroupId,
    selectedSkipRegionId,
    startLoopGroup,
    stopPlayback,
    togglePlayback,
    undo,
    visibleCaptionGroups,
  ])

  return (
    <CaptionWorkbenchScreen
      groups={visibleCaptionGroups}
      totalGroups={groups.length}
      selectedGroupId={visibleSelectedGroupId}
      selectedSkipRegionId={selectedSkipRegionId}
      isPlaying={isPlaying}
      isTranscribing={isTranscribing}
      canRedo={history.future.length > 0}
      canExportCutManifest={groups.length > 0 && keptTimelineRanges.length > 0}
      canSaveProject={canAutosaveProject}
      canTranscribeKeptChunks={Boolean(file) && transcribableKeptRanges.length > 0}
      canUndo={history.past.length > 0}
      hasCachedTranscript={hasCachedTranscript}
      audioUrl={audioUrl}
      captionContainerRef={captionContainerRef}
      isTimelineReady={isTimelineReady}
      timelineContainerRef={timelineContainerRef}
      timelineZoomConfig={timelineZoomConfig}
      waveformContainerRef={waveformContainerRef}
      zoomLabel={formatZoomLabel(zoomLevel)}
      zoomLevel={zoomLevel}
      language={language}
      stats={captionStats}
      settings={settings}
      timingNudgeStep={timingNudgeStep}
      capCutAgent={capCutAgent}
      capCutPatchError={capCutPatchError}
      capCutPatchSummary={capCutPatchSummary}
      capCutProjectImport={capCutProjectImport}
      capCutProjectPath={capCutProjectPath}
      capCutProjects={capCutProjects}
      isCapCutImportBusy={isCapCutImportBusy}
      isCapCutImportOpen={isCapCutImportOpen}
      isCapCutPatchBusy={isCapCutPatchBusy}
      isCapCutPatchOpen={isCapCutPatchOpen}
      isLoadingCapCutProjects={isLoadingCapCutProjects}
      onFileChange={handleFileChange}
      onLoadCachedTranscript={handleLoadCachedTranscript}
      onTranscribe={handleTranscribe}
      onRegroup={handleRegroup}
      onRedo={redo}
      onSaveProject={handleSaveProject}
      onUndo={undo}
      onExportCapCutManifest={handleExportCapCutManifest}
      onExportSrt={handleExportSrt}
      onCapCutImportClose={() => setIsCapCutImportOpen(false)}
      onCapCutImportOpen={openCapCutImportDialog}
      onCapCutImportRun={runCapCutImport}
      onCapCutPatchClose={() => setIsCapCutPatchOpen(false)}
      onCapCutPatchDryRun={runCapCutPatchDryRun}
      onCapCutPatchOpen={openCapCutPatchDialog}
      onCapCutPatchProjectPathChange={setCapCutProjectPath}
      onCapCutPatchRun={runCapCutPatch}
      onCapCutProjectsRefresh={refreshCapCutProjects}
      onTogglePlayback={togglePlayback}
      onAddSkipRegion={addSkipRegion}
      hasDetectedSilenceDraft={hasDetectedSilenceDraft}
      detectedSilenceAdjustment={detectedSilenceAdjustment}
      silenceAdjustmentConfig={silenceAdjustmentConfig}
      onDetectSilentSkipRegions={detectSilentSkipRegions}
      onDetectedSilenceAdjustmentChange={setDetectedSilenceAdjustment}
      onConfirmDetectedSilentSkipRegions={confirmDetectedSilentSkipRegions}
      onDeleteSelectedSkipRegion={deleteSelectedSkipRegion}
      onTranscribeKeptChunks={handleTranscribeKeptChunks}
      onTimelineZoomChange={setZoomLevel}
      onEditorSelect={setSelectedGroupId}
      onGroupTextChange={updateGroupText}
      onGroupTimingChange={updateGroupTiming}
      onSplitGroupAtCursor={splitGroupAtCursor}
      onMergeGroupWithPrevious={mergeGroupWithPrevious}
      onPlayGroup={playGroup}
      onSplitGroup={splitGroup}
      onMergeGroupWithNext={mergeGroupWithNext}
      onLanguageChange={setLanguage}
      onSettingsChange={handleSettingsChange}
    />
  )
}
