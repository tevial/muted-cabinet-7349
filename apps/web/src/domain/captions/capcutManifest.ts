import type { CaptionGroup } from '../../contracts/captions'
import { roundCaptionTime } from './timing'

const minExportDuration = 0.001

export type CapCutPatchManifestRange = {
  start: number
  end: number
}

export type CapCutPatchManifestCaption = CapCutPatchManifestRange & {
  id: string
  text: string
}

export type CapCutPatchManifestSource = {
  audioFingerprint?: string
  fileName?: string
  fileSize?: number
}

export type CapCutPatchManifest = {
  version: 1
  source?: CapCutPatchManifestSource
  duration: number
  keptRanges: CapCutPatchManifestRange[]
  captions: CapCutPatchManifestCaption[]
}

type BuildCapCutPatchManifestInput = {
  groups: CaptionGroup[]
  keptRanges: CapCutPatchManifestRange[]
  source?: CapCutPatchManifestSource
}

const getGroupText = (group: CaptionGroup) => group.textOverride?.trim() || group.text.trim()

const normalizeRange = (range: CapCutPatchManifestRange): CapCutPatchManifestRange | undefined => {
  const start = roundCaptionTime(Math.max(0, range.start))
  const end = roundCaptionTime(Math.max(start, range.end))

  return end - start >= minExportDuration ? { start, end } : undefined
}

const getManifestDuration = (
  ranges: CapCutPatchManifestRange[],
  captions: CapCutPatchManifestCaption[],
) => roundCaptionTime(Math.max(0, ...ranges.map((range) => range.end), ...captions.map((caption) => caption.end)))

export const buildCapCutPatchManifest = ({
  groups,
  keptRanges,
  source,
}: BuildCapCutPatchManifestInput): CapCutPatchManifest => {
  const captions = groups.flatMap((group) => {
    const range = normalizeRange(group)
    const text = getGroupText(group)

    if (!range || !text) return []

    return [{
      ...range,
      id: group.id,
      text,
    }]
  })
  const normalizedKeptRanges = keptRanges.flatMap((range) => {
    const normalized = normalizeRange(range)
    return normalized ? [normalized] : []
  })

  return {
    version: 1,
    source,
    duration: getManifestDuration(normalizedKeptRanges, captions),
    keptRanges: normalizedKeptRanges,
    captions,
  }
}
