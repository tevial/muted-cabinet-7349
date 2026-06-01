import type { RefObject } from 'react'
import { Check, Gauge, Pause, Play, Plus, ScanText, Search, Trash2, WandSparkles } from 'lucide-react'

import { CaptionEditor } from '../../../components/CaptionEditor'
import { CapCutMultitrackPreview } from '../../../components/CapCutMultitrackPreview'
import { SettingsPanel, type CaptionStats } from '../../../components/SettingsPanel'
import { TopBar } from '../../../components/TopBar'
import { WaveSurferTimeline } from '../../../components/WaveSurferTimeline'
import type { CaptionGroup, GroupingSettings } from '../../../contracts/captions'
import type {
  CapCutLocalAgentStatus,
  CapCutPatchSummary,
  CapCutProjectSummary,
} from '../../../services/capcut/capcutClient'
import type { CaptionGap } from '../../../domain/captions'
import type { CapCutProjectImport, CapCutSourceCutBoundary, CapCutSourcePreview } from '../../../contracts/capcut'
import { CaptionGapPanel } from './CaptionGapPanel'
import { CapCutProjectImportDialog } from './CapCutProjectImportDialog'
import { CapCutProjectPatchDialog } from './CapCutProjectPatchDialog'
import { CapCutSourceCutPanel } from './CapCutSourceCutPanel'
import type { SilenceDetectionSettings } from '../model/silenceDetection'

type CaptionWorkbenchScreenProps = {
  capCutAgent?: CapCutLocalAgentStatus
  capCutPatchError?: string
  capCutPatchSummary?: CapCutPatchSummary
  capCutProjectImport?: CapCutProjectImport
  capCutProjectPath: string
  capCutProjects: CapCutProjectSummary[]
  capCutSourceCutBoundary?: CapCutSourceCutBoundary
  capCutSourcePreview?: CapCutSourcePreview
  capCutSourcePreviewError?: string
  captionGap?: CaptionGap
  groups: CaptionGroup[]
  totalGroups: number
  selectedGroupId?: string
  selectedSkipRegionId?: string
  isPlaying: boolean
  isTranscribing: boolean
  isAligningCaptions: boolean
  isCapCutPatchBusy: boolean
  isCapCutPatchOpen: boolean
  isCapCutImportBusy: boolean
  isCapCutImportOpen: boolean
  isCapCutSourcePreviewLoading: boolean
  isLoadingCapCutProjects: boolean
  canRedo: boolean
  canExportCutManifest: boolean
  canSaveProject: boolean
  canAlignCaptions: boolean
  canAlignSelectedCaption: boolean
  canTranscribeKeptChunks: boolean
  alignmentProgressLabel?: string
  aligningGroupIds: string[]
  dirtyAlignmentCount: number
  hasCachedTranscript: boolean
  canUndo: boolean
  detectedSilenceAdjustment: number
  hasDetectedSilenceDraft: boolean
  audioUrl?: string
  captionContainerRef: RefObject<HTMLDivElement | null>
  isTimelineReady: boolean
  timelineContainerRef: RefObject<HTMLDivElement | null>
  timelineZoomConfig: {
    minPixelsPerSecond: number
    maxPixelsPerSecond: number
    sliderStep: number
  }
  playbackRate: number
  playbackRateLabel: string
  playbackSpeedConfig: {
    minRate: number
    maxRate: number
    sliderStep: number
  }
  silenceAdjustmentConfig: {
    min: number
    max: number
    step: number
  }
  silenceDetectionSettingConfig: {
    minDuration: { min: number; max: number; step: number }
    rmsThreshold: { min: number; max: number; step: number }
    speechPadding: { min: number; max: number; step: number }
  }
  silenceDetectionSettings: SilenceDetectionSettings
  waveformContainerRef: RefObject<HTMLDivElement | null>
  zoomLabel: string
  zoomLevel: number
  language: string
  stats: CaptionStats
  settings: GroupingSettings
  timingNudgeStep: number
  onFileChange: (file: File) => void
  onLoadCachedTranscript: () => void
  onTranscribe: () => void
  onRegroup: () => void
  onRedo: () => void
  onSaveProject: () => void
  onUndo: () => void
  onExportCapCutManifest: () => void
  onExportSrt: () => void
  onCapCutImportClose: () => void
  onCapCutImportOpen: () => void
  onCapCutImportRun: () => void
  onCapCutSourceCutClose: () => void
  onCapCutSourcePreviewLoad: () => void
  onCaptionGapClose: () => void
  onCaptionGapLink: () => void
  onCapCutPatchClose: () => void
  onCapCutPatchDryRun: () => void
  onCapCutPatchOpen: () => void
  onCapCutPatchProjectPathChange: (projectPath: string) => void
  onCapCutPatchRun: () => void
  onCapCutProjectsRefresh: () => void
  onTogglePlayback: () => void
  onPlaybackRateChange: (rate: number) => void
  onAddSkipRegion: () => void
  onConfirmDetectedSilentSkipRegions: () => void
  onDetectedSilenceAdjustmentChange: (adjustment: number) => void
  onDetectSilentSkipRegions: () => void
  onDeleteSelectedSkipRegion: () => void
  onSilenceDetectionSettingsChange: (settings: Partial<SilenceDetectionSettings>) => void
  onTranscribeKeptChunks: () => void
  onAlignDirtyGroups: () => void
  onAlignSelectedGroup: () => void
  onAlignVisibleGroups: () => void
  onTimelineZoomChange: (pixelsPerSecond: number) => void
  onEditorSelect: (groupId: string) => void
  onGroupTextChange: (groupId: string, text: string) => void
  onGroupTimingChange: (groupId: string, start: number, end: number) => void
  onSplitGroupAtCursor: (groupId: string, cursorIndex: number) => boolean
  onMergeGroupWithPrevious: (groupId: string) => boolean
  onPlayGroup: (groupId: string) => void
  onSplitGroup: (groupId: string) => void
  onMergeGroupWithNext: (groupId: string) => void
  onLanguageChange: (language: string) => void
  onSettingsChange: (settings: GroupingSettings) => void
}

export function CaptionWorkbenchScreen({
  capCutAgent,
  capCutPatchError,
  capCutPatchSummary,
  capCutProjectImport,
  capCutProjectPath,
  capCutProjects,
  capCutSourceCutBoundary,
  capCutSourcePreview,
  capCutSourcePreviewError,
  captionGap,
  groups,
  totalGroups,
  selectedGroupId,
  selectedSkipRegionId,
  isPlaying,
  isTranscribing,
  isAligningCaptions,
  isCapCutPatchBusy,
  isCapCutPatchOpen,
  isCapCutImportBusy,
  isCapCutImportOpen,
  isCapCutSourcePreviewLoading,
  isLoadingCapCutProjects,
  canRedo,
  canExportCutManifest,
  canSaveProject,
  canAlignCaptions,
  canAlignSelectedCaption,
  canTranscribeKeptChunks,
  alignmentProgressLabel,
  aligningGroupIds,
  dirtyAlignmentCount,
  hasCachedTranscript,
  canUndo,
  detectedSilenceAdjustment,
  hasDetectedSilenceDraft,
  audioUrl,
  captionContainerRef,
  isTimelineReady,
  timelineContainerRef,
  timelineZoomConfig,
  playbackRate,
  playbackRateLabel,
  playbackSpeedConfig,
  silenceAdjustmentConfig,
  silenceDetectionSettingConfig,
  silenceDetectionSettings,
  waveformContainerRef,
  zoomLabel,
  zoomLevel,
  language,
  stats,
  settings,
  timingNudgeStep,
  onFileChange,
  onLoadCachedTranscript,
  onTranscribe,
  onRegroup,
  onRedo,
  onSaveProject,
  onUndo,
  onExportCapCutManifest,
  onExportSrt,
  onCapCutImportClose,
  onCapCutImportOpen,
  onCapCutImportRun,
  onCapCutSourceCutClose,
  onCapCutSourcePreviewLoad,
  onCaptionGapClose,
  onCaptionGapLink,
  onCapCutPatchClose,
  onCapCutPatchDryRun,
  onCapCutPatchOpen,
  onCapCutPatchProjectPathChange,
  onCapCutPatchRun,
  onCapCutProjectsRefresh,
  onTogglePlayback,
  onPlaybackRateChange,
  onAddSkipRegion,
  onConfirmDetectedSilentSkipRegions,
  onDetectedSilenceAdjustmentChange,
  onDetectSilentSkipRegions,
  onDeleteSelectedSkipRegion,
  onSilenceDetectionSettingsChange,
  onTranscribeKeptChunks,
  onAlignDirtyGroups,
  onAlignSelectedGroup,
  onAlignVisibleGroups,
  onTimelineZoomChange,
  onEditorSelect,
  onGroupTextChange,
  onGroupTimingChange,
  onSplitGroupAtCursor,
  onMergeGroupWithPrevious,
  onPlayGroup,
  onSplitGroup,
  onMergeGroupWithNext,
  onLanguageChange,
  onSettingsChange,
}: CaptionWorkbenchScreenProps) {
  return (
    <main className="app-shell">
      <TopBar
        canExport={totalGroups > 0}
        canExportCutManifest={canExportCutManifest}
        canRedo={canRedo}
        canSaveProject={canSaveProject}
        canTranscribe={Boolean(audioUrl && !capCutProjectImport)}
        canUndo={canUndo}
        hasCachedTranscript={hasCachedTranscript}
        isTranscribing={isTranscribing}
        settingsContent={
          <SettingsPanel
            language={language}
            stats={stats}
            settings={settings}
            onLanguageChange={onLanguageChange}
            onChange={onSettingsChange}
          />
        }
        onFileChange={onFileChange}
        onLoadCachedTranscript={onLoadCachedTranscript}
        onTranscribe={onTranscribe}
        onRegroup={onRegroup}
        onRedo={onRedo}
        onSaveProject={onSaveProject}
        onUndo={onUndo}
        onExportCapCutManifest={onExportCapCutManifest}
        onExportSrt={onExportSrt}
        onOpenCapCutImport={onCapCutImportOpen}
        onOpenCapCutPatch={onCapCutPatchOpen}
      />

      <CapCutProjectImportDialog
        agent={capCutAgent}
        error={capCutPatchError}
        isBusy={isCapCutImportBusy}
        isLoadingProjects={isLoadingCapCutProjects}
        isOpen={isCapCutImportOpen}
        projects={capCutProjects}
        projectPath={capCutProjectPath}
        onClose={onCapCutImportClose}
        onImport={onCapCutImportRun}
        onProjectPathChange={onCapCutPatchProjectPathChange}
        onRefreshProjects={onCapCutProjectsRefresh}
      />

      <CapCutProjectPatchDialog
        agent={capCutAgent}
        canPatch={canExportCutManifest && Boolean(capCutProjectPath.trim())}
        error={capCutPatchError}
        isBusy={isCapCutPatchBusy}
        isLoadingProjects={isLoadingCapCutProjects}
        isOpen={isCapCutPatchOpen}
        projects={capCutProjects}
        projectPath={capCutProjectPath}
        summary={capCutPatchSummary}
        onClose={onCapCutPatchClose}
        onDryRun={onCapCutPatchDryRun}
        onPatch={onCapCutPatchRun}
        onProjectPathChange={onCapCutPatchProjectPathChange}
        onRefreshProjects={onCapCutProjectsRefresh}
      />

      <section className="workspace">
        <section className="main-stage">
          <section className="playback-panel">
            <button className="primary-button" type="button" onClick={onTogglePlayback}>
              {isPlaying ? <Pause size={17} /> : <Play size={17} />}
              {isPlaying ? 'Pause' : 'Play timeline'}
            </button>

            <label className="playback-rate-control" title="Playback speed">
              <Gauge size={16} />
              <span>Speed</span>
              <input
                type="range"
                min={playbackSpeedConfig.minRate}
                max={playbackSpeedConfig.maxRate}
                step={playbackSpeedConfig.sliderStep}
                value={playbackRate}
                disabled={!audioUrl || !isTimelineReady}
                onChange={(event) => onPlaybackRateChange(Number(event.target.value))}
              />
              <strong>{playbackRateLabel}</strong>
            </label>

            <div className="skip-zone-controls" aria-label="Skip zone actions">
              <button
                className="icon-button"
                type="button"
                title="Transcribe kept chunks between skip zones"
                disabled={!audioUrl || !isTimelineReady || isTranscribing || !canTranscribeKeptChunks}
                onClick={onTranscribeKeptChunks}
              >
                <ScanText size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                title="Add skip zone at playhead"
                disabled={!audioUrl || !isTimelineReady}
                onClick={onAddSkipRegion}
              >
                <Plus size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                title="Detect silent zones from waveform"
                disabled={!audioUrl || !isTimelineReady}
                onClick={onDetectSilentSkipRegions}
              >
                <WandSparkles size={16} />
              </button>
              {hasDetectedSilenceDraft ? (
                <>
                  <label className="silence-setting-control" title="RMS floor for silence detection">
                    <span>RMS</span>
                    <input
                      type="number"
                      min={silenceDetectionSettingConfig.rmsThreshold.min}
                      max={silenceDetectionSettingConfig.rmsThreshold.max}
                      step={silenceDetectionSettingConfig.rmsThreshold.step}
                      value={silenceDetectionSettings.rmsThreshold}
                      disabled={!audioUrl || !isTimelineReady}
                      onChange={(event) => onSilenceDetectionSettingsChange({ rmsThreshold: Number(event.target.value) })}
                    />
                  </label>
                  <label className="silence-setting-control" title="Minimum final skip-zone duration">
                    <span>Min gap</span>
                    <input
                      type="number"
                      min={silenceDetectionSettingConfig.minDuration.min}
                      max={silenceDetectionSettingConfig.minDuration.max}
                      step={silenceDetectionSettingConfig.minDuration.step}
                      value={silenceDetectionSettings.minDuration}
                      disabled={!audioUrl || !isTimelineReady}
                      onChange={(event) => onSilenceDetectionSettingsChange({ minDuration: Number(event.target.value) })}
                    />
                  </label>
                  <label className="silence-setting-control" title="Speech guard added around detected audible regions">
                    <span>Guard</span>
                    <input
                      type="number"
                      min={silenceDetectionSettingConfig.speechPadding.min}
                      max={silenceDetectionSettingConfig.speechPadding.max}
                      step={silenceDetectionSettingConfig.speechPadding.step}
                      value={silenceDetectionSettings.speechPadding}
                      disabled={!audioUrl || !isTimelineReady}
                      onChange={(event) => onSilenceDetectionSettingsChange({ speechPadding: Number(event.target.value) })}
                    />
                  </label>
                  <label className="silence-normalize-control" title="Use local loudness normalization for uneven recordings">
                    <input
                      type="checkbox"
                      checked={silenceDetectionSettings.adaptiveNormalization}
                      disabled={!audioUrl || !isTimelineReady}
                      onChange={(event) =>
                        onSilenceDetectionSettingsChange({ adaptiveNormalization: event.target.checked })}
                    />
                    <span>Normalize</span>
                  </label>
                  <label className="silence-tune-control" title="Adjust detected silent zone boundaries">
                    <input
                      type="range"
                      min={silenceAdjustmentConfig.min}
                      max={silenceAdjustmentConfig.max}
                      step={silenceAdjustmentConfig.step}
                      value={detectedSilenceAdjustment}
                      onChange={(event) => onDetectedSilenceAdjustmentChange(Number(event.target.value))}
                    />
                  </label>
                  <button
                    className="icon-button"
                    type="button"
                    title="Confirm detected silent zones"
                    onClick={onConfirmDetectedSilentSkipRegions}
                  >
                    <Check size={16} />
                  </button>
                </>
              ) : null}
              <button
                className="icon-button"
                type="button"
                title="Delete selected skip zone"
                disabled={!selectedSkipRegionId}
                onClick={onDeleteSelectedSkipRegion}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="alignment-controls" aria-label="Caption alignment actions">
              <button
                className="ghost-button compact-action"
                type="button"
                title="Run MFA alignment for the selected caption group"
                disabled={!canAlignSelectedCaption || isAligningCaptions}
                onClick={onAlignSelectedGroup}
              >
                <ScanText size={16} />
                {alignmentProgressLabel ?? 'Align selected'}
              </button>
              <button
                className="ghost-button compact-action"
                type="button"
                title="Run MFA alignment for edited caption groups"
                disabled={!dirtyAlignmentCount || !canAlignCaptions || isAligningCaptions}
                onClick={onAlignDirtyGroups}
              >
                <WandSparkles size={16} />
                Edited {dirtyAlignmentCount}
              </button>
              <button
                className="ghost-button compact-action"
                type="button"
                title="Run MFA alignment for all visible caption groups"
                disabled={!canAlignCaptions || isAligningCaptions}
                onClick={onAlignVisibleGroups}
              >
                <Check size={16} />
                Align all
              </button>
            </div>

            <label className="zoom-control">
              <Search size={16} />
              <span>Time detail</span>
              <input
                type="range"
                min={timelineZoomConfig.minPixelsPerSecond}
                max={timelineZoomConfig.maxPixelsPerSecond}
                step={timelineZoomConfig.sliderStep}
                value={Math.round(zoomLevel)}
                disabled={!audioUrl || !isTimelineReady}
                onChange={(event) => onTimelineZoomChange(Number(event.target.value))}
              />
              <strong>{zoomLabel}</strong>
            </label>
          </section>

          <section className="timeline-stack">
            {capCutProjectImport ? (
              <section className="capcut-import-summary" aria-label="Imported CapCut project summary">
                <strong>{capCutProjectImport.timelineMap.tracks.length} tracks</strong>
                <span>{capCutProjectImport.timelineMap.materials.length} media refs</span>
                <span>{capCutProjectImport.timelineMap.sourceCutBoundaries.length} source cuts</span>
                <span>{capCutProjectImport.timelineMap.markers.length} markers</span>
              </section>
            ) : null}
            <CapCutSourceCutPanel
              boundary={capCutSourceCutBoundary}
              error={capCutSourcePreviewError}
              isLoadingPreview={isCapCutSourcePreviewLoading}
              preview={capCutSourcePreview}
              onClose={onCapCutSourceCutClose}
              onLoadPreview={onCapCutSourcePreviewLoad}
            />
            <CaptionGapPanel
              gap={captionGap}
              onClose={onCaptionGapClose}
              onLink={onCaptionGapLink}
            />
            {capCutProjectImport ? (
              <CapCutMultitrackPreview stems={capCutProjectImport.stems} zoomLevel={zoomLevel} />
            ) : null}
            <WaveSurferTimeline
              audioUrl={audioUrl}
              captionContainerRef={captionContainerRef}
              timelineContainerRef={timelineContainerRef}
              waveformContainerRef={waveformContainerRef}
            />
          </section>
        </section>

        <div className="right-rail">
          <CaptionEditor
            aligningGroupIds={aligningGroupIds}
            groups={groups}
            selectedGroupId={selectedGroupId}
            totalGroups={totalGroups}
            onSelect={onEditorSelect}
            onTextChange={onGroupTextChange}
            onTimingChange={onGroupTimingChange}
            onSplitAtCursor={onSplitGroupAtCursor}
            onMergePrevious={onMergeGroupWithPrevious}
            onPlayGroup={onPlayGroup}
            onSplit={onSplitGroup}
            onMergeNext={onMergeGroupWithNext}
            timingNudgeStep={timingNudgeStep}
          />
        </div>
      </section>
    </main>
  )
}
