import type { GroupingSettings, TranscriptionResult } from '../../contracts/captions'
import { groupWords } from './grouping'

export type CaptionIngestResult = {
  result: TranscriptionResult
  sourceGroups: number
}

const meaningfulCaptionTextPattern = /[\p{L}\p{N}]/u

export const isMeaningfulCaptionWord = (text: string) => meaningfulCaptionTextPattern.test(text.trim())

export const sanitizeCaptionWords = (words: TranscriptionResult['words']) =>
  words.filter((word) => isMeaningfulCaptionWord(word.text))

export const ingestTranscription = (
  result: TranscriptionResult,
  settings: GroupingSettings,
): CaptionIngestResult => {
  const words = sanitizeCaptionWords(result.words)
  const groups = groupWords(words, settings)

  return {
    result: {
      ...result,
      text: words.map((word) => word.text).join(' '),
      words,
      groups,
    },
    sourceGroups: result.groups.length,
  }
}
