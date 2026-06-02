import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import WaveSurfer from 'wavesurfer.js'
import MinimapPlugin from 'wavesurfer.js/plugins/minimap'
import RegionsPlugin, { type Region } from 'wavesurfer.js/plugins/regions'
import TimelinePlugin from 'wavesurfer.js/plugins/timeline'
import ZoomPlugin from 'wavesurfer.js/plugins/zoom'

import type { CaptionGroup, CaptionWord, GroupingSettings } from '../../../contracts/captions'
import type { CapCutTimelineMap } from '../../../contracts/capcut'
import type { EmptyZoneCut, GroupBoundaryEditMode } from '../../../domain/captions'
import { formatSeconds, getEmptyZoneCuts, roundCaptionTime, timingNudgeStep } from '../../../domain/captions'
import {
  captionLaneOptions,
  captionRegionColors,
  formatTimelineLabel,
  playbackSpeedConfig,
  timelineZoomConfig,
  waveformLaneOptions,
} from './waveSurferTimelineConfig'
import {
  defaultSilenceDetectionSettings,
  detectSilenceCuts,
  normalizeSilenceDetectionSettings,
  type SilenceDetectionSettings,
} from './silenceDetection'
import { isPendingChunkGroup } from './chunkTranscription'

type ActiveSegment = {
  groupId: string
  start: number
  end: number
  loop: boolean
}

export type TimelineSkipState = {
  deletedAutoIds: Set<string>
  edits: Map<string, { start: number; end: number }>
  manualCuts: EmptyZoneCut[]
  signature: string
  sourceUrl?: string
}

type CaptionRegionSegment = {
  canEditTiming: boolean
  end: number
  group: CaptionGroup
  id: string
  label: string
  start: number
}

type DraftSelection = {
  end: number
  id: string
  start: number
  status: 'idle' | 'transcribing'
}

type SilenceDetectionDraft = {
  adjustment: number
  baseCuts: EmptyZoneCut[]
}

type PlaybackRange = {
  start: number
  end: number
}

export type TimelineRange = PlaybackRange

type UseWaveSurferTimelineOptions = {
  audioUrl?: string
  capCutTimelineMap?: CapCutTimelineMap
  contentDuration: number
  groups: CaptionGroup[]
  selectedGroupId?: string
  skipState: TimelineSkipState
  setSkipState: Dispatch<SetStateAction<TimelineSkipState>>
  setSelectedGroupId: Dispatch<SetStateAction<string | undefined>>
  setStatus: (message: string) => void
  settings: GroupingSettings
  selectedCapCutSourceCutBoundaryId?: string
  words: CaptionWord[]
  onCapCutSourceCutSelect?: (boundaryId?: string) => void
  onHistoryCommit: (source: string) => void
  onGroupTimingChange: (groupId: string, start: number, end: number, mode?: GroupBoundaryEditMode) => void
  onTranscribeRange?: (start: number, end: number) => Promise<void>
}

const segmentBoundaryTolerance = 0.015
const maxRenderedChannels = 2
const skipRegionMinDuration = 0.05
const defaultManualSkipDuration = 1.5
const manualEmptyZonePrefix = 'manual_cut_'
const audioSilenceEmptyZonePrefix = 'audio_silence_'
const captionRegionSliceSeparator = '__caption_slice__'
const draftSelectionRegionId = 'draft-selection'
const capCutProjectGapPrefix = 'capcut_project_gap_'
const capCutSourceCutPrefix = 'capcut_source_cut_'
const capCutMarkerPrefix = 'capcut_marker_'
const minDraftSelectionDuration = 0.1
const capCutBoundaryHitTargetWidth = 8
const silenceAdjustmentMin = -0.45
const silenceAdjustmentMax = 0.45
const silenceAdjustmentStep = 0.01
const silenceDetectionSettingConfig = {
  minDuration: { min: 0.1, max: 3, step: 0.05 },
  rmsThreshold: { min: 0.001, max: 0.05, step: 0.001 },
  speechPadding: { min: 0, max: 0.45, step: 0.01 },
}

export const createTimelineSkipState = (sourceUrl?: string): TimelineSkipState => ({
  deletedAutoIds: new Set(),
  edits: new Map(),
  manualCuts: [],
  signature: '',
  sourceUrl,
})

export const cloneTimelineSkipState = (state: TimelineSkipState): TimelineSkipState => ({
  deletedAutoIds: new Set(state.deletedAutoIds),
  edits: new Map(state.edits),
  manualCuts: state.manualCuts.map((cut) => ({ ...cut })),
  signature: state.signature,
  sourceUrl: state.sourceUrl,
})

const useLatestRef = <T,>(value: T) => {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const normalizePlaybackRate = (rate: number) =>
  Number(clamp(
    Number.isFinite(rate) ? rate : playbackSpeedConfig.defaultRate,
    playbackSpeedConfig.minRate,
    playbackSpeedConfig.maxRate,
  ).toFixed(2))

const getCaptionRegionId = (groupId: string, index: number, canEditTiming: boolean) =>
  canEditTiming ? groupId : `${groupId}${captionRegionSliceSeparator}${index}`

const getManualEmptyZoneId = (sequence: number) =>
  `${manualEmptyZonePrefix}${Date.now().toString(36)}_${sequence}`

const getRegionContent = (
  label: string,
  group: CaptionGroup,
  start = group.start,
  end = group.end,
) => {
  const content = document.createElement('span')
  const isPending = isPendingChunkGroup(group)
  content.textContent = label
  content.title = isPending
    ? `Transcribing ${formatSeconds(start)} - ${formatSeconds(end)}`
    : `${formatSeconds(start)} - ${formatSeconds(end)}`
  Object.assign(content.style, {
    background: isPending
      ? 'linear-gradient(90deg, rgba(20, 146, 127, 0.04), rgba(20, 146, 127, 0.20), rgba(20, 146, 127, 0.04))'
      : 'transparent',
    backgroundSize: '220% 100%',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    maxWidth: '100%',
    minWidth: '0',
    height: '100%',
    minHeight: '28px',
    overflow: 'hidden',
    padding: '0 12px',
    color: '#ffffff',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: '12px',
    fontStyle: isPending ? 'italic' : 'normal',
    fontWeight: '800',
    lineHeight: '1',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    animation: isPending ? 'selection-progress 1.1s linear infinite' : 'none',
  })

  return content
}

const getGroupWords = (group: CaptionGroup, wordMap: Map<string, CaptionWord>) =>
  group.wordIds.map((wordId) => wordMap.get(wordId)).filter((word): word is CaptionWord => word !== undefined)

const getSegmentWords = (words: CaptionWord[], start: number, end: number) =>
  words.filter((word) => word.end > start && word.start < end)

const isAudioSilenceCut = (cut: EmptyZoneCut) => cut.id.startsWith(audioSilenceEmptyZonePrefix)
const isUserManagedCut = (cut: EmptyZoneCut) =>
  cut.id.startsWith(manualEmptyZonePrefix) || isAudioSilenceCut(cut)

const getSkipRegionContent = (start: number, end: number, isSelected: boolean) => {
  const content = document.createElement('span')
  content.textContent = `${formatSeconds(start)} - ${formatSeconds(end)}`
  content.title = 'Skipped empty zone. Resize handles adjust it; select and delete to remove.'
  Object.assign(content.style, {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    padding: '0 8px',
    background: 'var(--color-timeline-skip-mask)',
    border: '1px solid var(--color-timeline-skip-border)',
    borderRadius: '6px',
    color: 'rgba(255, 255, 255, 0.58)',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: '11px',
    fontWeight: '800',
    lineHeight: '1',
    boxShadow: isSelected ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.16)' : 'none',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  })

  return content
}

const getDraftSelectionContent = (
  selection: DraftSelection,
  onSkip: () => void,
  onTranscribe: () => void,
  onClear: () => void,
) => {
  const content = document.createElement('div')
  const isTranscribing = selection.status === 'transcribing'
  Object.assign(content.style, {
    alignItems: 'center',
    background: isTranscribing
      ? 'linear-gradient(90deg, rgba(20, 146, 127, 0.08), rgba(20, 146, 127, 0.26), rgba(20, 146, 127, 0.08))'
      : 'rgba(255, 255, 255, 0.78)',
    backgroundSize: '220% 100%',
    boxSizing: 'border-box',
    color: '#173f39',
    display: 'flex',
    gap: '6px',
    height: '100%',
    justifyContent: 'center',
    minWidth: 'max-content',
    padding: '0 8px',
    pointerEvents: 'auto',
    width: '100%',
    animation: isTranscribing ? 'selection-progress 1.1s linear infinite' : 'none',
  })

  const label = document.createElement('strong')
  label.textContent = isTranscribing
    ? 'Transcribing...'
    : `${formatSeconds(selection.start)} - ${formatSeconds(selection.end)}`
  Object.assign(label.style, {
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: '11px',
    whiteSpace: 'nowrap',
  })
  content.appendChild(label)

  if (isTranscribing) return content

  const createButton = (labelText: string, title: string, onClick: () => void) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = labelText
    button.title = title
    Object.assign(button.style, {
      border: '1px solid rgba(13, 118, 104, 0.24)',
      borderRadius: '6px',
      background: '#ffffff',
      color: '#173f39',
      cursor: 'pointer',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      fontSize: '11px',
      fontWeight: '800',
      padding: '3px 6px',
    })
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    })
    return button
  }

  content.appendChild(createButton('Skip', 'Turn this selection into a skip zone', onSkip))
  content.appendChild(createButton('Transcribe', 'Transcribe only this selected range', onTranscribe))
  content.appendChild(createButton('×', 'Clear selection', onClear))
  return content
}

const getRegionColor = (isSelected: boolean) =>
  isSelected ? captionRegionColors.selected : captionRegionColors.default

const getSkipRegionColor = () => 'transparent'

const getRegionContentElement = (region: Region) => {
  const content = region.getContent(true)
  return content instanceof HTMLElement ? content : undefined
}

const hasSkipRegionResizeHandles = (region: Region) => Boolean(
  region.element?.querySelector('[part*="region-handle-left"]') &&
  region.element?.querySelector('[part*="region-handle-right"]'),
)

const setSkipRegionHandleVisibility = (region: Region, isVisible: boolean) => {
  region.element
    ?.querySelectorAll<HTMLElement>('[part*="region-handle"]')
    .forEach((handle) => {
      handle.style.opacity = isVisible ? '1' : '0'
    })
}

const syncSkipRegionHandleVisibility = (region: Region) => {
  const element = region.element
  if (!element) return

  setSkipRegionHandleVisibility(region, element.matches(':hover') || element.contains(document.activeElement))
}

const installSkipRegionHandleHoverBehavior = (region: Region) => {
  const element = region.element
  if (!element || element.dataset.skipHandleHoverBound === 'true') return

  element.dataset.skipHandleHoverBound = 'true'
  element.addEventListener('pointerenter', () => setSkipRegionHandleVisibility(region, true))
  element.addEventListener('pointerleave', () => setSkipRegionHandleVisibility(region, false))
  element.addEventListener('focusin', () => setSkipRegionHandleVisibility(region, true))
  element.addEventListener('focusout', () => setSkipRegionHandleVisibility(region, false))
}

const normalizeSkipRegionLayout = (region: Region) => {
  if (region.element) {
    region.element.style.top = '0%'
    region.element.style.height = '100%'
    region.element.style.cursor = 'default'
  }

  installSkipRegionHandleHoverBehavior(region)
  syncSkipRegionHandleVisibility(region)
  getRegionContentElement(region)?.style.setProperty('margin-top', '0px', 'important')
}

const normalizeSkipRegionLayouts = (skipRegionsPlugin: RegionsPlugin) => {
  skipRegionsPlugin.getRegions().forEach(normalizeSkipRegionLayout)
}

const groupPluginRegionsById = (regions: Region[]) =>
  regions.reduce<Map<string, Region[]>>((regionsById, region) => {
    const regions = regionsById.get(region.id)
    if (regions) {
      regions.push(region)
      return regionsById
    }

    regionsById.set(region.id, [region])
    return regionsById
  }, new Map())

const removePluginRegions = (regions: Region[] | undefined) => {
  regions?.forEach((region) => region.remove())
}

const scheduleSkipRegionLayoutNormalization = (skipRegionsPlugin: RegionsPlugin) => {
  window.requestAnimationFrame(() => {
    normalizeSkipRegionLayouts(skipRegionsPlugin)
    window.setTimeout(() => normalizeSkipRegionLayouts(skipRegionsPlugin), 24)
  })
}

const getCapCutPointRegionContent = (title: string, color: string, width = 2) => {
  const content = document.createElement('span')
  content.title = title
  Object.assign(content.style, {
    alignItems: 'stretch',
    background: 'transparent',
    boxSizing: 'border-box',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    minWidth: '8px',
    overflow: 'visible',
    pointerEvents: 'auto',
    width: '100%',
  })

  const line = document.createElement('span')
  Object.assign(line.style, {
    background: color,
    borderRadius: '999px',
    boxShadow: `0 0 0 1px ${color}`,
    display: 'block',
    height: '100%',
    width: `${width}px`,
  })

  content.appendChild(line)
  return content
}

const getCapCutRegionContent = (label: string, title: string, color: string, background: string) => {
  const content = document.createElement('span')
  content.textContent = label
  content.title = title
  Object.assign(content.style, {
    alignItems: 'center',
    background,
    boxSizing: 'border-box',
    color,
    display: 'flex',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: '10px',
    fontWeight: '850',
    height: '100%',
    justifyContent: 'center',
    lineHeight: '1',
    minWidth: '24px',
    overflow: 'hidden',
    padding: '0 5px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
  })

  return content
}

const normalizeTimeRange = (start: number, end: number, timelineDuration: number) => {
  const safeDuration = Math.max(0, timelineDuration)
  const safeStart = roundCaptionTime(clamp(Math.min(start, end), 0, safeDuration))
  const safeEnd = roundCaptionTime(clamp(Math.max(start, end), safeStart, safeDuration))

  return {
    start: safeStart,
    end: safeEnd,
    duration: roundCaptionTime(Math.max(0, safeEnd - safeStart)),
  }
}

const mergeEmptyZoneCuts = (cuts: EmptyZoneCut[]) =>
  cuts
    .slice()
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .reduce<EmptyZoneCut[]>((mergedCuts, cut) => {
      const previous = mergedCuts[mergedCuts.length - 1]
      if (!previous || cut.start > previous.end + segmentBoundaryTolerance) {
        mergedCuts.push({ ...cut })
        return mergedCuts
      }

      previous.end = Math.max(previous.end, cut.end)
      previous.duration = roundCaptionTime(previous.end - previous.start)
      return mergedCuts
    }, [])

const subtractEmptyZoneCuts = (start: number, end: number, cuts: EmptyZoneCut[]) => {
  let segments = [{ start, end }]

  cuts.forEach((cut) => {
    segments = segments.flatMap((segment) => {
      if (cut.end <= segment.start || cut.start >= segment.end) return [segment]

      const nextSegments: Array<{ start: number; end: number }> = []
      if (cut.start > segment.start) {
        nextSegments.push({ start: segment.start, end: Math.min(cut.start, segment.end) })
      }
      if (cut.end < segment.end) {
        nextSegments.push({ start: Math.max(cut.end, segment.start), end: segment.end })
      }

      return nextSegments
    })
  })

  return segments.filter((segment) => segment.end - segment.start >= skipRegionMinDuration)
}

const getCaptionSegmentLabel = (
  group: CaptionGroup,
  wordMap: Map<string, CaptionWord>,
  start: number,
  end: number,
) => {
  const groupWords = getGroupWords(group, wordMap)
  const segmentWords = getSegmentWords(groupWords, start, end)

  if (!segmentWords.length) return ''

  if (group.textOverride) {
    const overrideWords = group.textOverride.trim().split(/\s+/).filter(Boolean)
    if (overrideWords.length === groupWords.length) {
      const segmentWordIds = new Set(segmentWords.map((word) => word.id))
      return groupWords
        .flatMap((word, index) => segmentWordIds.has(word.id) ? [overrideWords[index]] : [])
        .join(' ')
    }

    const coversWholeGroup =
      Math.abs(start - group.start) < segmentBoundaryTolerance &&
      Math.abs(end - group.end) < segmentBoundaryTolerance
    if (coversWholeGroup) return group.textOverride
  }

  return segmentWords.map((word) => word.text).join(' ')
}

const getPlayableStart = (start: number, end: number, cuts: EmptyZoneCut[]) => {
  let nextStart = start
  let didMove = true

  while (didMove) {
    didMove = false
    const cut = cuts.find((item) => nextStart >= item.start && nextStart < item.end && item.end > start && item.start < end)
    if (cut) {
      nextStart = Math.min(cut.end, end)
      didMove = true
    }
  }

  return nextStart
}

const doPlaybackRangesOverlap = (left: PlaybackRange, right: PlaybackRange) =>
  left.end > right.start + segmentBoundaryTolerance && left.start < right.end - segmentBoundaryTolerance

const doesPlaybackRangeFitInside = (range: PlaybackRange, container: PlaybackRange) =>
  range.start >= container.start - segmentBoundaryTolerance && range.end <= container.end + segmentBoundaryTolerance

const arePlaybackRangesEqual = (left: PlaybackRange, right: PlaybackRange) =>
  Math.abs(left.start - right.start) < segmentBoundaryTolerance &&
  Math.abs(left.end - right.end) < segmentBoundaryTolerance

const doesPlaybackRangeOverlapCuts = (range: PlaybackRange, cuts: EmptyZoneCut[]) =>
  cuts.some((cut) => doPlaybackRangesOverlap(range, cut))

const removeOverlappingSilenceCuts = (
  silenceCuts: EmptyZoneCut[],
  protectedCuts: EmptyZoneCut[],
  minDuration: number,
) => {
  let sequence = 0

  return silenceCuts.flatMap((cut) =>
    subtractEmptyZoneCuts(cut.start, cut.end, protectedCuts).flatMap((segment) => {
      const duration = roundCaptionTime(segment.end - segment.start)
      if (duration < minDuration) return []

      sequence += 1
      const start = roundCaptionTime(segment.start)
      const end = roundCaptionTime(segment.end)

      return [{
        id: `${audioSilenceEmptyZonePrefix}${String(sequence).padStart(4, '0')}`,
        start,
        end,
        duration: roundCaptionTime(end - start),
      }]
    }),
  )
}

const resizeSilenceCuts = (
  cuts: EmptyZoneCut[],
  adjustment: number,
  timelineDuration: number,
  minDuration: number,
) =>
  cuts.flatMap((cut) => {
    const normalized = normalizeTimeRange(cut.start - adjustment, cut.end + adjustment, timelineDuration)
    if (normalized.duration < minDuration) return []

    return [{
      ...cut,
      ...normalized,
    }]
  })

type MergedEmptyZoneCut = EmptyZoneCut & {
  sourceIds: string[]
}

const mergeEditableEmptyZoneCuts = (cuts: EmptyZoneCut[]) =>
  cuts
    .slice()
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .reduce<MergedEmptyZoneCut[]>((mergedCuts, cut) => {
      const previous = mergedCuts[mergedCuts.length - 1]
      if (!previous || cut.start > previous.end + segmentBoundaryTolerance) {
        mergedCuts.push({ ...cut, sourceIds: [cut.id] })
        return mergedCuts
      }

      previous.end = Math.max(previous.end, cut.end)
      previous.duration = roundCaptionTime(previous.end - previous.start)
      previous.sourceIds.push(cut.id)
      return mergedCuts
    }, [])

const hasOverlappingEditableEmptyZoneCuts = (cuts: EmptyZoneCut[]) => {
  const sortedCuts = cuts.slice().sort((left, right) => left.start - right.start || left.end - right.end)

  return sortedCuts.some((cut, index) => {
    const previous = sortedCuts[index - 1]
    return previous !== undefined && cut.start <= previous.end + segmentBoundaryTolerance
  })
}

const getDecodedChannelData = (audioData: AudioBuffer) =>
  Array.from({ length: Math.min(audioData.numberOfChannels, maxRenderedChannels) }, (_, index) =>
    audioData.getChannelData(index),
  )

const getDecodedMaxPeak = (audioData: AudioBuffer) => {
  let maxPeak = 0

  for (let channelIndex = 0; channelIndex < audioData.numberOfChannels; channelIndex += 1) {
    const channelData = audioData.getChannelData(channelIndex)
    for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
      const samplePeak = Math.abs(channelData[sampleIndex] ?? 0)
      if (samplePeak > maxPeak) maxPeak = samplePeak
    }
  }

  return maxPeak || 1
}

const getWaveSurferPixelsPerSecond = (wavesurfer: WaveSurfer, fallbackZoom: number) => {
  const duration = wavesurfer.getDuration()
  if (duration <= 0) return fallbackZoom

  return wavesurfer.getWrapper().scrollWidth / duration || fallbackZoom
}

const getWaveSurferVisibleStartTime = (wavesurfer: WaveSurfer, fallbackZoom: number) =>
  wavesurfer.getScroll() / Math.max(getWaveSurferPixelsPerSecond(wavesurfer, fallbackZoom), 1)

const getWaveSurferViewportDuration = (wavesurfer: WaveSurfer, fallbackZoom: number) =>
  wavesurfer.getWidth() / Math.max(getWaveSurferPixelsPerSecond(wavesurfer, fallbackZoom), 1)

const getWaveSurferViewportCenterTime = (wavesurfer: WaveSurfer, fallbackZoom: number) =>
  getWaveSurferVisibleStartTime(wavesurfer, fallbackZoom) + getWaveSurferViewportDuration(wavesurfer, fallbackZoom) / 2

const getWaveSurferFitZoom = (wavesurfer: WaveSurfer) => {
  const duration = wavesurfer.getDuration()
  if (duration <= 0) return timelineZoomConfig.minPixelsPerSecond

  return Math.max(1, wavesurfer.getWidth() / duration)
}

const clampTimelineZoom = (zoom: number, wavesurfer?: WaveSurfer) =>
  clamp(
    zoom,
    wavesurfer?.getDecodedData() ? getWaveSurferFitZoom(wavesurfer) : timelineZoomConfig.minPixelsPerSecond,
    timelineZoomConfig.maxPixelsPerSecond,
  )

const setWaveSurferVisibleStartTime = (wavesurfer: WaveSurfer, time: number) => {
  wavesurfer.setScrollTime(Math.max(0, time))
}

const getWheelDeltaPixels = (event: WheelEvent) => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaX * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaX * window.innerWidth

  return event.deltaX
}

const createTimelineZoomPlugin = () =>
  ZoomPlugin.create({
    deltaThreshold: timelineZoomConfig.wheelDeltaThreshold,
    exponentialZooming: true,
    iterations: timelineZoomConfig.wheelIterations,
    maxZoom: timelineZoomConfig.maxPixelsPerSecond,
    scale: timelineZoomConfig.wheelScale,
  })

export const useWaveSurferTimeline = ({
  audioUrl,
  capCutTimelineMap,
  contentDuration,
  groups,
  selectedGroupId,
  skipState,
  setSkipState,
  setSelectedGroupId,
  setStatus,
  settings,
  selectedCapCutSourceCutBoundaryId,
  words,
  onCapCutSourceCutSelect,
  onHistoryCommit,
  onGroupTimingChange,
  onTranscribeRange,
}: UseWaveSurferTimelineOptions) => {
  const waveformContainerRef = useRef<HTMLDivElement | null>(null)
  const timelineContainerRef = useRef<HTMLDivElement | null>(null)
  const timelineHoverGuideRef = useRef<HTMLDivElement | null>(null)
  const timelineHoverLabelRef = useRef<HTMLSpanElement | null>(null)
  const timelineSurfaceRef = useRef<HTMLElement | null>(null)
  const captionContainerRef = useRef<HTMLDivElement | null>(null)
  const minimapControlRef = useRef<HTMLDivElement | null>(null)
  const minimapContainerRef = useRef<HTMLDivElement | null>(null)
  const minimapSelectionRef = useRef<HTMLDivElement | null>(null)
  const minimapViewportRef = useRef<HTMLDivElement | null>(null)
  const mainWaveSurferRef = useRef<WaveSurfer | null>(null)
  const captionWaveSurferRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<RegionsPlugin | null>(null)
  const skipRegionsPluginRef = useRef<RegionsPlugin | null>(null)
  const draftRegionsPluginRef = useRef<RegionsPlugin | null>(null)
  const capCutRegionsPluginRef = useRef<RegionsPlugin | null>(null)
  const activeSegmentRef = useRef<ActiveSegment | null>(null)
  const playbackRequestRef = useRef(0)
  const loopRestartTimeoutRef = useRef<number | undefined>(undefined)
  const suppressedLoopRestartGroupIdRef = useRef<string | undefined>(undefined)
  const isReconcilingRegionsRef = useRef(false)
  const isReconcilingSkipRegionsRef = useRef(false)
  const isSyncingScrollRef = useRef(false)
  const ignoredZoomEventSourcesRef = useRef(new Set<WaveSurfer>())
  const lastSkippedCutEndRef = useRef<number | undefined>(undefined)
  const manualEmptyZoneSequenceRef = useRef(0)
  const zoomLevelRef = useRef(timelineZoomConfig.defaultPixelsPerSecond)
  const syncTimelineAxisRef = useRef<() => void>(() => undefined)
  const syncMinimapNavigationRef = useRef<() => void>(() => undefined)
  const groupsRef = useLatestRef(groups)
  const selectedGroupIdRef = useLatestRef(selectedGroupId)
  const onGroupTimingChangeRef = useLatestRef(onGroupTimingChange)
  const onHistoryCommitRef = useLatestRef(onHistoryCommit)
  const onTranscribeRangeRef = useLatestRef(onTranscribeRange)
  const onCapCutSourceCutSelectRef = useLatestRef(onCapCutSourceCutSelect)
  const isCaptionRegionPointerDownRef = useRef(false)
  const isIndependentCaptionTimingEditRef = useRef(false)
  const setStatusRef = useLatestRef(setStatus)
  const [audioDuration, setAudioDuration] = useState(0)
  const [playheadTime, setPlayheadTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [loopedGroupId, setLoopedGroupId] = useState<string | undefined>()
  const [regionsReadyToken, setRegionsReadyToken] = useState(0)
  const [skipRegionsReadyToken, setSkipRegionsReadyToken] = useState(0)
  const [draftRegionsReadyToken, setDraftRegionsReadyToken] = useState(0)
  const [selectedSkipRegionIdState, setSelectedSkipRegionId] = useState<string | undefined>()
  const [draftSelection, setDraftSelection] = useState<DraftSelection | undefined>()
  const [silenceDetectionDraft, setSilenceDetectionDraft] = useState<SilenceDetectionDraft | undefined>()
  const [silenceDetectionSettings, setSilenceDetectionSettingsState] = useState(defaultSilenceDetectionSettings)
  const [zoomLevel, setZoomLevelState] = useState(timelineZoomConfig.defaultPixelsPerSecond)
  const [playbackRate, setPlaybackRateState] = useState(playbackSpeedConfig.defaultRate)
  const playbackRateRef = useRef(playbackSpeedConfig.defaultRate)
  const silenceDetectionSettingsRef = useLatestRef(silenceDetectionSettings)
  const timelineDuration = Math.max(contentDuration, audioDuration, playheadTime, audioUrl ? 1 : 0)
  const wordMap = useMemo(() => new Map(words.map((word) => [word.id, word])), [words])

  const setPlaybackRate = useCallback((nextRate: number) => {
    const normalizedRate = normalizePlaybackRate(nextRate)
    playbackRateRef.current = normalizedRate
    setPlaybackRateState(normalizedRate)
    mainWaveSurferRef.current?.setPlaybackRate(normalizedRate, true)
  }, [])

  useEffect(() => {
    const captionContainer = captionContainerRef.current
    if (!captionContainer) return undefined

    const startPointerEdit = (event: PointerEvent) => {
      isCaptionRegionPointerDownRef.current = true
      isIndependentCaptionTimingEditRef.current = event.altKey
    }
    const setOptionDuringPointerEdit = (event: KeyboardEvent) => {
      if (isCaptionRegionPointerDownRef.current && event.altKey) {
        isIndependentCaptionTimingEditRef.current = true
      }
    }
    const clearPointerEdit = () => {
      window.setTimeout(() => {
        isCaptionRegionPointerDownRef.current = false
        isIndependentCaptionTimingEditRef.current = false
      }, 0)
    }

    captionContainer.addEventListener('pointerdown', startPointerEdit)
    window.addEventListener('keydown', setOptionDuringPointerEdit)
    window.addEventListener('pointerup', clearPointerEdit)
    window.addEventListener('pointercancel', clearPointerEdit)
    window.addEventListener('blur', clearPointerEdit)

    return () => {
      captionContainer.removeEventListener('pointerdown', startPointerEdit)
      window.removeEventListener('keydown', setOptionDuringPointerEdit)
      window.removeEventListener('pointerup', clearPointerEdit)
      window.removeEventListener('pointercancel', clearPointerEdit)
      window.removeEventListener('blur', clearPointerEdit)
    }
  }, [])

  const emptyZoneCuts = useMemo(
    () => getEmptyZoneCuts(words, timelineDuration, settings),
    [settings, timelineDuration, words],
  )
  const emptyZoneSignature = emptyZoneCuts.map((cut) => `${cut.id}:${cut.start}:${cut.end}`).join('|')
  const emptyZoneSignatureRef = useLatestRef(emptyZoneSignature)
  const isEmptyZoneSourceCurrent = skipState.sourceUrl === audioUrl
  const isEmptyZoneStateCurrent = isEmptyZoneSourceCurrent && skipState.signature === emptyZoneSignature
  const activeEmptyZoneEdits = isEmptyZoneStateCurrent ? skipState.edits : undefined
  const deletedAutoEmptyZoneIds = isEmptyZoneStateCurrent ? skipState.deletedAutoIds : undefined
  const editableEmptyZoneCuts = useMemo(() => {
    const autoCuts = emptyZoneCuts
      .filter((cut) => !deletedAutoEmptyZoneIds?.has(cut.id))
      .map((cut) => {
        const edit = activeEmptyZoneEdits?.get(cut.id)
        if (!edit) return cut

        const { start, end, duration } = normalizeTimeRange(edit.start, edit.end, timelineDuration)
        return {
          ...cut,
          start,
          end,
          duration,
        }
      })

    return [...autoCuts, ...(isEmptyZoneSourceCurrent ? skipState.manualCuts : [])]
      .filter((cut) => cut.duration >= skipRegionMinDuration)
      .sort((left, right) => left.start - right.start || left.end - right.end)
  }, [
    activeEmptyZoneEdits,
    deletedAutoEmptyZoneIds,
    emptyZoneCuts,
    skipState.manualCuts,
    isEmptyZoneSourceCurrent,
    timelineDuration,
  ])
  const selectedSkipRegionId =
    !selectedGroupId &&
    selectedSkipRegionIdState &&
    editableEmptyZoneCuts.some((cut) => cut.id === selectedSkipRegionIdState)
      ? selectedSkipRegionIdState
      : undefined
  const maskedEmptyZoneCuts = useMemo(() => mergeEmptyZoneCuts(editableEmptyZoneCuts), [editableEmptyZoneCuts])
  const maskedEmptyZoneCutsRef = useLatestRef(maskedEmptyZoneCuts)
  const editableEmptyZoneCutsRef = useLatestRef(editableEmptyZoneCuts)
  const keptTimelineRanges = useMemo<TimelineRange[]>(
    () => subtractEmptyZoneCuts(0, timelineDuration, maskedEmptyZoneCuts),
    [maskedEmptyZoneCuts, timelineDuration],
  )
  const captionRegionSegments = useMemo<CaptionRegionSegment[]>(
    () =>
      groups.flatMap((group) => {
        const segments = subtractEmptyZoneCuts(group.start, group.end, maskedEmptyZoneCuts)
          .map((segment, index) => ({
            ...segment,
            index,
            label: getCaptionSegmentLabel(group, wordMap, segment.start, segment.end),
          }))
          .filter((segment) => segment.label)
        const canEditTiming = segments.length === 1

        return segments.map((segment) => ({
          canEditTiming,
          end: segment.end,
          group,
          id: getCaptionRegionId(group.id, segment.index, canEditTiming),
          label: segment.label,
          start: segment.start,
        }))
      }),
    [groups, maskedEmptyZoneCuts, wordMap],
  )
  const captionRegionSegmentMap = useMemo(
    () => new Map(captionRegionSegments.map((segment) => [segment.id, segment])),
    [captionRegionSegments],
  )
  const captionRegionSegmentsRef = useLatestRef(captionRegionSegments)
  const captionRegionSegmentMapRef = useLatestRef(captionRegionSegmentMap)
  const draftSelectionRef = useLatestRef(draftSelection)
  const silenceDetectionDraftRef = useLatestRef(silenceDetectionDraft)

  const clearLoopRestartTimeout = useCallback(() => {
    if (loopRestartTimeoutRef.current === undefined) return

    window.clearTimeout(loopRestartTimeoutRef.current)
    loopRestartTimeoutRef.current = undefined
  }, [])

  const zoomWaveSurferWithoutFeedback = useCallback((wavesurfer: WaveSurfer, zoom: number) => {
    ignoredZoomEventSourcesRef.current.add(wavesurfer)
    wavesurfer.zoom(zoom)
    window.requestAnimationFrame(() => {
      ignoredZoomEventSourcesRef.current.delete(wavesurfer)
    })
  }, [])

  const setSynchronizedVisibleStart = useCallback((visibleStart: number, zoom = zoomLevelRef.current) => {
    const mainWaveSurfer = mainWaveSurferRef.current
    const captionWaveSurfer = captionWaveSurferRef.current
    const sourceWaveSurfer = mainWaveSurfer?.getDecodedData()
      ? mainWaveSurfer
      : captionWaveSurfer?.getDecodedData()
        ? captionWaveSurfer
        : undefined
    if (!sourceWaveSurfer) return

    const maxStart = Math.max(
      0,
      sourceWaveSurfer.getDuration() - getWaveSurferViewportDuration(sourceWaveSurfer, zoom),
    )
    const nextStart = clamp(visibleStart, 0, maxStart)

    if (mainWaveSurfer?.getDecodedData()) {
      setWaveSurferVisibleStartTime(mainWaveSurfer, nextStart)
    }
    if (captionWaveSurfer?.getDecodedData()) {
      setWaveSurferVisibleStartTime(captionWaveSurfer, nextStart)
    }
    syncTimelineAxisRef.current()
    syncMinimapNavigationRef.current()
  }, [])

  const applySynchronizedZoom = useCallback((nextZoom: number, visibleStart?: number) => {
    const mainWaveSurfer = mainWaveSurferRef.current
    const captionWaveSurfer = captionWaveSurferRef.current
    const sourceWaveSurfer = mainWaveSurfer?.getDecodedData()
      ? mainWaveSurfer
      : captionWaveSurfer?.getDecodedData()
        ? captionWaveSurfer
        : undefined
    const zoom = clampTimelineZoom(nextZoom, sourceWaveSurfer)
    if (!sourceWaveSurfer) {
      zoomLevelRef.current = zoom
      setZoomLevelState(zoom)
      return
    }

    const centerTime = sourceWaveSurfer && visibleStart === undefined
      ? getWaveSurferViewportCenterTime(sourceWaveSurfer, zoomLevelRef.current)
      : undefined

    zoomLevelRef.current = zoom
    setZoomLevelState(zoom)
    ;[mainWaveSurfer, captionWaveSurfer].forEach((wavesurfer) => {
      if (!wavesurfer?.getDecodedData()) return
      zoomWaveSurferWithoutFeedback(wavesurfer, zoom)
    })

    window.requestAnimationFrame(() => {
      const nextVisibleStart =
        visibleStart ??
        (centerTime !== undefined
          ? centerTime - getWaveSurferViewportDuration(sourceWaveSurfer, zoom) / 2
          : getWaveSurferVisibleStartTime(sourceWaveSurfer, zoom))
      setSynchronizedVisibleStart(nextVisibleStart, zoom)
    })
  }, [setSynchronizedVisibleStart, zoomWaveSurferWithoutFeedback])

  const setZoomLevel = useCallback((nextZoom: number) => {
    applySynchronizedZoom(nextZoom)
  }, [applySynchronizedZoom])

  const getManualCutId = useCallback(() => getManualEmptyZoneId(manualEmptyZoneSequenceRef.current++), [])

  const reconcileOverlappingSkipCuts = useCallback((
    cuts: EmptyZoneCut[],
    preferredId?: string,
  ) => {
    const mergedCuts = mergeEditableEmptyZoneCuts(cuts)
    const manualCuts: EmptyZoneCut[] = []
    const deletedAutoIds = new Set<string>()
    const edits = new Map<string, { start: number; end: number }>()

    mergedCuts.forEach((cut) => {
      const preferredSourceId = preferredId && cut.sourceIds.includes(preferredId) ? preferredId : undefined
      const managedSourceId = preferredSourceId && isUserManagedCut({ ...cut, id: preferredSourceId })
        ? preferredSourceId
        : cut.sourceIds.find((sourceId) => isUserManagedCut({ ...cut, id: sourceId }))
      const isMergedCut = cut.sourceIds.length > 1
      const isManagedCut = managedSourceId !== undefined
      const isEditedAutoCut = preferredSourceId !== undefined && !isManagedCut

      if (isManagedCut || isMergedCut) {
        cut.sourceIds.forEach((sourceId) => {
          if (!sourceId.startsWith(manualEmptyZonePrefix) && !sourceId.startsWith(audioSilenceEmptyZonePrefix)) {
            deletedAutoIds.add(sourceId)
          }
        })
        manualCuts.push({
          id: managedSourceId ?? getManualCutId(),
          start: roundCaptionTime(cut.start),
          end: roundCaptionTime(cut.end),
          duration: roundCaptionTime(cut.end - cut.start),
        })
        return
      }

      if (isEditedAutoCut) {
        edits.set(cut.id, {
          start: roundCaptionTime(cut.start),
          end: roundCaptionTime(cut.end),
        })
      }
    })

    return {
      deletedAutoIds,
      edits,
      manualCuts,
    }
  }, [getManualCutId])

  useEffect(() => {
    if (!audioUrl || !isEmptyZoneSourceCurrent || !hasOverlappingEditableEmptyZoneCuts(editableEmptyZoneCuts)) {
      return
    }

    setSkipState((current) => {
      const baseState = current.sourceUrl === audioUrl ? current : createTimelineSkipState(audioUrl)
      const existingEdits =
        baseState.signature === emptyZoneSignature ? new Map(baseState.edits) : new Map<string, { start: number; end: number }>()
      const existingDeletedAutoIds =
        baseState.signature === emptyZoneSignature ? new Set(baseState.deletedAutoIds) : new Set<string>()
      const reconciledCuts = reconcileOverlappingSkipCuts(editableEmptyZoneCuts, selectedSkipRegionId)

      return {
        ...baseState,
        deletedAutoIds: new Set([...existingDeletedAutoIds, ...reconciledCuts.deletedAutoIds]),
        edits: new Map([...existingEdits, ...reconciledCuts.edits]),
        manualCuts: reconciledCuts.manualCuts,
        signature: emptyZoneSignature,
        sourceUrl: audioUrl,
      }
    })
  }, [
    audioUrl,
    editableEmptyZoneCuts,
    emptyZoneSignature,
    isEmptyZoneSourceCurrent,
    reconcileOverlappingSkipCuts,
    selectedSkipRegionId,
    setSkipState,
  ])

  const applySilenceDetectionDraft = useCallback((draft: SilenceDetectionDraft) => {
    const duration = mainWaveSurferRef.current?.getDuration() ?? timelineDuration
    const minDuration = silenceDetectionSettingsRef.current.minDuration
    const detectedCuts = removeOverlappingSilenceCuts(
      resizeSilenceCuts(draft.baseCuts, draft.adjustment, duration, minDuration),
      editableEmptyZoneCutsRef.current.filter((cut) => !isAudioSilenceCut(cut)),
      minDuration,
    )

    setSkipState((current) => {
      const baseState = current.sourceUrl === audioUrl ? current : createTimelineSkipState(audioUrl)

      return {
        ...baseState,
        manualCuts: [
          ...baseState.manualCuts.filter((cut) => !isAudioSilenceCut(cut)),
          ...detectedCuts,
        ],
        sourceUrl: audioUrl,
      }
    })
    setSelectedGroupId(undefined)
    setSelectedSkipRegionId(detectedCuts[0]?.id)

    return detectedCuts
  }, [
    audioUrl,
    editableEmptyZoneCutsRef,
    setSelectedGroupId,
    setSkipState,
    silenceDetectionSettingsRef,
    timelineDuration,
  ])

  const createSilenceDetectionDraft = useCallback((
    nextSettings: SilenceDetectionSettings,
    adjustment = 0,
  ): SilenceDetectionDraft | undefined => {
    const decodedData = mainWaveSurferRef.current?.getDecodedData()
    if (!audioUrl || !decodedData) return undefined

    const protectedCuts = editableEmptyZoneCutsRef.current.filter((cut) => !isAudioSilenceCut(cut))
    return {
      adjustment,
      baseCuts: removeOverlappingSilenceCuts(
        detectSilenceCuts(decodedData, {
          ...nextSettings,
          idPrefix: audioSilenceEmptyZonePrefix,
        }),
        protectedCuts,
        nextSettings.minDuration,
      ),
    }
  }, [audioUrl, editableEmptyZoneCutsRef])

  const setSilenceDetectionSettings = useCallback((nextSettings: Partial<SilenceDetectionSettings>) => {
    const normalizedSettings = normalizeSilenceDetectionSettings({
      ...silenceDetectionSettingsRef.current,
      ...nextSettings,
    })
    setSilenceDetectionSettingsState(normalizedSettings)

    const currentDraft = silenceDetectionDraftRef.current
    if (!currentDraft) return

    const nextDraft = createSilenceDetectionDraft(normalizedSettings, currentDraft.adjustment)
    if (!nextDraft) return

    setSilenceDetectionDraft(nextDraft)
    const detectedCuts = applySilenceDetectionDraft(nextDraft)
    setStatusRef.current(
      detectedCuts.length
        ? `Detected ${detectedCuts.length} silent zones with updated settings. Tune padding, then confirm.`
        : 'Updated silence settings cleared the detected zones.',
    )
  }, [
    applySilenceDetectionDraft,
    createSilenceDetectionDraft,
    setStatusRef,
    silenceDetectionDraftRef,
    silenceDetectionSettingsRef,
  ])

  const setDetectedSilenceAdjustment = useCallback((nextAdjustment: number) => {
    const currentDraft = silenceDetectionDraftRef.current
    if (!currentDraft) return

    const nextDraft = {
      ...currentDraft,
      adjustment: roundCaptionTime(clamp(nextAdjustment, silenceAdjustmentMin, silenceAdjustmentMax)),
    }
    setSilenceDetectionDraft(nextDraft)
    applySilenceDetectionDraft(nextDraft)
  }, [applySilenceDetectionDraft, silenceDetectionDraftRef])

  const confirmDetectedSilentSkipRegions = useCallback(() => {
    if (!silenceDetectionDraftRef.current) return

    setSilenceDetectionDraft(undefined)
    setStatusRef.current('Silent zones fixed. You can resize or delete them.')
  }, [setStatusRef, silenceDetectionDraftRef])

  const addSkipRegion = useCallback(() => {
    const wavesurfer = mainWaveSurferRef.current
    const duration = Math.max(wavesurfer?.getDuration() ?? timelineDuration, 0)
    if (!audioUrl || !wavesurfer?.getDecodedData() || duration <= skipRegionMinDuration) {
      setStatusRef.current('Upload audio or video to add a skip zone.')
      return
    }

    const regionDuration = Math.min(defaultManualSkipDuration, duration)
    const currentTime = wavesurfer.getCurrentTime()
    const start = roundCaptionTime(clamp(currentTime, 0, Math.max(0, duration - regionDuration)))
    const end = roundCaptionTime(Math.min(duration, start + regionDuration))
    const normalized = normalizeTimeRange(start, end, duration)
    if (normalized.duration < skipRegionMinDuration) return

    const id = `${manualEmptyZonePrefix}${Date.now().toString(36)}_${manualEmptyZoneSequenceRef.current++}`
    const manualCut = {
      id,
      ...normalized,
    }

    onHistoryCommitRef.current('add skip zone')
    setSilenceDetectionDraft(undefined)
    setSkipState((current) => {
      const baseState = current.sourceUrl === audioUrl ? current : createTimelineSkipState(audioUrl)
      const signature = emptyZoneSignatureRef.current
      const existingEdits =
        baseState.signature === signature ? new Map(baseState.edits) : new Map<string, { start: number; end: number }>()
      const existingDeletedAutoIds =
        baseState.signature === signature ? new Set(baseState.deletedAutoIds) : new Set<string>()
      const reconciledCuts = reconcileOverlappingSkipCuts(
        [...editableEmptyZoneCutsRef.current, manualCut],
        manualCut.id,
      )

      return {
        ...baseState,
        deletedAutoIds: new Set([...existingDeletedAutoIds, ...reconciledCuts.deletedAutoIds]),
        edits: new Map([...existingEdits, ...reconciledCuts.edits]),
        manualCuts: reconciledCuts.manualCuts,
        signature,
        sourceUrl: audioUrl,
      }
    })
    setSelectedGroupId(undefined)
    setSelectedSkipRegionId(id)
    setStatusRef.current('Skip zone added. Resize it with the handles on the waveform.')
  }, [
    audioUrl,
    editableEmptyZoneCutsRef,
    emptyZoneSignatureRef,
    onHistoryCommitRef,
    reconcileOverlappingSkipCuts,
    setSelectedGroupId,
    setStatusRef,
    setSkipState,
    timelineDuration,
  ])

  const deleteSelectedSkipRegion = useCallback(() => {
    if (!selectedSkipRegionId) {
      setStatusRef.current('Select a skip zone to delete it.')
      return
    }

    onHistoryCommitRef.current('delete skip zone')
    setSkipState((current) => {
      const baseState = current.sourceUrl === audioUrl ? current : createTimelineSkipState(audioUrl)
      const manualCuts = baseState.manualCuts.filter((cut) => cut.id !== selectedSkipRegionId)
      if (manualCuts.length !== baseState.manualCuts.length) {
        return {
          ...baseState,
          manualCuts,
          sourceUrl: audioUrl,
        }
      }

      const edits = baseState.signature === emptyZoneSignature ? new Map(baseState.edits) : new Map()
      const deletedAutoIds =
        baseState.signature === emptyZoneSignature ? new Set(baseState.deletedAutoIds) : new Set<string>()

      edits.delete(selectedSkipRegionId)
      deletedAutoIds.add(selectedSkipRegionId)

      return {
        ...baseState,
        deletedAutoIds,
        edits,
        signature: emptyZoneSignature,
        sourceUrl: audioUrl,
      }
    })
    setSelectedSkipRegionId(undefined)
    setStatusRef.current('Skip zone removed. Hidden caption groups are restored where the zone no longer overlaps.')
  }, [audioUrl, emptyZoneSignature, onHistoryCommitRef, selectedSkipRegionId, setStatusRef, setSkipState])

  const detectSilentSkipRegions = useCallback(() => {
    const wavesurfer = mainWaveSurferRef.current
    const decodedData = wavesurfer?.getDecodedData()
    if (!audioUrl || !decodedData) {
      setStatusRef.current('Upload audio or video before detecting silence.')
      return
    }

    const currentSilenceSettings = silenceDetectionSettingsRef.current
    const draft = createSilenceDetectionDraft(currentSilenceSettings)
    const hadDetectedCuts = skipState.sourceUrl === audioUrl && skipState.manualCuts.some(isAudioSilenceCut)
    if (!draft) return

    if (!draft.baseCuts.length && !hadDetectedCuts) {
      setStatusRef.current(`No silent zones longer than ${currentSilenceSettings.minDuration.toFixed(2)}s were detected.`)
      return
    }

    onHistoryCommitRef.current('detect silent skip zones')
    setSilenceDetectionDraft(draft)
    const detectedCuts = applySilenceDetectionDraft(draft)
    setStatusRef.current(
      detectedCuts.length
        ? `Detected ${detectedCuts.length} silent zones. Tune their padding, then confirm.`
        : 'Detected silent zones were cleared.',
    )
  }, [
    applySilenceDetectionDraft,
    audioUrl,
    createSilenceDetectionDraft,
    onHistoryCommitRef,
    setStatusRef,
    silenceDetectionSettingsRef,
    skipState.manualCuts,
    skipState.sourceUrl,
  ])

  const clearDraftSelection = useCallback(() => {
    draftRegionsPluginRef.current?.getRegions().forEach((region) => region.remove())
    setDraftSelection(undefined)
  }, [])

  const convertDraftSelectionToSkip = useCallback(() => {
    const selection = draftSelectionRef.current
    const wavesurfer = mainWaveSurferRef.current
    const duration = wavesurfer?.getDuration() ?? timelineDuration
    if (!selection || !audioUrl || duration <= 0) return

    const normalized = normalizeTimeRange(selection.start, selection.end, duration)
    if (normalized.duration < skipRegionMinDuration) {
      setStatusRef.current('Selection is too short to become a skip zone.')
      return
    }

    const id = `${manualEmptyZonePrefix}${Date.now().toString(36)}_${manualEmptyZoneSequenceRef.current++}`
    const manualCut = {
      id,
      ...normalized,
    }
    onHistoryCommitRef.current('selection to skip zone')
    setSilenceDetectionDraft(undefined)
    setSkipState((current) => {
      const baseState = current.sourceUrl === audioUrl ? current : createTimelineSkipState(audioUrl)
      const signature = emptyZoneSignatureRef.current
      const existingEdits =
        baseState.signature === signature ? new Map(baseState.edits) : new Map<string, { start: number; end: number }>()
      const existingDeletedAutoIds =
        baseState.signature === signature ? new Set(baseState.deletedAutoIds) : new Set<string>()
      const reconciledCuts = reconcileOverlappingSkipCuts(
        [...editableEmptyZoneCutsRef.current, manualCut],
        manualCut.id,
      )

      return {
        ...baseState,
        deletedAutoIds: new Set([...existingDeletedAutoIds, ...reconciledCuts.deletedAutoIds]),
        edits: new Map([...existingEdits, ...reconciledCuts.edits]),
        manualCuts: reconciledCuts.manualCuts,
        signature,
        sourceUrl: audioUrl,
      }
    })
    clearDraftSelection()
    setSelectedGroupId(undefined)
    setSelectedSkipRegionId(id)
    setStatusRef.current('Selection converted to a skip zone.')
  }, [
    audioUrl,
    clearDraftSelection,
    draftSelectionRef,
    editableEmptyZoneCutsRef,
    emptyZoneSignatureRef,
    onHistoryCommitRef,
    reconcileOverlappingSkipCuts,
    setSelectedGroupId,
    setStatusRef,
    setSkipState,
    timelineDuration,
  ])

  const transcribeDraftSelection = useCallback(async () => {
    const selection = draftSelectionRef.current
    const transcribeRange = onTranscribeRangeRef.current
    if (!selection) return
    if (!transcribeRange) {
      setStatusRef.current('Selected-range transcription is not available yet.')
      return
    }

    setDraftSelection({ ...selection, status: 'transcribing' })
    setStatusRef.current('Transcribing selected range...')

    try {
      await transcribeRange(selection.start, selection.end)
      clearDraftSelection()
      setStatusRef.current('Selected range transcribed and merged into the caption groups.')
    } catch (error) {
      setDraftSelection({ ...selection, status: 'idle' })
      setStatusRef.current(error instanceof Error ? error.message : 'Selected range transcription failed.')
    }
  }, [clearDraftSelection, draftSelectionRef, onTranscribeRangeRef, setStatusRef])

  const clearSegmentPlayback = useCallback(() => {
    playbackRequestRef.current += 1
    clearLoopRestartTimeout()
    activeSegmentRef.current = null
    lastSkippedCutEndRef.current = undefined
    setLoopedGroupId(undefined)
  }, [clearLoopRestartTimeout])

  const stopSegmentPlaybackWithStatus = useCallback((
    message?: string,
    options?: { clearSelectedGroup?: boolean; suppressLoopRestart?: boolean },
  ) => {
    const stoppedSegment = activeSegmentRef.current
    if (options?.suppressLoopRestart && stoppedSegment?.loop) {
      suppressedLoopRestartGroupIdRef.current = stoppedSegment.groupId
    }
    clearSegmentPlayback()
    mainWaveSurferRef.current?.pause()
    setIsPlaying(false)
    if (options?.clearSelectedGroup && stoppedSegment) {
      setSelectedGroupId((current) => (current === stoppedSegment.groupId ? undefined : current))
    }
    if (message) {
      setStatusRef.current(message)
    }
  }, [clearSegmentPlayback, setSelectedGroupId, setStatusRef])

  const stopPlayback = useCallback(() => {
    stopSegmentPlaybackWithStatus()
  }, [stopSegmentPlaybackWithStatus])

  const resetPlaybackPosition = useCallback(() => {
    clearSegmentPlayback()
    mainWaveSurferRef.current?.setTime(0)
    captionWaveSurferRef.current?.setTime(0)
    setAudioDuration(0)
    setPlayheadTime(0)
    setIsPlaying(false)
    setIsReady(false)
  }, [clearSegmentPlayback])

  const seekTo = useCallback((time: number, options?: { clearSegment?: boolean }) => {
    const wavesurfer = mainWaveSurferRef.current
    const duration = Math.max(wavesurfer?.getDuration() ?? timelineDuration, 0)
    const nextTime = clamp(time, 0, duration)

    if (options?.clearSegment ?? true) {
      clearSegmentPlayback()
    }
    wavesurfer?.setTime(nextTime)
    captionWaveSurferRef.current?.setTime(nextTime)
    setPlayheadTime(nextTime)

    return nextTime
  }, [clearSegmentPlayback, timelineDuration])

  const getGroupPlaybackRange = useCallback((group: CaptionGroup, preferredRange?: PlaybackRange): PlaybackRange | undefined => {
    const visibleSegments = captionRegionSegmentsRef.current.filter((segment) => segment.group.id === group.id)
    if (!visibleSegments.length) {
      return undefined
    }

    if (
      preferredRange &&
      preferredRange.end - preferredRange.start >= segmentBoundaryTolerance &&
      visibleSegments.some((segment) => doesPlaybackRangeFitInside(preferredRange, segment))
    ) {
      return preferredRange
    }

    const activeSegment = activeSegmentRef.current
    const activeVisibleSegment = activeSegment?.groupId === group.id
      ? visibleSegments.find((segment) =>
          doesPlaybackRangeFitInside(activeSegment, segment),
        )
      : undefined

    const currentTime = mainWaveSurferRef.current?.getCurrentTime()
    const playheadVisibleSegment = currentTime === undefined
      ? undefined
      : visibleSegments.find((segment) =>
          currentTime >= segment.start - segmentBoundaryTolerance &&
          currentTime <= segment.end + segmentBoundaryTolerance,
        )

    const segment = activeVisibleSegment ?? playheadVisibleSegment ?? visibleSegments[0]
    return { start: segment.start, end: segment.end }
  }, [captionRegionSegmentsRef])

  const getActiveSegmentInvalidStatus = useCallback((segment: ActiveSegment) => {
    const statusPrefix = segment.loop ? 'Loop' : 'Playback'
    const group = groupsRef.current.find((item) => item.id === segment.groupId)
    if (!group) {
      return `${statusPrefix} stopped because the selected group no longer exists.`
    }

    const visibleSegments = captionRegionSegmentsRef.current.filter((item) => item.group.id === segment.groupId)
    if (!visibleSegments.length) {
      return `${statusPrefix} stopped because the selected group is covered by a skip zone.`
    }

    const playbackStart = getPlayableStart(segment.start, segment.end, maskedEmptyZoneCutsRef.current)
    if (playbackStart >= segment.end - segmentBoundaryTolerance) {
      return `${statusPrefix} stopped because the selected group is covered by a skip zone.`
    }

    if (!segment.loop) return undefined

    if (doesPlaybackRangeOverlapCuts(segment, maskedEmptyZoneCutsRef.current)) {
      return 'Loop stopped because a skip-zone edit now overlaps the selected group.'
    }

    return undefined
  }, [captionRegionSegmentsRef, groupsRef, maskedEmptyZoneCutsRef])

  const stopActiveSegmentIfInvalid = useCallback((message?: string) => {
    const activeSegment = activeSegmentRef.current
    if (!activeSegment) return false

    const invalidStatus = message ?? getActiveSegmentInvalidStatus(activeSegment)
    if (!invalidStatus) return false

    stopSegmentPlaybackWithStatus(invalidStatus, { clearSelectedGroup: true, suppressLoopRestart: true })
    return true
  }, [getActiveSegmentInvalidStatus, stopSegmentPlaybackWithStatus])

  const stopActiveSegmentOnMaskOverlap = useCallback((range: PlaybackRange) => {
    const activeSegment = activeSegmentRef.current
    if (!activeSegment || !doPlaybackRangesOverlap(activeSegment, range)) return false

    stopSegmentPlaybackWithStatus(
      activeSegment.loop
        ? 'Loop stopped because a skip-zone edit now overlaps the selected group.'
        : 'Playback stopped because a skip-zone edit now overlaps the selected group.',
      { clearSelectedGroup: true, suppressLoopRestart: activeSegment.loop },
    )
    return true
  }, [stopSegmentPlaybackWithStatus])

  const startSegmentPlayback = useCallback(async (segment: ActiveSegment) => {
    const wavesurfer = mainWaveSurferRef.current
    if (!audioUrl || !wavesurfer || wavesurfer.getDuration() <= 0) {
      setStatusRef.current('Upload audio or video to audition timing.')
      return false
    }

    const skipCuts = maskedEmptyZoneCutsRef.current
    if (segment.loop && doesPlaybackRangeOverlapCuts(segment, skipCuts)) {
      stopSegmentPlaybackWithStatus(
        'Selected group is interrupted by a skip zone.',
        { clearSelectedGroup: true, suppressLoopRestart: true },
      )
      return false
    }

    const playbackStart = getPlayableStart(segment.start, segment.end, skipCuts)
    if (playbackStart >= segment.end - segmentBoundaryTolerance) {
      stopSegmentPlaybackWithStatus(
        'Selected group is fully covered by a skip zone.',
        { clearSelectedGroup: segment.loop, suppressLoopRestart: segment.loop },
      )
      return false
    }

    clearLoopRestartTimeout()
    const requestId = playbackRequestRef.current + 1
    playbackRequestRef.current = requestId
    if (segment.loop) {
      suppressedLoopRestartGroupIdRef.current = undefined
    }
    activeSegmentRef.current = null
    lastSkippedCutEndRef.current = undefined
    wavesurfer.pause()
    activeSegmentRef.current = segment
    setLoopedGroupId(segment.loop ? segment.groupId : undefined)
    wavesurfer.setTime(playbackStart)
    captionWaveSurferRef.current?.setTime(playbackStart)

    try {
      await wavesurfer.play(playbackStart, segment.end)
      if (playbackRequestRef.current !== requestId) return false
      setIsPlaying(true)
      return true
    } catch (error) {
      stopSegmentPlaybackWithStatus()
      setStatusRef.current(error instanceof Error ? error.message : 'Playback failed.')
      return false
    }
  }, [audioUrl, clearLoopRestartTimeout, maskedEmptyZoneCutsRef, setStatusRef, stopSegmentPlaybackWithStatus])

  const startLoopGroup = useCallback(async (groupId: string, preferredRange?: PlaybackRange) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!audioUrl || !group) {
      setStatusRef.current('Upload audio or video to loop the selected group.')
      return
    }

    const range = getGroupPlaybackRange(group, preferredRange)
    if (!range) {
      stopSegmentPlaybackWithStatus('Selected group is covered by a skip zone.')
      return
    }

    suppressedLoopRestartGroupIdRef.current = undefined
    setSelectedGroupId(group.id)
    setSelectedSkipRegionId(undefined)
    const didStart = await startSegmentPlayback({ groupId: group.id, start: range.start, end: range.end, loop: true })
    if (didStart) {
      setStatusRef.current('Looping selected group. Space stops playback.')
    }
  }, [
    audioUrl,
    getGroupPlaybackRange,
    groupsRef,
    setSelectedGroupId,
    setStatusRef,
    startSegmentPlayback,
    stopSegmentPlaybackWithStatus,
  ])

  const playGroup = useCallback((groupId: string) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!group) return

    const range = getGroupPlaybackRange(group)
    if (!range) {
      stopSegmentPlaybackWithStatus('Selected group is covered by a skip zone.')
      return
    }

    setSelectedGroupId(group.id)
    setSelectedSkipRegionId(undefined)
    void startSegmentPlayback({ groupId: group.id, start: range.start, end: range.end, loop: false })
  }, [getGroupPlaybackRange, groupsRef, setSelectedGroupId, startSegmentPlayback, stopSegmentPlaybackWithStatus])

  const togglePlayback = useCallback(async () => {
    const wavesurfer = mainWaveSurferRef.current
    if (!audioUrl || !wavesurfer || wavesurfer.getDuration() <= 0) {
      setStatusRef.current('Upload audio or video to play the timeline.')
      return
    }

    if (wavesurfer.isPlaying()) {
      clearSegmentPlayback()
      wavesurfer.pause()
      setIsPlaying(false)
      return
    }

    clearSegmentPlayback()
    const duration = wavesurfer.getDuration()
    if (duration > 0 && wavesurfer.getCurrentTime() >= duration - segmentBoundaryTolerance) {
      wavesurfer.setTime(0)
    }

    try {
      await wavesurfer.play()
      setIsPlaying(true)
    } catch (error) {
      setStatusRef.current(error instanceof Error ? error.message : 'Playback failed.')
    }
  }, [audioUrl, clearSegmentPlayback, setStatusRef])

  const handleTimelineGroupSelect = useCallback((groupId: string, preferredRange?: PlaybackRange) => {
    if (selectedGroupIdRef.current === groupId) {
      setSelectedGroupId(undefined)
      if (loopedGroupId === groupId || activeSegmentRef.current?.groupId === groupId) {
        clearSegmentPlayback()
      }
      setStatusRef.current('Group deselected. Space plays the full timeline from the playhead.')
      return
    }

    setSelectedGroupId(groupId)
    setSelectedSkipRegionId(undefined)
    if (loopedGroupId) {
      void startLoopGroup(groupId, preferredRange)
      return
    }
    activeSegmentRef.current = null
    setStatusRef.current('Group selected. Space loops this group.')
  }, [
    clearSegmentPlayback,
    loopedGroupId,
    selectedGroupIdRef,
    setSelectedGroupId,
    setStatusRef,
    startLoopGroup,
  ])
  const handleTimelineGroupSelectRef = useLatestRef(handleTimelineGroupSelect)
  const seekToRef = useLatestRef(seekTo)
  const startSegmentPlaybackRef = useLatestRef(startSegmentPlayback)

  useEffect(() => {
    if (!audioUrl) {
      return undefined
    }

    const waveformContainer = waveformContainerRef.current
    const timelineContainer = timelineContainerRef.current
    const captionContainer = captionContainerRef.current
    const minimapControl = minimapControlRef.current
    const minimapContainer = minimapContainerRef.current
    const minimapSelection = minimapSelectionRef.current
    const minimapViewport = minimapViewportRef.current
    if (
      !waveformContainer ||
      !timelineContainer ||
      !captionContainer ||
      !minimapControl ||
      !minimapContainer ||
      !minimapSelection ||
      !minimapViewport
    ) {
      return undefined
    }

    const subscriptions: Array<() => void> = []
    let captionSubscriptions: Array<() => void> = []
    let isDisposed = false
    let minimapSyncFrame: number | undefined
    let timelineSyncFrame: number | undefined

    const syncTimelineAxis = () => {
      const mainWaveSurfer = mainWaveSurferRef.current
      if (!mainWaveSurfer) return

      const timelineWrapper = timelineContainer.querySelector<HTMLElement>('[part="timeline-wrapper"]')
      if (!timelineWrapper) return

      const duration = mainWaveSurfer.getDuration()
      const scrollWidth = mainWaveSurfer.getWrapper().scrollWidth
      const pixelsPerSecond = duration > 0 ? scrollWidth / duration : zoomLevelRef.current
      timelineSurfaceRef.current?.style.setProperty(
        '--timeline-grid-step',
        `${Math.max(1, pixelsPerSecond)}px`,
      )

      timelineWrapper.style.width = `${scrollWidth}px`
      timelineWrapper.style.transform = `translateX(${-mainWaveSurfer.getScroll()}px)`
      timelineWrapper.style.willChange = 'transform'
    }

    const syncMinimapNavigation = () => {
      const mainWaveSurfer = mainWaveSurferRef.current
      if (!mainWaveSurfer?.getDecodedData()) return

      const duration = mainWaveSurfer.getDuration()
      if (duration <= 0) return

      const zoom = zoomLevelRef.current
      const visibleStart = getWaveSurferVisibleStartTime(mainWaveSurfer, zoom)
      const visibleDuration = getWaveSurferViewportDuration(mainWaveSurfer, zoom)
      const left = clamp(visibleStart / duration, 0, 1) * 100
      const width = clamp(visibleDuration / duration, 0, 1) * 100

      minimapViewport.style.left = `${left}%`
      minimapViewport.style.width = `${Math.min(width, 100 - left)}%`
    }

    const scheduleMinimapNavigationSync = () => {
      if (minimapSyncFrame !== undefined) return

      minimapSyncFrame = window.requestAnimationFrame(() => {
        minimapSyncFrame = undefined
        syncMinimapNavigation()
      })
    }

    const scheduleTimelineAxisSync = () => {
      if (timelineSyncFrame !== undefined) return

      timelineSyncFrame = window.requestAnimationFrame(() => {
        timelineSyncFrame = undefined
        syncTimelineAxis()
      })
    }

    syncTimelineAxisRef.current = scheduleTimelineAxisSync
    syncMinimapNavigationRef.current = scheduleMinimapNavigationSync

    const destroyCaptionWaveSurfer = () => {
      captionSubscriptions.forEach((unsubscribe) => unsubscribe())
      captionSubscriptions = []
      regionsPluginRef.current = null
      captionWaveSurferRef.current?.destroy()
      captionWaveSurferRef.current = null
    }

    const syncScroll = (source: WaveSurfer, target: WaveSurfer, visibleStartTime?: number) => {
      if (isSyncingScrollRef.current) return

      isSyncingScrollRef.current = true
      setWaveSurferVisibleStartTime(
        target,
        visibleStartTime ?? getWaveSurferVisibleStartTime(source, zoomLevelRef.current),
      )
      if (source === mainWaveSurfer || target === mainWaveSurfer) {
        syncTimelineAxis()
      }
      scheduleMinimapNavigationSync()
      window.requestAnimationFrame(() => {
        isSyncingScrollRef.current = false
      })
    }

    const skipRegionsPlugin = RegionsPlugin.create()
    const draftRegionsPlugin = RegionsPlugin.create()
    const capCutRegionsPlugin = RegionsPlugin.create()
    skipRegionsPluginRef.current = skipRegionsPlugin
    draftRegionsPluginRef.current = draftRegionsPlugin
    capCutRegionsPluginRef.current = capCutRegionsPlugin

    const mainWaveSurfer = WaveSurfer.create({
      ...waveformLaneOptions,
      container: waveformContainer,
      url: audioUrl,
      autoCenter: true,
      autoScroll: true,
      dragToSeek: false,
      fillParent: true,
      hideScrollbar: true,
      interact: true,
      minPxPerSec: zoomLevelRef.current,
      audioRate: playbackRateRef.current,
      plugins: [
        TimelinePlugin.create({
          container: timelineContainer,
          height: 28,
          formatTimeCallback: formatTimelineLabel,
        }),
        createTimelineZoomPlugin(),
        skipRegionsPlugin,
        draftRegionsPlugin,
        capCutRegionsPlugin,
        MinimapPlugin.create({
          container: minimapContainer,
          height: 28,
          interact: false,
          waveColor: '#dbe9e5',
          progressColor: '#9ed1c7',
          cursorColor: '#173f39',
          cursorWidth: 1,
          overlayColor: 'transparent',
        }),
      ],
    })
    mainWaveSurferRef.current = mainWaveSurfer

    const installModifierZoomGuard = (wavesurfer: WaveSurfer) => {
      const scrollContainer = wavesurfer.getWrapper().parentElement
      if (!scrollContainer) return undefined

      const handleWheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
        event.stopImmediatePropagation()
      }

      scrollContainer.addEventListener('wheel', handleWheel, { capture: true })

      return () => scrollContainer.removeEventListener('wheel', handleWheel, { capture: true })
    }

    const installTimelineSurfaceScroll = () => {
      const timelineSurface = timelineSurfaceRef.current
      if (!timelineSurface) return undefined

      const handleWheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return

        const source = mainWaveSurferRef.current
        if (!source?.getDecodedData()) return

        const deltaPixels = getWheelDeltaPixels(event)
        if (Math.abs(deltaPixels) < 1) return

        event.preventDefault()
        event.stopPropagation()

        const zoom = zoomLevelRef.current
        const pixelsPerSecond = Math.max(getWaveSurferPixelsPerSecond(source, zoom), 1)
        const visibleDuration = getWaveSurferViewportDuration(source, zoom)
        const duration = source.getDuration()
        const maxStart = Math.max(0, duration - visibleDuration)
        const nextStart = clamp(
          getWaveSurferVisibleStartTime(source, zoom) + deltaPixels / pixelsPerSecond,
          0,
          maxStart,
        )

        setSynchronizedVisibleStart(nextStart, zoom)
      }

      timelineSurface.addEventListener('wheel', handleWheel, { capture: true, passive: false })

      return () => timelineSurface.removeEventListener('wheel', handleWheel, { capture: true })
    }

    const installTimelineHoverGuide = () => {
      const timelineSurface = timelineSurfaceRef.current
      const hoverGuide = timelineHoverGuideRef.current
      const hoverLabel = timelineHoverLabelRef.current
      if (!timelineSurface || !hoverGuide || !hoverLabel) return undefined

      const hideHoverGuide = () => {
        hoverGuide.style.opacity = '0'
      }

      const handlePointerMove = (event: PointerEvent) => {
        const source = mainWaveSurferRef.current
        if (!source?.getDecodedData()) {
          hideHoverGuide()
          return
        }

        const duration = source.getDuration()
        if (duration <= 0) {
          hideHoverGuide()
          return
        }

        const surfaceRect = timelineSurface.getBoundingClientRect()
        const wrapperRect = source.getWrapper().getBoundingClientRect()
        const zoom = zoomLevelRef.current
        const pixelsPerSecond = Math.max(getWaveSurferPixelsPerSecond(source, zoom), 1)
        const visibleStart = getWaveSurferVisibleStartTime(source, zoom)
        const pointerXInWrapper = clamp(event.clientX - wrapperRect.left, 0, wrapperRect.width)
        const time = clamp(visibleStart + pointerXInWrapper / pixelsPerSecond, 0, duration)
        const x = (time - visibleStart) * pixelsPerSecond + wrapperRect.left - surfaceRect.left

        hoverGuide.style.transform = `translateX(${Math.round(x)}px)`
        hoverGuide.style.opacity = '1'
        hoverLabel.textContent = formatTimelineLabel(time)
      }

      timelineSurface.addEventListener('pointermove', handlePointerMove)
      timelineSurface.addEventListener('pointerleave', hideHoverGuide)

      return () => {
        timelineSurface.removeEventListener('pointermove', handlePointerMove)
        timelineSurface.removeEventListener('pointerleave', hideHoverGuide)
      }
    }

    type MinimapPointerState =
      | { offsetTime: number; pointerId: number; type: 'pan' }
      | { currentX: number; pointerId: number; startX: number; type: 'select' }

    const installMinimapNavigation = () => {
      let pointerState: MinimapPointerState | undefined

      const getControlRect = () => minimapControl.getBoundingClientRect()
      const getPointerX = (event: PointerEvent) => {
        const rect = getControlRect()
        return clamp(event.clientX - rect.left, 0, Math.max(rect.width, 1))
      }
      const getTimeFromX = (x: number) => {
        const duration = mainWaveSurfer.getDuration()
        const rect = getControlRect()
        return duration * clamp(x / Math.max(rect.width, 1), 0, 1)
      }
      const setSelectionPreview = (startX: number, endX: number) => {
        const rect = getControlRect()
        const left = clamp(Math.min(startX, endX), 0, rect.width)
        const width = clamp(Math.abs(endX - startX), 0, rect.width - left)

        minimapSelection.style.display = width >= 1 ? 'block' : 'none'
        minimapSelection.style.left = `${left}px`
        minimapSelection.style.width = `${width}px`
      }
      const clearSelectionPreview = () => {
        minimapSelection.style.display = 'none'
        minimapSelection.style.width = '0px'
      }
      const clearPanState = () => {
        minimapControl.classList.remove('is-panning')
      }

      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0 || !mainWaveSurfer.getDecodedData()) return

        event.preventDefault()
        const x = getPointerX(event)
        const duration = mainWaveSurfer.getDuration()
        const zoom = zoomLevelRef.current
        const visibleStart = getWaveSurferVisibleStartTime(mainWaveSurfer, zoom)
        const visibleEnd = visibleStart + getWaveSurferViewportDuration(mainWaveSurfer, zoom)
        const pointerTime = getTimeFromX(x)
        const isInsideViewport = pointerTime >= visibleStart && pointerTime <= visibleEnd

        minimapControl.setPointerCapture(event.pointerId)
        if (isInsideViewport) {
          pointerState = {
            offsetTime: pointerTime - visibleStart,
            pointerId: event.pointerId,
            type: 'pan',
          }
          minimapControl.classList.add('is-panning')
          return
        }

        pointerState = {
          currentX: x,
          pointerId: event.pointerId,
          startX: x,
          type: 'select',
        }
        setSelectionPreview(x, x)
        if (duration <= 0) clearSelectionPreview()
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (!pointerState || pointerState.pointerId !== event.pointerId) return

        event.preventDefault()
        const x = getPointerX(event)
        if (pointerState.type === 'pan') {
          setSynchronizedVisibleStart(getTimeFromX(x) - pointerState.offsetTime, zoomLevelRef.current)
          return
        }

        pointerState.currentX = x
        setSelectionPreview(pointerState.startX, x)
      }

      const handlePointerUp = (event: PointerEvent) => {
        if (!pointerState || pointerState.pointerId !== event.pointerId) return

        event.preventDefault()
        const state = pointerState
        pointerState = undefined
        if (minimapControl.hasPointerCapture(event.pointerId)) {
          minimapControl.releasePointerCapture(event.pointerId)
        }
        clearPanState()

        if (state.type === 'pan') return

        clearSelectionPreview()
        const duration = mainWaveSurfer.getDuration()
        const rect = getControlRect()
        const startX = clamp(Math.min(state.startX, state.currentX), 0, rect.width)
        const endX = clamp(Math.max(state.startX, state.currentX), 0, rect.width)
        const selectedDuration = duration * ((endX - startX) / Math.max(rect.width, 1))
        const selectedStart = getTimeFromX(startX)

        if (endX - startX < 8 || selectedDuration < 0.1) {
          const visibleDuration = getWaveSurferViewportDuration(mainWaveSurfer, zoomLevelRef.current)
          setSynchronizedVisibleStart(getTimeFromX(state.currentX) - visibleDuration / 2)
          return
        }

        applySynchronizedZoom(mainWaveSurfer.getWidth() / selectedDuration, selectedStart)
      }

      const handlePointerCancel = (event: PointerEvent) => {
        if (!pointerState || pointerState.pointerId !== event.pointerId) return
        pointerState = undefined
        clearSelectionPreview()
        clearPanState()
      }

      minimapControl.addEventListener('pointerdown', handlePointerDown)
      minimapControl.addEventListener('pointermove', handlePointerMove)
      minimapControl.addEventListener('pointerup', handlePointerUp)
      minimapControl.addEventListener('pointercancel', handlePointerCancel)
      minimapControl.addEventListener('lostpointercapture', handlePointerCancel)

      return () => {
        minimapControl.removeEventListener('pointerdown', handlePointerDown)
        minimapControl.removeEventListener('pointermove', handlePointerMove)
        minimapControl.removeEventListener('pointerup', handlePointerUp)
        minimapControl.removeEventListener('pointercancel', handlePointerCancel)
        minimapControl.removeEventListener('lostpointercapture', handlePointerCancel)
      }
    }

    const syncZoom = (source: WaveSurfer, target: WaveSurfer | null, nextZoom: number) => {
      if (ignoredZoomEventSourcesRef.current.delete(source)) return

      const zoom = clampTimelineZoom(nextZoom, source)
      zoomLevelRef.current = zoom
      setZoomLevelState(zoom)
      if (Math.abs(nextZoom - zoom) > 0.001) {
        zoomWaveSurferWithoutFeedback(source, zoom)
      }
      if (target?.getDecodedData()) {
        zoomWaveSurferWithoutFeedback(target, zoom)
      }
      window.requestAnimationFrame(() => {
        const visibleStart = getWaveSurferVisibleStartTime(source, zoom)
        setSynchronizedVisibleStart(visibleStart, zoom)
      })
    }

    const createCaptionWaveSurfer = (duration: number, maxPeak: number) => {
      destroyCaptionWaveSurfer()

      const decodedData = mainWaveSurfer.getDecodedData()
      if (!decodedData || duration <= 0 || isDisposed) return

      const regionsPlugin = RegionsPlugin.create()
      const captionWaveSurfer = WaveSurfer.create({
        ...captionLaneOptions,
        container: captionContainer,
        peaks: getDecodedChannelData(decodedData),
        duration,
        autoCenter: false,
        autoScroll: false,
        dragToSeek: { debounceTime: 80 },
        fillParent: true,
        hideScrollbar: true,
        interact: true,
        maxPeak,
        minPxPerSec: zoomLevelRef.current,
        plugins: [
          createTimelineZoomPlugin(),
          regionsPlugin,
        ],
      })

      captionWaveSurferRef.current = captionWaveSurfer
      regionsPluginRef.current = regionsPlugin
      setWaveSurferVisibleStartTime(
        captionWaveSurfer,
        getWaveSurferVisibleStartTime(mainWaveSurfer, zoomLevelRef.current),
      )
      setRegionsReadyToken((current) => current + 1)
      captionSubscriptions = [
        regionsPlugin.on('region-clicked', (region, event) => {
          event.stopPropagation()
          const segment = captionRegionSegmentMapRef.current.get(region.id)
          if (segment) {
            onCapCutSourceCutSelectRef.current?.(undefined)
            handleTimelineGroupSelectRef.current(segment.group.id, {
              start: segment.start,
              end: segment.end,
            })
          }
        }),
        regionsPlugin.on('region-double-clicked', (region, event) => {
          event.stopPropagation()
          const segment = captionRegionSegmentMapRef.current.get(region.id)
          if (!segment) return

          setSelectedGroupId(segment.group.id)
          setSelectedSkipRegionId(undefined)
          void startSegmentPlaybackRef.current({
            groupId: segment.group.id,
            start: segment.start,
            end: segment.end,
            loop: false,
          })
        }),
        regionsPlugin.on('region-updated', (region) => {
          if (isReconcilingRegionsRef.current) return
          const editMode = isIndependentCaptionTimingEditRef.current ? 'independent' : 'linked'
          const segment = captionRegionSegmentMapRef.current.get(region.id)
          if (!segment?.canEditTiming) return

          onGroupTimingChangeRef.current(segment.group.id, region.start, region.end, editMode)
        }),
        captionWaveSurfer.on('interaction', (time) => {
          seekToRef.current(time)
          onCapCutSourceCutSelectRef.current?.(undefined)
          setStatusRef.current(`Playhead moved to ${formatSeconds(time)}. Space plays the full timeline from here.`)
        }),
        captionWaveSurfer.on('scroll', (visibleStartTime) =>
          syncScroll(captionWaveSurfer, mainWaveSurfer, visibleStartTime),
        ),
        captionWaveSurfer.on('zoom', (nextZoom) => syncZoom(captionWaveSurfer, mainWaveSurfer, nextZoom)),
        installModifierZoomGuard(captionWaveSurfer) ?? (() => undefined),
      ]
    }

    const replayLoopedSegment = () => {
      const activeSegment = activeSegmentRef.current
      if (!activeSegment?.loop) return

      const requestId = playbackRequestRef.current
      clearLoopRestartTimeout()
      loopRestartTimeoutRef.current = window.setTimeout(() => {
        loopRestartTimeoutRef.current = undefined
        const latestSegment = activeSegmentRef.current
        if (playbackRequestRef.current !== requestId || !latestSegment?.loop) return
        if (latestSegment.groupId !== activeSegment.groupId) return
        if (stopActiveSegmentIfInvalid()) return

        void startSegmentPlaybackRef.current(latestSegment)
      }, 0)
    }

    subscriptions.push(
      installModifierZoomGuard(mainWaveSurfer) ?? (() => undefined),
      installTimelineSurfaceScroll() ?? (() => undefined),
      installTimelineHoverGuide() ?? (() => undefined),
      installMinimapNavigation(),
      mainWaveSurfer.on('ready', (duration) => {
        const decodedData = mainWaveSurfer.getDecodedData()
        const maxPeak = decodedData ? getDecodedMaxPeak(decodedData) : 1

        mainWaveSurfer.setOptions({ maxPeak })
        setAudioDuration(duration)
        setPlayheadTime(mainWaveSurfer.getCurrentTime())
        mainWaveSurfer.setPlaybackRate(playbackRateRef.current, true)
        setIsReady(true)
        syncTimelineAxis()
        syncMinimapNavigation()
        setSkipRegionsReadyToken((current) => current + 1)
        setDraftRegionsReadyToken((current) => current + 1)
        subscriptions.push(
          draftRegionsPlugin.enableDragSelection({
            id: draftSelectionRegionId,
            color: 'rgba(20, 146, 127, 0.18)',
            drag: true,
            resize: true,
            minLength: minDraftSelectionDuration,
          }),
        )
        createCaptionWaveSurfer(duration, maxPeak)
      }),
      skipRegionsPlugin.on('region-clicked', (region, event) => {
        event.stopPropagation()
        setSelectedGroupId(undefined)
        setSelectedSkipRegionId(region.id)
        setStatusRef.current('Skip zone selected. Resize or delete it.')
      }),
      capCutRegionsPlugin.on('region-clicked', (region, event) => {
        event.stopPropagation()
        const sourceCutId = region.id.startsWith(capCutSourceCutPrefix)
          ? region.id.slice(capCutSourceCutPrefix.length)
          : undefined
        if (!sourceCutId) return

        setSelectedGroupId(undefined)
        setSelectedSkipRegionId(undefined)
        onCapCutSourceCutSelectRef.current?.(sourceCutId)
        setStatusRef.current('CapCut source cut selected.')
      }),
      skipRegionsPlugin.on('region-updated', (region) => {
        if (isReconcilingSkipRegionsRef.current) return
        normalizeSkipRegionLayout(region)
        window.setTimeout(() => normalizeSkipRegionLayout(region), 24)

        const nextBounds = {
          start: roundCaptionTime(region.start),
          end: roundCaptionTime(region.end),
        }
        const normalized = normalizeTimeRange(nextBounds.start, nextBounds.end, mainWaveSurfer.getDuration())
        stopActiveSegmentOnMaskOverlap(normalized)
        setSelectedGroupId(undefined)
        setSelectedSkipRegionId(region.id)
        setSilenceDetectionDraft(undefined)
        onHistoryCommitRef.current('edit skip zone')
        setSkipState((current) => {
          const baseState = current.sourceUrl === audioUrl ? current : createTimelineSkipState(audioUrl)
          const signature = emptyZoneSignatureRef.current
          const existingEdits =
            baseState.signature === signature ? new Map(baseState.edits) : new Map<string, { start: number; end: number }>()
          const existingDeletedAutoIds =
            baseState.signature === signature ? new Set(baseState.deletedAutoIds) : new Set<string>()
          const updatedCuts = editableEmptyZoneCutsRef.current.map((cut) =>
            cut.id === region.id
              ? { ...cut, ...normalized }
              : cut,
          )
          const reconciledCuts = reconcileOverlappingSkipCuts(updatedCuts, region.id)

          return {
            ...baseState,
            deletedAutoIds: new Set([...existingDeletedAutoIds, ...reconciledCuts.deletedAutoIds]),
            edits: new Map([...existingEdits, ...reconciledCuts.edits]),
            manualCuts: reconciledCuts.manualCuts,
            signature,
            sourceUrl: audioUrl,
          }
        })
      }),
      draftRegionsPlugin.on('region-created', (region) => {
        draftRegionsPlugin.getRegions().forEach((item) => {
          if (item !== region) item.remove()
        })
        region.setOptions({ id: draftSelectionRegionId })
        setSelectedGroupId(undefined)
        setSelectedSkipRegionId(undefined)
        setDraftSelection({
          id: region.id,
          start: roundCaptionTime(region.start),
          end: roundCaptionTime(region.end),
          status: 'idle',
        })
        setStatusRef.current('Range selected. Choose Skip or Transcribe.')
      }),
      draftRegionsPlugin.on('region-clicked', (_region, event) => {
        event.stopPropagation()
      }),
      draftRegionsPlugin.on('region-updated', (region) => {
        setDraftSelection((current) => {
          if (!current || current.status === 'transcribing') return current

          return {
            ...current,
            start: roundCaptionTime(region.start),
            end: roundCaptionTime(region.end),
          }
        })
      }),
      mainWaveSurfer.on('decode', (duration) => {
        setAudioDuration(duration)
      }),
      mainWaveSurfer.on('play', () => {
        setIsPlaying(true)
      }),
      mainWaveSurfer.on('pause', () => {
        const activeSegment = activeSegmentRef.current
        if (!activeSegment) {
          setIsPlaying(false)
          return
        }

        if (activeSegment.loop) {
          const isAtSegmentEnd = mainWaveSurfer.getCurrentTime() >= activeSegment.end - segmentBoundaryTolerance
          if (isAtSegmentEnd) {
            replayLoopedSegment()
            return
          }
        }

        setIsPlaying(false)
        if (mainWaveSurfer.getCurrentTime() >= activeSegment.end - segmentBoundaryTolerance) {
          activeSegmentRef.current = null
        }
      }),
      mainWaveSurfer.on('finish', () => {
        clearSegmentPlayback()
        setIsPlaying(false)
        setPlayheadTime(mainWaveSurfer.getDuration())
      }),
      mainWaveSurfer.on('timeupdate', (time) => {
        setPlayheadTime(time)
        captionWaveSurferRef.current?.setTime(time)

        const activeSegment = activeSegmentRef.current
        if (activeSegment?.loop) {
          lastSkippedCutEndRef.current = undefined
          return
        }

        const cut = maskedEmptyZoneCutsRef.current.find((item) => {
          if (time < item.start || time >= item.end) return false
          if (!activeSegment) return true

          return item.end > activeSegment.start && item.start < activeSegment.end
        })
        if (!cut) {
          lastSkippedCutEndRef.current = undefined
          return
        }

        const nextTime = activeSegment ? Math.min(cut.end, activeSegment.end) : cut.end
        if (lastSkippedCutEndRef.current === nextTime) return

        lastSkippedCutEndRef.current = nextTime
        mainWaveSurfer.setTime(nextTime)
        captionWaveSurferRef.current?.setTime(nextTime)
      }),
      mainWaveSurfer.on('seeking', (time) => {
        setPlayheadTime(time)
        captionWaveSurferRef.current?.setTime(time)
      }),
      mainWaveSurfer.on('interaction', (time) => {
        clearSegmentPlayback()
        setPlayheadTime(time)
        captionWaveSurferRef.current?.setTime(time)
        setSelectedGroupId(undefined)
        setSelectedSkipRegionId(undefined)
        onCapCutSourceCutSelectRef.current?.(undefined)
        setStatusRef.current(`Playhead moved to ${formatSeconds(time)}. Space plays the full timeline from here.`)
      }),
      mainWaveSurfer.on('scroll', (visibleStartTime) => {
        syncTimelineAxis()
        scheduleMinimapNavigationSync()
        const captionWaveSurfer = captionWaveSurferRef.current
        if (captionWaveSurfer) syncScroll(mainWaveSurfer, captionWaveSurfer, visibleStartTime)
      }),
      mainWaveSurfer.on('zoom', (nextZoom) => {
        syncZoom(mainWaveSurfer, captionWaveSurferRef.current, nextZoom)
      }),
      mainWaveSurfer.on('redraw', () => {
        scheduleTimelineAxisSync()
        scheduleMinimapNavigationSync()
      }),
      mainWaveSurfer.on('error', (error) => {
        setStatusRef.current(error.message)
      }),
    )

    return () => {
      isDisposed = true
      syncTimelineAxisRef.current = () => undefined
      syncMinimapNavigationRef.current = () => undefined
      if (minimapSyncFrame !== undefined) {
        window.cancelAnimationFrame(minimapSyncFrame)
      }
      if (timelineSyncFrame !== undefined) {
        window.cancelAnimationFrame(timelineSyncFrame)
      }
      clearLoopRestartTimeout()
      subscriptions.forEach((unsubscribe) => unsubscribe())
      destroyCaptionWaveSurfer()
      mainWaveSurferRef.current = null
      skipRegionsPluginRef.current = null
      draftRegionsPluginRef.current = null
      capCutRegionsPluginRef.current = null
      mainWaveSurfer.destroy()
      setIsReady(false)
      setIsPlaying(false)
    }
  }, [
    applySynchronizedZoom,
    audioUrl,
    clearLoopRestartTimeout,
    clearSegmentPlayback,
    captionRegionSegmentMapRef,
    editableEmptyZoneCutsRef,
    emptyZoneSignatureRef,
    handleTimelineGroupSelectRef,
    maskedEmptyZoneCutsRef,
    onCapCutSourceCutSelectRef,
    onGroupTimingChangeRef,
    onHistoryCommitRef,
    reconcileOverlappingSkipCuts,
    seekToRef,
    setSelectedGroupId,
    setSynchronizedVisibleStart,
    setStatusRef,
    setSkipState,
    stopActiveSegmentIfInvalid,
    stopActiveSegmentOnMaskOverlap,
    startSegmentPlaybackRef,
    zoomWaveSurferWithoutFeedback,
  ])

  useEffect(() => {
    const regionsPlugin = regionsPluginRef.current
    if (!regionsPlugin) return

    const existingRegions = new Map(regionsPlugin.getRegions().map((region) => [region.id, region]))
    const nextRegionIds = new Set(captionRegionSegments.map((segment) => segment.id))

    isReconcilingRegionsRef.current = true

    existingRegions.forEach((region, regionId) => {
      if (!nextRegionIds.has(regionId)) {
        region.remove()
      }
    })

    captionRegionSegments.forEach((segment) => {
      const region = existingRegions.get(segment.id)
      const isSelected = segment.group.id === selectedGroupId
      const content = getRegionContent(segment.label, segment.group, segment.start, segment.end)
      const color = getRegionColor(isSelected)

      if (!region) {
        regionsPlugin.addRegion({
          id: segment.id,
          start: segment.start,
          end: segment.end,
          content,
          color,
          drag: segment.canEditTiming,
          resize: segment.canEditTiming,
          minLength: timingNudgeStep,
        })
        return
      }

      region.setOptions({
        start: segment.start,
        end: segment.end,
        content,
        color,
        drag: segment.canEditTiming,
        resize: segment.canEditTiming,
      })
    })

    window.requestAnimationFrame(() => {
      isReconcilingRegionsRef.current = false
    })
  }, [captionRegionSegments, regionsReadyToken, selectedGroupId])

  useEffect(() => {
    const skipRegionsPlugin = skipRegionsPluginRef.current
    if (!skipRegionsPlugin) return

    const existingRegionsById = groupPluginRegionsById(skipRegionsPlugin.getRegions())
    const nextRegionIds = new Set(editableEmptyZoneCuts.map((cut) => cut.id))

    isReconcilingSkipRegionsRef.current = true

    existingRegionsById.forEach((regions, regionId) => {
      if (!nextRegionIds.has(regionId)) {
        removePluginRegions(regions)
      }
    })

    editableEmptyZoneCuts.forEach((cut) => {
      const regions = existingRegionsById.get(cut.id)
      const [region, ...duplicateRegions] = regions ?? []
      const isSelected = cut.id === selectedSkipRegionId
      const content = getSkipRegionContent(cut.start, cut.end, isSelected)
      const color = getSkipRegionColor()

      removePluginRegions(duplicateRegions)

      if (!region || !region.element || !hasSkipRegionResizeHandles(region)) {
        region?.remove()
        const nextRegion = skipRegionsPlugin.addRegion({
          id: cut.id,
          start: cut.start,
          end: cut.end,
          content,
          color,
          drag: false,
          resize: true,
          resizeStart: true,
          resizeEnd: true,
          minLength: skipRegionMinDuration,
        })
        normalizeSkipRegionLayout(nextRegion)
        return
      }

      region.setOptions({
        start: cut.start,
        end: cut.end,
        content,
        color,
        drag: false,
        resize: true,
        resizeStart: true,
        resizeEnd: true,
      })
      normalizeSkipRegionLayout(region)
    })

    window.requestAnimationFrame(() => {
      scheduleSkipRegionLayoutNormalization(skipRegionsPlugin)
      isReconcilingSkipRegionsRef.current = false
    })
  }, [editableEmptyZoneCuts, selectedSkipRegionId, skipRegionsReadyToken])

  useEffect(() => {
    const capCutRegionsPlugin = capCutRegionsPluginRef.current
    const duration = mainWaveSurferRef.current?.getDuration() ?? timelineDuration
    if (!capCutRegionsPlugin) return

    capCutRegionsPlugin.getRegions().forEach((region) => region.remove())
    if (!capCutTimelineMap) return
    const pointHitTargetDuration = Math.max(0.001, capCutBoundaryHitTargetWidth / Math.max(zoomLevel, 1))

    capCutTimelineMap.projectGaps.forEach((gap) => {
      capCutRegionsPlugin.addRegion({
        id: `${capCutProjectGapPrefix}${gap.id}`,
        start: gap.start,
        end: gap.end,
        color: 'rgba(72, 116, 170, 0.14)',
        content: getCapCutRegionContent(
          'Gap',
          `CapCut project gap ${formatSeconds(gap.start)} - ${formatSeconds(gap.end)}`,
          '#315a73',
          'rgba(72, 116, 170, 0.18)',
        ),
        drag: false,
        resize: false,
      })
    })

    capCutTimelineMap.sourceCutBoundaries.forEach((boundary) => {
      const start = clamp(boundary.projectPosition - pointHitTargetDuration / 2, 0, duration)
      const end = clamp(boundary.projectPosition + pointHitTargetDuration / 2, start + 0.001, duration)
      const isSelected = boundary.id === selectedCapCutSourceCutBoundaryId
      capCutRegionsPlugin.addRegion({
        id: `${capCutSourceCutPrefix}${boundary.id}`,
        start,
        end,
        color: 'rgba(111, 75, 190, 0)',
        content: getCapCutPointRegionContent(
          `CapCut source cut: hidden ${formatSeconds(boundary.hiddenSourceStart)} - ${formatSeconds(boundary.hiddenSourceEnd)}`,
          isSelected ? '#372468' : '#6f4bbe',
          isSelected ? 3 : 2,
        ),
        drag: false,
        resize: false,
      })
    })

    capCutTimelineMap.markers.forEach((marker) => {
      const markerTime = marker.projectTime ?? marker.time
      if (markerTime === undefined || markerTime < 0 || markerTime > duration) return

      const start = clamp(markerTime - pointHitTargetDuration / 2, 0, duration)
      const end = clamp(markerTime + pointHitTargetDuration / 2, start + 0.001, duration)
      capCutRegionsPlugin.addRegion({
        id: `${capCutMarkerPrefix}${marker.id}`,
        start,
        end,
        color: 'rgba(0, 193, 205, 0)',
        content: getCapCutPointRegionContent(
          marker.title || `CapCut marker at ${formatSeconds(markerTime)}`,
          '#007983',
          2,
        ),
        drag: false,
        resize: false,
      })
    })
  }, [capCutTimelineMap, selectedCapCutSourceCutBoundaryId, skipRegionsReadyToken, timelineDuration, zoomLevel])

  useEffect(() => {
    const draftRegionsPlugin = draftRegionsPluginRef.current
    if (!draftRegionsPlugin) return

    const regions = draftRegionsPlugin.getRegions()
    regions.forEach((region) => {
      if (!draftSelection || region.id !== draftSelection.id) {
        region.remove()
        return
      }

      region.setOptions({
        start: draftSelection.start,
        end: draftSelection.end,
        color: draftSelection.status === 'transcribing'
          ? 'rgba(20, 146, 127, 0.26)'
          : 'rgba(20, 146, 127, 0.18)',
        content: getDraftSelectionContent(
          draftSelection,
          convertDraftSelectionToSkip,
          () => {
            void transcribeDraftSelection()
          },
          clearDraftSelection,
        ),
        drag: draftSelection.status !== 'transcribing',
        resize: draftSelection.status !== 'transcribing',
      })
    })
  }, [
    clearDraftSelection,
    convertDraftSelectionToSkip,
    draftRegionsReadyToken,
    draftSelection,
    transcribeDraftSelection,
  ])

  useEffect(() => {
    if (!selectedGroupId) return

    const group = groups.find((item) => item.id === selectedGroupId)
    const mainWaveSurfer = mainWaveSurferRef.current
    if (!group || !mainWaveSurfer?.getDecodedData()) return
    const visibleSegment = captionRegionSegments.find((segment) => segment.group.id === selectedGroupId)
    const selectedStart = visibleSegment?.start ?? group.start
    const selectedEnd = visibleSegment?.end ?? group.end

    const duration = mainWaveSurfer.getDuration()
    const visibleDuration = getWaveSurferViewportDuration(mainWaveSurfer, zoomLevelRef.current)
    const visibleStart = getWaveSurferVisibleStartTime(mainWaveSurfer, zoomLevelRef.current)
    const visibleEnd = visibleStart + visibleDuration
    const padding = Math.min(1, visibleDuration * 0.16)
    const isVisible = selectedStart >= visibleStart + padding && selectedEnd <= visibleEnd - padding
    if (isVisible) return

    const groupCenter = (selectedStart + selectedEnd) / 2
    const targetStart = clamp(groupCenter - visibleDuration / 2, 0, Math.max(0, duration - visibleDuration))
    setSynchronizedVisibleStart(targetStart, zoomLevelRef.current)
  }, [captionRegionSegments, groups, selectedGroupId, setSynchronizedVisibleStart])

  useEffect(() => {
    if (!activeSegmentRef.current) return undefined

    const timeout = window.setTimeout(() => {
      stopActiveSegmentIfInvalid()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [captionRegionSegments, groups, maskedEmptyZoneCuts, stopActiveSegmentIfInvalid])

  useEffect(() => {
    if (!loopedGroupId) return
    if (suppressedLoopRestartGroupIdRef.current === loopedGroupId) return

    const group = groups.find((item) => item.id === loopedGroupId)
    if (!group) {
      const timeout = window.setTimeout(() => {
        stopSegmentPlaybackWithStatus(
          'Loop stopped because the selected group no longer exists.',
          { clearSelectedGroup: true, suppressLoopRestart: true },
        )
      }, 0)
      return () => window.clearTimeout(timeout)
    }

    const activeSegment = activeSegmentRef.current
    const invalidStatus = activeSegment?.groupId === group.id
      ? getActiveSegmentInvalidStatus(activeSegment)
      : undefined
    if (invalidStatus) {
      const timeout = window.setTimeout(() => {
        stopActiveSegmentIfInvalid(invalidStatus)
      }, 0)
      return () => window.clearTimeout(timeout)
    }

    const range = getGroupPlaybackRange(group)
    if (!range) {
      const timeout = window.setTimeout(() => {
        stopSegmentPlaybackWithStatus(
          'Loop stopped because the selected group is covered by a skip zone.',
          { clearSelectedGroup: true, suppressLoopRestart: true },
        )
      }, 0)
      return () => window.clearTimeout(timeout)
    }

    if (
      activeSegment?.groupId === group.id &&
      arePlaybackRangesEqual(activeSegment, range) &&
      activeSegment.loop
    ) {
      return
    }

    void startSegmentPlayback({ groupId: group.id, start: range.start, end: range.end, loop: true })
  }, [
    getActiveSegmentInvalidStatus,
    getGroupPlaybackRange,
    groups,
    loopedGroupId,
    startSegmentPlayback,
    stopActiveSegmentIfInvalid,
    stopSegmentPlaybackWithStatus,
  ])

  return {
    addSkipRegion,
    captionContainerRef,
    confirmDetectedSilentSkipRegions,
    currentTime: playheadTime,
    deleteSelectedSkipRegion,
    detectSilentSkipRegions,
    detectedSilenceAdjustment: silenceDetectionDraft?.adjustment ?? 0,
    hasDetectedSilenceDraft: Boolean(silenceDetectionDraft),
    isPlaying,
    isReady,
    keptTimelineRanges,
    loopedGroupId,
    minimapControlRef,
    minimapContainerRef,
    minimapSelectionRef,
    minimapViewportRef,
    playGroup,
    playbackRate,
    playbackSpeedConfig,
    resetPlaybackPosition,
    seekTo,
    selectedSkipRegionId,
    setDetectedSilenceAdjustment,
    setPlaybackRate,
    setSilenceDetectionSettings,
    setZoomLevel,
    silenceAdjustmentConfig: {
      max: silenceAdjustmentMax,
      min: silenceAdjustmentMin,
      step: silenceAdjustmentStep,
    },
    silenceDetectionSettingConfig,
    silenceDetectionSettings,
    startLoopGroup,
    stopPlayback,
    timelineSurfaceRef,
    timelineContainerRef,
    timelineHoverGuideRef,
    timelineHoverLabelRef,
    timelineDuration,
    togglePlayback,
    waveformContainerRef,
    zoomLevel,
  }
}

export type WaveSurferTimelineRefs = {
  captionContainerRef: RefObject<HTMLDivElement | null>
  minimapControlRef: RefObject<HTMLDivElement | null>
  minimapContainerRef: RefObject<HTMLDivElement | null>
  minimapSelectionRef: RefObject<HTMLDivElement | null>
  minimapViewportRef: RefObject<HTMLDivElement | null>
  timelineSurfaceRef: RefObject<HTMLElement | null>
  timelineContainerRef: RefObject<HTMLDivElement | null>
  timelineHoverGuideRef: RefObject<HTMLDivElement | null>
  timelineHoverLabelRef: RefObject<HTMLSpanElement | null>
  waveformContainerRef: RefObject<HTMLDivElement | null>
}
