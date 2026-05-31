import type { CaptionGroup } from '../../../contracts/captions'

type TimelineRange = {
  end: number
  start: number
}

const pendingChunkGroupPrefix = 'pending_chunk_'
const pendingChunkText = 'Transcribing...'
const defaultKeptChunkConcurrency = 8
const maxKeptChunkConcurrency = 32

const clampInteger = (value: number, min: number, max: number) =>
  Math.min(Math.max(Math.round(value), min), max)

export const getKeptChunkTranscriptionConcurrency = () => {
  const rawValue = Number(import.meta.env.VITE_TRANSCRIBE_CHUNK_CONCURRENCY)
  if (!Number.isFinite(rawValue)) return defaultKeptChunkConcurrency

  return clampInteger(rawValue, 1, maxKeptChunkConcurrency)
}

export const isPendingChunkGroup = (group: CaptionGroup) => group.id.startsWith(pendingChunkGroupPrefix)

export const createPendingChunkGroups = (ranges: TimelineRange[]): CaptionGroup[] =>
  ranges.map((range, index) => ({
    id: `${pendingChunkGroupPrefix}${String(index + 1).padStart(4, '0')}`,
    wordIds: [],
    text: pendingChunkText,
    textOverride: pendingChunkText,
    start: range.start,
    end: range.end,
  }))

export const mergeGroupsWithPendingChunks = (
  groups: CaptionGroup[],
  pendingGroups: CaptionGroup[],
) => {
  if (!pendingGroups.length) return groups.filter((group) => !isPendingChunkGroup(group))

  return [
    ...groups.filter((group) => !isPendingChunkGroup(group)),
    ...pendingGroups,
  ].sort((left, right) => left.start - right.start || left.end - right.end)
}

export const runWithConcurrency = async <Item>(
  items: Item[],
  concurrency: number,
  worker: (item: Item, index: number) => Promise<void>,
) => {
  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  const errors: unknown[] = []
  let nextIndex = 0

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        await worker(items[index], index)
      } catch (error) {
        errors.push(error)
      }
    }
  }))

  if (errors.length) throw errors[0]
}
