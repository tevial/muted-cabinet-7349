import type { GroupingSettings } from '../types'
import { ui } from '../shared/ui/styles'

export type CaptionStats = {
  words: number
  groups: number
  averageWords: string
  duration: string
}

type SettingsPanelProps = {
  language: string
  stats: CaptionStats
  settings: GroupingSettings
  variant?: 'panel' | 'popover'
  onLanguageChange: (language: string) => void
  onChange: (settings: GroupingSettings) => void
}

export function SettingsPanel({
  language,
  stats,
  settings,
  variant = 'panel',
  onLanguageChange,
  onChange,
}: SettingsPanelProps) {
  const update = <K extends keyof GroupingSettings>(key: K, value: GroupingSettings[K]) => {
    onChange({ ...settings, [key]: value })
  }

  const statItems = [
    { label: 'Words', value: stats.words },
    { label: 'Blocks', value: stats.groups },
    { label: 'Words/block', value: stats.averageWords },
    { label: 'Range', value: stats.duration },
  ]

  return (
    <aside className={variant === 'popover' ? ui.settingsPopoverPanel : ui.panel}>
      <div className={ui.panelHeading}>
        <p className={ui.panelKicker}>Grouping</p>
        <h2 className={ui.title}>Caption rules</h2>
      </div>

      <div className={ui.miniStats} aria-label="Caption statistics">
        {statItems.map((item) => (
          <div className={ui.miniStatCard} key={item.label}>
            <span className={ui.miniStatValue}>{item.value}</span>
            <p className={ui.miniStatLabel}>{item.label}</p>
          </div>
        ))}
      </div>

      <label className={ui.field}>
        <span>Language hint</span>
        <input
          className={ui.fieldInput}
          value={language}
          placeholder="uk, ru, en..."
          onChange={(event) => onLanguageChange(event.target.value)}
        />
      </label>

      <label className={ui.checkboxField}>
        <input
          className={ui.checkboxInput}
          type="checkbox"
          checked={settings.trimEmptyZones}
          onChange={(event) => update('trimEmptyZones', event.target.checked)}
        />
        <span>Trim empty zones</span>
      </label>

      <label className={ui.field}>
        <span>Empty if no words for</span>
        <input
          className={ui.fieldInput}
          type="number"
          min={0}
          step={0.05}
          disabled={!settings.trimEmptyZones}
          value={settings.emptyZoneThreshold}
          onChange={(event) => update('emptyZoneThreshold', Number(event.target.value))}
        />
      </label>

      <div className={ui.callout}>
        Caption length lives in the Caption groups header. Text edits stay in
        draft until you apply them back to the word layer.
      </div>
    </aside>
  )
}
