import { FileVideo, RefreshCcw, X } from 'lucide-react'

import type {
  CapCutLocalAgentStatus,
  CapCutProjectSummary,
} from '../../../services/capcut/capcutClient'
import { cx } from '../../../shared/ui/classNames'
import { ui } from '../../../shared/ui/styles'

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
    <div className={ui.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={ui.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Load CapCut project"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={ui.popoverTitleRow}>
          <div>
            <strong>Load CapCut project</strong>
            <p className={ui.noteText}>Import timeline structure and render per-track audio stems.</p>
          </div>
          <button className={ui.iconButton} type="button" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={ui.agentRow}>
          <span className={ui.agentStatus}>
            {agent?.enabled ? 'Local Agent on' : 'Manual project path'}
          </span>
          <button className={ui.ghostButton} type="button" disabled={isLoadingProjects || isBusy} onClick={onRefreshProjects}>
            <RefreshCcw size={16} />
            {isLoadingProjects ? 'Scanning' : 'Refresh'}
          </button>
        </div>

        {projects.length ? (
          <div className={ui.projectList} aria-label="CapCut projects">
            {projects.map((project) => (
              <button
                className={cx(ui.projectCard, project.projectPath === projectPath && ui.projectCardSelected)}
                key={project.id}
                type="button"
                onClick={() => onProjectPathChange(project.projectPath)}
              >
                {project.coverUrl ? (
                  <img className={ui.projectThumb} src={project.coverUrl} alt="" />
                ) : (
                  <span className={ui.projectPlaceholder}>
                    <FileVideo size={18} />
                  </span>
                )}
                <span>
                  <strong className={ui.projectName}>{project.name}</strong>
                  <em className={ui.projectMeta}>{project.tracks.length} tracks · {project.duration?.toFixed(1) ?? '0.0'}s</em>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className={ui.noteText}>
            {isLoadingProjects ? 'Scanning local CapCut projects...' : 'No local CapCut projects were found.'}
          </p>
        )}

        <label className={ui.field}>
          Project path
          <input
            className={ui.fieldInput}
            type="text"
            value={projectPath}
            placeholder="/Users/.../Movies/CapCut/User Data/Projects/com.lveditor.draft/..."
            onChange={(event) => onProjectPathChange(event.target.value)}
          />
        </label>

        {error ? <p className={ui.errorText}>{error}</p> : null}

        <div className={ui.actionsRow}>
          <button className={ui.ghostButton} type="button" onClick={onClose}>
            Cancel
          </button>
          <button className={ui.primaryButton} type="button" disabled={isBusy || !projectPath.trim()} onClick={onImport}>
            {isBusy ? 'Importing' : 'Import project'}
          </button>
        </div>
      </section>
    </div>
  )
}
