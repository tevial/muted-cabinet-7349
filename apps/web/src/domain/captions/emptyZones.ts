import type { CaptionWord, GroupingSettings } from '../../contracts/captions'
import { normalizeGroupingSettings } from './settings'
import { roundCaptionTime } from './timing'

export type EmptyZoneCut = {
  id: string
  start: number
  end: number
  duration: number
}

export const getEmptyZoneCuts = (
  words: CaptionWord[],
  timelineDuration: number,
  settings: GroupingSettings,
): EmptyZoneCut[] => {
  const safeSettings = normalizeGroupingSettings(settings)
  if (!safeSettings.trimEmptyZones || !words.length) return []

  const sortedWords = [...words].sort((left, right) => left.start - right.start)
  const safeDuration = Math.max(0, timelineDuration)
  const cuts: EmptyZoneCut[] = []

  const addCut = (start: number, end: number) => {
    const safeStart = roundCaptionTime(Math.max(0, start))
    const safeEnd = roundCaptionTime(Math.min(Math.max(end, safeStart), safeDuration))
    const duration = roundCaptionTime(safeEnd - safeStart)

    if (duration < safeSettings.emptyZoneThreshold) return
    cuts.push({
      id: `cut_${String(cuts.length + 1).padStart(4, '0')}`,
      start: safeStart,
      end: safeEnd,
      duration,
    })
  }

  sortedWords.forEach((word, index) => {
    const nextWord = sortedWords[index + 1]
    if (nextWord) addCut(word.end, nextWord.start)
  })

  return cuts
}
