import type { RefObject } from 'react'
import { Check, Pause, Play, ScanText, WandSparkles } from 'lucide-react'

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
import type { CapCutProjectImport, CapCutSourceCutBoundary, CapCutSourcePreview } from '../../../contracts/capcut'
import { cx } from '../../../shared/ui/classNames'
import { ui } from '../../../shared/ui/styles'
import { CapCutProjectImportDialog } from './CapCutProjectImportDialog'
import { CapCutProjectPatchDialog } from './CapCutProjectPatchDialog'
import { CapCutSourceCutPanel } from './CapCutSourceCutPanel'
import type { SilenceDetectionSettings } from '../model/silenceDetection'

const playbackRateOptions = [
  { value: 0.25, label: '0.2x' },
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.7x' },
  { value: 1, label: '1x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2.0x' },
  { value: 2.5, label: '2.5x' },
] as const

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
  groups: CaptionGroup[]
  hasCaptionDraft: boolean
  totalGroups: number
  selectedGroupId?: string
  selectedSkipRegionId?: string
  isPlaying: boolean
  isManualGrouping: boolean
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
  minimapControlRef: RefObject<HTMLDivElement | null>
  minimapContainerRef: RefObject<HTMLDivElement | null>
  minimapSelectionRef: RefObject<HTMLDivElement | null>
  minimapViewportRef: RefObject<HTMLDivElement | null>
  timelineSurfaceRef: RefObject<HTMLElement | null>
  timelineContainerRef: RefObject<HTMLDivElement | null>
  timelineHoverGuideRef: RefObject<HTMLDivElement | null>
  timelineHoverLabelRef: RefObject<HTMLSpanElement | null>
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
  onApplyCaptionDraft: () => void
  onRevertCaptionDraft: () => void
  onGroupTextChange: (groupId: string, text: string) => void
  onGroupTimingChange: (groupId: string, start: number, end: number) => void
  onMaxCharsChange: (maxChars: number) => void
  onSplitGroupAtCursor: (groupId: string, cursorIndex: number, text: string) => boolean
  onMergeGroupWithPrevious: (groupId: string) => boolean
  onSplitGroup: (groupId: string) => void
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
  groups,
  hasCaptionDraft,
  totalGroups,
  selectedGroupId,
  isPlaying,
  isManualGrouping,
  isTranscribing,
  isCapCutPatchBusy,
  isCapCutPatchOpen,
  isCapCutImportBusy,
  isCapCutImportOpen,
  isCapCutSourcePreviewLoading,
  isLoadingCapCutProjects,
  canRedo,
  canExportCutManifest,
  canSaveProject,
  canTranscribeKeptChunks,
  aligningGroupIds,
  hasCachedTranscript,
  canUndo,
  detectedSilenceAdjustment,
  hasDetectedSilenceDraft,
  audioUrl,
  captionContainerRef,
  isTimelineReady,
  minimapControlRef,
  minimapContainerRef,
  minimapSelectionRef,
  minimapViewportRef,
  timelineSurfaceRef,
  timelineContainerRef,
  timelineHoverGuideRef,
  timelineHoverLabelRef,
  playbackRate,
  silenceAdjustmentConfig,
  silenceDetectionSettingConfig,
  silenceDetectionSettings,
  waveformContainerRef,
  zoomLevel,
  language,
  stats,
  settings,
  timingNudgeStep,
  onFileChange,
  onLoadCachedTranscript,
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
  onCapCutPatchClose,
  onCapCutPatchDryRun,
  onCapCutPatchOpen,
  onCapCutPatchProjectPathChange,
  onCapCutPatchRun,
  onCapCutProjectsRefresh,
  onTogglePlayback,
  onPlaybackRateChange,
  onConfirmDetectedSilentSkipRegions,
  onDetectedSilenceAdjustmentChange,
  onDetectSilentSkipRegions,
  onSilenceDetectionSettingsChange,
  onTranscribeKeptChunks,
  onEditorSelect,
  onApplyCaptionDraft,
  onRegroup,
  onRevertCaptionDraft,
  onGroupTextChange,
  onGroupTimingChange,
  onMaxCharsChange,
  onSplitGroupAtCursor,
  onMergeGroupWithPrevious,
  onSplitGroup,
  onLanguageChange,
  onSettingsChange,
}: CaptionWorkbenchScreenProps) {
  return (
    <main className={ui.appShell}>
      <TopBar
        canExport={totalGroups > 0 && !hasCaptionDraft}
        canExportCutManifest={canExportCutManifest}
        canRedo={canRedo}
        canSaveProject={canSaveProject}
        canUndo={canUndo}
        hasCachedTranscript={hasCachedTranscript}
        settingsContent={
          <SettingsPanel
            language={language}
            stats={stats}
            settings={settings}
            variant="popover"
            onLanguageChange={onLanguageChange}
            onChange={onSettingsChange}
          />
        }
        onFileChange={onFileChange}
        onLoadCachedTranscript={onLoadCachedTranscript}
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

      <section className={ui.workspace}>
        <section className={ui.mainStage}>
          <section className={ui.playbackPanel}>
            <div className={ui.timelineToolbarActions} aria-label="Timeline generation actions">
              <button
                className={ui.timelineToolButton}
                type="button"
                title="Detect silent zones from waveform"
                disabled={!audioUrl || !isTimelineReady}
                onClick={onDetectSilentSkipRegions}
              >
                <WandSparkles size={22} />
              </button>
              <button
                className={ui.timelineToolButton}
                type="button"
                title="Transcribe kept chunks between skip zones"
                disabled={!audioUrl || !isTimelineReady || isTranscribing || !canTranscribeKeptChunks}
                onClick={onTranscribeKeptChunks}
              >
                <ScanText size={22} />
              </button>
            </div>

            {hasDetectedSilenceDraft ? (
              <div className={ui.timelineToolbarDraft} aria-label="Detected silence settings">
                <label className={ui.silenceSettingControl} title="RMS floor for silence detection">
                  <span>RMS</span>
                  <input
                    className={ui.silenceSettingInput}
                    type="number"
                    min={silenceDetectionSettingConfig.rmsThreshold.min}
                    max={silenceDetectionSettingConfig.rmsThreshold.max}
                    step={silenceDetectionSettingConfig.rmsThreshold.step}
                    value={silenceDetectionSettings.rmsThreshold}
                    disabled={!audioUrl || !isTimelineReady}
                    onChange={(event) => onSilenceDetectionSettingsChange({ rmsThreshold: Number(event.target.value) })}
                  />
                </label>
                <label className={ui.silenceSettingControl} title="Minimum final skip-zone duration">
                  <span>Min gap</span>
                  <input
                    className={ui.silenceSettingInput}
                    type="number"
                    min={silenceDetectionSettingConfig.minDuration.min}
                    max={silenceDetectionSettingConfig.minDuration.max}
                    step={silenceDetectionSettingConfig.minDuration.step}
                    value={silenceDetectionSettings.minDuration}
                    disabled={!audioUrl || !isTimelineReady}
                    onChange={(event) => onSilenceDetectionSettingsChange({ minDuration: Number(event.target.value) })}
                  />
                </label>
                <label className={ui.silenceSettingControl} title="Speech guard added around detected audible regions">
                  <span>Guard</span>
                  <input
                    className={ui.silenceSettingInput}
                    type="number"
                    min={silenceDetectionSettingConfig.speechPadding.min}
                    max={silenceDetectionSettingConfig.speechPadding.max}
                    step={silenceDetectionSettingConfig.speechPadding.step}
                    value={silenceDetectionSettings.speechPadding}
                    disabled={!audioUrl || !isTimelineReady}
                    onChange={(event) => onSilenceDetectionSettingsChange({ speechPadding: Number(event.target.value) })}
                  />
                </label>
                <label className={ui.silenceNormalizeControl} title="Use local loudness normalization for uneven recordings">
                  <input
                    className={ui.silenceNormalizeInput}
                    type="checkbox"
                    checked={silenceDetectionSettings.adaptiveNormalization}
                    disabled={!audioUrl || !isTimelineReady}
                    onChange={(event) =>
                      onSilenceDetectionSettingsChange({ adaptiveNormalization: event.target.checked })}
                  />
                  <span>Normalize</span>
                </label>
                <label className={ui.silenceTuneControl} title="Adjust detected silent zone boundaries">
                  <input
                    className={ui.silenceTuneInput}
                    type="range"
                    min={silenceAdjustmentConfig.min}
                    max={silenceAdjustmentConfig.max}
                    step={silenceAdjustmentConfig.step}
                    value={detectedSilenceAdjustment}
                    onChange={(event) => onDetectedSilenceAdjustmentChange(Number(event.target.value))}
                  />
                </label>
                <button
                  className={ui.timelineToolButton}
                  type="button"
                  title="Confirm detected silent zones"
                  onClick={onConfirmDetectedSilentSkipRegions}
                >
                  <Check size={22} />
                </button>
              </div>
            ) : null}
          </section>

          <section className={ui.timelineStack}>
            {capCutProjectImport ? (
              <section className={ui.importSummary} aria-label="Imported CapCut project summary">
                <strong className="text-heading">{capCutProjectImport.timelineMap.tracks.length} tracks</strong>
                <span className={ui.importSummaryPill}>{capCutProjectImport.timelineMap.materials.length} media refs</span>
                <span className={ui.importSummaryPill}>
                  {capCutProjectImport.timelineMap.sourceCutBoundaries.length} source cuts
                </span>
                <span className={ui.importSummaryPill}>{capCutProjectImport.timelineMap.markers.length} markers</span>
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
            {capCutProjectImport ? (
              <CapCutMultitrackPreview stems={capCutProjectImport.stems} zoomLevel={zoomLevel} />
            ) : null}
            <WaveSurferTimeline
              audioUrl={audioUrl}
              captionContainerRef={captionContainerRef}
              minimapControlRef={minimapControlRef}
              minimapContainerRef={minimapContainerRef}
              minimapSelectionRef={minimapSelectionRef}
              minimapViewportRef={minimapViewportRef}
              timelineSurfaceRef={timelineSurfaceRef}
              timelineContainerRef={timelineContainerRef}
              timelineHoverGuideRef={timelineHoverGuideRef}
              timelineHoverLabelRef={timelineHoverLabelRef}
              timelineGridStepPx={zoomLevel}
              waveformContainerRef={waveformContainerRef}
            />
            <div className={ui.timelineTransport} aria-label="Timeline playback controls">
              <button
                className={ui.timelinePlayButton}
                type="button"
                aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
                disabled={!audioUrl || !isTimelineReady}
                onClick={onTogglePlayback}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <div className={ui.timelineSpeedPicker} aria-label="Playback speed">
                {playbackRateOptions.map((option) => {
                  const isSelected = Math.abs(playbackRate - option.value) < 0.001

                  return (
                    <button
                      key={option.value}
                      className={cx(ui.timelineSpeedOption, isSelected && ui.timelineSpeedOptionSelected)}
                      type="button"
                      aria-pressed={isSelected}
                      data-selected={isSelected ? 'true' : 'false'}
                      disabled={!audioUrl || !isTimelineReady}
                      onClick={() => onPlaybackRateChange(option.value)}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        </section>

        <div className={ui.rightRail}>
          <CaptionEditor
            aligningGroupIds={aligningGroupIds}
            groups={groups}
            hasDraft={hasCaptionDraft}
            isManualGrouping={isManualGrouping}
            maxChars={settings.maxChars}
            selectedGroupId={selectedGroupId}
            totalGroups={totalGroups}
            onApplyDraft={onApplyCaptionDraft}
            onMaxCharsChange={onMaxCharsChange}
            onRegroup={onRegroup}
            onRevertDraft={onRevertCaptionDraft}
            onSelect={onEditorSelect}
            onTextChange={onGroupTextChange}
            onTimingChange={onGroupTimingChange}
            onSplitAtCursor={onSplitGroupAtCursor}
            onMergePrevious={onMergeGroupWithPrevious}
            onSplit={onSplitGroup}
            timingNudgeStep={timingNudgeStep}
          />
        </div>
      </section>
    </main>
  )
}
