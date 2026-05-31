import { useEffect, useRef, type MouseEvent } from 'react'
import { Combine, Play, Scissors } from 'lucide-react'

import type { CaptionGroup } from '../types'

type CaptionEditorProps = {
  groups: CaptionGroup[]
  aligningGroupIds?: string[]
  selectedGroupId?: string
  totalGroups?: number
  onSelect: (groupId: string) => void
  onTextChange: (groupId: string, text: string) => void
  onTimingChange: (groupId: string, start: number, end: number) => void
  onSplitAtCursor: (groupId: string, cursorIndex: number) => boolean
  onMergePrevious: (groupId: string) => boolean
  onPlayGroup: (groupId: string) => void
  onSplit: (groupId: string) => void
  onMergeNext: (groupId: string) => void
  timingNudgeStep: number
}

export function CaptionEditor({
  groups,
  aligningGroupIds = [],
  selectedGroupId,
  totalGroups,
  onSelect,
  onTextChange,
  onTimingChange,
  onSplitAtCursor,
  onMergePrevious,
  onPlayGroup,
  onSplit,
  onMergeNext,
  timingNudgeStep,
}: CaptionEditorProps) {
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const textInputRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingTextFocusRef = useRef<'start' | 'end' | undefined>(undefined)
  const aligningGroupIdSet = new Set(aligningGroupIds)
  const runRowAction = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    event.stopPropagation()
    action()
  }
  const groupCountLabel =
    totalGroups !== undefined && totalGroups !== groups.length
      ? `${groups.length} visible`
      : `${groups.length} groups`

  useEffect(() => {
    const focusPosition = pendingTextFocusRef.current
    if (!focusPosition || !selectedGroupId) return

    const input = textInputRefs.current.get(selectedGroupId)
    if (!input) return

    pendingTextFocusRef.current = undefined
    const cursorPosition = focusPosition === 'start' ? 0 : input.value.length
    input.focus()
    input.setSelectionRange(cursorPosition, cursorPosition)
  }, [groups, selectedGroupId])

  useEffect(() => {
    if (!selectedGroupId || pendingTextFocusRef.current) return

    rowRefs.current.get(selectedGroupId)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [selectedGroupId])

  return (
    <section className="editor-panel">
      <div className="section-title-row">
        <div>
          <p className="panel-kicker">Blocks</p>
          <h2>Caption groups</h2>
        </div>
        <span>{groupCountLabel}</span>
      </div>

      <div className="group-list">
        {groups.map((group) => {
          const isSelected = group.id === selectedGroupId
          const textValue = group.textOverride ?? group.text
          const isPending = group.wordIds.length === 0 && textValue === 'Transcribing...'
          const isAligning = aligningGroupIdSet.has(group.id)

          return (
            <article
              key={group.id}
              ref={(node) => {
                if (node) {
                  rowRefs.current.set(group.id, node)
                  return
                }

                rowRefs.current.delete(group.id)
              }}
              className={`caption-row ${isSelected ? 'selected' : ''} ${isPending || isAligning ? 'pending' : ''}`}
              onClick={() => onSelect(group.id)}
            >
              <div className="caption-row-time">
                <label className="time-field" title="Start time">
                  <input
                    type="number"
                    min={0}
                    step={timingNudgeStep}
                    value={group.start.toFixed(3)}
                    disabled={isPending || isAligning}
                    onChange={(event) => onTimingChange(group.id, Number(event.target.value), group.end)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Start time ${group.id}`}
                  />
                </label>
              </div>

              <input
                ref={(node) => {
                  if (node) {
                    textInputRefs.current.set(group.id, node)
                    return
                  }

                  textInputRefs.current.delete(group.id)
                }}
                value={textValue}
                readOnly={isPending || isAligning}
                onChange={(event) => onTextChange(group.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    if (onSplitAtCursor(group.id, event.currentTarget.selectionStart ?? textValue.length)) {
                      pendingTextFocusRef.current = 'start'
                    }
                    return
                  }

                  const selectionStart = event.currentTarget.selectionStart ?? 0
                  const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart
                  if (event.key === 'Backspace' && selectionStart === 0 && selectionEnd === 0) {
                    event.preventDefault()
                    if (onMergePrevious(group.id)) {
                      pendingTextFocusRef.current = 'end'
                    }
                  }
                }}
                aria-label={`Caption text ${group.id}`}
              />

              <div className="row-actions">
                <button
                  type="button"
                  title="Play this group"
                  disabled={isPending || isAligning}
                  onClick={(event) => runRowAction(event, () => onPlayGroup(group.id))}
                >
                  <Play size={15} />
                </button>
                <button
                  type="button"
                  title="Split this group"
                  disabled={isPending || isAligning}
                  onClick={(event) => runRowAction(event, () => onSplit(group.id))}
                >
                  <Scissors size={15} />
                </button>
                <button
                  type="button"
                  title="Merge with next group"
                  disabled={isPending || isAligning}
                  onClick={(event) => runRowAction(event, () => onMergeNext(group.id))}
                >
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
