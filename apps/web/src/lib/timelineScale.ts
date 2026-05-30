import { captionFrameRate } from './captioning'

export type TimelineScalePreset = {
  id: string
  label: string
  detail: string
  unitSeconds: number
  majorTickSeconds: number
  pixelsPerSecond: number
}

const frameSeconds = 1 / captionFrameRate

export const timelineScalePresets: TimelineScalePreset[] = [
  {
    id: 'seconds-2',
    label: '2s',
    detail: 'seconds',
    unitSeconds: 2,
    majorTickSeconds: 10,
    pixelsPerSecond: 28,
  },
  {
    id: 'seconds-1',
    label: '1s',
    detail: '1 second',
    unitSeconds: 1,
    majorTickSeconds: 5,
    pixelsPerSecond: 56,
  },
  {
    id: 'milliseconds-500',
    label: '500ms',
    detail: 'half-second',
    unitSeconds: 0.5,
    majorTickSeconds: 2,
    pixelsPerSecond: 96,
  },
  {
    id: 'milliseconds-250',
    label: '250ms',
    detail: 'quarter-second',
    unitSeconds: 0.25,
    majorTickSeconds: 1,
    pixelsPerSecond: 160,
  },
  {
    id: 'milliseconds-100',
    label: '100ms',
    detail: 'fine timing',
    unitSeconds: 0.1,
    majorTickSeconds: 0.5,
    pixelsPerSecond: 280,
  },
  {
    id: 'frames-2',
    label: '2 frames',
    detail: `${captionFrameRate} fps`,
    unitSeconds: frameSeconds * 2,
    majorTickSeconds: 0.5,
    pixelsPerSecond: captionFrameRate * 18,
  },
  {
    id: 'frames-1',
    label: '1 frame',
    detail: `${captionFrameRate} fps`,
    unitSeconds: frameSeconds,
    majorTickSeconds: 0.5,
    pixelsPerSecond: captionFrameRate * 30,
  },
]

export const defaultTimelineScaleIndex = 2

export const getTimelineScalePreset = (index: number) =>
  timelineScalePresets[Math.min(Math.max(Math.round(index), 0), timelineScalePresets.length - 1)]

export const getTimelineWidth = (duration: number, pixelsPerSecond: number) =>
  `max(100%, ${Math.ceil(Math.max(duration, 1) * pixelsPerSecond)}px)`

export const getTimelineTicks = (duration: number, majorTickSeconds: number) => {
  const ticks: number[] = []
  const safeDuration = Math.max(duration, 0)

  for (let time = 0; time <= safeDuration; time += majorTickSeconds) {
    ticks.push(time)
  }

  if (ticks.at(-1) !== safeDuration) {
    ticks.push(safeDuration)
  }

  return ticks
}
