import { RefreshCcw, Scissors, X } from 'lucide-react'

import type {
  CapCutLocalAgentStatus,
  CapCutPatchSummary,
  CapCutProjectSummary,
} from '../../../services/capcut/capcutClient'

type CapCutProjectPatchDialogProps = {
  agent?: CapCutLocalAgentStatus
  canPatch: boolean
  error?: string
  isBusy: boolean
  isLoadingProjects: boolean
  isOpen: boolean
  projects: CapCutProjectSummary[]
  projectPath: string
  summary?: CapCutPatchSummary
  onClose: () => void
  onDryRun: () => void
  onPatch: () => void
  onProjectPathChange: (projectPath: string) => void
  onRefreshProjects: () => void
}

const formatDuration = (seconds?: number) => {
  if (seconds === undefined) return 'unknown'

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainingSeconds}`
}

export function CapCutProjectPatchDialog({
  agent,
  canPatch,
  error,
  isBusy,
  isLoadingProjects,
  isOpen,
  projects,
  projectPath,
  summary,
  onClose,
  onDryRun,
  onPatch,
  onProjectPathChange,
  onRefreshProjects,
}: CapCutProjectPatchDialogProps) {
  if (!isOpen) return null

  const showProjectList = Boolean(agent?.enabled && agent.rootExists && projects.length)
  const agentLabel = agent?.enabled
    ? agent.rootExists
      ? 'Local agent'
      : 'Manual path'
    : 'Manual path'

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="capcut-patch-dialog" role="dialog" aria-modal="true" aria-label="Patch CapCut project">
        <div className="popover-title-row">
          <div>
            <p className="panel-kicker">CapCut</p>
            <h2>Patch project</h2>
          </div>
          <button className="icon-button" type="button" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="capcut-agent-row">
          <span className="capcut-agent-status">{agentLabel}</span>
          <button className="icon-button" type="button" title="Refresh projects" onClick={onRefreshProjects}>
            <RefreshCcw size={15} />
          </button>
        </div>

        {showProjectList ? (
          <div className="capcut-project-list" aria-label="CapCut projects">
            {projects.map((project) => (
              <button
                className={`capcut-project-card${project.projectPath === projectPath ? ' is-selected' : ''}`}
                key={project.projectPath}
                type="button"
                onClick={() => onProjectPathChange(project.projectPath)}
              >
                {project.coverUrl ? (
                  <img src={project.coverUrl} alt="" />
                ) : (
                  <span className="capcut-project-placeholder">
                    <Scissors size={18} />
                  </span>
                )}
                <span>
                  <strong>{project.name}</strong>
                  <em>{formatDuration(project.duration)} · {project.supported ? 'Supported' : 'Check needed'}</em>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <label className="field">
          <span>Project path</span>
          <input
            type="text"
            value={projectPath}
            placeholder="/Users/.../Movies/CapCut/User Data/Projects/com.lveditor.draft/0531"
            onChange={(event) => onProjectPathChange(event.target.value)}
          />
        </label>

        {error ? <p className="capcut-patch-error">{error}</p> : null}

        {summary ? (
          <dl className="capcut-patch-summary">
            <div>
              <dt>Input</dt>
              <dd>{formatDuration(summary.inputDuration)}</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>{formatDuration(summary.outputDuration)}</dd>
            </div>
            <div>
              <dt>Video</dt>
              <dd>{summary.videoSegments}</dd>
            </div>
            <div>
              <dt>Captions</dt>
              <dd>{summary.captionSegments}</dd>
            </div>
          </dl>
        ) : null}

        <div className="capcut-patch-actions">
          <button className="ghost-button" type="button" disabled={!canPatch || isBusy} onClick={onDryRun}>
            Dry run
          </button>
          <button className="primary-button" type="button" disabled={!canPatch || isBusy} onClick={onPatch}>
            {isBusy ? 'Patching' : 'Patch project'}
          </button>
        </div>

        {isLoadingProjects ? <p className="capcut-patch-note">Loading projects...</p> : null}
      </section>
    </div>
  )
}
