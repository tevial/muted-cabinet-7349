import type { CaptionGroup, CaptionWord } from '../../contracts/captions'

export const captionFrameRate = 30
const frameDuration = 1 / captionFrameRate
export const timingNudgeStep = frameDuration
export const captionBoundaryLinkTolerance = 0.08

export const roundCaptionTime = (seconds: number) => Math.round(seconds * 1000) / 1000

export const snapSecondsToFrame = (seconds: number) =>
  roundCaptionTime(Math.round(seconds / frameDuration) * frameDuration)

const getSafeTime = (seconds: number, fallback: number) =>
  snapSecondsToFrame(Number.isFinite(seconds) ? seconds : fallback)

export const clampCaptionTime = (seconds: number, min: number, max: number) =>
  Math.min(Math.max(seconds, min), max)

export const areCaptionBoundariesLinked = (
  left: number,
  right: number,
  tolerance = captionBoundaryLinkTolerance,
) => Math.abs(left - right) <= tolerance

export const getGroupText = (words: CaptionWord[]) => words.map((word) => word.text).join(' ')

export type CaptionGap = {
  id: string
  start: number
  end: number
  duration: number
  previousGroupId: string
  nextGroupId: string
}

export type GroupBoundaryEditMode = 'linked' | 'independent'

type NormalizeGroupTimingOptions = {
  linkAdjacent?: boolean
}

type GroupBoundaryEditOptions = {
  mode?: GroupBoundaryEditMode
  snapTolerance?: number
}

export const normalizeGroupTimings = (
  groups: CaptionGroup[],
  options: NormalizeGroupTimingOptions = {},
): CaptionGroup[] => {
  const linkAdjacent = options.linkAdjacent ?? true
  const groupsWithSafeStarts = groups.map((group) => ({
    ...group,
    start: Math.max(0, getSafeTime(group.start, 0)),
  }))

  if (linkAdjacent) {
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

  const normalizedGroups: CaptionGroup[] = []
  groupsWithSafeStarts.forEach((group, index) => {
    const previous = normalizedGroups[index - 1]
    const next = groupsWithSafeStarts[index + 1]
    const startFloor = previous ? previous.end : 0
    const start = roundCaptionTime(Math.max(startFloor, getSafeTime(group.start, startFloor)))
    const requestedEnd = Math.max(start, getSafeTime(group.end, start))
    const nextStart = next ? getSafeTime(next.start, requestedEnd) : undefined
    const end = roundCaptionTime(nextStart === undefined ? requestedEnd : Math.min(requestedEnd, nextStart))

    normalizedGroups.push({
      ...group,
      start,
      end,
    })
  })

  return normalizedGroups
}

export const setGroupBoundary = (
  groups: CaptionGroup[],
  groupId: string,
  start: number,
  end: number,
  options: GroupBoundaryEditOptions = {},
): CaptionGroup[] => {
  const groupIndex = groups.findIndex((group) => group.id === groupId)
  if (groupIndex === -1) return groups

  if (options.mode === 'independent') {
    return setIndependentGroupBoundary(groups, groupIndex, start, end, options.snapTolerance ?? captionBoundaryLinkTolerance)
  }

  const nextGroups = groups.map((group) => ({ ...group }))
  const previous = nextGroups[groupIndex - 1]
  const next = nextGroups[groupIndex + 1]
  const minStart = previous ? previous.start : 0
  const maxStart = next ? next.start : getSafeTime(end, nextGroups[groupIndex].end)
  const safeStart = getSafeTime(start, nextGroups[groupIndex].start)

  nextGroups[groupIndex].start = clampCaptionTime(safeStart, minStart, maxStart)

  if (next) {
    const nextNext = nextGroups[groupIndex + 2]
    const minEnd = nextGroups[groupIndex].start
    const maxEnd = nextNext ? nextNext.start : getSafeTime(next.end, next.start)
    const safeEnd = getSafeTime(end, next.start)

    next.start = clampCaptionTime(safeEnd, minEnd, maxEnd)
  } else {
    const safeEnd = getSafeTime(end, nextGroups[groupIndex].end)
    nextGroups[groupIndex].end = Math.max(nextGroups[groupIndex].start, safeEnd)
  }

  return normalizeGroupTimings(nextGroups)
}

const hasChanged = (left: number, right: number) => Math.abs(left - right) > 0.001

const setIndependentGroupBoundary = (
  groups: CaptionGroup[],
  groupIndex: number,
  start: number,
  end: number,
  snapTolerance: number,
): CaptionGroup[] => {
  const nextGroups = groups.map((group) => ({ ...group }))
  const group = nextGroups[groupIndex]
  const previous = nextGroups[groupIndex - 1]
  const next = nextGroups[groupIndex + 1]
  const safeStart = getSafeTime(start, group.start)
  const safeEnd = getSafeTime(end, group.end)
  const startChanged = hasChanged(safeStart, group.start)
  const endChanged = hasChanged(safeEnd, group.end)

  if (startChanged || !endChanged) {
    group.start = safeStart
  }
  if (endChanged || !startChanged) {
    group.end = safeEnd
  }

  const previousEnd = previous?.end ?? 0
  const nextStart = next?.start

  if (previous && group.start <= previousEnd + snapTolerance) {
    group.start = previousEnd
  }

  group.start = clampCaptionTime(group.start, previousEnd, group.end)

  if (next && group.end >= nextStart - snapTolerance) {
    group.end = nextStart
  }

  group.end = clampCaptionTime(group.end, group.start, nextStart ?? Math.max(group.end, group.start))

  return normalizeGroupTimings(nextGroups, { linkAdjacent: false })
}

export const getCaptionGaps = (
  groups: CaptionGroup[],
  minDuration = timingNudgeStep,
): CaptionGap[] =>
  groups.flatMap((group, index) => {
    const next = groups[index + 1]
    if (!next) return []

    const start = roundCaptionTime(group.end)
    const end = roundCaptionTime(next.start)
    const duration = roundCaptionTime(end - start)
    if (duration < minDuration) return []

    return [{
      id: `caption_gap_${group.id}__${next.id}`,
      start,
      end,
      duration,
      previousGroupId: group.id,
      nextGroupId: next.id,
    }]
  })

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
