import { useEffect, useRef, useState } from 'react'
import MultiTrack, { type TrackOptions } from 'wavesurfer-multitrack'

import type { CapCutAudioStem } from '../contracts/capcut'
import { formatTimelineLabel, timelineZoomConfig } from '../features/caption-workbench/model/waveSurferTimelineConfig'
import { cx } from '../shared/ui/classNames'
import { ui } from '../shared/ui/styles'

type CapCutMultitrackPreviewProps = {
  stems: CapCutAudioStem[]
  zoomLevel: number
}

const toTrackOptions = (stem: CapCutAudioStem, index: number): TrackOptions => ({
  id: stem.id,
  url: stem.url,
  draggable: false,
  startPosition: 0,
  volume: 1,
  options: {
    height: 56,
    waveColor: index % 2 === 0 ? '#cfe5df' : '#d9d7ef',
    progressColor: index % 2 === 0 ? '#14927f' : '#6f4bbe',
    normalize: true,
  },
})

export function CapCutMultitrackPreview({ stems, zoomLevel }: CapCutMultitrackPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const multitrackRef = useRef<MultiTrack | null>(null)
  const initialZoomRef = useRef(zoomLevel)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || stems.length < 2) return undefined

    container.innerHTML = ''
    setIsReady(false)
    const multitrack = MultiTrack.create(stems.map(toTrackOptions), {
      container,
      cursorColor: '#173f39',
      cursorWidth: 1,
      minPxPerSec: initialZoomRef.current,
      trackBackground: '#fbfcfb',
      trackBorderColor: '#d7e3df',
      timelineOptions: {
        height: 24,
        formatTimeCallback: formatTimelineLabel,
      },
    })
    multitrackRef.current = multitrack
    const unsubscribe = multitrack.on('canplay', () => setIsReady(true))

    return () => {
      unsubscribe()
      multitrack.destroy()
      multitrackRef.current = null
      container.innerHTML = ''
      setIsReady(false)
    }
  }, [stems])

  useEffect(() => {
    multitrackRef.current?.zoom(
      Math.min(Math.max(zoomLevel, timelineZoomConfig.minPixelsPerSecond), timelineZoomConfig.maxPixelsPerSecond),
    )
  }, [zoomLevel])

  if (stems.length < 2) return null

  return (
    <section className={cx(ui.multitrackPreview, !isReady && 'opacity-60')} data-ready={isReady ? 'true' : 'false'}>
      <div className={ui.multitrackTitle}>
        <strong>Multitrack stems</strong>
        <span className={ui.multitrackTitleMeta}>{stems.length} synced tracks</span>
      </div>
      <div ref={containerRef} className={ui.multitrackHost} />
    </section>
  )
}
