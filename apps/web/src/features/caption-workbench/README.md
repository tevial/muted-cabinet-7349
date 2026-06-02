# Caption Workbench Feature

Owner for the main caption editing workflow.

This feature contains:

- `CaptionWorkbench.tsx` - feature controller for source media upload,
  source-video to editor-audio preparation, fingerprinting, cache load,
  transcription, ingest, group editing, keyboard shortcuts, document-like group
  line editing, kept-chunk retranscription, autosave, SRT export, and CapCut
  cut-manifest export.
- `ui/CapCutProjectPatchDialog.tsx` - project patch dialog that consumes the
  optional local CapCut project scanner and falls back to manual project paths.
- `ui/CapCutSourceCutPanel.tsx` - selected source-cut details and hidden
  source-range audio preview for imported CapCut projects.
- `model/useWaveSurferTimeline.ts` - WaveSurfer instances, official plugins,
  playback, playback speed, precise segment loop, seek, caption regions,
  editable empty-zone skip regions, temporary range selections, CapCut
  source-cut selection, derived caption-region masking, zoom,
  scroll sync, and timeline audition state.
- `model/waveSurferTimelineConfig.ts` - WaveSurfer visual options, zoom limits,
  timeline label formatting, and caption region colors.
- `model/silenceDetection.ts` - local waveform silence detection using the
  WaveSurfer-decoded `AudioBuffer`; follows the official WaveSurfer Silence
  example pattern by extracting audible regions first, then deriving editable
  skip-zone gaps without calling transcription or LLM services. It adds local
  loudness normalization, RMS threshold, minimum silence duration, and
  speech-edge guard settings for uneven recordings.
- `ui/CaptionWorkbenchScreen.tsx` - feature view that renders controller props,
  the settings popover, the dark timeline action bar, plugin-backed WaveSurfer
  timeline hosts, bottom transport/speed controls, and the right-rail caption
  group editor.
- Presentational components from `apps/web/src/components`, including
  `WaveSurferTimeline`, which only renders DOM hosts and decorative fades for
  the model-owned WaveSurfer instances. The CapCut import summary stays pinned
  to the top of the dark timeline stack, while the WaveSurfer host fills the
  remaining stage space and centers the fixed-height lanes inside it. The
  WaveSurfer host also renders one shared hover guide above all lanes, while
  the timeline model computes its timestamp from the main WaveSurfer instance.
  The WaveSurfer Minimap plugin renders into its own bottom host after the
  caption lane and has a workbench control layer for dragging the visible
  viewport or range-selecting a zoom target.

Rules:

- Do not duplicate caption grouping or timing logic here; call the caption
  domain.
- Treat the editor word layer as the source of truth for caption text after
  transcription. Caption groups are rebuilt from current words plus grouping
  settings. Row text edits, Enter splits, and Backspace merges are staged in a
  caption draft first; applying the draft updates the word layer once and then
  rebuilds groups.
- Do not read or write localStorage directly outside the storage service.
- Saved projects persist words, groups, settings, serialized skip-zone state,
  and source identity. Browser object URLs are never stored; saved skip zones
  are rebound to the fresh source media URL after fingerprint-matched file load
  or CapCut project identity load.
- CapCut project import restores exact saved editor state by source identity.
  Do not route saved CapCut editor state through transcription ingest, because
  that would rebuild user-edited groups instead of restoring the working
  project snapshot.
- Do not call OpenAI or external providers from browser code; call the local API
  transcription client.
- Video uploads are prepared before entering the editor state. The workbench
  calls the media conversion service, receives a 96k MP3 editor audio file, and
  only then creates object URLs, fingerprints, cache checks, WaveSurfer sources,
  transcription requests, and alignment requests. Keep this as a source-media
  preparation step rather than adding video-specific branches to caption logic.
- Keep playback, playback speed, plugin lifecycle, timeline zoom/scroll, and
  audition state in `model`, not in the screen. Playback speed is set through
  WaveSurfer `setPlaybackRate`.
- Treat skip zones as a non-destructive timeline mask. They may hide or split
  caption regions visually and during playback, but source words/groups remain
  in memory so removing or resizing the skip zone restores the affected captions.
- Render skip zones as a translucent page-background mask with a low-opacity
  white border so they dim waveform content instead of competing with caption
  group blocks. Skip-zone resize handles stay visually hidden until the user
  hovers or focuses the zone, keeping the waveform uncluttered.
- Keep skip zones resize-only on the waveform. Moving a whole zone is too easy
  to trigger accidentally; changing its start/end handles is the supported edit.
- Treat independent caption boundaries as plain empty space between groups, not
  as rendered timeline objects. `Option` + drag on a caption boundary moves
  only that side of the group and breaks the neighbor link; dragging back within
  snap distance relinks the neighboring boundary.
- The right-rail caption group list follows the same non-destructive mask as the
  timeline: groups fully covered by active skip zones are hidden from the list
  but remain in source state and local project persistence.
- Overlapping skip zones are normalized into one editable zone. This applies to
  user-created, transcript-derived, and waveform-detected zones once the user
  edits or overlaps them.
- WaveSurfer skip-region reconciliation must remove stale or duplicate plugin
  regions by id after a merge; the domain state is the source of truth, not
  any leftover region DOM from the plugin.
- Full timeline playback skips active skip zones, but selected group loops stay
  pinned to a currently visible caption segment and must not jump through skip
  zones at the segment boundary. If a skip-zone edit, undo/redo, or regroup
  makes the active loop segment hidden or split, stop the loop instead of
  replaying a stale range. Ordinary caption timing nudges should retarget the
  loop to the group's new visible range rather than stopping playback.
- Keep undo/redo in the feature controller. History stores editor snapshots
  across words, groups, grouping settings, selected group, and skip-zone state.
- The Caption groups header owns the `maxChars` control because it directly
  changes automatic group wrapping. In auto grouping mode, changing it rebuilds
  committed groups from current words when no caption draft is pending. After a
  user applies manual row text/split/merge/timing changes, the project enters
  manual grouping mode: `maxChars` updates are stored but do not rebuild groups
  until the user clicks `Regroup` and confirms that manual group layout changes
  should be reset. Corrected words are always kept.
- Caption group rows are compact dark editor rows. Long text clips under a
  right-side fade, the fade expands on row hover, and the only quick row action
  is the split/scissors action shown on hover.
- Treat active skip zones as hard grouping boundaries when rebuilding groups.
  Caption groups may remain in source state inside hidden ranges, but a group
  should not visually or logically link from one kept range into the next.
- Caption timeline regions are editable when a group has exactly one visible
  text-bearing kept segment, even if skip zones hide some of the group's stored
  range. This preserves resize handles after nearby skip edits and text drafts.
- Use temporary WaveSurfer range selections for contextual actions. A selected
  range can become a skip zone or be sent to the local API for segment
  transcription.
- Kept-chunk retranscription sends all non-skipped timeline ranges to the local
  API as bounded parallel selected-range requests. The workbench inserts
  temporary loading groups for every kept range, merges each completed result
  immediately, and preserves words hidden under skip zones. It uses the
  uploaded media file when present, or lazily downloads the first rendered
  CapCut import stem and passes that file through the same transcription client.
- CapCut cut-manifest export is deterministic caption-domain logic. The
  workbench downloads a JSON contract containing source metadata, kept timeline
  ranges, and original-time caption groups; backend tooling owns the actual
  CapCut draft rewrite and remapping.
- The CapCut project patch dialog must keep local filesystem concerns behind
  the CapCut service client. It may use the local agent's scanned project list
  when available, but manual project-path patching must continue to work when
  the scanner is disabled. Dry-run summaries surface total media segments plus
  video/audio/caption counts so projects with standalone audio tracks are not
  presented as video-only rewrites.
- CapCut source-cut boundaries are selectable read/preview objects in this
  stage. The timeline model owns hit testing and selected-boundary highlight;
  the feature controller owns source-preview API calls; the screen renders the
  preview panel. Restoring hidden source ranges remains a separate draft-write
  workflow.
- Transcription ingest must sanitize provider artifacts before grouping.
  Punctuation-only words, including standalone dash variants, are ignored in
  full transcription, selected-range transcription, cache load, and kept-chunk
  retranscription.
- Transcript-derived empty zones are only inferred from gaps between words.
  Do not create leading or trailing skip zones from partial transcription
  results; selected-range and kept-chunk transcription writes also disable
  transcript-derived trimming so these actions cannot create uncontrolled
  skip-zone markup. Whole-audio silence should come from the waveform detector.
- Audio silence detection is a local timeline command. It may replace prior
  auto-detected audio silence zones, but it must preserve user-created skip
  zones and transcript-derived zones. Detected zones can be tuned with a
  temporary boundary slider before the user confirms them. The minimum detected
  duration setting applies both to the base detection and to the final tuned
  zones after shrink/expand adjustment. The default detection tuning is
  `RMS 0.02`, `Min gap 0.2s`, and `Guard 0.12s`. Detection settings are
  draft-only UI: show them with the temporary tuning slider and hide them after
  confirmation.
- WaveSurfer visual normalization is not enough for silence detection. Analyze
  the decoded audio data directly and keep local loudness normalization enabled
  for recordings with loud peaks and quieter speech.
- Keep selection synchronization driven by `selectedGroupId`; timeline regions
  and the caption group list should scroll to the selected group through their
  own view/model boundary, not by directly calling each other.
- Prefer official WaveSurfer plugins over custom timeline drawing. Custom media
  timeline behavior needs a documented reason that a plugin cannot support it.
- Keep WaveSurfer lane synchronization time-based. Use WaveSurfer `scroll`
  event visible times, the official `setScrollTime()` API, measured rendered
  pixels-per-second, and deferred `requestAnimationFrame` zoom sync so the top
  waveform lane, shared time axis, and caption region lane do not drift while
  the Zoom plugin settles scroll.
- Clamp zoom-out to the rendered fit-to-width value for the active WaveSurfer
  instance. The official Zoom plugin allows this value even when it is below
  the editor's nominal minimum, so synced lanes must share that effective
  minimum instead of keeping the caption lane and top timeline on different
  scales.
- Keep timeline background grid spacing as the exact rendered pixels-per-second
  value. Do not round or apply a visual minimum to the grid step because that
  creates cumulative drift from the official Timeline plugin labels at low zoom.
- Keep waveform amplitude stable across zoom/redraw. If `normalize` is enabled,
  compute one decoded-audio `maxPeak` and pass it to every synchronized
  WaveSurfer lane; otherwise per-canvas normalization can make the same audio
  visually grow or shrink during zoom.
- Keep reusable UI in `components` only when it has no feature orchestration.
- Use Tailwind utilities for workbench styling. Shared repeated UI patterns
  belong in `apps/web/src/shared/ui/styles.ts`; keep `src/index.css` limited to
  Tailwind import/theme tokens and unavoidable WaveSurfer `::part(...)` bridge
  selectors.
- Do not hydrate saved words/groups into the active editor until source media is
  selected; object URLs cannot survive reloads, so stale transcript state must
  remain cache/fallback data only.
- Do not allow manual or automatic project saves before active source media is
  known; otherwise the empty boot state can overwrite a valid saved project.

## Keyboard Shortcuts

Global shortcuts are ignored while typing in editable fields, except the
document-style caption text edits listed below.

- `Space` - loop the selected group; without selection, play/pause the timeline.
- `Command`/`Ctrl` + `Z` - undo the last editor action.
- `Command`/`Ctrl` + `Shift` + `Z` - redo the last undone editor action.
- `Tab` / `Shift+Tab` - select the next or previous caption group.
- `A` / physical `KeyA` - move the selected group's start one frame earlier.
- `D` / physical `KeyD` - move the selected group's start one frame later.
- `ArrowLeft` - move the selected group's end one frame earlier.
- `ArrowRight` - move the selected group's end one frame later.
- `Enter` inside caption text - split the group at the cursor.
- `Backspace` at the start of caption text - merge with the previous group.
- `Delete` / `Backspace` with a skip zone selected - remove the selected skip
  zone.
- `Option` + drag a caption boundary - move only that side of the group and
  leave plain empty space between neighboring groups. Drag it back within snap
  distance to relink the neighboring boundary.
- `Ctrl`/`Command` + wheel over the timeline - zoom around the timestamp under
  the pointer; plain two-finger horizontal scroll pans the timeline.
