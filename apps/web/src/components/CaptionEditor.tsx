import { useEffect, useRef, type MouseEvent } from 'react'
import { Check, RotateCcw, Scissors } from 'lucide-react'

import type { CaptionGroup } from '../types'
import { cx } from '../shared/ui/classNames'
import { ui } from '../shared/ui/styles'

type CaptionEditorProps = {
  groups: CaptionGroup[]
  aligningGroupIds?: string[]
  hasDraft?: boolean
  maxChars: number
  selectedGroupId?: string
  totalGroups?: number
  onApplyDraft: () => void
  onMaxCharsChange: (maxChars: number) => void
  onRevertDraft: () => void
  onSelect: (groupId: string) => void
  onTextChange: (groupId: string, text: string) => void
  onTimingChange: (groupId: string, start: number, end: number) => void
  onSplitAtCursor: (groupId: string, cursorIndex: number, text: string) => boolean
  onMergePrevious: (groupId: string) => boolean
  onSplit: (groupId: string) => void
  timingNudgeStep: number
}

export function CaptionEditor({
  groups,
  aligningGroupIds = [],
  hasDraft = false,
  maxChars,
  selectedGroupId,
  totalGroups,
  onApplyDraft,
  onMaxCharsChange,
  onRevertDraft,
  onSelect,
  onTextChange,
  onTimingChange,
  onSplitAtCursor,
  onMergePrevious,
  onSplit,
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
    <section className={ui.editorPanel}>
      <div className={ui.sectionTitleRow}>
        <div>
          <p className={ui.sectionKicker}>Blocks</p>
          <h2 className={ui.sectionTitle}>Caption groups</h2>
        </div>
        <div className={ui.captionHeaderControls}>
          <label className={ui.maxCharsControl}>
            <span>Max chars</span>
            <input
              className={ui.maxCharsInput}
              type="number"
              min={8}
              value={maxChars}
              onChange={(event) => onMaxCharsChange(Number(event.target.value))}
              aria-label="Maximum caption characters"
            />
          </label>
          <span className={ui.captionCount}>{groupCountLabel}</span>
        </div>
      </div>
      {hasDraft ? (
        <div className={ui.captionDraftActions}>
          <span className={ui.captionDraftLabel}>Draft changes</span>
          <button className={cx(ui.ghostButton, ui.captionDraftButton)} type="button" onClick={onRevertDraft}>
            <RotateCcw size={14} />
            Revert
          </button>
          <button className={cx(ui.primaryButton, ui.captionDraftButton)} type="button" onClick={onApplyDraft}>
            <Check size={14} />
            Update groups
          </button>
        </div>
      ) : null}

      <div className={ui.groupList}>
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
              className={cx(
                ui.captionRow,
                isSelected && ui.captionRowSelected,
                (isPending || isAligning) && ui.captionRowPending,
              )}
              onClick={() => onSelect(group.id)}
            >
              <div className={ui.captionRowTime}>
                <label className="block" title="Start time">
                  <input
                    className={ui.captionTimeInput}
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
                className={cx(ui.captionTextInput, (isPending || isAligning) && ui.captionPendingInput)}
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
                    if (onSplitAtCursor(group.id, event.currentTarget.selectionStart ?? textValue.length, textValue)) {
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

              <span className={ui.captionRowFade} aria-hidden="true" />
              <div className={ui.rowActions}>
                <button
                  className={ui.rowActionButton}
                  type="button"
                  title="Split this group"
                  disabled={isPending || isAligning}
                  onClick={(event) => runRowAction(event, () => onSplit(group.id))}
                >
                  <Scissors size={15} />
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
