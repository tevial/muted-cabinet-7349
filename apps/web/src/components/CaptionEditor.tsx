import { Combine, Scissors, StepForward } from 'lucide-react'

import type { CaptionGroup, CaptionWord } from '../types'
import { formatSeconds } from '../lib/captioning'

type CaptionEditorProps = {
  groups: CaptionGroup[]
  words: CaptionWord[]
  selectedGroupId?: string
  onSelect: (groupId: string) => void
  onTextChange: (groupId: string, text: string) => void
  onSplit: (groupId: string) => void
  onMergeNext: (groupId: string) => void
}

export function CaptionEditor({
  groups,
  words,
  selectedGroupId,
  onSelect,
  onTextChange,
  onSplit,
  onMergeNext,
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
                <span>{formatSeconds(group.start)}</span>
                <StepForward size={14} />
                <span>{formatSeconds(group.end)}</span>
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

