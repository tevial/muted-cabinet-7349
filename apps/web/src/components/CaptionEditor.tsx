import { ChevronLeft, ChevronRight, Combine, Play, Scissors, StepForward } from 'lucide-react'

import type { CaptionGroup, CaptionWord } from '../types'
import { formatSeconds } from '../lib/captioning'

type CaptionEditorProps = {
  groups: CaptionGroup[]
  words: CaptionWord[]
  selectedGroupId?: string
  onSelect: (groupId: string) => void
  onTextChange: (groupId: string, text: string) => void
  onTimingChange: (groupId: string, start: number, end: number) => void
  onNudgeTiming: (groupId: string, offset: number) => void
  onPlayGroup: (groupId: string) => void
  onSplit: (groupId: string) => void
  onMergeNext: (groupId: string) => void
  timingNudgeStep: number
}

export function CaptionEditor({
  groups,
  words,
  selectedGroupId,
  onSelect,
  onTextChange,
  onTimingChange,
  onNudgeTiming,
  onPlayGroup,
  onSplit,
  onMergeNext,
  timingNudgeStep,
}: CaptionEditorProps) {
  const wordMap = new Map(words.map((word) => [word.id, word]))

  return (
    <section className="editor-panel">
      <div className="section-title-row">
        <div>
          <p className="panel-kicker">Blocks</p>
          <h2>Caption groups</h2>
        </div>
        <span>{groups.length} groups</span>
      </div>

      <div className="group-list">
        {groups.map((group) => {
          const groupWords = group.wordIds.map((id) => wordMap.get(id)).filter(Boolean) as CaptionWord[]
          const isSelected = group.id === selectedGroupId

          return (
            <article
              key={group.id}
              className={`caption-row ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(group.id)}
            >
              <div className="caption-row-time">
                <label className="time-field">
                  <span>Start</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={group.start.toFixed(2)}
                    onChange={(event) => onTimingChange(group.id, Number(event.target.value), group.end)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Start time ${group.id}`}
                  />
                </label>
                <StepForward size={14} />
                <label className="time-field">
                  <span>End</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={group.end.toFixed(2)}
                    onChange={(event) => onTimingChange(group.id, group.start, Number(event.target.value))}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`End time ${group.id}`}
                  />
                </label>
              </div>

              <input
                value={group.textOverride ?? group.text}
                onChange={(event) => onTextChange(group.id, event.target.value)}
                aria-label={`Caption text ${group.id}`}
              />

              <div className="word-strip">
                {groupWords.map((word) => (
                  <span key={word.id} className="word-token" title={`${formatSeconds(word.start)}-${formatSeconds(word.end)}`}>
                    {word.text}
                  </span>
                ))}
              </div>

              <div className="row-actions">
                <button type="button" title="Play this group" onClick={() => onPlayGroup(group.id)}>
                  <Play size={15} />
                </button>
                <button
                  type="button"
                  title={`Move start ${timingNudgeStep.toFixed(2)}s earlier`}
                  onClick={() => onNudgeTiming(group.id, -timingNudgeStep)}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  title={`Move start ${timingNudgeStep.toFixed(2)}s later`}
                  onClick={() => onNudgeTiming(group.id, timingNudgeStep)}
                >
                  <ChevronRight size={15} />
                </button>
                <button type="button" title="Split this group" onClick={() => onSplit(group.id)}>
                  <Scissors size={15} />
                </button>
                <button type="button" title="Merge with next group" onClick={() => onMergeNext(group.id)}>
                  <Combine size={15} />
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
