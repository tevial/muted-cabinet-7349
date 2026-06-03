# UI Components Catalog

This catalog tracks shared UI components and reusable feature presentation
patterns.

## Styling

### Shared UI Tailwind Utilities

- Layer: shared UI utility
- Location: `apps/web/src/shared/ui`
- Purpose: Provide reusable Tailwind class constants and the local `cx`
  class-name combiner for common buttons, dialogs, panels, caption rows, and
  timeline host structure. The workbench uses this map for the dark app body,
  command toolbar, timeline action bar, WaveSurfer shell, and bottom
  transport/speed selector.
- Public API: `ui` style map and `cx(...classes)`.
- Used by: Workbench screen, top bar, settings, caption editor, CapCut dialogs,
  source-cut panels, WaveSurfer host components.
- Use when: A presentational pattern repeats across components and should not
  be copy-pasted as ad hoc class strings.
- Do not use for: Business logic, dynamic WaveSurfer plugin state, or domain
  decisions.
- Related: `apps/web/src/index.css`, which now only imports Tailwind, defines
  theme color/shadow tokens, and contains the WaveSurfer `::part(...)` bridge
  that cannot be expressed as normal React markup.

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
  playback-speed control, undo/redo actions, kept-chunk transcription, manual
  and automatic skip-zone controls, CapCut cut-manifest export, WaveSurfer timeline refs,
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
  summary/error state, including media/video/audio/caption counts, and action
  callbacks.
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

### TopBar

- Layer: pattern
- Location: `apps/web/src/components/TopBar.tsx`
- Purpose: Render primary source upload, cache, save, and export actions plus
  the settings and CapCut import popover triggers. The toolbar follows the current
  dark command-bar direction: import/load actions on the left, undo/redo
  centered with absolute positioning on desktop, and settings/save/export on
  the right. Export opens a dropdown for SRT, cut JSON, and direct CapCut patch
  actions.
- Public API: Capability flags, settings content, cache/source load callbacks,
  audio-or-video source upload callback, save callback, SRT/CapCut manifest
  export callbacks, and CapCut import/patch callbacks.
- Used by: Caption workbench.
- Use when: Rendering the editor command bar.
- Do not use for: Cache/transcription decision logic.
- Related: [Upload Source Media workflow](../product/workflows.md#upload-source-media).

### SettingsPanel

- Layer: feature view
- Location: `apps/web/src/components/SettingsPanel.tsx`
- Purpose: Render language hint, legacy empty-zone controls, and compact stats.
- Public API: `language`, `stats`, `settings`, optional `variant`,
  `onLanguageChange`, `onChange`.
- Used by: Caption workbench settings popover.
- Use when: Editing non-row caption preferences.
- Do not use for: Applying or persisting grouping settings.
- Related: [Regroup Captions workflow](../product/workflows.md#regroup-captions).

### WaveSurferTimeline

- Layer: feature view
- Location: `apps/web/src/components/WaveSurferTimeline.tsx`
- Purpose: Render the DOM host structure for the WaveSurfer timeline: clean
  waveform lane with the official Timeline plugin inserted by the model,
  editable skip overlays, caption region lane, and minimap lane inside the dark
  timeline shell. Internal horizontal scrollbars are visually hidden, and the
  timeline includes an invisible WaveSurfer interaction host behind the visible
  lanes so blank-space seek and command/control zoom are still handled by
  WaveSurfer's own interaction and Zoom plugin math. Timeline ticks/labels are
  not drawn by this component and are not mirrored through a custom background
  grid.
  Hover cursors are rendered by WaveSurfer's official Hover plugin inside each
  host, including the invisible blank-space host, so hover positioning follows
  the same scroll wrapper as media rendering. The outer surface only handles
  non-zoom horizontal wheel panning; playhead seeking must come from WaveSurfer
  `interaction` events or Region click handlers, not from surface pointer-up
  events. Playhead placement can land inside skip zones; playback rules skip
  those zones only when audio starts or reaches them. The host adds top/bottom
  fades around the WaveSurfer-owned lanes, but does not own any media timing. The
  minimap host is rendered as a separate bottom row after the caption lane,
  using WaveSurfer Minimap's own `container` option, built-in viewport overlay,
  and click/drag seek behavior. The hosted WaveSurfer instances
  render continuous waveforms rather than bar-style peaks. Temporary range
  actions are rendered inside WaveSurfer Regions owned by the timeline model.
- Public API: `audioUrl`, the timeline surface ref, and WaveSurfer container
  refs owned by the workbench WaveSurfer model.
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
  hover-only split action, including document-like Enter split, Backspace merge
  events, and selected-row scroll alignment. Long row text is clipped under a
  right-side gradient fade that expands on hover so the scissors action remains
  readable without permanently crowding the list. The controller passes only
  caption groups that are currently visible after the active skip-zone mask;
  hidden groups remain in source state. Pending transcription rows are read-only
  loading placeholders until the related chunk returns words. Draft text edits
  expose an inline `Update groups` / `Revert` action bar instead of forcing a
  regroup on every keystroke. The header owns the `maxChars` wrapping control
  and shows `Regroup` when manual grouping is active, because changing
  `maxChars` no longer auto-wraps manually arranged rows.
- Public API: `groups`, optional `totalGroups`, selection,
  `maxChars`, draft/manual grouping state, text/timing/cursor-split/merge/split
  callbacks.
- Used by: Caption workbench right rail.
- Use when: Editing caption groups as rows.
- Do not use for: Owning split/merge/timing rules.
- Related: [Caption Domain](modules.md#caption-domain).
