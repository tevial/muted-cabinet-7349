import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Pause, Play, Search } from 'lucide-react'

import { transcribeFile } from './api'
import './App.css'
import { AudioWaveform } from './components/AudioWaveform'
import { CaptionEditor } from './components/CaptionEditor'
import { CaptionTimeline } from './components/CaptionTimeline'
import { ImportPanel } from './components/ImportPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { TopBar } from './components/TopBar'
import { sampleWords } from './data/sampleProject'
import {
  defaultGroupingSettings,
  downloadTextFile,
  exportSrt,
  groupWords,
  normalizeGroupTimings,
  nudgeGroupEndBoundary,
  nudgeGroupStartBoundary,
  rebuildGroupTiming,
  setGroupBoundary,
  timingNudgeStep,
} from './lib/captioning'
import { createAudioFingerprint } from './lib/audioFingerprint'
import {
  createSavedProject,
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

function App() {
  const [savedProject] = useState(() => loadProject())
  const initialWords = savedProject?.words ?? sampleWords
  const initialGroups = normalizeGroupTimings(savedProject?.groups ?? groupWords(initialWords))
  const [words, setWords] = useState<CaptionWord[]>(initialWords)
  const [groups, setGroups] = useState<CaptionGroup[]>(initialGroups)
  const [settings, setSettings] = useState<GroupingSettings>(savedProject?.settings ?? defaultGroupingSettings)
  const [selectedGroupId, setSelectedGroupId] = useState<string>(initialGroups[0]?.id)
  const [file, setFile] = useState<File | undefined>()
  const [audioFingerprint, setAudioFingerprint] = useState<string | undefined>()
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [language, setLanguage] = useState(savedProject?.language ?? 'uk')
  const [status, setStatus] = useState(
    savedProject ? 'Saved project restored. Manual edits are preserved.' : 'Sample words loaded. Upload audio when ready.',
  )
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [timelineScaleIndex, setTimelineScaleIndex] = useState(defaultTimelineScaleIndex)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loopedGroupId, setLoopedGroupId] = useState<string | undefined>()
  const activeSegmentRef = useRef<{ groupId: string; start: number; end: number; loop: boolean } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const totalDuration = useMemo(() => Math.max(...groups.map((group) => group.end), 0), [groups])
  const averageWords = groups.length ? (words.length / groups.length).toFixed(1) : '0'
  const timelineScale = getTimelineScalePreset(timelineScaleIndex)
  const timelineWidth = getTimelineWidth(totalDuration, timelineScale.pixelsPerSecond)
  const timelineContentStyle = {
    width: timelineWidth,
    '--minor-grid': `${Math.max(4, timelineScale.unitSeconds * timelineScale.pixelsPerSecond)}px`,
    '--major-grid': `${Math.max(24, timelineScale.majorTickSeconds * timelineScale.pixelsPerSecond)}px`,
  } as CSSProperties
  const currentProject = useMemo(
    () =>
      createSavedProject(language, words, groups, settings, {
        audioFingerprint,
        fileName: file?.name,
        fileSize: file?.size,
      }),
    [audioFingerprint, file?.name, file?.size, groups, language, settings, words],
  )

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  useEffect(() => {
    saveProject(currentProject)
  }, [currentProject])

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause()
    activeSegmentRef.current = null
    setLoopedGroupId(undefined)
    setIsPlaying(false)
  }, [])

  const setActiveGroups = (nextGroups: CaptionGroup[]) => {
    const normalizedGroups = normalizeGroupTimings(nextGroups)
    setGroups(normalizedGroups)
    setSelectedGroupId((current) => current && normalizedGroups.some((group) => group.id === current) ? current : normalizedGroups[0]?.id)
  }

  const getTranscriptionSummary = (wordCount: number, groupCount: number) =>
    `${wordCount} words, ${groupCount} groups`

  const loadCachedTranscription = (fingerprint: string, sourceFile?: File) => {
    const cachedTranscription = loadTranscriptionCache(fingerprint, language)
    if (!cachedTranscription) {
      if (savedProject?.audioFingerprint !== fingerprint || savedProject.language !== language) return false

      setWords(savedProject.words)
      setActiveGroups(savedProject.groups)
      if (sourceFile) {
        saveTranscriptionCache(fingerprint, sourceFile, language, {
          text: savedProject.words.map((word) => word.text).join(' '),
          words: savedProject.words,
          groups: savedProject.groups,
        })
      }
      setStatus(
        `Loaded transcript from saved project for ${savedProject.fileName ?? 'this audio'}: ${getTranscriptionSummary(
          savedProject.words.length,
          savedProject.groups.length,
        )}.`,
      )
      return true
    }

    setWords(cachedTranscription.result.words)
    setActiveGroups(cachedTranscription.result.groups)
    setStatus(
      `Loaded cached transcription for ${cachedTranscription.fileName}: ${getTranscriptionSummary(
        cachedTranscription.result.words.length,
        cachedTranscription.result.groups.length,
      )}. No API call needed.`,
    )
    return true
  }

  const ensureAudioFingerprint = async (nextFile: File) => {
    if (audioFingerprint && file === nextFile) return audioFingerprint

    const fingerprint = await createAudioFingerprint(nextFile)
    setAudioFingerprint(fingerprint)
    return fingerprint
  }

  const handleFileChange = async (nextFile: File) => {
    stopPlayback()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setFile(nextFile)
    setAudioFingerprint(undefined)
    setAudioUrl(URL.createObjectURL(nextFile))
    setStatus('Checking local transcription cache...')

    try {
      const fingerprint = await createAudioFingerprint(nextFile)
      setAudioFingerprint(fingerprint)

      if (!loadCachedTranscription(fingerprint, nextFile)) {
        setStatus('File staged. No cached transcription found yet.')
      }
    } catch {
      setStatus('File staged. Could not create a local cache fingerprint.')
    }
  }

  const handleLoadSample = () => {
    stopPlayback()
    setWords(sampleWords)
    setActiveGroups(groupWords(sampleWords, settings))
    setStatus('Sample words loaded for editing and SRT export.')
  }

  const handleRegroup = () => {
    stopPlayback()
    setActiveGroups(groupWords(words, settings))
    setStatus('Groups rebuilt from original word timestamps. Manual text and timing edits in groups were reset.')
  }

  const handleTranscribe = async (options?: { bypassCache?: boolean }) => {
    if (!file) return
    stopPlayback()
    setIsTranscribing(true)
    setStatus(options?.bypassCache ? 'Bypassing local cache and sending audio to the API...' : 'Checking local transcription cache...')

    try {
      const fingerprint = await ensureAudioFingerprint(file)
      if (!options?.bypassCache && loadCachedTranscription(fingerprint, file)) return

      setStatus('Sending audio to the local API...')
      const result = await transcribeFile(file, language)
      const didCache = saveTranscriptionCache(fingerprint, file, language, result)
      setWords(result.words)
      setActiveGroups(result.groups)
      setStatus(
        didCache
          ? `Transcribed ${getTranscriptionSummary(result.words.length, result.groups.length)} and cached this audio locally.`
          : `Transcribed ${getTranscriptionSummary(result.words.length, result.groups.length)}. Local transcription cache failed.`,
      )
    } catch (error) {
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
    downloadTextFile('capcut-caption-export.srt', exportSrt(groups))
    setStatus(didSave ? 'Project saved locally and SRT exported.' : 'SRT exported. Local project save failed.')
  }

  const handleSaveProject = () => {
    const didSave = saveProject(currentProject)
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
    audio.currentTime = start
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
    audio.currentTime = group.start
    await audio.play()
    setIsPlaying(true)
    setStatus('Looping selected group. Space stops playback.')
  }, [audioUrl, groups])

  const togglePlayback = async () => {
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

    setLoopedGroupId(undefined)
    activeSegmentRef.current = null
    await audio.play()
    setIsPlaying(true)
  }

  const playGroup = (groupId: string) => {
    const group = groups.find((item) => item.id === groupId)
    if (!group) return
    setSelectedGroupId(groupId)
    void playFrom(group.start, group.end, group.id)
  }

  const handleAudioTimeUpdate = () => {
    const audio = audioRef.current
    const activeSegment = activeSegmentRef.current
    if (!audio || !activeSegment) return

    if (audio.currentTime >= activeSegment.end) {
      if (activeSegment.loop) {
        audio.currentTime = activeSegment.start
        void audio.play()
        return
      }

      audio.pause()
      setIsPlaying(false)
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
      if (!selectedGroupId || !groups.length) return

      const key = event.key.toLowerCase()

      if (event.code === 'Space') {
        event.preventDefault()
        if (loopedGroupId) {
          stopPlayback()
          return
        }

        void startLoopGroup(selectedGroupId)
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        const selectedIndex = Math.max(groups.findIndex((group) => group.id === selectedGroupId), 0)
        const offset = event.shiftKey ? -1 : 1
        const nextGroup = groups[(selectedIndex + offset + groups.length) % groups.length]
        setSelectedGroupId(nextGroup.id)

        if (loopedGroupId) {
          void startLoopGroup(nextGroup.id)
        }
        return
      }

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
  }, [groups, loopedGroupId, nudgeGroupEnd, nudgeGroupStart, selectedGroupId, startLoopGroup, stopPlayback])

  return (
    <main className="app-shell">
      <TopBar
        canExport={groups.length > 0}
        canTranscribe={Boolean(file)}
        isTranscribing={isTranscribing}
        onTranscribe={handleTranscribe}
        onRegroup={handleRegroup}
        onSaveProject={handleSaveProject}
        onExportSrt={handleExportSrt}
      />

      <section className="workspace">
        <section className="main-stage">
          <ImportPanel
            fileName={file?.name}
            language={language}
            status={status}
            isTranscribing={isTranscribing}
            onLanguageChange={setLanguage}
            onFileChange={handleFileChange}
            onLoadSample={handleLoadSample}
            onTranscribe={handleTranscribe}
          />

          <div className="metrics-row">
            <div>
              <span>{words.length}</span>
              <p>Words</p>
            </div>
            <div>
              <span>{groups.length}</span>
              <p>Caption blocks</p>
            </div>
            <div>
              <span>{averageWords}</span>
              <p>Words per block</p>
            </div>
            <div>
              <span>{totalDuration.toFixed(1)}s</span>
              <p>Timed range</p>
            </div>
          </div>

          <section className="playback-panel">
            <audio
              ref={audioRef}
              src={audioUrl}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
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
            <div className="timeline-scroll">
              <div className="timeline-content" style={timelineContentStyle}>
                <AudioWaveform audioUrl={audioUrl} pixelsPerSecond={timelineScale.pixelsPerSecond} />

                <CaptionTimeline
                  groups={groups}
                  scale={timelineScale}
                  selectedGroupId={selectedGroupId}
                  onSelect={setSelectedGroupId}
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
          <SettingsPanel settings={settings} onChange={setSettings} />
        </div>
      </section>
    </main>
  )
}

export default App
