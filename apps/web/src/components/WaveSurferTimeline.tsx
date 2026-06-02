import type { CSSProperties, RefObject } from 'react'

import { cx } from '../shared/ui/classNames'
import { ui } from '../shared/ui/styles'

type WaveSurferTimelineProps = {
  audioUrl?: string
  captionContainerRef: RefObject<HTMLDivElement | null>
  minimapControlRef: RefObject<HTMLDivElement | null>
  minimapContainerRef: RefObject<HTMLDivElement | null>
  minimapSelectionRef: RefObject<HTMLDivElement | null>
  minimapViewportRef: RefObject<HTMLDivElement | null>
  timelineSurfaceRef: RefObject<HTMLElement | null>
  timelineContainerRef: RefObject<HTMLDivElement | null>
  timelineHoverGuideRef: RefObject<HTMLDivElement | null>
  timelineHoverLabelRef: RefObject<HTMLSpanElement | null>
  timelineGridStepPx: number
  waveformContainerRef: RefObject<HTMLDivElement | null>
}

export function WaveSurferTimeline({
  audioUrl,
  captionContainerRef,
  minimapControlRef,
  minimapContainerRef,
  minimapSelectionRef,
  minimapViewportRef,
  timelineSurfaceRef,
  timelineContainerRef,
  timelineHoverGuideRef,
  timelineHoverLabelRef,
  timelineGridStepPx,
  waveformContainerRef,
}: WaveSurferTimelineProps) {
  const timelineStyle = {
    '--timeline-grid-step': `${Math.max(1, timelineGridStepPx)}px`,
  } as CSSProperties

  return (
    <section
      ref={timelineSurfaceRef}
      className={cx('timeline-grid-surface', ui.wavesurferTimeline)}
      data-empty={audioUrl ? 'false' : 'true'}
      style={timelineStyle}
    >
      <div className={ui.timelineGridFadeTop} aria-hidden="true" />
      <div className={ui.timelineGridFadeBottom} aria-hidden="true" />
      <div ref={timelineHoverGuideRef} className={ui.timelineHoverGuide} aria-hidden="true">
        <span ref={timelineHoverLabelRef} className={ui.timelineHoverLabel} />
      </div>
      <div ref={timelineContainerRef} className={cx('wavesurfer-time-axis', ui.wavesurferTimeAxis)} />
      <div className={cx('wavesurfer-lane waveform-lane', ui.wavesurferLane)}>
        <div ref={waveformContainerRef} className={ui.wavesurferHost} />
      </div>
      <div className={cx('wavesurfer-lane caption-region-lane', ui.wavesurferLane)}>
        <div ref={captionContainerRef} className={ui.wavesurferHost} />
      </div>
      <div className={ui.wavesurferMinimapLane}>
        <div ref={minimapContainerRef} className={cx('wavesurfer-minimap-host', ui.wavesurferMinimapHost)} />
        <div
          ref={minimapControlRef}
          className={cx('wavesurfer-minimap-control', ui.wavesurferMinimapControl)}
          aria-label="Timeline minimap navigation"
        >
          <div
            ref={minimapViewportRef}
            className={cx('wavesurfer-minimap-viewport', ui.wavesurferMinimapViewport)}
          />
          <div
            ref={minimapSelectionRef}
            className={cx('wavesurfer-minimap-selection', ui.wavesurferMinimapSelection)}
          />
        </div>
      </div>
    </section>
  )
}
