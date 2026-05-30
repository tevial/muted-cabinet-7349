export type CaptionWord = {
  id: string
  text: string
  start: number
  end: number
  confidence?: number
}

export type CaptionGroup = {
  id: string
  wordIds: string[]
  text: string
  start: number
  end: number
  textOverride?: string
}

export type GroupingSettings = {
  maxWords: number
  minDuration: number
  maxChars: number
  pauseThreshold: number
  trimEmptyZones: boolean
  emptyZoneThreshold: number
}

export type TranscriptionResult = {
  language?: string
  duration?: number
  text: string
  words: CaptionWord[]
  groups: CaptionGroup[]
}
