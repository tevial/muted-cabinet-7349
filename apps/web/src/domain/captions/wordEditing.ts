import type { CaptionGroup, CaptionWord, GroupingSettings } from '../../contracts/captions'
import { groupWords } from './grouping'
import { getGroupText, roundCaptionTime } from './timing'

export type ApplyGroupTextEditInput = {
  words: CaptionWord[]
  group: CaptionGroup
  text: string
  createWordId: (index: number) => string
}

export type ApplyGroupTextEditResult = {
  words: CaptionWord[]
  changed: boolean
  range: { start: number; end: number }
  replacementWordIds: string[]
  removedWordIds: string[]
}

export type ApplyCaptionGroupDraftInput = {
  breakRanges?: Array<{ start: number; end: number }>
  words: CaptionWord[]
  draftGroups: CaptionGroup[]
  settings: GroupingSettings
  createWordId: (group: CaptionGroup, groupIndex: number, wordIndex: number) => string
}

export type ApplyCaptionGroupDraftResult = {
  words: CaptionWord[]
  groups: CaptionGroup[]
  editedRanges: Array<{ start: number; end: number }>
}

type TokenMatch = {
  sourceIndex: number
  targetIndex: number
}

const splitCaptionTextIntoWords = (text: string) => text.trim().split(/\s+/).filter(Boolean)

const getGroupDisplayText = (group: CaptionGroup) => group.textOverride ?? group.text

const normalizeToken = (text: string) =>
  text.trim().toLowerCase().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, '')

const getLcsMatches = (sourceTokens: string[], targetTokens: string[]): TokenMatch[] => {
  const sourceLength = sourceTokens.length
  const targetLength = targetTokens.length
  const table = Array.from({ length: sourceLength + 1 }, () => Array<number>(targetLength + 1).fill(0))

  for (let sourceIndex = sourceLength - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let targetIndex = targetLength - 1; targetIndex >= 0; targetIndex -= 1) {
      table[sourceIndex][targetIndex] =
        sourceTokens[sourceIndex] === targetTokens[targetIndex]
          ? table[sourceIndex + 1][targetIndex + 1] + 1
          : Math.max(table[sourceIndex + 1][targetIndex], table[sourceIndex][targetIndex + 1])
    }
  }

  const matches: TokenMatch[] = []
  let sourceIndex = 0
  let targetIndex = 0
  while (sourceIndex < sourceLength && targetIndex < targetLength) {
    if (sourceTokens[sourceIndex] === targetTokens[targetIndex]) {
      matches.push({ sourceIndex, targetIndex })
      sourceIndex += 1
      targetIndex += 1
      continue
    }

    if (table[sourceIndex + 1][targetIndex] >= table[sourceIndex][targetIndex + 1]) {
      sourceIndex += 1
    } else {
      targetIndex += 1
    }
  }

  return matches
}

const createDistributedWord = (
  text: string,
  index: number,
  count: number,
  start: number,
  end: number,
  sourceWord: CaptionWord | undefined,
  createWordId: () => string,
): CaptionWord => {
  const safeStart = Math.max(0, start)
  const safeEnd = Math.max(safeStart + 0.001, end)
  const duration = safeEnd - safeStart
  const wordStart = roundCaptionTime(safeStart + (duration * index) / count)
  const wordEnd = roundCaptionTime(index === count - 1 ? safeEnd : safeStart + (duration * (index + 1)) / count)

  return {
    ...(sourceWord ? { confidence: sourceWord.confidence } : {}),
    id: sourceWord?.id ?? createWordId(),
    text,
    start: wordStart,
    end: Math.max(wordStart, wordEnd),
  }
}

const buildReplacementBlock = (
  sourceWords: CaptionWord[],
  targetTokens: string[],
  rangeStart: number,
  rangeEnd: number,
  createWordId: () => string,
) => {
  if (!targetTokens.length) return []

  if (sourceWords.length === targetTokens.length) {
    return targetTokens.map((text, index) => ({
      ...sourceWords[index],
      text,
    }))
  }

  return targetTokens.map((text, index) =>
    createDistributedWord(text, index, targetTokens.length, rangeStart, rangeEnd, sourceWords[index], createWordId),
  )
}

export const applyGroupTextEditToWords = ({
  words,
  group,
  text,
  createWordId,
}: ApplyGroupTextEditInput): ApplyGroupTextEditResult => {
  const wordMap = new Map(words.map((word) => [word.id, word]))
  const groupWords = group.wordIds.map((wordId) => wordMap.get(wordId)).filter(Boolean) as CaptionWord[]
  const range = { start: group.start, end: group.end }
  if (!groupWords.length) {
    return { words, changed: false, range, replacementWordIds: [], removedWordIds: [] }
  }

  const targetTokens = splitCaptionTextIntoWords(text)
  const sourceText = getGroupText(groupWords)
  if (targetTokens.join(' ') === sourceText) {
    return { words, changed: false, range, replacementWordIds: group.wordIds, removedWordIds: [] }
  }

  const sourceTokens = groupWords.map((word) => normalizeToken(word.text))
  const normalizedTargetTokens = targetTokens.map(normalizeToken)
  const matches = getLcsMatches(sourceTokens, normalizedTargetTokens)
  const replacementWords: CaptionWord[] = []
  const groupWordIds = new Set(group.wordIds)
  const createNextWordId = (() => {
    let nextIndex = 1
    return () => createWordId(nextIndex++)
  })()

  const addBlock = (
    sourceStart: number,
    sourceEnd: number,
    targetStart: number,
    targetEnd: number,
    fallbackStart: number,
    fallbackEnd: number,
  ) => {
    const sourceBlock = groupWords.slice(sourceStart, sourceEnd)
    const targetBlock = targetTokens.slice(targetStart, targetEnd)
    const blockStart = sourceBlock[0]?.start ?? fallbackStart
    const blockEnd = sourceBlock.at(-1)?.end ?? fallbackEnd

    replacementWords.push(...buildReplacementBlock(sourceBlock, targetBlock, blockStart, blockEnd, createNextWordId))
  }

  let sourceCursor = 0
  let targetCursor = 0
  matches.forEach((match) => {
    const previousEnd = replacementWords.at(-1)?.end ?? range.start
    const nextStart = groupWords[match.sourceIndex]?.start ?? range.end
    addBlock(sourceCursor, match.sourceIndex, targetCursor, match.targetIndex, previousEnd, nextStart)

    replacementWords.push({
      ...groupWords[match.sourceIndex],
      text: targetTokens[match.targetIndex],
    })
    sourceCursor = match.sourceIndex + 1
    targetCursor = match.targetIndex + 1
  })

  addBlock(
    sourceCursor,
    groupWords.length,
    targetCursor,
    targetTokens.length,
    replacementWords.at(-1)?.end ?? range.start,
    range.end,
  )

  const replacementWordIds = replacementWords.map((word) => word.id)
  const replacementWordIdSet = new Set(replacementWordIds)
  const removedWordIds = group.wordIds.filter((wordId) => !replacementWordIdSet.has(wordId))
  const nextWords = [
    ...words.filter((word) => !groupWordIds.has(word.id)),
    ...replacementWords,
  ].sort((left, right) => left.start - right.start || left.end - right.end)

  return {
    words: nextWords,
    changed: true,
    range,
    replacementWordIds,
    removedWordIds,
  }
}

const getExistingWordIds = (words: CaptionWord[], wordIds: string[]) => {
  const wordIdSet = new Set(words.map((word) => word.id))
  return wordIds.filter((wordId) => wordIdSet.has(wordId))
}

const buildDraftGroupsFromWordBlock = (
  draftGroup: CaptionGroup,
  wordIds: string[],
  words: CaptionWord[],
  settings: GroupingSettings,
  breakRanges: Array<{ start: number; end: number }>,
) => {
  const wordMap = new Map(words.map((word) => [word.id, word]))
  const blockWords = wordIds
    .map((wordId) => wordMap.get(wordId))
    .filter((word): word is CaptionWord => Boolean(word))
    .sort((left, right) => left.start - right.start || left.end - right.end)

  if (!blockWords.length) return []

  const wrappedGroups = groupWords(blockWords, settings, { breakRanges })
  return wrappedGroups.map((group, index) => {
    const isFirst = index === 0
    const isLast = index === wrappedGroups.length - 1

    return {
      ...group,
      id: wrappedGroups.length === 1 ? draftGroup.id : `${draftGroup.id}_wrap_${index + 1}`,
      start: isFirst ? draftGroup.start : group.start,
      end: isLast ? draftGroup.end : group.end,
      textOverride: undefined,
    }
  })
}

export const applyCaptionGroupDraftToWords = ({
  breakRanges = [],
  words,
  draftGroups,
  settings,
  createWordId,
}: ApplyCaptionGroupDraftInput): ApplyCaptionGroupDraftResult => {
  let nextWords = words
  const editedRanges: Array<{ start: number; end: number }> = []
  const draftWordBlocks: string[][] = []

  draftGroups.forEach((draftGroup, groupIndex) => {
    const editResult = applyGroupTextEditToWords({
      words: nextWords,
      group: draftGroup,
      text: getGroupDisplayText(draftGroup),
      createWordId: (wordIndex) => createWordId(draftGroup, groupIndex, wordIndex),
    })

    nextWords = editResult.words
    draftWordBlocks.push(
      editResult.changed
        ? editResult.replacementWordIds
        : getExistingWordIds(nextWords, draftGroup.wordIds),
    )

    if (editResult.changed) {
      editedRanges.push(editResult.range)
    }
  })

  const groups = draftGroups.flatMap((draftGroup, index) =>
    buildDraftGroupsFromWordBlock(draftGroup, draftWordBlocks[index] ?? [], nextWords, settings, breakRanges),
  )

  return {
    words: nextWords,
    groups,
    editedRanges,
  }
}
