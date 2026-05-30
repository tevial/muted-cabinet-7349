import type { CaptionGroup } from '../types'
import { formatSeconds } from '../lib/captioning'
import { getTimelineTicks, type TimelineScalePreset } from '../lib/timelineScale'

type CaptionTimelineProps = {
  groups: CaptionGroup[]
  scale: TimelineScalePreset
  duration: number
  selectedGroupId?: string
  onSelect: (groupId: string) => void
  onPlayGroup: (groupId: string) => void
}

export function CaptionTimeline({
  groups,
  scale,
  duration,
  selectedGroupId,
  onSelect,
  onPlayGroup,
}: CaptionTimelineProps) {
  const safeDuration = Math.max(duration, 1)
  const ticks = getTimelineTicks(safeDuration, scale.majorTickSeconds)

  return (
    <section className="timeline-panel">
      <div className="timeline-scale">
        {ticks.map((tick) => (
          <span key={tick} style={{ left: `${(tick / safeDuration) * 100}%` }}>
            {formatSeconds(tick)}
          </span>
        ))}
      </div>
      <div className="caption-track">
        {groups.map((group) => {
          const left = `${(group.start / safeDuration) * 100}%`
          const width = `${((group.end - group.start) / safeDuration) * 100}%`
          return (
            <button
              key={group.id}
              type="button"
              className={`caption-chip ${selectedGroupId === group.id ? 'active' : ''}`}
              style={{ left, width }}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(group.id)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                onPlayGroup(group.id)
              }}
              title={`${formatSeconds(group.start)} - ${formatSeconds(group.end)}. Double click to play.`}
            >
              {group.textOverride || group.text}
            </button>
          )
        })}
      </div>
    </section>
  )
}
