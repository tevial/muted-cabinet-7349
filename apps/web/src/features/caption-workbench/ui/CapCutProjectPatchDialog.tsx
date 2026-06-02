import { RefreshCcw, Scissors, X } from 'lucide-react'

import type {
  CapCutLocalAgentStatus,
  CapCutPatchSummary,
  CapCutProjectSummary,
} from '../../../services/capcut/capcutClient'
import { cx } from '../../../shared/ui/classNames'
import { ui } from '../../../shared/ui/styles'

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

const getCaptionCleanupLabel = (summary?: CapCutPatchSummary) => {
  const cleanup = summary?.captionSanitizer
  if (!cleanup) return undefined

  const changed =
    cleanup.inputSegments !== cleanup.outputSegments ||
    cleanup.droppedShortSegments > 0 ||
    cleanup.trimmedOverlaps > 0 ||
    cleanup.droppedAfterOverlapTrim > 0

  if (!changed) return undefined

  return [
    cleanup.droppedShortSegments ? `${cleanup.droppedShortSegments} short removed` : undefined,
    cleanup.trimmedOverlaps ? `${cleanup.trimmedOverlaps} overlap trimmed` : undefined,
    cleanup.droppedAfterOverlapTrim ? `${cleanup.droppedAfterOverlapTrim} trimmed caption removed` : undefined,
  ].filter(Boolean).join(' · ')
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
  const captionCleanupLabel = getCaptionCleanupLabel(summary)

  return (
    <div className={ui.modalBackdrop} role="presentation">
      <section className={ui.dialog} role="dialog" aria-modal="true" aria-label="Patch CapCut project">
        <div className={ui.popoverTitleRow}>
          <div>
            <p className={ui.panelKicker}>CapCut</p>
            <h2 className={ui.title}>Patch project</h2>
          </div>
          <button className={ui.iconButton} type="button" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={ui.agentRow}>
          <span className={ui.agentStatus}>{agentLabel}</span>
          <button className={ui.iconButton} type="button" title="Refresh projects" onClick={onRefreshProjects}>
            <RefreshCcw size={15} />
          </button>
        </div>

        {showProjectList ? (
          <div className={ui.projectList} aria-label="CapCut projects">
            {projects.map((project) => (
              <button
                className={cx(ui.projectCard, project.projectPath === projectPath && ui.projectCardSelected)}
                key={project.projectPath}
                type="button"
                onClick={() => onProjectPathChange(project.projectPath)}
              >
                {project.coverUrl ? (
                  <img className={ui.projectThumb} src={project.coverUrl} alt="" />
                ) : (
                  <span className={ui.projectPlaceholder}>
                    <Scissors size={18} />
                  </span>
                )}
                <span>
                  <strong className={ui.projectName}>{project.name}</strong>
                  <em className={ui.projectMeta}>{formatDuration(project.duration)} · {project.supported ? 'Supported' : 'Check needed'}</em>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <label className={ui.field}>
          <span>Project path</span>
          <input
            className={ui.fieldInput}
            type="text"
            value={projectPath}
            placeholder="/Users/.../Movies/CapCut/User Data/Projects/com.lveditor.draft/0531"
            onChange={(event) => onProjectPathChange(event.target.value)}
          />
        </label>

        {error ? <p className={ui.errorText}>{error}</p> : null}

        {summary ? (
          <>
            <dl className={ui.patchSummary}>
              <div className={ui.patchSummaryCard}>
                <dt className={ui.patchSummaryTerm}>Input</dt>
                <dd className={ui.patchSummaryValue}>{formatDuration(summary.inputDuration)}</dd>
              </div>
              <div className={ui.patchSummaryCard}>
                <dt className={ui.patchSummaryTerm}>Output</dt>
                <dd className={ui.patchSummaryValue}>{formatDuration(summary.outputDuration)}</dd>
              </div>
              <div className={ui.patchSummaryCard}>
                <dt className={ui.patchSummaryTerm}>Media</dt>
                <dd className={ui.patchSummaryValue}>{summary.mediaSegments ?? summary.videoSegments}</dd>
              </div>
              <div className={ui.patchSummaryCard}>
                <dt className={ui.patchSummaryTerm}>Video</dt>
                <dd className={ui.patchSummaryValue}>{summary.videoSegments}</dd>
              </div>
              <div className={ui.patchSummaryCard}>
                <dt className={ui.patchSummaryTerm}>Audio</dt>
                <dd className={ui.patchSummaryValue}>{summary.audioSegments ?? 0}</dd>
              </div>
              <div className={ui.patchSummaryCard}>
                <dt className={ui.patchSummaryTerm}>Captions</dt>
                <dd className={ui.patchSummaryValue}>{summary.captionSegments}</dd>
              </div>
            </dl>
            {captionCleanupLabel ? (
              <p className={ui.noteText}>Caption cleanup: {captionCleanupLabel}</p>
            ) : null}
          </>
        ) : null}

        <div className={ui.actionsRow}>
          <button className={ui.ghostButton} type="button" disabled={!canPatch || isBusy} onClick={onDryRun}>
            Dry run
          </button>
          <button className={ui.primaryButton} type="button" disabled={!canPatch || isBusy} onClick={onPatch}>
            {isBusy ? 'Patching' : 'Patch project'}
          </button>
        </div>

        {isLoadingProjects ? <p className={ui.noteText}>Loading projects...</p> : null}
      </section>
    </div>
  )
}
