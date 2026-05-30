import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { transcribeFile } from '../../services/transcription/transcriptionClient'
import { sampleWords } from '../../data/sampleProject'
import {
  defaultGroupingSettings,
  exportSrt,
  groupWords,
  ingestTranscription,
  normalizeGroupTimings,
  nudgeGroupEndBoundary,
  nudgeGroupStartBoundary,
  rebuildGroupTiming,
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
} from '../../services/storage/projectRepository'
import {
  defaultTimelineScaleIndex,
  getTimelineScalePreset,
  getTimelineWidth,
  timelineScalePresets,
} from '../../lib/timelineScale'
import type { CaptionGroup, CaptionWord, GroupingSettings } from '../../contracts/captions'
import { useTimelinePlayback } from './model/useTimelinePlayback'
import { CaptionWorkbenchScreen } from './ui/CaptionWorkbenchScreen'

const isEditableShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

type TranscriptSource = {
  audioFingerprint?: string
  fileName?: string
  fileSize?: number
}

export function CaptionWorkbench() {
  const [savedProject] = useState(() => loadProject())
  const initialWords = savedProject?.words ?? sampleWords
  const initialGroups = normalizeGroupTimings(savedProject?.groups ?? groupWords(initialWords))
  const [words, setWords] = useState<CaptionWord[]>(initialWords)
  const [groups, setGroups] = useState<CaptionGroup[]>(initialGroups)
  const [settings, setSettings] = useState<GroupingSettings>(savedProject?.settings ?? defaultGroupingSettings)
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(initialGroups[0]?.id)
  const [file, setFile] = useState<File | undefined>()
  const [audioFingerprint, setAudioFingerprint] = useState<string | undefined>()
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSource | undefined>(() =>
    savedProject?.audioFingerprint
      ? {
          audioFingerprint: savedProject.audioFingerprint,
          fileName: savedProject.fileName,
          fileSize: savedProject.fileSize,
        }
      : undefined,
  )
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [language, setLanguage] = useState(savedProject?.language ?? 'uk')
  const [status, setStatus] = useState(
    savedProject ? 'Saved project restored. Manual edits are preserved.' : 'Sample words loaded. Upload audio when ready.',
  )
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [timelineScaleIndex, setTimelineScaleIndex] = useState(defaultTimelineScaleIndex)
  const autosaveLogKeyRef = useRef<string | undefined>(undefined)
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

  const totalDuration = useMemo(() => Math.max(...groups.map((group) => group.end), 0), [groups])
  const {
    audioRef,
    emptyZoneCuts,
    handleAudioEnded,
    handleAudioPause,
    handleAudioTimeUpdate,
    handleTimelineGroupSelect,
    handleTimelineSeek,
    isPlaying,
    loopedGroupId,
    playGroup,
    playheadStyle,
    resetPlaybackPosition,
    startLoopGroup,
    stopPlayback,
    syncAudioPosition,
    timelineDuration,
    timelineScrollRef,
    togglePlayback,
  } = useTimelinePlayback({
    audioUrl,
    contentDuration: totalDuration,
    groups,
    selectedGroupId,
    setSelectedGroupId,
    setStatus,
    settings,
    words,
  })
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
  const timelineScale = getTimelineScalePreset(timelineScaleIndex)
  const timelineWidth = getTimelineWidth(timelineDuration, timelineScale.pixelsPerSecond)
  const timelineContentStyle = {
    width: timelineWidth,
    '--minor-grid': `${Math.max(4, timelineScale.unitSeconds * timelineScale.pixelsPerSecond)}px`,
    '--major-grid': `${Math.max(24, timelineScale.majorTickSeconds * timelineScale.pixelsPerSecond)}px`,
  } as CSSProperties
  const currentProject = useMemo(
    () =>
      createSavedProject(language, words, groups, settings, transcriptSource),
    [groups, language, settings, transcriptSource, words],
  )

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
    const didSave = saveProject(currentProject)
    const logKey = `${currentProject.audioFingerprint ?? 'none'}:${currentProject.words.length}:${currentProject.groups.length}`

    if (logKey !== autosaveLogKeyRef.current) {
      autosaveLogKeyRef.current = logKey
      flowLog('project autosave', {
        ok: didSave,
        words: currentProject.words.length,
        groups: currentProject.groups.length,
        transcriptFingerprint: shortFingerprint(currentProject.audioFingerprint),
        fileName: currentProject.fileName ?? null,
      })
    }
  }, [currentProject])

  const setActiveGroups = (
    nextGroups: CaptionGroup[],
    source = 'groups write',
    details?: Record<string, unknown>,
  ) => {
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
    wordMutationSourceRef.current = 'cache load'
    setWords(ingested.result.words)
    setActiveGroups(ingested.result.groups, 'cache load', {
      fingerprint: shortFingerprint(fingerprint),
      fileName: cachedTranscription.fileName,
    })
    setTranscriptSource({
      audioFingerprint: fingerprint,
      fileName: sourceFile?.name ?? cachedTranscription.fileName,
      fileSize: sourceFile?.size ?? cachedTranscription.fileSize,
    })
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

  const ensureAudioFingerprint = async (nextFile: File) => {
    if (audioFingerprint && file === nextFile) return audioFingerprint

    const fingerprint = await createAudioFingerprint(nextFile)
    setAudioFingerprint(fingerprint)
    return fingerprint
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
        wordMutationSourceRef.current = 'upload: clear stale transcript'
        groupMutationSourceRef.current = 'upload: clear stale transcript'
        setWords([])
        setGroups([])
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
      wordMutationSourceRef.current = 'transcribe: response'
      setWords(ingested.result.words)
      setActiveGroups(ingested.result.groups, 'transcribe: response', {
        fingerprint: shortFingerprint(fingerprint),
        cacheWriteOk: cacheWrite.ok,
      })
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
    groupMutationSourceRef.current = 'group text edit'
    setGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, textOverride: text } : group)),
    )
  }

  const updateGroupTiming = (groupId: string, start: number, end: number) => {
    groupMutationSourceRef.current = 'group timing edit'
    setGroups((current) => setGroupBoundary(current, groupId, start, end))
  }

  const nudgeGroupStart = useCallback((groupId: string, offset: number) => {
    groupMutationSourceRef.current = 'group start nudge'
    setGroups((current) => nudgeGroupStartBoundary(current, groupId, offset))
    setSelectedGroupId(groupId)
    setStatus(`Group start nudged 1 frame ${offset < 0 ? 'earlier' : 'later'}.`)
  }, [])

  const nudgeGroupEnd = useCallback((groupId: string, offset: number) => {
    groupMutationSourceRef.current = 'group end nudge'
    setGroups((current) => nudgeGroupEndBoundary(current, groupId, offset))
    setSelectedGroupId(groupId)
    setStatus(`Group end nudged 1 frame ${offset < 0 ? 'earlier' : 'later'}.`)
  }, [])

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
        textOverride: undefined,
      },
      words,
    )
    setActiveGroups([...groups.slice(0, groupIndex), merged, ...groups.slice(groupIndex + 2)], 'merge group', {
      groupId,
    })
    setSelectedGroupId(merged.id)
    setStatus('Groups merged from their existing word timestamps.')
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

  const handleSaveProject = () => {
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
      if (isEditableShortcutTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return

      const key = event.key.toLowerCase()

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
        if (!groups.length) return
        event.preventDefault()
        const offset = event.shiftKey ? -1 : 1
        const nextGroup = selectedGroupId
          ? groups[(Math.max(groups.findIndex((group) => group.id === selectedGroupId), 0) + offset + groups.length) % groups.length]
          : groups[event.shiftKey ? groups.length - 1 : 0]
        setSelectedGroupId(nextGroup.id)

        if (loopedGroupId) {
          void startLoopGroup(nextGroup.id)
        }
        return
      }

      if (!selectedGroupId) return

      if (key === 'a') {
        event.preventDefault()
        nudgeGroupStart(selectedGroupId, -timingNudgeStep)
        return
      }

      if (key === 'd') {
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
  }, [groups, loopedGroupId, nudgeGroupEnd, nudgeGroupStart, selectedGroupId, startLoopGroup, stopPlayback, togglePlayback])

  return (
    <CaptionWorkbenchScreen
      fileName={file?.name}
      status={status}
      groups={groups}
      words={words}
      selectedGroupId={selectedGroupId}
      isPlaying={isPlaying}
      isTranscribing={isTranscribing}
      hasCachedTranscript={hasCachedTranscript}
      audioUrl={audioUrl}
      audioRef={audioRef}
      timelineScrollRef={timelineScrollRef}
      timelineScale={timelineScale}
      timelineScaleIndex={timelineScaleIndex}
      timelineScalePresets={timelineScalePresets}
      timelineContentStyle={timelineContentStyle}
      playheadStyle={playheadStyle}
      emptyZoneCuts={emptyZoneCuts}
      timelineDuration={timelineDuration}
      language={language}
      stats={captionStats}
      settings={settings}
      timingNudgeStep={timingNudgeStep}
      onFileChange={handleFileChange}
      onLoadCachedTranscript={handleLoadCachedTranscript}
      onTranscribe={handleTranscribe}
      onRegroup={handleRegroup}
      onSaveProject={handleSaveProject}
      onExportSrt={handleExportSrt}
      onTogglePlayback={togglePlayback}
      onTimelineScaleIndexChange={setTimelineScaleIndex}
      onAudioPositionSync={syncAudioPosition}
      onAudioTimeUpdate={handleAudioTimeUpdate}
      onTimelineSeek={handleTimelineSeek}
      onTimelineGroupSelect={handleTimelineGroupSelect}
      onEditorSelect={setSelectedGroupId}
      onGroupTextChange={updateGroupText}
      onGroupTimingChange={updateGroupTiming}
      onGroupStartNudge={nudgeGroupStart}
      onPlayGroup={playGroup}
      onSplitGroup={splitGroup}
      onMergeGroupWithNext={mergeGroupWithNext}
      onLanguageChange={setLanguage}
      onSettingsChange={setSettings}
      onAudioPause={handleAudioPause}
      onAudioEnded={handleAudioEnded}
    />
  )
}
