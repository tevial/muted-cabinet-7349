import type { EmptyZoneCut } from './captioning'
import type { CaptionGroup, CaptionWord, GroupingSettings } from '../types'

type TimestampItem = {
  index: number
  id: string
  start: number
  end: number
  duration: number
}

type TimestampDuplicate = {
  key: string
  count: number
  ids: string[]
}

type BuildDebugReportInput = {
  audioDuration: number
  audioFingerprint?: string
  emptyZoneCuts: EmptyZoneCut[]
  fileName?: string
  groups: CaptionGroup[]
  language: string
  playheadTime: number
  selectedGroupId?: string
  settings: GroupingSettings
  storageSnapshot: unknown
  timelineDuration: number
  transcriptSource?: {
    audioFingerprint?: string
    fileName?: string
    fileSize?: number
  }
  words: CaptionWord[]
}

const roundDebugTime = (seconds: number) => Math.round(seconds * 1000) / 1000

const toTimestampItem = ({ id, start, end }: Pick<TimestampItem, 'id' | 'start' | 'end'>, index: number) => ({
  index: index + 1,
  id,
  start: roundDebugTime(start),
  end: roundDebugTime(end),
  duration: roundDebugTime(end - start),
})

const getDuplicateItems = <T extends { id: string }>(
  items: T[],
  getKey: (item: T) => string,
): TimestampDuplicate[] => {
  const buckets = new Map<string, string[]>()

  items.forEach((item) => {
    const key = getKey(item)
    const ids = buckets.get(key)
    if (ids) {
      ids.push(item.id)
      return
    }

    buckets.set(key, [item.id])
  })

  return Array.from(buckets.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, count: ids.length, ids }))
}

export const buildTimestampDebugReport = ({
  audioDuration,
  audioFingerprint,
  emptyZoneCuts,
  fileName,
  groups,
  language,
  playheadTime,
  selectedGroupId,
  settings,
  storageSnapshot,
  timelineDuration,
  transcriptSource,
  words,
}: BuildDebugReportInput) => {
  const wordRows = words.map((word, index) => ({
    ...toTimestampItem(word, index),
    text: word.text,
    gapFromPrevious:
      index === 0 ? null : roundDebugTime(word.start - words[index - 1].end),
  }))
  const groupRows = groups.map((group, index) => ({
    ...toTimestampItem(group, index),
    text: group.textOverride ?? group.text,
    wordIds: group.wordIds,
  }))
  const cutRows = emptyZoneCuts.map((cut, index) => toTimestampItem(cut, index))

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'capcut-caption-debug',
      fileName: fileName ?? null,
      language,
      audioFingerprint: audioFingerprint ?? null,
      transcriptSource: transcriptSource ?? null,
      timeline: {
        audioDuration: roundDebugTime(audioDuration),
        playheadTime: roundDebugTime(playheadTime),
        timelineDuration: roundDebugTime(timelineDuration),
        selectedGroupId: selectedGroupId ?? null,
      },
      settings,
      counts: {
        words: wordRows.length,
        groups: groupRows.length,
        emptyZoneCuts: cutRows.length,
      },
      diagnostics: {
        sourceMismatch: Boolean(
          audioFingerprint &&
            transcriptSource?.audioFingerprint &&
            audioFingerprint !== transcriptSource.audioFingerprint,
        ),
        duplicateWordStarts: getDuplicateItems(wordRows, (word) => String(word.start)),
        duplicateWordRanges: getDuplicateItems(wordRows, (word) => `${word.start}-${word.end}`),
        duplicateGroupStarts: getDuplicateItems(groupRows, (group) => String(group.start)),
        duplicateGroupRanges: getDuplicateItems(groupRows, (group) => `${group.start}-${group.end}`),
        duplicateCutStarts: getDuplicateItems(cutRows, (cut) => String(cut.start)),
        duplicateCutRanges: getDuplicateItems(cutRows, (cut) => `${cut.start}-${cut.end}`),
      },
      words: wordRows,
      groups: groupRows,
      emptyZoneCuts: cutRows,
      localStorage: storageSnapshot,
    },
    null,
    2,
  )
}
