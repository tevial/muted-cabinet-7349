import type { GroupingSettings } from '../../contracts/captions'

export const defaultGroupingSettings: GroupingSettings = {
  maxWords: 3,
  minDuration: 0.26,
  maxChars: 26,
  pauseThreshold: 0.42,
  trimEmptyZones: false,
  emptyZoneThreshold: 0.8,
}

export const normalizeGroupingSettings = (settings?: Partial<GroupingSettings>): GroupingSettings => ({
  ...defaultGroupingSettings,
  ...settings,
  maxWords: Math.max(1, Math.round(settings?.maxWords ?? defaultGroupingSettings.maxWords)),
  minDuration: Math.max(0, settings?.minDuration ?? defaultGroupingSettings.minDuration),
  maxChars: Math.max(1, Math.round(settings?.maxChars ?? defaultGroupingSettings.maxChars)),
  pauseThreshold: Math.max(0, settings?.pauseThreshold ?? defaultGroupingSettings.pauseThreshold),
  trimEmptyZones: Boolean(settings?.trimEmptyZones ?? defaultGroupingSettings.trimEmptyZones),
  emptyZoneThreshold: Math.max(0.05, settings?.emptyZoneThreshold ?? defaultGroupingSettings.emptyZoneThreshold),
})
