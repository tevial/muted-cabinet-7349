import type { RefObject } from 'react'

type WaveSurferTimelineProps = {
  audioUrl?: string
  captionContainerRef: RefObject<HTMLDivElement | null>
  timelineContainerRef: RefObject<HTMLDivElement | null>
  waveformContainerRef: RefObject<HTMLDivElement | null>
}

export function WaveSurferTimeline({
  audioUrl,
  captionContainerRef,
  timelineContainerRef,
  waveformContainerRef,
}: WaveSurferTimelineProps) {
  return (
    <section className="wavesurfer-timeline" data-empty={audioUrl ? 'false' : 'true'}>
      <div ref={timelineContainerRef} className="wavesurfer-time-axis" />
      <div className="wavesurfer-lane waveform-lane">
        <div ref={waveformContainerRef} className="wavesurfer-host" />
      </div>
      <div className="wavesurfer-lane caption-region-lane">
        <div ref={captionContainerRef} className="wavesurfer-host" />
      </div>
    </section>
  )
}
