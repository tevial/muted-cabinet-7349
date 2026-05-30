import type { CSSProperties, MouseEvent, RefObject } from 'react'
import { Pause, Play, Search } from 'lucide-react'

import { AudioWaveform } from '../../../components/AudioWaveform'
import { CaptionEditor } from '../../../components/CaptionEditor'
import { CaptionTimeline } from '../../../components/CaptionTimeline'
import { EmptyZoneOverlay } from '../../../components/EmptyZoneOverlay'
import { SettingsPanel, type CaptionStats } from '../../../components/SettingsPanel'
import { TopBar } from '../../../components/TopBar'
import type { CaptionGroup, CaptionWord, GroupingSettings } from '../../../contracts/captions'
import type { EmptyZoneCut } from '../../../domain/captions'
import type { TimelineScalePreset } from '../../../lib/timelineScale'

type CaptionWorkbenchScreenProps = {
  fileName?: string
  status: string
  groups: CaptionGroup[]
  words: CaptionWord[]
  selectedGroupId?: string
  isPlaying: boolean
  isTranscribing: boolean
  hasCachedTranscript: boolean
  audioUrl?: string
  audioRef: RefObject<HTMLAudioElement | null>
  timelineScrollRef: RefObject<HTMLDivElement | null>
  timelineScale: TimelineScalePreset
  timelineScaleIndex: number
  timelineScalePresets: TimelineScalePreset[]
  timelineContentStyle: CSSProperties
  playheadStyle: CSSProperties
  emptyZoneCuts: EmptyZoneCut[]
  timelineDuration: number
  language: string
  stats: CaptionStats
  settings: GroupingSettings
  timingNudgeStep: number
  onFileChange: (file: File) => void
  onLoadCachedTranscript: () => void
  onTranscribe: () => void
  onRegroup: () => void
  onSaveProject: () => void
  onExportSrt: () => void
  onTogglePlayback: () => void
  onTimelineScaleIndexChange: (index: number) => void
  onAudioPositionSync: () => void
  onAudioTimeUpdate: () => void
  onTimelineSeek: (event: MouseEvent<HTMLDivElement>) => void
  onTimelineGroupSelect: (groupId: string) => void
  onEditorSelect: (groupId: string) => void
  onGroupTextChange: (groupId: string, text: string) => void
  onGroupTimingChange: (groupId: string, start: number, end: number) => void
  onGroupStartNudge: (groupId: string, offset: number) => void
  onPlayGroup: (groupId: string) => void
  onSplitGroup: (groupId: string) => void
  onMergeGroupWithNext: (groupId: string) => void
  onLanguageChange: (language: string) => void
  onSettingsChange: (settings: GroupingSettings) => void
  onAudioPause: () => void
  onAudioEnded: () => void
}

export function CaptionWorkbenchScreen({
  fileName,
  status,
  groups,
  words,
  selectedGroupId,
  isPlaying,
  isTranscribing,
  hasCachedTranscript,
  audioUrl,
  audioRef,
  timelineScrollRef,
  timelineScale,
  timelineScaleIndex,
  timelineScalePresets,
  timelineContentStyle,
  playheadStyle,
  emptyZoneCuts,
  timelineDuration,
  language,
  stats,
  settings,
  timingNudgeStep,
  onFileChange,
  onLoadCachedTranscript,
  onTranscribe,
  onRegroup,
  onSaveProject,
  onExportSrt,
  onTogglePlayback,
  onTimelineScaleIndexChange,
  onAudioPositionSync,
  onAudioTimeUpdate,
  onTimelineSeek,
  onTimelineGroupSelect,
  onEditorSelect,
  onGroupTextChange,
  onGroupTimingChange,
  onGroupStartNudge,
  onPlayGroup,
  onSplitGroup,
  onMergeGroupWithNext,
  onLanguageChange,
  onSettingsChange,
  onAudioPause,
  onAudioEnded,
}: CaptionWorkbenchScreenProps) {
  return (
    <main className="app-shell">
      <TopBar
        canExport={groups.length > 0}
        canTranscribe={Boolean(audioUrl)}
        hasCachedTranscript={hasCachedTranscript}
        isTranscribing={isTranscribing}
        onFileChange={onFileChange}
        onLoadCachedTranscript={onLoadCachedTranscript}
        onTranscribe={onTranscribe}
        onRegroup={onRegroup}
        onSaveProject={onSaveProject}
        onExportSrt={onExportSrt}
      />

      <section className="workspace">
        <section className="main-stage">
          <div className="status-strip">
            <strong>{fileName ?? 'No source file selected'}</strong>
            <span>{status}</span>
          </div>

          <section className="playback-panel">
            <audio
              ref={audioRef}
              src={audioUrl}
              onLoadedMetadata={onAudioPositionSync}
              onDurationChange={onAudioPositionSync}
              onSeeked={onAudioPositionSync}
              onPause={onAudioPause}
              onEnded={onAudioEnded}
              onTimeUpdate={onAudioTimeUpdate}
            />

            <button className="primary-button" type="button" onClick={onTogglePlayback}>
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
                onChange={(event) => onTimelineScaleIndexChange(Number(event.target.value))}
              />
              <strong>{timelineScale.label}</strong>
              <em>{timelineScale.detail}</em>
            </label>
          </section>

          <section className="timeline-stack">
            <div className="timeline-scroll" ref={timelineScrollRef}>
              <div className="timeline-content" style={timelineContentStyle} onClick={onTimelineSeek}>
                <div className="timeline-playhead" style={playheadStyle} aria-hidden="true" />
                <EmptyZoneOverlay cuts={emptyZoneCuts} duration={timelineDuration} />
                <AudioWaveform audioUrl={audioUrl} pixelsPerSecond={timelineScale.pixelsPerSecond} />

                <CaptionTimeline
                  groups={groups}
                  scale={timelineScale}
                  duration={timelineDuration}
                  selectedGroupId={selectedGroupId}
                  onSelect={onTimelineGroupSelect}
                  onPlayGroup={onPlayGroup}
                />
              </div>
            </div>
          </section>

          <CaptionEditor
            groups={groups}
            words={words}
            selectedGroupId={selectedGroupId}
            onSelect={onEditorSelect}
            onTextChange={onGroupTextChange}
            onTimingChange={onGroupTimingChange}
            onNudgeTiming={onGroupStartNudge}
            onPlayGroup={onPlayGroup}
            onSplit={onSplitGroup}
            onMergeNext={onMergeGroupWithNext}
            timingNudgeStep={timingNudgeStep}
          />
        </section>

        <div className="right-rail">
          <SettingsPanel
            language={language}
            stats={stats}
            settings={settings}
            onLanguageChange={onLanguageChange}
            onChange={onSettingsChange}
          />
        </div>
      </section>
    </main>
  )
}
