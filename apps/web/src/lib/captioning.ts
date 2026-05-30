import type { CaptionGroup, CaptionWord, GroupingSettings } from '../types'

export const defaultGroupingSettings: GroupingSettings = {
  maxWords: 3,
  minDuration: 0.26,
  maxChars: 26,
  pauseThreshold: 0.42,
}

export const captionFrameRate = 30
const frameDuration = 1 / captionFrameRate
export const timingNudgeStep = frameDuration

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

const getGroupText = (words: CaptionWord[]) => words.map((word) => word.text).join(' ')

const roundTime = (seconds: number) => Math.round(seconds * 1000) / 1000

export const snapSecondsToFrame = (seconds: number) => roundTime(Math.round(seconds / frameDuration) * frameDuration)

const getSafeTime = (seconds: number, fallback: number) =>
  snapSecondsToFrame(Number.isFinite(seconds) ? seconds : fallback)

const clampTime = (seconds: number, min: number, max: number) =>
  Math.min(Math.max(seconds, min), max)

export const normalizeGroupTimings = (groups: CaptionGroup[]): CaptionGroup[] => {
  const groupsWithSafeStarts = groups.map((group) => ({
    ...group,
    start: Math.max(0, getSafeTime(group.start, 0)),
  }))

  return groupsWithSafeStarts.map((group, index) => {
    const next = groupsWithSafeStarts[index + 1]
    const requestedEnd = getSafeTime(group.end, group.start)
    const end = next ? next.start : requestedEnd

    return {
      ...group,
      start: roundTime(Math.min(group.start, end)),
      end: roundTime(end),
    }
  })
}

export const setGroupBoundary = (
  groups: CaptionGroup[],
  groupId: string,
  start: number,
  end: number,
): CaptionGroup[] => {
  const groupIndex = groups.findIndex((group) => group.id === groupId)
  if (groupIndex === -1) return groups

  const nextGroups = groups.map((group) => ({ ...group }))
  const previous = nextGroups[groupIndex - 1]
  const next = nextGroups[groupIndex + 1]
  const minStart = previous ? previous.start : 0
  const maxStart = next ? next.start : getSafeTime(end, nextGroups[groupIndex].end)
  const safeStart = getSafeTime(start, nextGroups[groupIndex].start)

  nextGroups[groupIndex].start = clampTime(safeStart, minStart, maxStart)

  if (next) {
    const nextNext = nextGroups[groupIndex + 2]
    const minEnd = nextGroups[groupIndex].start
    const maxEnd = nextNext ? nextNext.start : getSafeTime(next.end, next.start)
    const safeEnd = getSafeTime(end, next.start)

    next.start = clampTime(safeEnd, minEnd, maxEnd)
  } else {
    const safeEnd = getSafeTime(end, nextGroups[groupIndex].end)
    nextGroups[groupIndex].end = Math.max(nextGroups[groupIndex].start, safeEnd)
  }

  return normalizeGroupTimings(nextGroups)
}

export const nudgeGroupStartBoundary = (
  groups: CaptionGroup[],
  groupId: string,
  offset: number,
): CaptionGroup[] => {
  const group = groups.find((item) => item.id === groupId)
  if (!group) return groups

  return setGroupBoundary(groups, groupId, group.start + offset, group.end)
}

export const nudgeGroupEndBoundary = (
  groups: CaptionGroup[],
  groupId: string,
  offset: number,
): CaptionGroup[] => {
  const group = groups.find((item) => item.id === groupId)
  if (!group) return groups

  return setGroupBoundary(groups, groupId, group.start, group.end + offset)
}

export const groupWords = (
  words: CaptionWord[],
  settings: GroupingSettings = defaultGroupingSettings,
): CaptionGroup[] => {
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
      isConnectorWord(previous.text) || isConnectorWord(word.text) || duration < settings.minDuration
    const exceedsLimits =
      candidate.length > settings.maxWords ||
      candidateText.length > settings.maxChars ||
      gap > settings.pauseThreshold

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

export const rebuildGroupTiming = (group: CaptionGroup, words: CaptionWord[]): CaptionGroup => {
  const wordMap = new Map(words.map((word) => [word.id, word]))
  const groupWords = group.wordIds.map((id) => wordMap.get(id)).filter(Boolean) as CaptionWord[]

  if (!groupWords.length) return group

  const first = groupWords[0]
  const last = groupWords[groupWords.length - 1]

  return normalizeGroupTimings([{
    ...group,
    text: getGroupText(groupWords),
    start: first.start,
    end: last.end,
  }])[0]
}

export const formatSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`
}

export const secondsToSrtTime = (seconds: number) => {
  const totalMs = Math.round(seconds * 1000)
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const secs = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    secs,
  ).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

export const exportSrt = (groups: CaptionGroup[]) =>
  `${groups
    .map((group, index) => {
      const text = group.textOverride?.trim() || group.text
      return `${index + 1}\n${secondsToSrtTime(group.start)} --> ${secondsToSrtTime(group.end)}\n${text}`
    })
    .join('\n\n')}\n`

export const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
