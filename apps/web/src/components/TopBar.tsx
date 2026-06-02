import { useState, type ReactNode } from 'react'
import {
  Database,
  Download,
  FileAudio,
  FileJson,
  FolderOpen,
  Save,
  Settings as SettingsIcon,
  Redo2,
  Undo2,
  X,
} from 'lucide-react'

import { ui } from '../shared/ui/styles'

type TopBarProps = {
  canExport: boolean
  canExportCutManifest: boolean
  canRedo: boolean
  canSaveProject: boolean
  canUndo: boolean
  hasCachedTranscript: boolean
  settingsContent: ReactNode
  onFileChange: (file: File) => void
  onLoadCachedTranscript: () => void
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
  canUndo,
  hasCachedTranscript,
  settingsContent,
  onFileChange,
  onLoadCachedTranscript,
  onSaveProject,
  onExportCapCutManifest,
  onExportSrt,
  onOpenCapCutImport,
  onOpenCapCutPatch,
  onRedo,
  onUndo,
}: TopBarProps) {
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const canOpenExport = canExport || canExportCutManifest
  const runExportAction = (action: () => void) => {
    setIsExportOpen(false)
    action()
  }

  return (
    <header className={ui.topbar}>
      <nav className={ui.toolbar} aria-label="Primary actions">
        <div className={ui.toolbarGroup}>
          <button
            className={ui.toolbarPrimaryButton}
            type="button"
            title="Load a local CapCut project through the Local Agent"
            onClick={onOpenCapCutImport}
          >
            <FolderOpen size={17} />
            Load CapCut
          </button>
          <label className={ui.toolbarPrimaryButton} htmlFor="source-file" title="Choose audio or video source">
            <FileAudio size={17} />
            Upload
            <input
              id="source-file"
              className={ui.sourceFileInput}
              type="file"
              accept="audio/*,video/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) onFileChange(file)
                event.currentTarget.value = ''
              }}
            />
          </label>
          <button
            className={ui.toolbarSecondaryButton}
            type="button"
            disabled={!hasCachedTranscript}
            onClick={onLoadCachedTranscript}
          >
            <Database size={17} />
            Load Cache
          </button>
        </div>

        <div className={ui.toolbarCenterActions} aria-label="History actions">
          <button className={ui.toolbarIconButton} type="button" title="Undo" disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={16} />
          </button>
          <button className={ui.toolbarIconButton} type="button" title="Redo" disabled={!canRedo} onClick={onRedo}>
            <Redo2 size={16} />
          </button>
        </div>

        <div className={ui.toolbarActions}>
          <div className={ui.toolbarPopoverAnchor}>
            <button
              className={ui.toolbarIconButton}
              type="button"
              title="Settings"
              aria-label="Settings"
              aria-expanded={isSettingsOpen}
              aria-controls="caption-settings-popover"
              onClick={() => {
                setIsExportOpen(false)
                setIsSettingsOpen((current) => !current)
              }}
            >
              <SettingsIcon size={17} />
            </button>
            {isSettingsOpen ? (
              <div
                id="caption-settings-popover"
                className={ui.settingsPopover}
                role="dialog"
                aria-label="Caption settings"
              >
                <div className={ui.popoverTitleRow}>
                  <strong>Settings</strong>
                  <button
                    className={ui.iconButton}
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

          <button className={ui.toolbarSecondaryButton} type="button" disabled={!canSaveProject} onClick={onSaveProject}>
            <Save size={17} />
            Save Project
          </button>

          <div className={ui.toolbarPopoverAnchor}>
            <button
              className={ui.toolbarPrimaryButton}
              type="button"
              disabled={!canOpenExport}
              aria-expanded={isExportOpen}
              aria-controls="caption-export-menu"
              onClick={() => {
                setIsSettingsOpen(false)
                setIsExportOpen((current) => !current)
              }}
            >
              <Download size={17} />
              Export
            </button>
            {isExportOpen ? (
              <div id="caption-export-menu" className={ui.toolbarMenu} role="menu" aria-label="Export actions">
                <button
                  className={ui.toolbarMenuItem}
                  type="button"
                  role="menuitem"
                  disabled={!canExport}
                  onClick={() => runExportAction(onExportSrt)}
                >
                  <Download size={16} />
                  Export to SRT
                </button>
                <button
                  className={ui.toolbarMenuItem}
                  type="button"
                  role="menuitem"
                  disabled={!canExportCutManifest}
                  onClick={() => runExportAction(onExportCapCutManifest)}
                >
                  <FileJson size={16} />
                  Export cut JSON
                </button>
                <button
                  className={ui.toolbarMenuItem}
                  type="button"
                  role="menuitem"
                  disabled={!canExportCutManifest}
                  onClick={() => runExportAction(onOpenCapCutPatch)}
                >
                  <FolderOpen size={16} />
                  Patch CapCut
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </nav>
    </header>
  )
}
