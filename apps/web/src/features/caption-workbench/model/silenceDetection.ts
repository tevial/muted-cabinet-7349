import { roundCaptionTime } from '../../../domain/captions'
import type { EmptyZoneCut } from '../../../domain/captions'

export type SilenceDetectionSettings = {
  adaptiveNormalization: boolean
  adaptiveWindowDuration: number
  mergeDuration: number
  minDuration: number
  relativeThreshold: number
  rmsThreshold: number
  speechPadding: number
  windowDuration: number
}

type SilenceDetectionOptions = SilenceDetectionSettings & {
  idPrefix: string
}

type TimeRange = {
  start: number
  end: number
}

type RmsFrame = TimeRange & {
  rms: number
}

export const defaultSilenceDetectionSettings: SilenceDetectionSettings = {
  adaptiveNormalization: true,
  adaptiveWindowDuration: 1.2,
  mergeDuration: 0.2,
  minDuration: 0.2,
  relativeThreshold: 0.16,
  rmsThreshold: 0.02,
  speechPadding: 0.12,
  windowDuration: 0.025,
}

const defaultSilenceDetectionOptions: SilenceDetectionOptions = {
  ...defaultSilenceDetectionSettings,
  idPrefix: 'audio_silence_',
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(Number.isFinite(value) ? value : min, min), max)

export const normalizeSilenceDetectionSettings = (
  settings?: Partial<SilenceDetectionSettings>,
): SilenceDetectionSettings => ({
  adaptiveNormalization: Boolean(
    settings?.adaptiveNormalization ?? defaultSilenceDetectionSettings.adaptiveNormalization,
  ),
  adaptiveWindowDuration: clamp(
    settings?.adaptiveWindowDuration ?? defaultSilenceDetectionSettings.adaptiveWindowDuration,
    0.2,
    8,
  ),
  mergeDuration: clamp(settings?.mergeDuration ?? defaultSilenceDetectionSettings.mergeDuration, 0, 2),
  minDuration: clamp(settings?.minDuration ?? defaultSilenceDetectionSettings.minDuration, 0.05, 10),
  relativeThreshold: clamp(settings?.relativeThreshold ?? defaultSilenceDetectionSettings.relativeThreshold, 0.02, 1),
  rmsThreshold: clamp(settings?.rmsThreshold ?? defaultSilenceDetectionSettings.rmsThreshold, 0.001, 0.2),
  speechPadding: clamp(settings?.speechPadding ?? defaultSilenceDetectionSettings.speechPadding, 0, 2),
  windowDuration: clamp(settings?.windowDuration ?? defaultSilenceDetectionSettings.windowDuration, 0.005, 0.25),
})

const normalizeSilenceDetectionOptions = (options?: Partial<SilenceDetectionOptions>): SilenceDetectionOptions => ({
  ...normalizeSilenceDetectionSettings(options),
  idPrefix: options?.idPrefix ?? defaultSilenceDetectionOptions.idPrefix,
})

const getFrameRms = (audioBuffer: AudioBuffer, frameStart: number, frameEnd: number) => {
  let maxRms = 0

  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const channel = audioBuffer.getChannelData(channelIndex)
    let sumSquares = 0

    for (let sampleIndex = frameStart; sampleIndex < frameEnd; sampleIndex += 1) {
      sumSquares += channel[sampleIndex] ** 2
    }

    maxRms = Math.max(maxRms, Math.sqrt(sumSquares / Math.max(1, frameEnd - frameStart)))
  }

  return maxRms
}

const mergeCloseRanges = (ranges: TimeRange[], mergeDuration: number) =>
  ranges.reduce<TimeRange[]>((mergedRanges, range) => {
    const previous = mergedRanges[mergedRanges.length - 1]
    if (previous && range.start - previous.end < mergeDuration) {
      previous.end = range.end
      return mergedRanges
    }

    mergedRanges.push({ ...range })
    return mergedRanges
  }, [])

const padRanges = (ranges: TimeRange[], duration: number, padding: number) =>
  ranges.map((range) => ({
    start: Math.max(0, range.start - padding),
    end: Math.min(duration, range.end + padding),
  }))

const getRmsFrames = (
  audioBuffer: AudioBuffer,
  windowDuration: number,
): RmsFrame[] => {
  const sampleRate = audioBuffer.sampleRate
  const frameSize = Math.max(1, Math.round(sampleRate * windowDuration))
  const frames: RmsFrame[] = []

  for (let frameStart = 0; frameStart < audioBuffer.length; frameStart += frameSize) {
    const frameEnd = Math.min(audioBuffer.length, frameStart + frameSize)
    frames.push({
      start: frameStart / sampleRate,
      end: frameEnd / sampleRate,
      rms: getFrameRms(audioBuffer, frameStart, frameEnd),
    })
  }

  return frames
}

const getLocalPeakRms = (frames: RmsFrame[], index: number, radiusFrames: number) => {
  let peak = 0
  const start = Math.max(0, index - radiusFrames)
  const end = Math.min(frames.length - 1, index + radiusFrames)

  for (let frameIndex = start; frameIndex <= end; frameIndex += 1) {
    peak = Math.max(peak, frames[frameIndex].rms)
  }

  return peak
}

const isAudibleFrame = (
  frames: RmsFrame[],
  index: number,
  settings: SilenceDetectionSettings,
) => {
  const frame = frames[index]
  if (frame.rms > settings.rmsThreshold) return true
  if (!settings.adaptiveNormalization) return false

  const radiusFrames = Math.max(1, Math.round(settings.adaptiveWindowDuration / settings.windowDuration / 2))
  const localPeak = getLocalPeakRms(frames, index, radiusFrames)
  if (localPeak <= 0) return false

  const normalizedRms = frame.rms / localPeak
  return frame.rms > settings.rmsThreshold * 0.2 && normalizedRms > settings.relativeThreshold
}

const extractAudibleRegions = (
  audioBuffer: AudioBuffer,
  settings: SilenceDetectionSettings,
  mergeDuration: number,
) => {
  const frames = getRmsFrames(audioBuffer, settings.windowDuration)
  const regions: TimeRange[] = []
  let audibleStart: number | undefined

  frames.forEach((frame, index) => {
    const isAudible = isAudibleFrame(frames, index, settings)

    if (isAudible) {
      audibleStart ??= frame.start
      return
    }

    if (audibleStart !== undefined) {
      regions.push({ start: audibleStart, end: frame.start })
      audibleStart = undefined
    }
  })

  if (audibleStart !== undefined) {
    regions.push({ start: audibleStart, end: audioBuffer.duration })
  }

  return mergeCloseRanges(regions, mergeDuration)
}

const getSilenceCutsFromAudibleRegions = (
  audibleRegions: TimeRange[],
  duration: number,
  idPrefix: string,
  minDuration: number,
) => {
  const cuts: EmptyZoneCut[] = []
  let lastAudibleEnd = 0

  const addCut = (start: number, end: number) => {
    const safeStart = roundCaptionTime(start)
    const safeEnd = roundCaptionTime(end)
    const safeDuration = roundCaptionTime(safeEnd - safeStart)
    if (safeDuration < minDuration) return

    cuts.push({
      id: `${idPrefix}${String(cuts.length + 1).padStart(4, '0')}`,
      start: safeStart,
      end: safeEnd,
      duration: safeDuration,
    })
  }

  audibleRegions.forEach((region) => {
    addCut(lastAudibleEnd, region.start)
    lastAudibleEnd = Math.max(lastAudibleEnd, region.end)
  })
  addCut(lastAudibleEnd, duration)

  return cuts
}

export const detectSilenceCuts = (
  audioBuffer: AudioBuffer,
  options?: Partial<SilenceDetectionOptions>,
): EmptyZoneCut[] => {
  const detectionSettings = normalizeSilenceDetectionOptions(options)
  const {
    idPrefix,
    mergeDuration,
    minDuration,
    speechPadding,
  } = detectionSettings
  const audibleRegions = mergeCloseRanges(
    padRanges(
      extractAudibleRegions(audioBuffer, detectionSettings, mergeDuration),
      audioBuffer.duration,
      speechPadding,
    ),
    mergeDuration,
  )

  return getSilenceCutsFromAudibleRegions(
    audibleRegions,
    audioBuffer.duration,
    idPrefix,
    minDuration,
  )
}
