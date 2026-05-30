import type { CaptionGroup, CaptionWord, GroupingSettings } from '../../contracts/captions'
import { defaultGroupingSettings, normalizeGroupingSettings } from './settings'
import { getGroupText, normalizeGroupTimings } from './timing'

const connectorWords = new Set([
  'а',
  'але',
  'без',
  'бо',
  'в',
  'від',
  'до',
  'з',
  'за',
  'і',
  'й',
  'коли',
  'на',
  'не',
  'ну',
  'та',
  'то',
  'у',
  'це',
  'що',
  'як',
  'якщо',
])

const normalizeWord = (text: string) =>
  text.trim().toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, '')

export const isConnectorWord = (text: string) => connectorWords.has(normalizeWord(text))

export const groupWords = (
  words: CaptionWord[],
  settings: GroupingSettings = defaultGroupingSettings,
): CaptionGroup[] => {
  const safeSettings = normalizeGroupingSettings(settings)
  const groups: CaptionGroup[] = []
  let current: CaptionWord[] = []

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

  words.forEach((word) => {
    if (!current.length) {
      current = [word]
      return
    }

    const previous = current[current.length - 1]
    const candidate = [...current, word]
    const candidateText = getGroupText(candidate)
    const duration = word.end - current[0].start
    const gap = word.start - previous.end
    const shouldJoin =
      isConnectorWord(previous.text) || isConnectorWord(word.text) || duration < safeSettings.minDuration
    const exceedsLimits =
      candidate.length > safeSettings.maxWords ||
      candidateText.length > safeSettings.maxChars ||
      gap > safeSettings.pauseThreshold

    if (shouldJoin && !exceedsLimits) {
      current = candidate
      return
    }

    if (current.length === 1 && isConnectorWord(current[0].text) && !exceedsLimits) {
      current = candidate
      return
    }

    commit()
    current = [word]
  })

  commit()
  return normalizeGroupTimings(groups)
}
