import { Link2, X } from 'lucide-react'

import type { CaptionGap } from '../../../domain/captions'
import { formatSeconds } from '../../../domain/captions'

type CaptionGapPanelProps = {
  gap?: CaptionGap
  onClose: () => void
  onLink: () => void
}

export function CaptionGapPanel({ gap, onClose, onLink }: CaptionGapPanelProps) {
  if (!gap) return null

  return (
    <section className="timeline-object-panel caption-gap-panel" aria-label="Selected caption gap">
      <div className="timeline-object-header">
        <div>
          <span>Caption gap</span>
          <strong>
            {formatSeconds(gap.start)} - {formatSeconds(gap.end)}
          </strong>
        </div>
        <button className="icon-button" type="button" title="Close caption gap" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <dl className="timeline-object-details">
        <div>
          <dt>Duration</dt>
          <dd>{formatSeconds(gap.duration)}</dd>
        </div>
        <div>
          <dt>Media</dt>
          <dd>Kept</dd>
        </div>
        <div>
          <dt>Captions</dt>
          <dd>Hidden</dd>
        </div>
      </dl>

      <div className="timeline-object-actions">
        <button className="ghost-button" type="button" onClick={onLink}>
          <Link2 size={16} />
          Link captions across gap
        </button>
      </div>
    </section>
  )
}
