import type { CaptionGroup, CaptionWord } from '../../contracts/captions'
import { sanitizeCaptionWords } from './transcriptionIngest'
import {
  areCaptionBoundariesLinked,
  clampCaptionTime,
  getGroupText,
  roundCaptionTime,
} from './timing'

export type ApplyAlignedWordsToGroupInput = {
  words: CaptionWord[]
  groups: CaptionGroup[]
  groupId: string
  alignedWords: CaptionWord[]
  createWordId: (index: number) => string
}

export type ApplyAlignedWordsToGroupResult = {
  words: CaptionWord[]
  groups: CaptionGroup[]
  group?: CaptionGroup
}

const getAlignedBoundary = (words: CaptionWord[]) => ({
  start: words[0].start,
  end: words.at(-1)?.end ?? words[0].end,
})

const clampWordToGroup = (word: CaptionWord, start: number, end: number): CaptionWord => {
  const nextStart = roundCaptionTime(clampCaptionTime(word.start, start, end))
  const nextEnd = roundCaptionTime(clampCaptionTime(word.end, nextStart, end))

  return {
    ...word,
    start: nextStart,
    end: nextEnd,
  }
}

/**
 * Replace the words owned by one caption group with aligned word intervals while
 * preserving group identity, text overrides, and the user's linked/detached
 * boundary model.
 *
 * When the target was linked to the previous group, the aligned start becomes
 * the shared boundary and moves the previous group's end. When it was linked to
 * the next group, the target keeps that right boundary; detached or final groups
 * also adopt the aligned end.
 */
export const applyAlignedWordsToGroup = ({
  words,
  groups,
  groupId,
  alignedWords,
  createWordId,
}: ApplyAlignedWordsToGroupInput): ApplyAlignedWordsToGroupResult => {
  const targetGroup = groups.find((group) => group.id === groupId)
  const sanitizedWords = sanitizeCaptionWords(alignedWords)
  if (!targetGroup || !sanitizedWords.length) return { words, groups }

  const groupIndex = groups.findIndex((group) => group.id === groupId)
  const previousGroup = groups[groupIndex - 1]
  const nextGroup = groups[groupIndex + 1]
  const linkedToPrevious = Boolean(
    previousGroup && areCaptionBoundariesLinked(previousGroup.end, targetGroup.start),
  )
  const linkedToNext = Boolean(
    nextGroup && areCaptionBoundariesLinked(targetGroup.end, nextGroup.start),
  )
  const rawReplacementWords = sanitizedWords.map((word, index) => ({
    ...word,
    id: targetGroup.wordIds[index] ?? createWordId(index + 1),
    start: roundCaptionTime(word.start),
    end: roundCaptionTime(word.end),
  }))
  const alignedBoundary = getAlignedBoundary(rawReplacementWords)
  const startFloor = previousGroup
    ? linkedToPrevious
      ? previousGroup.start
      : previousGroup.end
    : 0
  const startCeiling = nextGroup?.start ?? Math.max(alignedBoundary.start, alignedBoundary.end)
  const alignedStart = roundCaptionTime(
    clampCaptionTime(alignedBoundary.start, startFloor, startCeiling),
  )
  const shouldAdoptAlignedEnd = !nextGroup || !linkedToNext
  const alignedEndCeiling = nextGroup?.start ?? Math.max(alignedBoundary.end, alignedStart)
  const alignedEnd = shouldAdoptAlignedEnd
    ? roundCaptionTime(clampCaptionTime(alignedBoundary.end, alignedStart, alignedEndCeiling))
    : nextGroup.start
  const replacementWords = rawReplacementWords.map((word) => clampWordToGroup(word, alignedStart, alignedEnd))
  const replacementWordIds = new Set(targetGroup.wordIds)
  const nextWords = [
    ...words.filter((word) => !replacementWordIds.has(word.id)),
    ...replacementWords,
  ].sort((left, right) => left.start - right.start || left.end - right.end)
  const alignedGroup: CaptionGroup = {
    ...targetGroup,
    wordIds: replacementWords.map((word) => word.id),
    text: getGroupText(replacementWords),
    start: alignedStart,
    end: alignedEnd,
  }
  const nextGroups = groups.map((group) => {
    if (previousGroup && group.id === previousGroup.id && linkedToPrevious) {
      return {
        ...group,
        end: alignedStart,
      }
    }
    if (group.id === groupId) return alignedGroup
    return group
  })

  return {
    words: nextWords,
    groups: nextGroups,
    group: alignedGroup,
  }
}
