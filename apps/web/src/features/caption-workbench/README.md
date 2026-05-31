# Caption Workbench Feature

Owner for the main caption editing workflow.

This feature contains:

- `CaptionWorkbench.tsx` - feature controller for source media upload,
  fingerprinting, cache load, transcription, ingest, group editing, keyboard
  shortcuts, document-like group line editing, kept-chunk retranscription,
  autosave, SRT export, and CapCut cut-manifest export.
- `ui/CapCutProjectPatchDialog.tsx` - project patch dialog that consumes the
  optional local CapCut project scanner and falls back to manual project paths.
- `ui/CapCutSourceCutPanel.tsx` - selected source-cut details and hidden
  source-range audio preview for imported CapCut projects.
- `ui/CaptionGapPanel.tsx` - selected subtitle-only gap details and relink
  action.
- `model/useWaveSurferTimeline.ts` - WaveSurfer instances, official plugins,
  playback, precise segment loop, seek, caption regions, editable empty-zone
  skip regions, temporary range selections, caption-gap selection, CapCut
  source-cut selection, derived caption-region masking, zoom, scroll sync, and
  timeline audition state.
- `model/waveSurferTimelineConfig.ts` - WaveSurfer visual options, zoom limits,
  timeline label formatting, and caption region colors.
- `model/silenceDetection.ts` - local waveform silence detection using the
  WaveSurfer-decoded `AudioBuffer`; follows the official WaveSurfer Silence
  example pattern by extracting audible regions first, then deriving editable
  skip-zone gaps without calling transcription or LLM services. It adds local
  loudness normalization, RMS threshold, minimum silence duration, and
  speech-edge guard settings for uneven recordings.
- `ui/CaptionWorkbenchScreen.tsx` - feature view that renders controller props,
  the settings popover, plugin-backed WaveSurfer timeline hosts, and the
  right-rail caption group editor.
- Presentational components from `apps/web/src/components`, including
  `WaveSurferTimeline`, which only renders DOM hosts for the model-owned
  WaveSurfer instances.

Rules:

- Do not duplicate caption grouping or timing logic here; call the caption
  domain.
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
- Keep playback, plugin lifecycle, timeline zoom/scroll, and audition state in
  `model`, not in the screen.
- Treat skip zones as a non-destructive timeline mask. They may hide or split
  caption regions visually and during playback, but source words/groups remain
  in memory so removing or moving the skip zone restores the affected captions.
- Treat caption gaps as subtitle-only ranges. They keep audio/video intact and
  hide only caption display between neighboring groups. `Option` + drag on a
  caption boundary creates or edits a gap; dragging back into the neighboring
  boundary snaps the groups back into a linked boundary.
- The right-rail caption group list follows the same non-destructive mask as the
  timeline: groups fully covered by active skip zones are hidden from the list
  but remain in source state and local project persistence.
- Overlapping skip zones are normalized into one editable zone. This applies to
  user-created, transcript-derived, and waveform-detected zones once the user
  edits or overlaps them.
- Full timeline playback skips active skip zones, but selected group loops stay
  pinned to a currently visible caption segment and must not jump through skip
  zones at the segment boundary. If a skip-zone edit, undo/redo, or regroup
  makes the active loop segment hidden or split, stop the loop instead of
  replaying a stale range. Ordinary caption timing nudges should retarget the
  loop to the group's new visible range rather than stopping playback.
- Keep undo/redo in the feature controller. History stores editor snapshots
  across words, groups, grouping settings, selected group, and skip-zone state.
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
  the scanner is disabled.
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
  zones after shrink/expand adjustment. Detection settings are draft-only UI:
  show them with the temporary tuning slider and hide them after confirmation.
- WaveSurfer visual normalization is not enough for silence detection. Analyze
  the decoded audio data directly and keep local loudness normalization enabled
  for recordings with loud peaks and quieter speech.
- Keep selection synchronization driven by `selectedGroupId`; timeline regions
  and the caption group list should scroll to the selected group through their
  own view/model boundary, not by directly calling each other.
- Prefer official WaveSurfer plugins over custom timeline drawing. Custom media
  timeline behavior needs a documented reason that a plugin cannot support it.
- Keep WaveSurfer lane synchronization time-based. Use WaveSurfer `scroll`
  event visible times, measured rendered pixels-per-second, and deferred
  `requestAnimationFrame` zoom sync so the top waveform lane, shared time axis,
  and caption region lane do not drift while the Zoom plugin settles scroll.
- Keep waveform amplitude stable across zoom/redraw. If `normalize` is enabled,
  compute one decoded-audio `maxPeak` and pass it to every synchronized
  WaveSurfer lane; otherwise per-canvas normalization can make the same audio
  visually grow or shrink during zoom.
- Keep reusable UI in `components` only when it has no feature orchestration.
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
  create a subtitle-only caption gap. Drag it back within snap distance to
  relink the neighboring boundary.
- `Ctrl`/`Command` + wheel over the timeline - zoom around the timestamp under
  the pointer; plain two-finger horizontal scroll pans the timeline.
