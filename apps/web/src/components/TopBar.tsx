import { useState, type ReactNode } from 'react'
import {
  Database,
  Download,
  FileAudio,
  FileJson,
  FolderOpen,
  RefreshCcw,
  Save,
  Scissors,
  Settings as SettingsIcon,
  Redo2,
  Undo2,
  WandSparkles,
  X,
} from 'lucide-react'

type TopBarProps = {
  canExport: boolean
  canExportCutManifest: boolean
  canRedo: boolean
  canSaveProject: boolean
  canTranscribe: boolean
  canUndo: boolean
  hasCachedTranscript: boolean
  isTranscribing: boolean
  settingsContent: ReactNode
  onFileChange: (file: File) => void
  onLoadCachedTranscript: () => void
  onTranscribe: () => void
  onRegroup: () => void
  onSaveProject: () => void
  onExportCapCutManifest: () => void
  onExportSrt: () => void
  onOpenCapCutImport: () => void
  onOpenCapCutPatch: () => void
  onRedo: () => void
  onUndo: () => void
}

export function TopBar({
  canExport,
  canExportCutManifest,
  canRedo,
  canSaveProject,
  canTranscribe,
  canUndo,
  hasCachedTranscript,
  isTranscribing,
  settingsContent,
  onFileChange,
  onLoadCachedTranscript,
  onTranscribe,
  onRegroup,
  onSaveProject,
  onExportCapCutManifest,
  onExportSrt,
  onOpenCapCutImport,
  onOpenCapCutPatch,
  onRedo,
  onUndo,
}: TopBarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

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
          title="Load a local CapCut project through the Local Agent"
          onClick={onOpenCapCutImport}
        >
          <FolderOpen size={17} />
          Load CapCut
        </button>
        <button
          className="ghost-button"
          type="button"
          title="Rebuild caption groups from current words and caption rules"
          onClick={onRegroup}
        >
          <RefreshCcw size={17} />
          Regroup
        </button>
        <button className="icon-button" type="button" title="Undo" disabled={!canUndo} onClick={onUndo}>
          <Undo2 size={16} />
        </button>
        <button className="icon-button" type="button" title="Redo" disabled={!canRedo} onClick={onRedo}>
          <Redo2 size={16} />
        </button>
        <button className="ghost-button" type="button" disabled={!canSaveProject} onClick={onSaveProject}>
          <Save size={17} />
          Save Project
        </button>
        <div className="toolbar-popover-anchor">
          <button
            className="ghost-button"
            type="button"
            aria-expanded={isSettingsOpen}
            aria-controls="caption-settings-popover"
            onClick={() => setIsSettingsOpen((current) => !current)}
          >
            <SettingsIcon size={17} />
            Settings
          </button>
          {isSettingsOpen ? (
            <div
              id="caption-settings-popover"
              className="settings-popover"
              role="dialog"
              aria-label="Caption settings"
            >
              <div className="popover-title-row">
                <strong>Settings</strong>
                <button
                  className="icon-button"
                  type="button"
                  title="Close settings"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              {settingsContent}
            </div>
          ) : null}
        </div>
        <button className="primary-button" type="button" disabled={!canExport} onClick={onExportSrt}>
          <Download size={17} />
          Export SRT
        </button>
        <button
          className="ghost-button"
          type="button"
          disabled={!canExportCutManifest}
          title="Export JSON manifest for CapCut draft patching"
          onClick={onExportCapCutManifest}
        >
          <FileJson size={17} />
          Export Cut JSON
        </button>
        <button
          className="ghost-button"
          type="button"
          disabled={!canExportCutManifest}
          title="Patch a local CapCut project"
          onClick={onOpenCapCutPatch}
        >
          <FolderOpen size={17} />
          Patch CapCut
        </button>
      </nav>
    </header>
  )
}
