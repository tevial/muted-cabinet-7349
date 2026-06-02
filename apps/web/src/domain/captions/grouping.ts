import type { CaptionGroup, CaptionWord, GroupingSettings } from '../../contracts/captions'
import { defaultGroupingSettings, normalizeGroupingSettings } from './settings'
import { getGroupText, normalizeGroupTimings } from './timing'

export type CaptionGroupingRange = {
  start: number
  end: number
}

type GroupWordsOptions = {
  breakRanges?: CaptionGroupingRange[]
}

const normalizeBreakRanges = (ranges: CaptionGroupingRange[] = []) =>
  ranges
    .map((range) => ({
      start: Math.max(0, range.start),
      end: Math.max(0, range.end),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)

const getBreakBoundaries = (ranges: CaptionGroupingRange[]) =>
  ranges.flatMap((range) => [range.start, range.end]).sort((left, right) => left - right)

const hasBreakBoundaryBetween = (previous: CaptionWord, word: CaptionWord, boundaries: number[]) =>
  boundaries.some((boundary) => boundary > previous.start && boundary <= word.start)

export const groupWords = (
  words: CaptionWord[],
  settings: GroupingSettings = defaultGroupingSettings,
  options: GroupWordsOptions = {},
): CaptionGroup[] => {
  const safeSettings = normalizeGroupingSettings(settings)
  const breakRanges = normalizeBreakRanges(options.breakRanges)
  const breakBoundaries = getBreakBoundaries(breakRanges)
  const groups: CaptionGroup[] = []
  let current: CaptionWord[] = []
  const sortedWords = [...words].sort((left, right) => left.start - right.start || left.end - right.end)

  const commit = () => {
    if (!current.length) return
    const first = current[0]
    const last = current[current.length - 1]

    groups.push({
      id: `g_${String(groups.length + 1).padStart(4, '0')}`,
      wordIds: current.map((word) => word.id),
      text: getGroupText(current),
      start: first.start,
      end: last.end,
    })
    current = []
  }

  sortedWords.forEach((word) => {
    if (!current.length) {
      current = [word]
      return
    }

    const previous = current[current.length - 1]
    const candidate = [...current, word]
    const candidateText = getGroupText(candidate)
    const exceedsHardLimits = candidateText.length > safeSettings.maxChars
    const crossesBreakBoundary = hasBreakBoundaryBetween(previous, word, breakBoundaries)

    if (!exceedsHardLimits && !crossesBreakBoundary) {
      current = candidate
      return
    }

    commit()
    current = [word]
  })

  commit()
  return normalizeGroupTimings(groups, { breakRanges })
}
