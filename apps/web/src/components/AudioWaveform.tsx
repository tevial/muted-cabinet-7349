import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'

const placeholderBars = Array.from({ length: 72 }, (_, index) => 18 + ((index * 17) % 58))

type AudioWaveformProps = {
  audioUrl?: string
}

export function AudioWaveform({ audioUrl }: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

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
    })

    return () => {
      wavesurfer.destroy()
    }
  }, [audioUrl])

  if (audioUrl) return <div ref={containerRef} className="waveform" />

  return (
    <div className="waveform waveform-placeholder" aria-label="Waveform placeholder">
      {placeholderBars.map((height, index) => (
        <span key={index} style={{ height }} />
      ))}
    </div>
  )
}

