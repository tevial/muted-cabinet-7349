import type { GroupingSettings } from '../types'

type SettingsPanelProps = {
  settings: GroupingSettings
  onChange: (settings: GroupingSettings) => void
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const update = (key: keyof GroupingSettings, value: number) => {
    onChange({ ...settings, [key]: value })
  }

  return (
    <aside className="panel settings-panel">
      <div className="panel-heading">
        <p className="panel-kicker">Grouping</p>
        <h2>Caption rules</h2>
      </div>

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
          min={0}
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

      <div className="callout">
        Sync is only needed when words are rewritten. Split and merge keep original word timestamps.
      </div>
    </aside>
  )
}

