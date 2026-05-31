import { ExternalLink, Loader2, X } from 'lucide-react'

import type { CapCutSourceCutBoundary, CapCutSourcePreview } from '../../../contracts/capcut'
import { formatSeconds } from '../../../domain/captions'

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
    <section className="capcut-source-cut-panel" aria-label="Selected CapCut source cut">
      <div className="source-cut-header">
        <div>
          <span>Source cut</span>
          <strong>{formatSeconds(boundary.projectPosition)}</strong>
        </div>
        <button className="icon-button" type="button" title="Close source cut" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <dl className="source-cut-details">
        <div>
          <dt>Hidden source</dt>
          <dd>
            {formatSeconds(boundary.hiddenSourceStart)} - {formatSeconds(boundary.hiddenSourceEnd)}
          </dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatSeconds(boundary.hiddenDuration)}</dd>
        </div>
        <div>
          <dt>Media</dt>
          <dd title={boundary.mediaPath}>{boundary.materialName || getSourceName(boundary.mediaPath)}</dd>
        </div>
      </dl>

      <div className="source-cut-actions">
        <button className="ghost-button" type="button" disabled={isLoadingPreview} onClick={onLoadPreview}>
          {isLoadingPreview ? <Loader2 size={16} /> : <ExternalLink size={16} />}
          {isLoadingPreview ? 'Rendering preview' : 'Preview hidden range'}
        </button>
      </div>

      {error ? <p className="capcut-patch-error">{error}</p> : null}

      {preview ? (
        <audio className="source-cut-audio" src={preview.url} controls preload="metadata" />
      ) : null}

      <p className="source-cut-note">Restore writes are the next CapCut draft step.</p>
    </section>
  )
}
