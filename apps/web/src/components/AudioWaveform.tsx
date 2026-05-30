import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'

const placeholderBars = Array.from({ length: 72 }, (_, index) => 18 + ((index * 17) % 58))
const basePxPerSec = 24

type AudioWaveformProps = {
  audioUrl?: string
  zoom: number
}

export function AudioWaveform({ audioUrl, zoom }: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const zoomRef = useRef(zoom)

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#c4d4cf',
      progressColor: '#14927f',
      cursorColor: '#173f39',
      height: 96,
      barWidth: 2,
      barGap: 2,
      url: audioUrl,
      fillParent: true,
      hideScrollbar: true,
      minPxPerSec: basePxPerSec * zoomRef.current,
    })
    wavesurferRef.current = wavesurfer

    return () => {
      wavesurferRef.current = null
      wavesurfer.destroy()
    }
  }, [audioUrl])

  useEffect(() => {
    zoomRef.current = zoom
    wavesurferRef.current?.zoom(basePxPerSec * zoom)
  }, [zoom])

  if (audioUrl) {
    return <div ref={containerRef} className="waveform" />
  }

  return (
    <div className="waveform waveform-placeholder" aria-label="Waveform placeholder">
      {placeholderBars.map((height, index) => (
        <span key={index} style={{ height }} />
      ))}
    </div>
  )
}
