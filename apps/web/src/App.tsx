import { useEffect, useMemo, useRef, useState } from 'react'
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
  rebuildGroupTiming,
} from './lib/captioning'
import type { CaptionGroup, CaptionWord, GroupingSettings } from './types'

function App() {
  const [words, setWords] = useState<CaptionWord[]>(sampleWords)
  const [groups, setGroups] = useState<CaptionGroup[]>(() => groupWords(sampleWords))
  const [settings, setSettings] = useState<GroupingSettings>(defaultGroupingSettings)
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id)
  const [file, setFile] = useState<File | undefined>()
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [language, setLanguage] = useState('uk')
  const [status, setStatus] = useState('Sample words loaded. Upload audio when ready.')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [timelineZoom, setTimelineZoom] = useState(2)
  const [isPlaying, setIsPlaying] = useState(false)
  const activeSegmentRef = useRef<{ groupId: string; end: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const totalDuration = useMemo(() => Math.max(...groups.map((group) => group.end), 0), [groups])
  const averageWords = groups.length ? (words.length / groups.length).toFixed(1) : '0'

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const setActiveGroups = (nextGroups: CaptionGroup[]) => {
    setGroups(nextGroups)
    setSelectedGroupId((current) => current && nextGroups.some((group) => group.id === current) ? current : nextGroups[0]?.id)
  }

  const handleFileChange = (nextFile: File) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setFile(nextFile)
    setAudioUrl(URL.createObjectURL(nextFile))
    setStatus('File staged. Start transcription when the API server is running.')
  }

  const handleLoadSample = () => {
    setWords(sampleWords)
    setActiveGroups(groupWords(sampleWords, settings))
    setStatus('Sample words loaded for editing and SRT export.')
  }

  const handleRegroup = () => {
    setActiveGroups(groupWords(words, settings))
    setStatus('Groups rebuilt from original word timestamps.')
  }

  const handleTranscribe = async () => {
    if (!file) return
    setIsTranscribing(true)
    setStatus('Sending audio to the local API...')

    try {
      const result = await transcribeFile(file, language)
      setWords(result.words)
      setActiveGroups(result.groups)
      setStatus(`Transcribed ${result.words.length} words. Review grouping before export.`)
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
    downloadTextFile('capcut-caption-export.srt', exportSrt(groups))
    setStatus('SRT exported. Import it into CapCut captions.')
  }

  const playFrom = async (start: number, end?: number, groupId?: string) => {
    const audio = audioRef.current
    if (!audioUrl || !audio) {
      setStatus('Upload audio or video to audition timing.')
      return
    }

    activeSegmentRef.current = end && groupId ? { groupId, end } : null
    audio.currentTime = start
    await audio.play()
    setIsPlaying(true)
  }

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
      audio.pause()
      setIsPlaying(false)
      activeSegmentRef.current = null
    }
  }

  return (
    <main className="app-shell">
      <TopBar
        canExport={groups.length > 0}
        canTranscribe={Boolean(file)}
        isTranscribing={isTranscribing}
        onTranscribe={handleTranscribe}
        onRegroup={handleRegroup}
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
              <span>Zoom</span>
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={timelineZoom}
                onChange={(event) => setTimelineZoom(Number(event.target.value))}
              />
              <strong>{timelineZoom.toFixed(1)}x</strong>
            </label>
          </section>

          <AudioWaveform audioUrl={audioUrl} zoom={timelineZoom} />

          <CaptionTimeline
            groups={groups}
            zoom={timelineZoom}
            selectedGroupId={selectedGroupId}
            onSelect={setSelectedGroupId}
            onPlayGroup={playGroup}
          />

          <CaptionEditor
            groups={groups}
            words={words}
            selectedGroupId={selectedGroupId}
            onSelect={setSelectedGroupId}
            onTextChange={updateGroupText}
            onPlayGroup={playGroup}
            onSplit={splitGroup}
            onMergeNext={mergeGroupWithNext}
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
