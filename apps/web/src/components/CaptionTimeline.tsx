import type { CaptionGroup } from '../types'
import { formatSeconds } from '../lib/captioning'
import { getTimelineTicks, type TimelineScalePreset } from '../lib/timelineScale'

type CaptionTimelineProps = {
  groups: CaptionGroup[]
  scale: TimelineScalePreset
  selectedGroupId?: string
  onSelect: (groupId: string) => void
  onPlayGroup: (groupId: string) => void
}

export function CaptionTimeline({
  groups,
  scale,
  selectedGroupId,
  onSelect,
  onPlayGroup,
}: CaptionTimelineProps) {
  const duration = Math.max(...groups.map((group) => group.end), 1)
  const ticks = getTimelineTicks(duration, scale.majorTickSeconds)

  return (
    <section className="timeline-panel">
      <div className="timeline-scale">
        {ticks.map((tick) => (
          <span key={tick} style={{ left: `${(tick / duration) * 100}%` }}>
            {formatSeconds(tick)}
          </span>
        ))}
      </div>
      <div className="caption-track">
        {groups.map((group) => {
          const left = `${(group.start / duration) * 100}%`
          const width = `${((group.end - group.start) / duration) * 100}%`
          return (
            <button
              key={group.id}
              type="button"
              className={`caption-chip ${selectedGroupId === group.id ? 'active' : ''}`}
              style={{ left, width }}
              onClick={() => onSelect(group.id)}
              onDoubleClick={() => onPlayGroup(group.id)}
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
