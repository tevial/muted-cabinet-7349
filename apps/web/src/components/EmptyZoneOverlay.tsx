import { formatSeconds, type EmptyZoneCut } from '../lib/captioning'

type EmptyZoneOverlayProps = {
  cuts: EmptyZoneCut[]
  duration: number
}

export function EmptyZoneOverlay({ cuts, duration }: EmptyZoneOverlayProps) {
  const safeDuration = Math.max(duration, 1)

  if (!cuts.length) return null

  return (
    <div className="empty-zone-overlay" aria-hidden="true">
      {cuts.map((cut) => (
        <span
          key={cut.id}
          className="empty-zone-cut"
          style={{
            left: `${(cut.start / safeDuration) * 100}%`,
            width: `${(cut.duration / safeDuration) * 100}%`,
          }}
          title={`${formatSeconds(cut.start)} - ${formatSeconds(cut.end)}`}
        />
      ))}
    </div>
  )
}
