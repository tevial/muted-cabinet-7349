import { Download, FileAudio, RefreshCcw, Scissors, WandSparkles } from 'lucide-react'

type TopBarProps = {
  canExport: boolean
  canTranscribe: boolean
  isTranscribing: boolean
  onTranscribe: () => void
  onRegroup: () => void
  onExportSrt: () => void
}

export function TopBar({
  canExport,
  canTranscribe,
  isTranscribing,
  onTranscribe,
  onRegroup,
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
        <label className="ghost-button" htmlFor="source-file">
          <FileAudio size={17} />
          Upload
        </label>
        <button className="ghost-button" type="button" disabled={!canTranscribe || isTranscribing} onClick={onTranscribe}>
          <WandSparkles size={17} />
          {isTranscribing ? 'Transcribing' : 'Transcribe'}
        </button>
        <button className="ghost-button" type="button" onClick={onRegroup}>
          <RefreshCcw size={17} />
          Regroup
        </button>
        <button className="primary-button" type="button" disabled={!canExport} onClick={onExportSrt}>
          <Download size={17} />
          Export SRT
        </button>
      </nav>
    </header>
  )
}
