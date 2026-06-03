import type { RefObject } from 'react'

import { cx } from '../shared/ui/classNames'
import { ui } from '../shared/ui/styles'

type WaveSurferTimelineProps = {
  audioUrl?: string
  captionContainerRef: RefObject<HTMLDivElement | null>
  interactionContainerRef: RefObject<HTMLDivElement | null>
  minimapContainerRef: RefObject<HTMLDivElement | null>
  timelineSurfaceRef: RefObject<HTMLElement | null>
  waveformContainerRef: RefObject<HTMLDivElement | null>
}

export function WaveSurferTimeline({
  audioUrl,
  captionContainerRef,
  interactionContainerRef,
  minimapContainerRef,
  timelineSurfaceRef,
  waveformContainerRef,
}: WaveSurferTimelineProps) {
  return (
    <section
      ref={timelineSurfaceRef}
      className={cx('timeline-surface', ui.wavesurferTimeline)}
      data-empty={audioUrl ? 'false' : 'true'}
    >
      <div className={ui.timelineFadeTop} aria-hidden="true" />
      <div className={ui.timelineFadeBottom} aria-hidden="true" />
      <div ref={interactionContainerRef} className={cx('wavesurfer-interaction-host', ui.wavesurferInteractionHost)} />
      <div className={cx('wavesurfer-lane waveform-lane', ui.wavesurferLane)}>
        <div ref={waveformContainerRef} className={ui.wavesurferHost} />
      </div>
      <div className={cx('wavesurfer-lane caption-region-lane', ui.wavesurferLane)}>
        <div ref={captionContainerRef} className={ui.wavesurferHost} />
      </div>
      <div className={ui.wavesurferMinimapLane}>
        <div ref={minimapContainerRef} className={cx('wavesurfer-minimap-host', ui.wavesurferMinimapHost)} />
      </div>
    </section>
  )
}
