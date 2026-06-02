export const timelineZoomConfig = {
  defaultPixelsPerSecond: 96,
  minPixelsPerSecond: 24,
  maxPixelsPerSecond: 1200,
  sliderStep: 1,
  wheelDeltaThreshold: 12,
  wheelScale: 0.08,
  wheelIterations: 120,
}

export const playbackSpeedConfig = {
  defaultRate: 1,
  minRate: 0.25,
  maxRate: 2.5,
  sliderStep: 0.05,
}

export const waveformLaneOptions = {
  height: 88,
  waveColor: '#16777e',
  progressColor: '#2ac1cd',
  cursorColor: '#ffffffcc',
  cursorWidth: 2,
  normalize: true,
}

export const captionLaneOptions = {
  height: 72,
  waveColor: 'rgba(22, 119, 126, 0.18)',
  progressColor: 'rgba(42, 193, 205, 0.24)',
  cursorColor: '#ffffffcc',
  cursorWidth: 2,
  normalize: true,
}

export const captionRegionColors = {
  default: 'rgba(157, 73, 54, 0.96)',
  selected: 'rgba(146, 61, 42, 0.98)',
}

export const formatTimelineLabel = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds)
  const totalMilliseconds = Math.round(safeSeconds * 1000)
  const milliseconds = totalMilliseconds % 1000
  const totalSeconds = Math.floor(totalMilliseconds / 1000)
  const wholeSeconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const wholeMinutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (hours > 0) {
    return `${hours}:${String(wholeMinutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`
  }

  if (safeSeconds < 10) {
    return `${wholeSeconds}.${String(milliseconds).padStart(3, '0')}`
  }

  return `${wholeMinutes}:${String(wholeSeconds).padStart(2, '0')}`
}

export const formatZoomLabel = (pixelsPerSecond: number) =>
  `${Math.round(pixelsPerSecond)} px/s`

export const formatPlaybackRateLabel = (rate: number) =>
  `${rate.toFixed(2).replace(/\.?0+$/, '')}x`
