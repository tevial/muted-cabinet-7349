import { FileVideo, RefreshCcw, X } from 'lucide-react'

import type {
  CapCutLocalAgentStatus,
  CapCutProjectSummary,
} from '../../../services/capcut/capcutClient'

type CapCutProjectImportDialogProps = {
  agent?: CapCutLocalAgentStatus
  error?: string
  isBusy: boolean
  isLoadingProjects: boolean
  isOpen: boolean
  projects: CapCutProjectSummary[]
  projectPath: string
  onClose: () => void
  onImport: () => void
  onProjectPathChange: (projectPath: string) => void
  onRefreshProjects: () => void
}

export function CapCutProjectImportDialog({
  agent,
  error,
  isBusy,
  isLoadingProjects,
  isOpen,
  projects,
  projectPath,
  onClose,
  onImport,
  onProjectPathChange,
  onRefreshProjects,
}: CapCutProjectImportDialogProps) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="capcut-patch-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Load CapCut project"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="popover-title-row">
          <div>
            <strong>Load CapCut project</strong>
            <p className="capcut-patch-note">Import timeline structure and render per-track audio stems.</p>
          </div>
          <button className="icon-button" type="button" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="capcut-agent-row">
          <span className="capcut-agent-status">
            {agent?.enabled ? 'Local Agent on' : 'Manual project path'}
          </span>
          <button className="ghost-button" type="button" disabled={isLoadingProjects || isBusy} onClick={onRefreshProjects}>
            <RefreshCcw size={16} />
            {isLoadingProjects ? 'Scanning' : 'Refresh'}
          </button>
        </div>

        {projects.length ? (
          <div className="capcut-project-list" aria-label="CapCut projects">
            {projects.map((project) => (
              <button
                className={`capcut-project-card${project.projectPath === projectPath ? ' is-selected' : ''}`}
                key={project.id}
                type="button"
                onClick={() => onProjectPathChange(project.projectPath)}
              >
                {project.coverUrl ? (
                  <img src={project.coverUrl} alt="" />
                ) : (
                  <span className="capcut-project-placeholder">
                    <FileVideo size={18} />
                  </span>
                )}
                <span>
                  <strong>{project.name}</strong>
                  <em>{project.tracks.length} tracks · {project.duration?.toFixed(1) ?? '0.0'}s</em>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="capcut-patch-note">
            {isLoadingProjects ? 'Scanning local CapCut projects...' : 'No local CapCut projects were found.'}
          </p>
        )}

        <label className="field">
          Project path
          <input
            type="text"
            value={projectPath}
            placeholder="/Users/.../Movies/CapCut/User Data/Projects/com.lveditor.draft/..."
            onChange={(event) => onProjectPathChange(event.target.value)}
          />
        </label>

        {error ? <p className="capcut-patch-error">{error}</p> : null}

        <div className="capcut-patch-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" disabled={isBusy || !projectPath.trim()} onClick={onImport}>
            {isBusy ? 'Importing' : 'Import project'}
          </button>
        </div>
      </section>
    </div>
  )
}
