import { ExternalLink, Loader2, X } from 'lucide-react'

import type { CapCutSourceCutBoundary, CapCutSourcePreview } from '../../../contracts/capcut'
import { formatSeconds } from '../../../domain/captions'
import { cx } from '../../../shared/ui/classNames'
import { ui } from '../../../shared/ui/styles'

type CapCutSourceCutPanelProps = {
  boundary?: CapCutSourceCutBoundary
  error?: string
  isLoadingPreview: boolean
  preview?: CapCutSourcePreview
  onClose: () => void
  onLoadPreview: () => void
}

const getSourceName = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

export function CapCutSourceCutPanel({
  boundary,
  error,
  isLoadingPreview,
  preview,
  onClose,
  onLoadPreview,
}: CapCutSourceCutPanelProps) {
  if (!boundary) return null

  return (
    <section
      className={cx(ui.timelineObjectPanel, ui.sourceCutPanel, '[--timeline-object-accent:#6f4bbe] [--timeline-object-detail-border:#e4ddee]')}
      aria-label="Selected CapCut source cut"
    >
      <div className={ui.timelineObjectHeader}>
        <div className={ui.timelineObjectHeaderInfo}>
          <span className={ui.timelineObjectLabel}>Source cut</span>
          <strong className={ui.timelineObjectTime}>{formatSeconds(boundary.projectPosition)}</strong>
        </div>
        <button className={ui.iconButton} type="button" title="Close source cut" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <dl className={ui.timelineObjectDetails}>
        <div className={ui.timelineObjectDetailCard}>
          <dt className={ui.timelineObjectDetailTerm}>Hidden source</dt>
          <dd className={ui.timelineObjectDetailValue}>
            {formatSeconds(boundary.hiddenSourceStart)} - {formatSeconds(boundary.hiddenSourceEnd)}
          </dd>
        </div>
        <div className={ui.timelineObjectDetailCard}>
          <dt className={ui.timelineObjectDetailTerm}>Duration</dt>
          <dd className={ui.timelineObjectDetailValue}>{formatSeconds(boundary.hiddenDuration)}</dd>
        </div>
        <div className={ui.timelineObjectDetailCard}>
          <dt className={ui.timelineObjectDetailTerm}>Media</dt>
          <dd className={ui.timelineObjectDetailValue} title={boundary.mediaPath}>{boundary.materialName || getSourceName(boundary.mediaPath)}</dd>
        </div>
      </dl>

      <div className={ui.timelineObjectActions}>
        <button className={ui.ghostButton} type="button" disabled={isLoadingPreview} onClick={onLoadPreview}>
          {isLoadingPreview ? <Loader2 size={16} /> : <ExternalLink size={16} />}
          {isLoadingPreview ? 'Rendering preview' : 'Preview hidden range'}
        </button>
      </div>

      {error ? <p className={ui.errorText}>{error}</p> : null}

      {preview ? (
        <audio className={ui.sourceCutAudio} src={preview.url} controls preload="metadata" />
      ) : null}

      <p className={ui.sourceCutNote}>Restore is not available yet; this stage is preview-only.</p>
    </section>
  )
}
