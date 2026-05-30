import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'

const placeholderBars = Array.from({ length: 72 }, (_, index) => 18 + ((index * 17) % 58))

type AudioWaveformProps = {
  audioUrl?: string
  pixelsPerSecond: number
}

export function AudioWaveform({ audioUrl, pixelsPerSecond }: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const pixelsPerSecondRef = useRef(pixelsPerSecond)

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
      interact: false,
      cursorWidth: 0,
      fillParent: true,
      hideScrollbar: true,
      minPxPerSec: pixelsPerSecondRef.current,
    })
    wavesurferRef.current = wavesurfer

    return () => {
      wavesurferRef.current = null
      wavesurfer.destroy()
    }
  }, [audioUrl])

  useEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond
    wavesurferRef.current?.zoom(pixelsPerSecond)
  }, [pixelsPerSecond])

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
