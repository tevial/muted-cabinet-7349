import { Database, Download, FileAudio, RefreshCcw, Save, Scissors, WandSparkles } from 'lucide-react'

type TopBarProps = {
  canExport: boolean
  canTranscribe: boolean
  hasCachedTranscript: boolean
  isTranscribing: boolean
  onFileChange: (file: File) => void
  onLoadCachedTranscript: () => void
  onTranscribe: () => void
  onRegroup: () => void
  onSaveProject: () => void
  onExportSrt: () => void
}

export function TopBar({
  canExport,
  canTranscribe,
  hasCachedTranscript,
  isTranscribing,
  onFileChange,
  onLoadCachedTranscript,
  onTranscribe,
  onRegroup,
  onSaveProject,
  onExportSrt,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <Scissors size={18} />
        </div>
        <div>
          <span className="brand-title">CapCut Caption</span>
          <span className="brand-subtitle">word-level caption editor</span>
        </div>
      </div>

      <nav className="toolbar" aria-label="Primary actions">
        <label className="ghost-button" htmlFor="source-file" title="Choose audio or video source">
          <FileAudio size={17} />
          Upload
          <input
            id="source-file"
            className="source-file-input"
            type="file"
            accept="audio/*,video/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) onFileChange(file)
              event.currentTarget.value = ''
            }}
          />
        </label>
        <button className="ghost-button" type="button" disabled={!canTranscribe || isTranscribing} onClick={onTranscribe}>
          <WandSparkles size={17} />
          {isTranscribing ? 'Transcribing' : 'Transcribe'}
        </button>
        {hasCachedTranscript ? (
          <button className="ghost-button" type="button" disabled={isTranscribing} onClick={onLoadCachedTranscript}>
            <Database size={17} />
            Load Cache
          </button>
        ) : null}
        <button
          className="ghost-button"
          type="button"
          title="Rebuild caption groups from current words and caption rules"
          onClick={onRegroup}
        >
          <RefreshCcw size={17} />
          Regroup
        </button>
        <button className="ghost-button" type="button" onClick={onSaveProject}>
          <Save size={17} />
          Save Project
        </button>
        <button className="primary-button" type="button" disabled={!canExport} onClick={onExportSrt}>
          <Download size={17} />
          Export SRT
        </button>
      </nav>
    </header>
  )
}
