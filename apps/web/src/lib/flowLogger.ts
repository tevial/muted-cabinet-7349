import type { CaptionGroup, CaptionWord, TranscriptionResult } from '../types'

const flowPrefix = '[CC flow]'
const maxDiagnosticSamples = 3

type TimedItem = {
  id: string
  text?: string
  start: number
  end: number
}

type TimestampDiagnosticsInput = {
  words?: CaptionWord[]
  groups?: CaptionGroup[]
  cuts?: TimedItem[]
}

const roundTime = (seconds: number) => (Number.isFinite(seconds) ? seconds.toFixed(3) : 'nan')

const compactText = (text?: string) => {
  if (!text) return undefined
  return text.length > 28 ? `${text.slice(0, 25)}...` : text
}

const summarizeItem = (item: TimedItem) => ({
  id: item.id,
  text: compactText(item.text),
  range: `${roundTime(item.start)}-${roundTime(item.end)}`,
})

const getTimedRows = (items: Array<TimedItem & { wordIds?: string[]; textOverride?: string }> = []) =>
  items.map((item, index) => ({
    index,
    id: item.id,
    start: Number(roundTime(item.start)),
    end: Number(roundTime(item.end)),
    duration: Number(roundTime(item.end - item.start)),
    text: item.textOverride ?? item.text ?? '',
    wordIds: item.wordIds?.join(', ') ?? '',
  }))

export const summarizeTimedItems = (items: TimedItem[] = []) => ({
  count: items.length,
  first: items[0] ? summarizeItem(items[0]) : null,
  last: items.at(-1) ? summarizeItem(items.at(-1) as TimedItem) : null,
})

const summarizeDuplicates = (items: TimedItem[] = [], getKey: (item: TimedItem) => string) => {
  const buckets = new Map<string, TimedItem[]>()

  items.forEach((item) => {
    const key = getKey(item)
    buckets.set(key, [...(buckets.get(key) ?? []), item])
  })

  const duplicates = [...buckets.entries()].filter(([, bucket]) => bucket.length > 1)
  if (!duplicates.length) return undefined

  return {
    buckets: duplicates.length,
    items: duplicates.reduce((sum, [, bucket]) => sum + bucket.length, 0),
    samples: duplicates.slice(0, maxDiagnosticSamples).map(([key, bucket]) => ({
      key,
      items: bucket.slice(0, 4).map(summarizeItem),
    })),
  }
}

const summarizeNonPositiveDurations = (items: TimedItem[] = []) => {
  const invalid = items.filter((item) => item.end <= item.start)
  if (!invalid.length) return undefined

  return {
    count: invalid.length,
    samples: invalid.slice(0, maxDiagnosticSamples).map(summarizeItem),
  }
}

const summarizeOverlaps = (items: TimedItem[] = []) => {
  const overlaps: Array<{ previous: TimedItem; current: TimedItem }> = []

  items.forEach((item, index) => {
    const previous = items[index - 1]
    if (previous && previous.end > item.start) {
      overlaps.push({ previous, current: item })
    }
  })

  if (!overlaps.length) return undefined

  return {
    count: overlaps.length,
    samples: overlaps.slice(0, maxDiagnosticSamples).map((overlap) => ({
      previous: summarizeItem(overlap.previous),
      current: summarizeItem(overlap.current),
    })),
  }
}

const normalizeText = (text?: string) => text?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''

const summarizeRepeatedAdjacentText = (items: TimedItem[] = []) => {
  const repeats: Array<{ previous: TimedItem; current: TimedItem }> = []

  items.forEach((item, index) => {
    const previous = items[index - 1]
    if (previous && normalizeText(previous.text) && normalizeText(previous.text) === normalizeText(item.text)) {
      repeats.push({ previous, current: item })
    }
  })

  if (!repeats.length) return undefined

  return {
    count: repeats.length,
    samples: repeats.slice(0, maxDiagnosticSamples).map((repeat) => ({
      previous: summarizeItem(repeat.previous),
      current: summarizeItem(repeat.current),
    })),
  }
}

export const summarizeTimestampDiagnostics = ({
  words,
  groups,
  cuts,
}: TimestampDiagnosticsInput) => {
  const diagnostics = {
    wordStartDupes: summarizeDuplicates(words, (word) => roundTime(word.start)),
    wordRangeDupes: summarizeDuplicates(words, (word) => `${roundTime(word.start)}-${roundTime(word.end)}`),
    wordBadDurations: summarizeNonPositiveDurations(words),
    wordOverlaps: summarizeOverlaps(words),
    groupStartDupes: summarizeDuplicates(groups, (group) => roundTime(group.start)),
    groupRangeDupes: summarizeDuplicates(groups, (group) => `${roundTime(group.start)}-${roundTime(group.end)}`),
    groupBadDurations: summarizeNonPositiveDurations(groups),
    groupOverlaps: summarizeOverlaps(groups),
    repeatedGroupText: summarizeRepeatedAdjacentText(groups),
    cutRangeDupes: summarizeDuplicates(cuts, (cut) => `${roundTime(cut.start)}-${roundTime(cut.end)}`),
    cutBadDurations: summarizeNonPositiveDurations(cuts),
    cutOverlaps: summarizeOverlaps(cuts),
  }

  const activeDiagnostics = Object.fromEntries(
    Object.entries(diagnostics).filter(([, value]) => Boolean(value)),
  )

  return Object.keys(activeDiagnostics).length ? activeDiagnostics : { ok: true }
}

export const shortFingerprint = (fingerprint?: string) =>
  fingerprint ? `${fingerprint.slice(0, 10)}...${fingerprint.slice(-6)}` : null

export const summarizeFile = (file?: File) =>
  file
    ? {
        name: file.name,
        sizeMb: Math.round((file.size / 1024 / 1024) * 100) / 100,
        type: file.type || 'unknown',
      }
    : null

export const summarizeTranscription = (result?: TranscriptionResult) =>
  result
    ? {
        words: result.words.length,
        groups: result.groups.length,
        textChars: result.text.length,
        duration: result.duration ?? null,
        language: result.language ?? null,
      }
    : null

export const flowLog = (event: string, details?: Record<string, unknown>) => {
  if (details) {
    console.info(`${flowPrefix} ${event}`, details)
    return
  }

  console.info(`${flowPrefix} ${event}`)
}

export const flowWarn = (event: string, details?: Record<string, unknown>) => {
  if (details) {
    console.warn(`${flowPrefix} ${event}`, details)
    return
  }

  console.warn(`${flowPrefix} ${event}`)
}

export const flowTimedTable = (
  event: string,
  items: Array<TimedItem & { wordIds?: string[]; textOverride?: string }> = [],
  details?: Record<string, unknown>,
) => {
  console.groupCollapsed(`${flowPrefix} ${event} (${items.length})`)
  if (details) console.info(details)
  console.table(getTimedRows(items))
  console.groupEnd()
}
