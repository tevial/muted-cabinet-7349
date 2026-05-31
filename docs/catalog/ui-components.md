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
- Public API: Typed view props for toolbar, settings popover content, playback,
  undo/redo actions, kept-chunk transcription, manual and automatic skip-zone
  controls, CapCut cut-manifest export, WaveSurfer timeline refs,
  draft-only detected-silence threshold/normalization/tuning controls, zoom
  control, and right-rail editor regions.
- Used by: `CaptionWorkbench`.
- Use when: Rendering the workbench layout.
- Do not use for: Transcription/cache/grouping/playback state transitions.
- Related: [UI Architecture](../ui-architecture.md).

### CapCutProjectPatchDialog

- Layer: feature view
- Location:
  `apps/web/src/features/caption-workbench/ui/CapCutProjectPatchDialog.tsx`
- Purpose: Render the local CapCut project patch workflow with optional scanned
  project cards, manual project path fallback, dry-run summary, and patch
  action.
- Public API: Local agent status, project summaries, selected path, patch
  summary/error state, and action callbacks.
- Used by: Caption workbench screen.
- Use when: The workbench needs to inspect, dry-run, or patch a local CapCut
  project without exporting JSON manually.
- Do not use for: Filesystem scanning, draft rewriting, or building the patch
  manifest.
- Related: [Patch CapCut Draft workflow](../product/workflows.md#patch-capcut-draft).

### CapCutProjectImportDialog

- Layer: feature view
- Location:
  `apps/web/src/features/caption-workbench/ui/CapCutProjectImportDialog.tsx`
- Purpose: Render the local CapCut project import workflow with optional
  Local Agent project cards, manual project path fallback, and a single import
  action that loads project structure plus rendered per-track stems.
- Public API: Local agent status, project summaries, selected path,
  import/error state, and action callbacks.
- Used by: Caption workbench screen.
- Use when: The workbench needs to load a CapCut draft as structured timeline
  data instead of starting from a standalone audio file.
- Do not use for: Filesystem scanning, timeline-map parsing, ffmpeg rendering,
  or caption/skip-zone state transitions.
- Related: [CapCut Cut Export Plan](../capcut-cut-export-plan.md).

### CapCutSourceCutPanel

- Layer: feature view
- Location:
  `apps/web/src/features/caption-workbench/ui/CapCutSourceCutPanel.tsx`
- Purpose: Render the selected CapCut source-cut boundary details and an audio
  preview of the hidden source range.
- Public API: Selected `CapCutSourceCutBoundary`, optional
  `CapCutSourcePreview`, loading/error state, close and preview callbacks.
- Used by: Caption workbench screen.
- Use when: The workbench needs to inspect a restore-capable source cut from an
  imported CapCut project.
- Do not use for: Timeline-map mutation, draft writes, or ffmpeg/API calls.
- Related: [CapCut Cut Export Plan](../capcut-cut-export-plan.md).

### CaptionGapPanel

- Layer: feature view
- Location:
  `apps/web/src/features/caption-workbench/ui/CaptionGapPanel.tsx`
- Purpose: Render the selected subtitle-only gap between two caption groups and
  offer an action to relink captions across that gap.
- Public API: Selected `CaptionGap`, close callback, relink callback.
- Used by: Caption workbench screen.
- Use when: The workbench needs to explain that a timeline range keeps media
  but hides caption display.
- Do not use for: Skip-zone deletion, media cuts, or group timing mutation.
- Related: [Caption Domain](modules.md#caption-domain).

### TopBar

- Layer: pattern
- Location: `apps/web/src/components/TopBar.tsx`
- Purpose: Render primary file/transcription/cache/save/export actions and the
  settings and CapCut import popover triggers.
- Public API: Capability flags, settings content, SRT/CapCut manifest export
  callbacks, and action callbacks.
- Used by: Caption workbench.
- Use when: Rendering the editor command bar.
- Do not use for: Cache/transcription decision logic.
- Related: [Upload Source Media workflow](../product/workflows.md#upload-source-media).

### SettingsPanel

- Layer: feature view
- Location: `apps/web/src/components/SettingsPanel.tsx`
- Purpose: Render caption rule controls, language hint, and compact stats.
- Public API: `language`, `stats`, `settings`, `onLanguageChange`, `onChange`.
- Used by: Caption workbench settings popover.
- Use when: Editing caption grouping parameters.
- Do not use for: Applying or persisting grouping settings.
- Related: [Regroup Captions workflow](../product/workflows.md#regroup-captions).

### WaveSurferTimeline

- Layer: feature view
- Location: `apps/web/src/components/WaveSurferTimeline.tsx`
- Purpose: Render the DOM host structure for the WaveSurfer timeline: shared
  time axis, clean waveform lane with editable skip overlays, and caption region
  lane. Temporary range actions are rendered inside WaveSurfer Regions owned by
  the timeline model.
- Public API: `audioUrl` and three container refs owned by the workbench
  WaveSurfer model.
- Used by: Caption workbench timeline.
- Use when: The workbench needs the plugin-backed media timeline layout.
- Do not use for: Creating WaveSurfer instances, mutating group timings, or
  owning playback state.
- Related: [Edit Timing And Preview workflow](../product/workflows.md#edit-timing-and-preview).

### CapCutMultitrackPreview

- Layer: feature view
- Location: `apps/web/src/components/CapCutMultitrackPreview.tsx`
- Purpose: Render a read-only WaveSurfer MultiTrack preview for imported
  CapCut audio stems so multiple source tracks can be inspected without
  collapsing the project model into a single waveform.
- Public API: `stems`, `zoomLevel`.
- Used by: Caption workbench screen when a CapCut import returns at least two
  stems.
- Use when: Showing synced imported CapCut track stems as a multitrack
  reference view.
- Do not use for: Caption editing, skip-zone ownership, source-cut restoration,
  or replacing the main timeline model.
- Related: [CapCut Timeline Map](modules.md#capcut-timeline-map).

### CaptionEditor

- Layer: feature view
- Location: `apps/web/src/components/CaptionEditor.tsx`
- Purpose: Render the compact caption group list, timing inputs, text edits, and
  row actions, including document-like Enter split, Backspace merge events, and
  selected-row scroll alignment. The controller passes only caption groups that
  are currently visible after the active skip-zone mask; hidden groups remain in
  source state. Pending transcription rows are read-only loading placeholders
  until the related chunk returns words.
- Public API: `groups`, optional `totalGroups`, selection,
  text/timing/cursor-split/merge/play callbacks.
- Used by: Caption workbench right rail.
- Use when: Editing caption groups as rows.
- Do not use for: Owning split/merge/timing rules.
- Related: [Caption Domain](modules.md#caption-domain).
