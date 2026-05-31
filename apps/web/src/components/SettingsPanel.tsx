import type { GroupingSettings } from '../types'

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
  onLanguageChange: (language: string) => void
  onChange: (settings: GroupingSettings) => void
}

export function SettingsPanel({ language, stats, settings, onLanguageChange, onChange }: SettingsPanelProps) {
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
    <aside className="panel settings-panel">
      <div className="panel-heading">
        <p className="panel-kicker">Grouping</p>
        <h2>Caption rules</h2>
      </div>

      <div className="mini-stats" aria-label="Caption statistics">
        {statItems.map((item) => (
          <div key={item.label}>
            <span>{item.value}</span>
            <p>{item.label}</p>
          </div>
        ))}
      </div>

      <label className="field">
        <span>Language hint</span>
        <input
          value={language}
          placeholder="uk, ru, en..."
          onChange={(event) => onLanguageChange(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Max words</span>
        <input
          type="number"
          min={1}
          max={6}
          value={settings.maxWords}
          onChange={(event) => update('maxWords', Number(event.target.value))}
        />
      </label>

      <label className="field">
        <span>Min duration</span>
        <input
          type="number"
          min={0.05}
          step={0.05}
          value={settings.minDuration}
          onChange={(event) => update('minDuration', Number(event.target.value))}
        />
      </label>

      <label className="field">
        <span>Max chars</span>
        <input
          type="number"
          min={8}
          value={settings.maxChars}
          onChange={(event) => update('maxChars', Number(event.target.value))}
        />
      </label>

      <label className="field">
        <span>Pause split</span>
        <input
          type="number"
          min={0}
          step={0.05}
          value={settings.pauseThreshold}
          onChange={(event) => update('pauseThreshold', Number(event.target.value))}
        />
      </label>

      <label className="field checkbox-field">
        <input
          type="checkbox"
          checked={settings.trimEmptyZones}
          onChange={(event) => update('trimEmptyZones', event.target.checked)}
        />
        <span>Trim empty zones</span>
      </label>

      <label className="field">
        <span>Empty if no words for</span>
        <input
          type="number"
          min={0}
          step={0.05}
          disabled={!settings.trimEmptyZones}
          value={settings.emptyZoneThreshold}
          onChange={(event) => update('emptyZoneThreshold', Number(event.target.value))}
        />
      </label>

      <div className="callout">
        Word-timestamp gaps are legacy suggestions. Use waveform-detected skip zones for controlled CapCut cuts.
      </div>
    </aside>
  )
}
