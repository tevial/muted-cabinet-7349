import { Database, FileUp, PlayCircle, WandSparkles } from 'lucide-react'

type ImportPanelProps = {
  fileName?: string
  language: string
  status: string
  hasCachedTranscript: boolean
  isTranscribing: boolean
  onLanguageChange: (language: string) => void
  onFileChange: (file: File) => void
  onLoadSample: () => void
  onLoadCachedTranscript: () => void
  onTranscribe: () => void
}

export function ImportPanel({
  fileName,
  language,
  status,
  hasCachedTranscript,
  isTranscribing,
  onLanguageChange,
  onFileChange,
  onLoadSample,
  onLoadCachedTranscript,
  onTranscribe,
}: ImportPanelProps) {
  return (
    <aside className="panel import-panel">
      <div className="panel-heading">
        <p className="panel-kicker">Source</p>
        <h2>Audio in, timed words out</h2>
      </div>

      <label className="dropzone">
        <FileUp size={22} />
        <span>{fileName || 'Choose audio or video'}</span>
        <input
          id="source-file"
          type="file"
          accept="audio/*,video/*"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onFileChange(file)
          }}
        />
      </label>

      <label className="field">
        <span>Language hint</span>
        <input
          value={language}
          placeholder="uk, ru, en..."
          onChange={(event) => onLanguageChange(event.target.value)}
        />
      </label>

      <div className="stack">
        <button className="primary-button full" type="button" disabled={!fileName || isTranscribing} onClick={onTranscribe}>
          <WandSparkles size={17} />
          {isTranscribing ? 'Transcribing...' : 'Transcribe with word timing'}
        </button>
        {hasCachedTranscript ? (
          <button className="ghost-button full" type="button" disabled={isTranscribing} onClick={onLoadCachedTranscript}>
            <Database size={17} />
            Load cached transcript
          </button>
        ) : null}
        <button className="ghost-button full" type="button" onClick={onLoadSample}>
          <PlayCircle size={17} />
          Load sample words
        </button>
      </div>

      <p className="status-line">{status}</p>
    </aside>
  )
}
