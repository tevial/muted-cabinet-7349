import type { GroupingSettings, TranscriptionResult } from '../../contracts/captions'
import { groupWords } from './grouping'

export type CaptionIngestResult = {
  result: TranscriptionResult
  sourceGroups: number
}

export const ingestTranscription = (
  result: TranscriptionResult,
  settings: GroupingSettings,
): CaptionIngestResult => {
  const groups = groupWords(result.words, settings)

  return {
    result: {
      ...result,
      text: result.words.map((word) => word.text).join(' '),
      groups,
    },
    sourceGroups: result.groups.length,
  }
}
