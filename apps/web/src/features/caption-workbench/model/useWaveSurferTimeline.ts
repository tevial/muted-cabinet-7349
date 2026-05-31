import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import WaveSurfer from 'wavesurfer.js'
import HoverPlugin from 'wavesurfer.js/plugins/hover'
import MinimapPlugin from 'wavesurfer.js/plugins/minimap'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import TimelinePlugin from 'wavesurfer.js/plugins/timeline'
import ZoomPlugin from 'wavesurfer.js/plugins/zoom'

import type { CaptionGroup, CaptionWord, GroupingSettings } from '../../../contracts/captions'
import type { CapCutTimelineMap } from '../../../contracts/capcut'
import type { EmptyZoneCut } from '../../../domain/captions'
import { formatSeconds, getEmptyZoneCuts, roundCaptionTime, timingNudgeStep } from '../../../domain/captions'
import {
  captionLaneOptions,
  captionRegionColors,
  formatTimelineLabel,
  timelineZoomConfig,
  waveformLaneOptions,
} from './waveSurferTimelineConfig'
import { detectSilenceCuts } from './silenceDetection'
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
  onCapCutSourceCutSelect?: (boundaryId: string) => void
  onHistoryCommit: (source: string) => void
  onGroupTimingChange: (groupId: string, start: number, end: number) => void
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

const getCaptionRegionId = (groupId: string, index: number, canEditTiming: boolean) =>
  canEditTiming ? groupId : `${groupId}${captionRegionSliceSeparator}${index}`

const getManualEmptyZoneId = (sequence: number) =>
  `${manualEmptyZonePrefix}${Date.now().toString(36)}_${sequence}`

const getRegionContent = (
  label: string,
  group: CaptionGroup,
  isSelected: boolean,
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
    height: '100%',
    minHeight: '28px',
    overflow: 'hidden',
    padding: '0 12px',
    color: isSelected ? '#ffffff' : '#103b35',
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

const isAudioSilenceCut = (cut: EmptyZoneCut) => cut.id.startsWith(audioSilenceEmptyZonePrefix)
const isUserManagedCut = (cut: EmptyZoneCut) =>
  cut.id.startsWith(manualEmptyZonePrefix) || isAudioSilenceCut(cut)

const getSkipRegionContent = (start: number, end: number, isSelected: boolean) => {
  const content = document.createElement('span')
  content.textContent = `${formatSeconds(start)} - ${formatSeconds(end)}`
  content.title = 'Skipped empty zone. Drag handles adjust it; select and delete to remove.'
  Object.assign(content.style, {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    padding: '0 8px',
    background: isSelected
      ? 'repeating-linear-gradient(135deg, rgba(226, 119, 75, 0.32) 0 6px, rgba(226, 119, 75, 0.14) 6px 12px)'
      : 'repeating-linear-gradient(135deg, rgba(226, 119, 75, 0.18) 0 6px, rgba(226, 119, 75, 0.08) 6px 12px)',
    color: '#7a341d',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: '11px',
    fontWeight: '800',
    lineHeight: '1',
    boxShadow: isSelected ? 'inset 0 0 0 2px rgba(177, 73, 48, 0.88)' : 'none',
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

const getSkipRegionColor = (isSelected: boolean) =>
  isSelected ? 'rgba(226, 119, 75, 0.32)' : 'rgba(226, 119, 75, 0.2)'

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
  if (group.textOverride) return group.textOverride

  const segmentWords = group.wordIds
    .map((wordId) => wordMap.get(wordId))
    .filter((word): word is CaptionWord => word !== undefined && word.end > start && word.start < end)

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

const removeOverlappingSilenceCuts = (silenceCuts: EmptyZoneCut[], protectedCuts: EmptyZoneCut[]) => {
  let sequence = 0

  return silenceCuts.flatMap((cut) =>
    subtractEmptyZoneCuts(cut.start, cut.end, protectedCuts).map((segment) => {
      sequence += 1
      const start = roundCaptionTime(segment.start)
      const end = roundCaptionTime(segment.end)

      return {
        id: `${audioSilenceEmptyZonePrefix}${String(sequence).padStart(4, '0')}`,
        start,
        end,
        duration: roundCaptionTime(end - start),
      }
    }),
  )
}

const resizeSilenceCuts = (cuts: EmptyZoneCut[], adjustment: number, timelineDuration: number) =>
  cuts.flatMap((cut) => {
    const normalized = normalizeTimeRange(cut.start - adjustment, cut.end + adjustment, timelineDuration)
    if (normalized.duration < skipRegionMinDuration) return []

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

const getDecodedChannelData = (audioData: AudioBuffer) =>
  Array.from({ length: Math.min(audioData.numberOfChannels, maxRenderedChannels) }, (_, index) =>
    audioData.getChannelData(index),
  )

const createTimelineHoverPlugin = (lineColor: string) =>
  HoverPlugin.create({
    lineColor,
    lineWidth: 1,
    labelBackground: '#173f39',
    labelColor: '#ffffff',
    labelSize: 11,
    labelPreferLeft: true,
    formatTimeCallback: formatTimelineLabel,
  })

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
  const captionContainerRef = useRef<HTMLDivElement | null>(null)
  const mainWaveSurferRef = useRef<WaveSurfer | null>(null)
  const captionWaveSurferRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<RegionsPlugin | null>(null)
  const skipRegionsPluginRef = useRef<RegionsPlugin | null>(null)
  const draftRegionsPluginRef = useRef<RegionsPlugin | null>(null)
  const capCutRegionsPluginRef = useRef<RegionsPlugin | null>(null)
  const activeSegmentRef = useRef<ActiveSegment | null>(null)
  const playbackRequestRef = useRef(0)
  const loopRestartTimeoutRef = useRef<number | undefined>(undefined)
  const isReconcilingRegionsRef = useRef(false)
  const isReconcilingSkipRegionsRef = useRef(false)
  const isSyncingScrollRef = useRef(false)
  const isSyncingZoomRef = useRef(false)
  const lastSkippedCutEndRef = useRef<number | undefined>(undefined)
  const manualEmptyZoneSequenceRef = useRef(0)
  const zoomLevelRef = useRef(timelineZoomConfig.defaultPixelsPerSecond)
  const groupsRef = useLatestRef(groups)
  const selectedGroupIdRef = useLatestRef(selectedGroupId)
  const onGroupTimingChangeRef = useLatestRef(onGroupTimingChange)
  const onHistoryCommitRef = useLatestRef(onHistoryCommit)
  const onTranscribeRangeRef = useLatestRef(onTranscribeRange)
  const onCapCutSourceCutSelectRef = useLatestRef(onCapCutSourceCutSelect)
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
  const [zoomLevel, setZoomLevelState] = useState(timelineZoomConfig.defaultPixelsPerSecond)
  const timelineDuration = Math.max(contentDuration, audioDuration, playheadTime, audioUrl ? 1 : 0)
  const wordMap = useMemo(() => new Map(words.map((word) => [word.id, word])), [words])
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

        return segments.flatMap((segment, index) => {
          const canEditTiming =
            segments.length === 1 &&
            Math.abs(segment.start - group.start) < segmentBoundaryTolerance &&
            Math.abs(segment.end - group.end) < segmentBoundaryTolerance
          const label = getCaptionSegmentLabel(group, wordMap, segment.start, segment.end)

          if (!label) return []

          return [{
            canEditTiming,
            end: segment.end,
            group,
            id: getCaptionRegionId(group.id, index, canEditTiming),
            label,
            start: segment.start,
          }]
        })
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

  const setZoomLevel = useCallback((nextZoom: number) => {
    const zoom = clamp(
      nextZoom,
      timelineZoomConfig.minPixelsPerSecond,
      timelineZoomConfig.maxPixelsPerSecond,
    )
    zoomLevelRef.current = zoom
    setZoomLevelState(zoom)

    isSyncingZoomRef.current = true
    ;[mainWaveSurferRef.current, captionWaveSurferRef.current].forEach((wavesurfer) => {
      if (!wavesurfer?.getDecodedData()) return
      wavesurfer.zoom(zoom)
    })
    window.requestAnimationFrame(() => {
      isSyncingZoomRef.current = false
    })
  }, [])

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

  const applySilenceDetectionDraft = useCallback((draft: SilenceDetectionDraft) => {
    const duration = mainWaveSurferRef.current?.getDuration() ?? timelineDuration
    const detectedCuts = removeOverlappingSilenceCuts(
      resizeSilenceCuts(draft.baseCuts, draft.adjustment, duration),
      editableEmptyZoneCutsRef.current.filter((cut) => !isAudioSilenceCut(cut)),
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
  }, [audioUrl, editableEmptyZoneCutsRef, setSelectedGroupId, setSkipState, timelineDuration])

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
    setStatusRef.current('Silent zones fixed. You can still drag, resize, or delete them.')
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
    setStatusRef.current('Skip zone added. Drag or resize it on the waveform.')
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

    const protectedCuts = editableEmptyZoneCuts.filter((cut) => !isAudioSilenceCut(cut))
    const baseCuts = detectSilenceCuts(decodedData, {
      idPrefix: audioSilenceEmptyZonePrefix,
      minDuration: settings.emptyZoneThreshold,
    })
    const hadDetectedCuts = skipState.sourceUrl === audioUrl && skipState.manualCuts.some(isAudioSilenceCut)

    if (!baseCuts.length && !hadDetectedCuts) {
      setStatusRef.current(`No silent zones longer than ${settings.emptyZoneThreshold.toFixed(2)}s were detected.`)
      return
    }

    onHistoryCommitRef.current('detect silent skip zones')
    const draft = {
      adjustment: 0,
      baseCuts: removeOverlappingSilenceCuts(baseCuts, protectedCuts),
    }
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
    editableEmptyZoneCuts,
    onHistoryCommitRef,
    setStatusRef,
    settings.emptyZoneThreshold,
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

  const stopPlayback = useCallback(() => {
    clearSegmentPlayback()
    mainWaveSurferRef.current?.pause()
    setIsPlaying(false)
  }, [clearSegmentPlayback])

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

  const getGroupPlaybackRange = useCallback((group: CaptionGroup, preferredRange?: PlaybackRange): PlaybackRange => {
    if (preferredRange && preferredRange.end - preferredRange.start >= segmentBoundaryTolerance) {
      return preferredRange
    }

    const visibleSegments = captionRegionSegmentsRef.current.filter((segment) => segment.group.id === group.id)
    if (!visibleSegments.length) {
      return { start: group.start, end: group.end }
    }

    const activeSegment = activeSegmentRef.current
    const activeVisibleSegment = activeSegment?.groupId === group.id
      ? visibleSegments.find((segment) =>
          activeSegment.start >= segment.start - segmentBoundaryTolerance &&
          activeSegment.end <= segment.end + segmentBoundaryTolerance,
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

  const startSegmentPlayback = useCallback(async (segment: ActiveSegment) => {
    const wavesurfer = mainWaveSurferRef.current
    if (!audioUrl || !wavesurfer || wavesurfer.getDuration() <= 0) {
      setStatusRef.current('Upload audio or video to audition timing.')
      return false
    }

    const playbackStart = getPlayableStart(segment.start, segment.end, maskedEmptyZoneCutsRef.current)
    if (playbackStart >= segment.end - segmentBoundaryTolerance) {
      clearSegmentPlayback()
      wavesurfer.pause()
      setIsPlaying(false)
      setStatusRef.current('Selected group is fully covered by a skip zone.')
      return false
    }

    clearLoopRestartTimeout()
    const requestId = playbackRequestRef.current + 1
    playbackRequestRef.current = requestId
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
      clearSegmentPlayback()
      setIsPlaying(false)
      setStatusRef.current(error instanceof Error ? error.message : 'Playback failed.')
      return false
    }
  }, [audioUrl, clearLoopRestartTimeout, clearSegmentPlayback, maskedEmptyZoneCutsRef, setStatusRef])

  const startLoopGroup = useCallback(async (groupId: string, preferredRange?: PlaybackRange) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!audioUrl || !group) {
      setStatusRef.current('Upload audio or video to loop the selected group.')
      return
    }

    const range = getGroupPlaybackRange(group, preferredRange)
    setSelectedGroupId(group.id)
    setSelectedSkipRegionId(undefined)
    const didStart = await startSegmentPlayback({ groupId: group.id, start: range.start, end: range.end, loop: true })
    if (didStart) {
      setStatusRef.current('Looping selected group. Space stops playback.')
    }
  }, [audioUrl, getGroupPlaybackRange, groupsRef, setSelectedGroupId, setStatusRef, startSegmentPlayback])

  const playGroup = useCallback((groupId: string) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!group) return

    const range = getGroupPlaybackRange(group)
    setSelectedGroupId(group.id)
    setSelectedSkipRegionId(undefined)
    void startSegmentPlayback({ groupId: group.id, start: range.start, end: range.end, loop: false })
  }, [getGroupPlaybackRange, groupsRef, setSelectedGroupId, startSegmentPlayback])

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
    if (!waveformContainer || !timelineContainer || !captionContainer) return undefined

    const subscriptions: Array<() => void> = []
    let captionSubscriptions: Array<() => void> = []
    let isDisposed = false

    const destroyCaptionWaveSurfer = () => {
      captionSubscriptions.forEach((unsubscribe) => unsubscribe())
      captionSubscriptions = []
      regionsPluginRef.current = null
      captionWaveSurferRef.current?.destroy()
      captionWaveSurferRef.current = null
    }

    const syncScroll = (source: WaveSurfer, target: WaveSurfer) => {
      if (isSyncingScrollRef.current) return

      isSyncingScrollRef.current = true
      target.setScroll(source.getScroll())
      if (source === mainWaveSurfer || target === mainWaveSurfer) {
        syncTimelineAxis()
      }
      window.requestAnimationFrame(() => {
        isSyncingScrollRef.current = false
      })
    }

    const syncTimelineAxis = () => {
      const timelineWrapper = timelineContainer.querySelector<HTMLElement>('[part="timeline-wrapper"]')
      if (!timelineWrapper) return

      timelineWrapper.style.width = `${mainWaveSurfer.getWrapper().scrollWidth}px`
      timelineWrapper.style.transform = `translateX(${-mainWaveSurfer.getScroll()}px)`
      timelineWrapper.style.willChange = 'transform'
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
      hideScrollbar: false,
      interact: true,
      minPxPerSec: zoomLevelRef.current,
      plugins: [
        TimelinePlugin.create({
          container: timelineContainer,
          height: 28,
          formatTimeCallback: formatTimelineLabel,
        }),
        createTimelineHoverPlugin('rgba(23, 63, 57, 0.68)'),
        createTimelineZoomPlugin(),
        skipRegionsPlugin,
        draftRegionsPlugin,
        capCutRegionsPlugin,
        MinimapPlugin.create({
          height: 28,
          waveColor: '#dbe9e5',
          progressColor: '#9ed1c7',
          cursorColor: '#173f39',
          cursorWidth: 1,
          barWidth: 1,
          barGap: 1,
          overlayColor: 'rgba(20, 146, 127, 0.12)',
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

    const syncZoom = (source: WaveSurfer, target: WaveSurfer | null, nextZoom: number) => {
      zoomLevelRef.current = nextZoom
      setZoomLevelState(nextZoom)

      if (!target?.getDecodedData() || isSyncingZoomRef.current) return

      isSyncingZoomRef.current = true
      target.zoom(nextZoom)
      target.setScroll(source.getScroll())
      window.requestAnimationFrame(() => {
        isSyncingZoomRef.current = false
      })
    }

    const createCaptionWaveSurfer = (duration: number) => {
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
        hideScrollbar: false,
        interact: true,
        minPxPerSec: zoomLevelRef.current,
        plugins: [
          createTimelineHoverPlugin('rgba(23, 63, 57, 0.48)'),
          createTimelineZoomPlugin(),
          regionsPlugin,
        ],
      })

      captionWaveSurferRef.current = captionWaveSurfer
      regionsPluginRef.current = regionsPlugin
      captionWaveSurfer.setScroll(mainWaveSurfer.getScroll())
      setRegionsReadyToken((current) => current + 1)
      captionSubscriptions = [
        regionsPlugin.on('region-clicked', (region, event) => {
          event.stopPropagation()
          const segment = captionRegionSegmentMapRef.current.get(region.id)
          if (segment) {
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
          const segment = captionRegionSegmentMapRef.current.get(region.id)
          if (!segment?.canEditTiming) return

          onGroupTimingChangeRef.current(segment.group.id, region.start, region.end)
        }),
        captionWaveSurfer.on('interaction', (time) => {
          seekToRef.current(time)
          setStatusRef.current(`Playhead moved to ${formatSeconds(time)}. Space plays the full timeline from here.`)
        }),
        captionWaveSurfer.on('scroll', () => syncScroll(captionWaveSurfer, mainWaveSurfer)),
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

        void startSegmentPlaybackRef.current(latestSegment)
      }, 0)
    }

    subscriptions.push(
      installModifierZoomGuard(mainWaveSurfer) ?? (() => undefined),
      mainWaveSurfer.on('ready', (duration) => {
        setAudioDuration(duration)
        setPlayheadTime(mainWaveSurfer.getCurrentTime())
        setIsReady(true)
        syncTimelineAxis()
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
        createCaptionWaveSurfer(duration)
      }),
      skipRegionsPlugin.on('region-clicked', (region, event) => {
        event.stopPropagation()
        setSelectedGroupId(undefined)
        setSelectedSkipRegionId(region.id)
        setStatusRef.current('Skip zone selected. Drag, resize, or delete it.')
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

        setSelectedGroupId(undefined)
        setSelectedSkipRegionId(region.id)
        setSilenceDetectionDraft(undefined)
        onHistoryCommitRef.current('edit skip zone')
        setSkipState((current) => {
          const baseState = current.sourceUrl === audioUrl ? current : createTimelineSkipState(audioUrl)
          const signature = emptyZoneSignatureRef.current
          const nextBounds = {
            start: roundCaptionTime(region.start),
            end: roundCaptionTime(region.end),
          }
          const normalized = normalizeTimeRange(nextBounds.start, nextBounds.end, mainWaveSurfer.getDuration())
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
        setStatusRef.current(`Playhead moved to ${formatSeconds(time)}. Space plays the full timeline from here.`)
      }),
      mainWaveSurfer.on('scroll', () => {
        syncTimelineAxis()
        const captionWaveSurfer = captionWaveSurferRef.current
        if (captionWaveSurfer) syncScroll(mainWaveSurfer, captionWaveSurfer)
      }),
      mainWaveSurfer.on('zoom', (nextZoom) => {
        syncZoom(mainWaveSurfer, captionWaveSurferRef.current, nextZoom)
        syncTimelineAxis()
      }),
      mainWaveSurfer.on('redraw', () => {
        syncTimelineAxis()
      }),
      mainWaveSurfer.on('error', (error) => {
        setStatusRef.current(error.message)
      }),
    )

    return () => {
      isDisposed = true
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
    setStatusRef,
    setSkipState,
    startSegmentPlaybackRef,
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
      const content = getRegionContent(segment.label, segment.group, isSelected, segment.start, segment.end)
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

    const existingRegions = new Map(skipRegionsPlugin.getRegions().map((region) => [region.id, region]))
    const nextRegionIds = new Set(editableEmptyZoneCuts.map((cut) => cut.id))

    isReconcilingSkipRegionsRef.current = true

    existingRegions.forEach((region, regionId) => {
      if (!nextRegionIds.has(regionId)) {
        region.remove()
      }
    })

    editableEmptyZoneCuts.forEach((cut) => {
      const region = existingRegions.get(cut.id)
      const isSelected = cut.id === selectedSkipRegionId
      const content = getSkipRegionContent(cut.start, cut.end, isSelected)
      const color = getSkipRegionColor(isSelected)

      if (!region) {
        skipRegionsPlugin.addRegion({
          id: cut.id,
          start: cut.start,
          end: cut.end,
          content,
          color,
          drag: true,
          resize: true,
          minLength: skipRegionMinDuration,
        })
        return
      }

      region.setOptions({
        start: cut.start,
        end: cut.end,
        content,
        color,
        drag: true,
        resize: true,
      })
    })

    window.requestAnimationFrame(() => {
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
    const visibleDuration = mainWaveSurfer.getWidth() / Math.max(zoomLevelRef.current, 1)
    const visibleStart = mainWaveSurfer.getScroll() / Math.max(zoomLevelRef.current, 1)
    const visibleEnd = visibleStart + visibleDuration
    const padding = Math.min(1, visibleDuration * 0.16)
    const isVisible = selectedStart >= visibleStart + padding && selectedEnd <= visibleEnd - padding
    if (isVisible) return

    const groupCenter = (selectedStart + selectedEnd) / 2
    const targetStart = clamp(groupCenter - visibleDuration / 2, 0, Math.max(0, duration - visibleDuration))
    mainWaveSurfer.setScrollTime(targetStart)
    captionWaveSurferRef.current?.setScroll(mainWaveSurfer.getScroll())
  }, [captionRegionSegments, groups, selectedGroupId])

  useEffect(() => {
    if (!loopedGroupId) return

    const group = groups.find((item) => item.id === loopedGroupId)
    if (!group) {
      activeSegmentRef.current = null
      window.setTimeout(() => setLoopedGroupId(undefined), 0)
      return
    }

    const activeSegment = activeSegmentRef.current
    if (
      activeSegment?.groupId === group.id &&
      activeSegment.start === group.start &&
      activeSegment.end === group.end &&
      activeSegment.loop
    ) {
      return
    }

    void startSegmentPlayback({ groupId: group.id, start: group.start, end: group.end, loop: true })
  }, [groups, loopedGroupId, startSegmentPlayback])

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
    playGroup,
    resetPlaybackPosition,
    seekTo,
    selectedSkipRegionId,
    setDetectedSilenceAdjustment,
    setZoomLevel,
    silenceAdjustmentConfig: {
      max: silenceAdjustmentMax,
      min: silenceAdjustmentMin,
      step: silenceAdjustmentStep,
    },
    startLoopGroup,
    stopPlayback,
    timelineContainerRef,
    timelineDuration,
    togglePlayback,
    waveformContainerRef,
    zoomLevel,
  }
}

export type WaveSurferTimelineRefs = {
  captionContainerRef: RefObject<HTMLDivElement | null>
  timelineContainerRef: RefObject<HTMLDivElement | null>
  waveformContainerRef: RefObject<HTMLDivElement | null>
}
