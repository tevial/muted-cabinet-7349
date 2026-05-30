# UI Components Catalog

This catalog tracks shared UI components and reusable feature presentation
patterns.

## Components

### CaptionWorkbench

- Layer: feature controller
- Location: `apps/web/src/features/caption-workbench/CaptionWorkbench.tsx`
- Purpose: Own feature orchestration and pass state/actions to the screen view.
- Public API: No props; rendered by `App`.
- Used by: `apps/web/src/App.tsx`.
- Use when: Showing the primary editor experience.
- Do not use for: Shared UI primitives or caption domain logic.
- Related: [UI Architecture](../ui-architecture.md).

### CaptionWorkbenchScreen

- Layer: feature view
- Location: `apps/web/src/features/caption-workbench/ui/CaptionWorkbenchScreen.tsx`
- Purpose: Present the main desktop caption editing screen from controller props.
- Public API: Typed view props for toolbar, playback, timeline, editor, and
  settings regions.
- Used by: `CaptionWorkbench`.
- Use when: Rendering the workbench layout.
- Do not use for: Transcription/cache/grouping/playback state transitions.
- Related: [UI Architecture](../ui-architecture.md).

### TopBar

- Layer: pattern
- Location: `apps/web/src/components/TopBar.tsx`
- Purpose: Render primary file/transcription/cache/save/export actions.
- Public API: Capability flags and action callbacks.
- Used by: Caption workbench.
- Use when: Rendering the editor command bar.
- Do not use for: Cache/transcription decision logic.
- Related: [Upload Source Media workflow](../product/workflows.md#upload-source-media).

### SettingsPanel

- Layer: feature view
- Location: `apps/web/src/components/SettingsPanel.tsx`
- Purpose: Render caption rule controls, language hint, and compact stats.
- Public API: `language`, `stats`, `settings`, `onLanguageChange`, `onChange`.
- Used by: Caption workbench right rail.
- Use when: Editing caption grouping parameters.
- Do not use for: Applying or persisting grouping settings.
- Related: [Regroup Captions workflow](../product/workflows.md#regroup-captions).

### CaptionTimeline

- Layer: feature view
- Location: `apps/web/src/components/CaptionTimeline.tsx`
- Purpose: Render caption groups on the horizontal timeline.
- Public API: `groups`, `scale`, `duration`, selected group, select/play
  callbacks.
- Used by: Caption workbench timeline.
- Use when: Visualizing group timing relative to source media.
- Do not use for: Mutating group timings.
- Related: [Edit Timing And Preview workflow](../product/workflows.md#edit-timing-and-preview).

### CaptionEditor

- Layer: feature view
- Location: `apps/web/src/components/CaptionEditor.tsx`
- Purpose: Render block list, timing inputs, word tokens, and row actions.
- Public API: `groups`, `words`, selection, text/timing/split/merge/play
  callbacks.
- Used by: Caption workbench.
- Use when: Editing caption groups as rows.
- Do not use for: Owning split/merge/timing rules.
- Related: [Caption Domain](modules.md#caption-domain).

### AudioWaveform

- Layer: feature view
- Location: `apps/web/src/components/AudioWaveform.tsx`
- Purpose: Render audio waveform preview at the current timeline scale.
- Public API: `audioUrl`, `pixelsPerSecond`.
- Used by: Caption workbench timeline.
- Use when: Displaying source media waveform.
- Do not use for: Playback control or timeline state.
- Related: [Edit Timing And Preview workflow](../product/workflows.md#edit-timing-and-preview).

### EmptyZoneOverlay

- Layer: feature view
- Location: `apps/web/src/components/EmptyZoneOverlay.tsx`
- Purpose: Render detected empty-zone cut previews over the timeline.
- Public API: `cuts`, `duration`.
- Used by: Caption workbench timeline.
- Use when: Showing local empty-zone trim candidates.
- Do not use for: Applying video cuts or mutating CapCut drafts.
- Related: [Requirements](../product/requirements.md).
