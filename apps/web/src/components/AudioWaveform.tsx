import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'

const placeholderBars = Array.from({ length: 72 }, (_, index) => 18 + ((index * 17) % 58))

type AudioWaveformProps = {
  audioUrl?: string
  zoom: number
}

export function AudioWaveform({ audioUrl, zoom }: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)

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
      minPxPerSec: 24,
    })
    wavesurferRef.current = wavesurfer

    return () => {
      wavesurferRef.current = null
      wavesurfer.destroy()
    }
  }, [audioUrl])

  useEffect(() => {
    wavesurferRef.current?.zoom(24 * zoom)
  }, [zoom])

  if (audioUrl) {
    return (
      <div className="waveform-scroll">
        <div ref={containerRef} className="waveform" />
      </div>
    )
  }

  return (
    <div className="waveform-scroll">
      <div
        className="waveform waveform-placeholder"
        aria-label="Waveform placeholder"
        style={{ width: `${Math.max(100, zoom * 100)}%` }}
      >
        {placeholderBars.map((height, index) => (
          <span key={index} style={{ height }} />
        ))}
      </div>
    </div>
  )
}
