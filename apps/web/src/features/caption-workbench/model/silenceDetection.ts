import { roundCaptionTime } from '../../../domain/captions'
import type { EmptyZoneCut } from '../../../domain/captions'

type SilenceDetectionOptions = {
  idPrefix: string
  mergeDuration: number
  minDuration: number
  rmsThreshold: number
  windowDuration: number
}

type TimeRange = {
  start: number
  end: number
}

const defaultSilenceDetectionOptions: SilenceDetectionOptions = {
  idPrefix: 'audio_silence_',
  mergeDuration: 0.2,
  minDuration: 0.8,
  rmsThreshold: 0.012,
  windowDuration: 0.025,
}

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

const extractAudibleRegions = (
  audioBuffer: AudioBuffer,
  rmsThreshold: number,
  windowDuration: number,
  mergeDuration: number,
) => {
  const sampleRate = audioBuffer.sampleRate
  const frameSize = Math.max(1, Math.round(sampleRate * windowDuration))
  const regions: TimeRange[] = []
  let audibleStart: number | undefined

  for (let frameStart = 0; frameStart < audioBuffer.length; frameStart += frameSize) {
    const frameEnd = Math.min(audioBuffer.length, frameStart + frameSize)
    const frameTime = frameStart / sampleRate
    const isAudible = getFrameRms(audioBuffer, frameStart, frameEnd) > rmsThreshold

    if (isAudible) {
      audibleStart ??= frameTime
      continue
    }

    if (audibleStart !== undefined) {
      regions.push({ start: audibleStart, end: frameTime })
      audibleStart = undefined
    }
  }

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
  const {
    idPrefix,
    mergeDuration,
    minDuration,
    rmsThreshold,
    windowDuration,
  } = {
    ...defaultSilenceDetectionOptions,
    ...options,
  }
  const audibleRegions = extractAudibleRegions(audioBuffer, rmsThreshold, windowDuration, mergeDuration)

  return getSilenceCutsFromAudibleRegions(
    audibleRegions,
    audioBuffer.duration,
    idPrefix,
    minDuration,
  )
}
