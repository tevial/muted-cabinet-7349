import type { CaptionGroup, CaptionWord } from '../../contracts/captions'

export const captionFrameRate = 30
const frameDuration = 1 / captionFrameRate
export const timingNudgeStep = frameDuration

export const roundCaptionTime = (seconds: number) => Math.round(seconds * 1000) / 1000

export const snapSecondsToFrame = (seconds: number) =>
  roundCaptionTime(Math.round(seconds / frameDuration) * frameDuration)

const getSafeTime = (seconds: number, fallback: number) =>
  snapSecondsToFrame(Number.isFinite(seconds) ? seconds : fallback)

const clampTime = (seconds: number, min: number, max: number) =>
  Math.min(Math.max(seconds, min), max)

export const getGroupText = (words: CaptionWord[]) => words.map((word) => word.text).join(' ')

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
      start: roundCaptionTime(Math.min(group.start, end)),
      end: roundCaptionTime(end),
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
