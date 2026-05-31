export type CapCutTimelineMaterial = {
  id: string
  type: 'audio' | 'video'
  path: string
  name: string
  duration: number
  durationUs: number
  hasAudio: boolean
  width?: number
  height?: number
}

export type CapCutTimelineSegment = {
  id: string
  index: number
  trackId: string
  trackIndex: number
  type: string
  materialId: string
  materialPath: string
  materialName: string
  hasAudio: boolean
  sourceStart: number
  sourceEnd: number
  sourceDuration: number
  targetStart: number
  targetEnd: number
  duration: number
  speed: number
  volume: number
  visible: boolean
  reverse: boolean
  renderIndex?: number
  trackRenderIndex?: number
  extraMaterialRefs: string[]
}

export type CapCutTimelineTrack = {
  id: string
  index: number
  type: string
  name: string
  segments: CapCutTimelineSegment[]
  segmentCount: number
  renderIndex?: number
  flag?: number
  attribute?: number
}

export type CapCutTimelineMarker = {
  id: string
  scope: 'source' | 'source-beat' | 'timeline'
  time?: number
  projectTime?: number
  sourceTime?: number
  segmentId?: string
  materialRefId?: string
  duration: number
  title: string
  color: string
}

export type CapCutProjectGap = {
  id: string
  start: number
  end: number
  duration: number
}

export type CapCutSourceCutBoundary = {
  id: string
  trackId: string
  leftSegmentId: string
  rightSegmentId: string
  mediaPath: string
  materialName: string
  hiddenSourceStart: number
  hiddenSourceEnd: number
  hiddenDuration: number
  projectPosition: number
  canRestore: boolean
}

export type CapCutTimelineMap = {
  version: number
  projectPath: string
  mainTimelineId: string
  duration: number
  durationUs: number
  tracks: CapCutTimelineTrack[]
  materials: CapCutTimelineMaterial[]
  markers: CapCutTimelineMarker[]
  projectGaps: CapCutProjectGap[]
  sourceCutBoundaries: CapCutSourceCutBoundary[]
  warnings: string[]
}

export type CapCutAudioStem = {
  id: string
  trackId: string
  label: string
  duration: number
  url: string
  warnings: string[]
}

export type CapCutProjectImport = {
  timelineMap: CapCutTimelineMap
  stems: CapCutAudioStem[]
  warnings: string[]
}

export type CapCutSourcePreview = {
  mediaPath: string
  start: number
  end: number
  duration: number
  url: string
}
