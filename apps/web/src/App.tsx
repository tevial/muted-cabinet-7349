import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { Pause, Play, Search } from 'lucide-react'

import { transcribeFile } from './api'
import './App.css'
import { AudioWaveform } from './components/AudioWaveform'
import { CaptionEditor } from './components/CaptionEditor'
import { CaptionTimeline } from './components/CaptionTimeline'
import { EmptyZoneOverlay } from './components/EmptyZoneOverlay'
import { SettingsPanel } from './components/SettingsPanel'
import { TopBar } from './components/TopBar'
import { sampleWords } from './data/sampleProject'
import {
  defaultGroupingSettings,
  downloadTextFile,
  exportSrt,
  formatSeconds,
  getEmptyZoneCuts,
  groupWords,
  normalizeGroupTimings,
  nudgeGroupEndBoundary,
  nudgeGroupStartBoundary,
  rebuildGroupTiming,
  setGroupBoundary,
  timingNudgeStep,
} from './lib/captioning'
import { createAudioFingerprint } from './lib/audioFingerprint'
import { flowLog, flowWarn, shortFingerprint, summarizeFile, summarizeTranscription } from './lib/flowLogger'
import {
  createSavedProject,
  getTranscriptionCacheMeta,
  loadProject,
  loadTranscriptionCache,
  saveProject,
  saveTranscriptionCache,
} from './lib/projectStorage'
import {
  defaultTimelineScaleIndex,
  getTimelineScalePreset,
  getTimelineWidth,
  timelineScalePresets,
} from './lib/timelineScale'
import type { CaptionGroup, CaptionWord, GroupingSettings } from './types'

const isEditableShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

type TranscriptSource = {
  audioFingerprint?: string
  fileName?: string
  fileSize?: number
}

function App() {
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
  const [isPlaying, setIsPlaying] = useState(false)
  const [loopedGroupId, setLoopedGroupId] = useState<string | undefined>()
  const [audioDuration, setAudioDuration] = useState(0)
  const [playheadTime, setPlayheadTime] = useState(0)
  const activeSegmentRef = useRef<{ groupId: string; start: number; end: number; loop: boolean } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)
  const autosaveLogKeyRef = useRef<string | undefined>(undefined)
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
  const timelineDuration = Math.max(totalDuration, audioDuration, playheadTime, 1)
  const averageWords = groups.length ? (words.length / groups.length).toFixed(1) : '0'
  const emptyZoneCuts = useMemo(
    () => getEmptyZoneCuts(words, timelineDuration, settings),
    [settings, timelineDuration, words],
  )
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
  const playheadStyle = {
    left: `${Math.min(Math.max(playheadTime / timelineDuration, 0), 1) * 100}%`,
  } as CSSProperties
  const currentProject = useMemo(
    () =>
      createSavedProject(language, words, groups, settings, transcriptSource),
    [groups, language, settings, transcriptSource, words],
  )

  useEffect(() => {
    flowLog('boot', bootFlowLogRef.current)
  }, [])

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

  const keepPlayheadInView = useCallback((time: number) => {
    const scroller = timelineScrollRef.current
    if (!scroller) return

    const playheadX = (time / timelineDuration) * scroller.scrollWidth
    const leftEdge = scroller.scrollLeft
    const rightEdge = leftEdge + scroller.clientWidth
    const margin = Math.min(160, scroller.clientWidth * 0.2)

    if (playheadX < leftEdge + margin || playheadX > rightEdge - margin) {
      scroller.scrollLeft = Math.max(0, playheadX - scroller.clientWidth * 0.35)
    }
  }, [timelineDuration])

  useEffect(() => {
    if (!isPlaying) return

    let animationFrame = 0
    let lastSync = 0
    const syncPlayhead = (timestamp: number) => {
      const audio = audioRef.current
      if (audio && timestamp - lastSync > 33) {
        setPlayheadTime(audio.currentTime)
        keepPlayheadInView(audio.currentTime)
        lastSync = timestamp
      }
      animationFrame = requestAnimationFrame(syncPlayhead)
    }

    animationFrame = requestAnimationFrame(syncPlayhead)
    return () => cancelAnimationFrame(animationFrame)
  }, [isPlaying, keepPlayheadInView])

  const clearSegmentPlayback = useCallback(() => {
    activeSegmentRef.current = null
    setLoopedGroupId(undefined)
  }, [])

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause()
    clearSegmentPlayback()
    setIsPlaying(false)
  }, [clearSegmentPlayback])

  const syncAudioPosition = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (Number.isFinite(audio.duration)) {
      setAudioDuration(audio.duration)
    }
    setPlayheadTime(audio.currentTime)
  }, [])

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current
    const audioLimit = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined
    const maxTime = audioLimit ?? timelineDuration
    const nextTime = Math.min(Math.max(time, 0), Math.max(maxTime, 0))

    if (audio && audioUrl) {
      audio.currentTime = nextTime
    }
    setPlayheadTime(nextTime)
    keepPlayheadInView(nextTime)
    return nextTime
  }, [audioUrl, keepPlayheadInView, timelineDuration])

  const setActiveGroups = (nextGroups: CaptionGroup[]) => {
    const normalizedGroups = normalizeGroupTimings(nextGroups)
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

    setWords(cachedTranscription.result.words)
    setActiveGroups(cachedTranscription.result.groups)
    setTranscriptSource({
      audioFingerprint: fingerprint,
      fileName: sourceFile?.name ?? cachedTranscription.fileName,
      fileSize: sourceFile?.size ?? cachedTranscription.fileSize,
    })
    if (sourceFile) {
      const cacheWrite = saveTranscriptionCache(fingerprint, sourceFile, language, cachedTranscription.result)
      flowLog('cache load: normalized source cache', {
        ok: cacheWrite.ok,
        overwrote: cacheWrite.overwrote,
        key: cacheWrite.key,
      })
    }
    flowLog('cache load: applied', {
      fingerprint: shortFingerprint(fingerprint),
      fileName: cachedTranscription.fileName,
      result: summarizeTranscription(cachedTranscription.result),
    })
    setStatus(
      `Loaded cached transcription for ${cachedTranscription.fileName}: ${getTranscriptionSummary(
        cachedTranscription.result.words.length,
        cachedTranscription.result.groups.length,
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
    setAudioDuration(0)
    setPlayheadTime(0)
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
    flowLog('regroup: local rebuild', {
      words: words.length,
      previousGroups: groups.length,
      settings,
    })
    setActiveGroups(groupWords(words, settings))
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
      const result = await transcribeFile(file, language)
      flowLog('transcribe: response', {
        fingerprint: shortFingerprint(fingerprint),
        result: summarizeTranscription(result),
      })
      const cacheWrite = saveTranscriptionCache(fingerprint, file, language, result)
      flowLog('cache write: transcription', {
        ok: cacheWrite.ok,
        overwrote: cacheWrite.overwrote,
        previousWords: cacheWrite.previousWords,
        previousGroups: cacheWrite.previousGroups,
        bytes: cacheWrite.bytes,
        key: cacheWrite.key,
      })
      setWords(result.words)
      setActiveGroups(result.groups)
      setTranscriptSource({
        audioFingerprint: fingerprint,
        fileName: file.name,
        fileSize: file.size,
      })
      flowLog('transcribe: applied to editor', {
        fingerprint: shortFingerprint(fingerprint),
        words: result.words.length,
        groups: result.groups.length,
        autosaveSource: {
          fileName: file.name,
          fileSize: file.size,
        },
      })
      setStatus(
        cacheWrite.ok
          ? `Transcribed ${getTranscriptionSummary(result.words.length, result.groups.length)} and cached this audio locally.`
          : `Transcribed ${getTranscriptionSummary(result.words.length, result.groups.length)}. Local transcription cache failed.`,
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
    setGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, textOverride: text } : group)),
    )
  }

  const updateGroupTiming = (groupId: string, start: number, end: number) => {
    setGroups((current) => setGroupBoundary(current, groupId, start, end))
  }

  const nudgeGroupStart = useCallback((groupId: string, offset: number) => {
    setGroups((current) => nudgeGroupStartBoundary(current, groupId, offset))
    setSelectedGroupId(groupId)
    setStatus(`Group start nudged 1 frame ${offset < 0 ? 'earlier' : 'later'}.`)
  }, [])

  const nudgeGroupEnd = useCallback((groupId: string, offset: number) => {
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
    setActiveGroups([...groups.slice(0, groupIndex), first, second, ...groups.slice(groupIndex + 1)])
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
    setActiveGroups([...groups.slice(0, groupIndex), merged, ...groups.slice(groupIndex + 2)])
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

  const playFrom = async (start: number, end?: number, groupId?: string) => {
    const audio = audioRef.current
    if (!audioUrl || !audio) {
      setStatus('Upload audio or video to audition timing.')
      return
    }

    setLoopedGroupId(undefined)
    activeSegmentRef.current = end && groupId ? { groupId, start, end, loop: false } : null
    seekTo(start)
    await audio.play()
    setIsPlaying(true)
  }

  const startLoopGroup = useCallback(async (groupId: string) => {
    const audio = audioRef.current
    const group = groups.find((item) => item.id === groupId)
    if (!audioUrl || !audio || !group) {
      setStatus('Upload audio or video to loop the selected group.')
      return
    }

    setSelectedGroupId(group.id)
    setLoopedGroupId(group.id)
    activeSegmentRef.current = { groupId: group.id, start: group.start, end: group.end, loop: true }
    seekTo(group.start)
    await audio.play()
    setIsPlaying(true)
    setStatus('Looping selected group. Space stops playback.')
  }, [audioUrl, groups, seekTo])

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current
    if (!audioUrl || !audio) {
      setStatus('Upload audio or video to play the timeline.')
      return
    }

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      return
    }

    clearSegmentPlayback()
    if (audio.ended || audio.currentTime >= audio.duration) {
      seekTo(0)
    }
    await audio.play()
    setIsPlaying(true)
  }, [audioUrl, clearSegmentPlayback, isPlaying, seekTo])

  const playGroup = (groupId: string) => {
    const group = groups.find((item) => item.id === groupId)
    if (!group) return
    setSelectedGroupId(groupId)
    void playFrom(group.start, group.end, group.id)
  }

  const handleTimelineGroupSelect = (groupId: string) => {
    if (selectedGroupId === groupId) {
      setSelectedGroupId(undefined)
      if (loopedGroupId === groupId || activeSegmentRef.current?.groupId === groupId) {
        clearSegmentPlayback()
      }
      setStatus('Group deselected. Space plays the full timeline from the playhead.')
      return
    }

    setSelectedGroupId(groupId)
    if (loopedGroupId) {
      void startLoopGroup(groupId)
      return
    }
    activeSegmentRef.current = null
    setStatus('Group selected. Space loops this group.')
  }

  const handleTimelineSeek = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width) return

    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const nextTime = seekTo((x / rect.width) * timelineDuration)
    clearSegmentPlayback()
    setSelectedGroupId(undefined)
    setStatus(`Playhead moved to ${formatSeconds(nextTime)}. Space plays the full timeline from here.`)
  }

  const handleAudioTimeUpdate = () => {
    const audio = audioRef.current
    if (audio) setPlayheadTime(audio.currentTime)

    const activeSegment = activeSegmentRef.current
    if (!audio) return

    if (!activeSegment) {
      const cut = emptyZoneCuts.find((item) => audio.currentTime >= item.start && audio.currentTime < item.end)
      if (cut) {
        seekTo(cut.end)
      }
      return
    }

    if (audio.currentTime >= activeSegment.end) {
      if (activeSegment.loop) {
        audio.currentTime = activeSegment.start
        setPlayheadTime(activeSegment.start)
        void audio.play()
        return
      }

      audio.pause()
      setIsPlaying(false)
      setPlayheadTime(activeSegment.end)
      activeSegmentRef.current = null
    }
  }

  useEffect(() => {
    if (!loopedGroupId) return

    const group = groups.find((item) => item.id === loopedGroupId)
    const audio = audioRef.current
    if (!group || !audio) {
      activeSegmentRef.current = null
      setLoopedGroupId(undefined)
      return
    }

    activeSegmentRef.current = { groupId: group.id, start: group.start, end: group.end, loop: true }
    audio.currentTime = group.start
    void audio.play()
    setIsPlaying(true)
  }, [groups, loopedGroupId])

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
    <main className="app-shell">
      <TopBar
        canExport={groups.length > 0}
        canTranscribe={Boolean(file)}
        hasCachedTranscript={hasCachedTranscript}
        isTranscribing={isTranscribing}
        onFileChange={handleFileChange}
        onLoadCachedTranscript={handleLoadCachedTranscript}
        onTranscribe={handleTranscribe}
        onRegroup={handleRegroup}
        onSaveProject={handleSaveProject}
        onExportSrt={handleExportSrt}
      />

      <section className="workspace">
        <section className="main-stage">
          <div className="status-strip">
            <strong>{file?.name ?? 'No source file selected'}</strong>
            <span>{status}</span>
          </div>

          <section className="playback-panel">
            <audio
              ref={audioRef}
              src={audioUrl}
              onLoadedMetadata={syncAudioPosition}
              onDurationChange={syncAudioPosition}
              onSeeked={syncAudioPosition}
              onPause={() => {
                setIsPlaying(false)
                syncAudioPosition()
              }}
              onEnded={() => {
                setIsPlaying(false)
                clearSegmentPlayback()
                syncAudioPosition()
              }}
              onTimeUpdate={handleAudioTimeUpdate}
            />

            <button className="primary-button" type="button" onClick={togglePlayback}>
              {isPlaying ? <Pause size={17} /> : <Play size={17} />}
              {isPlaying ? 'Pause' : 'Play timeline'}
            </button>

            <label className="zoom-control">
              <Search size={16} />
              <span>Time detail</span>
              <input
                type="range"
                min={0}
                max={timelineScalePresets.length - 1}
                step={1}
                value={timelineScaleIndex}
                onChange={(event) => setTimelineScaleIndex(Number(event.target.value))}
              />
              <strong>{timelineScale.label}</strong>
              <em>{timelineScale.detail}</em>
            </label>
          </section>

          <section className="timeline-stack">
            <div className="timeline-scroll" ref={timelineScrollRef}>
              <div className="timeline-content" style={timelineContentStyle} onClick={handleTimelineSeek}>
                <div className="timeline-playhead" style={playheadStyle} aria-hidden="true" />
                <EmptyZoneOverlay cuts={emptyZoneCuts} duration={timelineDuration} />
                <AudioWaveform audioUrl={audioUrl} pixelsPerSecond={timelineScale.pixelsPerSecond} />

                <CaptionTimeline
                  groups={groups}
                  scale={timelineScale}
                  duration={timelineDuration}
                  selectedGroupId={selectedGroupId}
                  onSelect={handleTimelineGroupSelect}
                  onPlayGroup={playGroup}
                />
              </div>
            </div>
          </section>

          <CaptionEditor
            groups={groups}
            words={words}
            selectedGroupId={selectedGroupId}
            onSelect={setSelectedGroupId}
            onTextChange={updateGroupText}
            onTimingChange={updateGroupTiming}
            onNudgeTiming={nudgeGroupStart}
            onPlayGroup={playGroup}
            onSplit={splitGroup}
            onMergeNext={mergeGroupWithNext}
            timingNudgeStep={timingNudgeStep}
          />
        </section>

        <div className="right-rail">
          <SettingsPanel
            language={language}
            stats={captionStats}
            settings={settings}
            onLanguageChange={setLanguage}
            onChange={setSettings}
          />
        </div>
      </section>
    </main>
  )
}

export default App
