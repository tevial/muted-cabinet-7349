import type { CaptionGroup } from '../../contracts/captions'
import { secondsToSrtTime } from './formatting'

export const exportSrt = (groups: CaptionGroup[]) =>
  `${groups
    .map((group, index) => {
      const text = group.textOverride?.trim() || group.text
      return `${index + 1}\n${secondsToSrtTime(group.start)} --> ${secondsToSrtTime(group.end)}\n${text}`
    })
    .join('\n\n')}\n`
