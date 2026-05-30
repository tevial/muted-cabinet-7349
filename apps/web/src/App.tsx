import { useMemo, useState } from 'react'

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

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId),
    [groups, selectedGroupId],
  )

  const totalDuration = useMemo(() => Math.max(...groups.map((group) => group.end), 0), [groups])
  const averageWords = groups.length ? (words.length / groups.length).toFixed(1) : '0'

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

        <section className="main-stage">
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

          <AudioWaveform audioUrl={audioUrl} />

          <CaptionTimeline groups={groups} selectedGroupId={selectedGroupId} onSelect={setSelectedGroupId} />

          <CaptionEditor
            groups={groups}
            words={words}
            selectedGroupId={selectedGroupId}
            onSelect={setSelectedGroupId}
            onTextChange={updateGroupText}
            onSplit={splitGroup}
            onMergeNext={mergeGroupWithNext}
          />
        </section>

        <div className="right-rail">
          <SettingsPanel settings={settings} onChange={setSettings} />

          <aside className="panel selected-panel">
            <div className="panel-heading">
              <p className="panel-kicker">Selection</p>
              <h2>{selectedGroup ? selectedGroup.textOverride || selectedGroup.text : 'No group'}</h2>
            </div>
            {selectedGroup ? (
              <dl className="selected-details">
                <div>
                  <dt>Start</dt>
                  <dd>{selectedGroup.start.toFixed(3)}s</dd>
                </div>
                <div>
                  <dt>End</dt>
                  <dd>{selectedGroup.end.toFixed(3)}s</dd>
                </div>
                <div>
                  <dt>Words</dt>
                  <dd>{selectedGroup.wordIds.length}</dd>
                </div>
              </dl>
            ) : (
              <p className="empty-copy">Select a caption block to inspect timing.</p>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}

export default App
