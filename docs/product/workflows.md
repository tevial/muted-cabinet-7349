# Workflows

## Core Workflows

### Upload Source Media

- Actor: User.
- Trigger: User selects an audio or video file.
- Preconditions: Web app is open.
- Steps:
  1. If the selected source is a video file, the media conversion client asks
     the local API to extract the first audio stream into a 96k MP3 editor
     audio file. Audio files skip this step.
  2. Web app creates an object URL for the working audio file.
  3. Audio service computes the working audio fingerprint.
  4. Storage service checks transcription cache for fingerprint/language.
  5. Workbench either keeps the current matching transcript or clears stale
     editor state.
- Result: Source media is staged and cache availability is visible.
- Failure states: Video audio extraction fails, the source has no readable
  audio stream, or fingerprint generation fails. If fingerprinting fails, the
  user can still transcribe but cache behavior may be unavailable.
- Related domain concepts: SourceMedia, TranscriptionCache, SavedProject.

### Load Cached Transcription

- Actor: User.
- Trigger: User clicks `Load Cache`.
- Preconditions: Cache exists for fingerprint/language.
- Steps:
  1. Storage service returns cached transcription.
  2. Caption domain ingests cached words through current grouping settings.
  3. Workbench writes words and generated groups into editor state.
  4. Project autosave persists the editor state.
- Result: Editor is hydrated without an API request.
- Failure states: Cache missing, unreadable, or from a different fingerprint.
- Related domain concepts: CaptionWord, CaptionGroup, GroupingSettings.

### Fresh Transcription

- Actor: User.
- Trigger: User clicks `Transcribe`.
- Preconditions: Source media is selected and API is running.
- Steps:
  1. Workbench ensures a fingerprint exists.
  2. Transcription client uploads the file to the local API.
  3. API calls the configured transcription provider. `auto` tries local
     `stable-ts` first so Whisper timestamps are adjusted with silence
     suppression/VAD, then falls back to OpenAI if local inference cannot run.
  4. Caption domain removes punctuation-only artifacts, ingests returned words,
     and rebuilds groups.
  5. Storage service overwrites the local transcription cache.
  6. Workbench writes words and groups into editor state.
- Result: Editor shows freshly transcribed captions and cache is updated.
- Failure states: API down, local model unavailable, API key missing when
  OpenAI is required, provider error, invalid response.
- Related domain concepts: CaptionWord, CaptionGroup, TranscriptionCache.

### Retranscribe Kept Chunks

- Actor: User.
- Trigger: User clicks the kept-chunk transcription action after creating or
  detecting skip zones.
- Preconditions: Source media is selected or a CapCut project import has a
  rendered audio stem, API is running, and at least one non-skipped timeline
  range exists.
- Steps:
  1. Timeline model exposes ranges left after active skip zones are subtracted.
  2. Workbench inserts temporary loading groups for every kept range.
  3. Workbench uses the uploaded media file or downloads the imported CapCut
     stem as a `File`, then sends selected-range requests through a bounded
     parallel pool.
  4. Each completed range is sanitized and merged immediately into editor state
     while pending ranges remain visible as loading groups.
  5. Workbench disables transcript-derived trimming for this write so the
     action cannot create uncontrolled skip zones around chunks.
  6. Caption domain rebuilds groups and storage updates the local cache after
     all ranges finish.
- Result: Kept timeline ranges progressively receive fresh word-level
  transcription.
- Failure states: API key missing, API down, no words detected, provider error,
  or too many concurrent provider requests for the current project limits.
  Local `stable-ts` inference is serialized around the shared model instance;
  OpenAI fallback still uses the server-side request pool.
- Related domain concepts: CaptionWord, CaptionGroup, EmptyZoneCut.

### Import CapCut Project

- Actor: User.
- Trigger: User clicks `Load CapCut` and imports a scanned or manually entered
  local project path.
- Preconditions: Local API can inspect/render the project and at least one
  audible stem exists.
- Steps:
  1. CapCut client imports the project timeline map and rendered audio stems.
  2. Workbench creates a stable source identity from project path and main
     timeline id.
  3. Storage service checks for a saved editor project under that source key.
  4. If a saved project exists, workbench restores exact words, groups,
     settings, language, and skip-zone state without transcription ingest.
  5. If no saved project exists, workbench clears stale editor state and starts
     an empty editor for that CapCut source.
- Result: Reopening the same CapCut project restores the user's local caption
  groups and skip-zone edits.
- Failure states: Local agent/API unavailable, unsupported draft, no audible
  stems, or unreadable saved project.
- Related domain concepts: CapCutProjectSource, SavedProject, CaptionGroup.

### Regroup Captions

- Actor: User.
- Trigger: User changes caption rules or clicks `Regroup`.
- Preconditions: Editor has caption words.
- Steps:
  1. Caption domain normalizes grouping settings.
  2. Caption domain rebuilds groups from current words using character-based
     wrapping. Active skip-zone gaps are passed as hard boundaries so captions
     do not link across removed timeline ranges.
  3. Workbench replaces group state and preserves selection if possible. If a
     caption text draft is pending, the workbench asks the user to apply or
     revert it before rebuilding from the committed word layer.
- Result: Caption groups reflect current rules.
- Failure states: No words available; group count may be unchanged if settings
  do not change grouping boundaries.
- Related domain concepts: GroupingSettings, CaptionWord, CaptionGroup.

### Edit Caption Text Draft

- Actor: User.
- Trigger: User edits caption text, splits with `Enter`, or merges with
  `Backspace`.
- Preconditions: At least one caption group exists.
- Steps:
  1. Caption editor writes row text, split, and merge changes into a staged
     caption draft instead of regrouping on every keypress.
  2. Workbench disables export, transcription, alignment, and project save
     actions that require committed caption state.
  3. User clicks `Update groups` to apply the draft or `Revert` to discard it.
  4. Caption domain applies the staged text edits to the word layer, then
     rebuilds groups once through the current character-wrap settings and
     active skip-zone boundaries.
  5. Workbench marks the affected caption range dirty for later MFA alignment.
- Result: Text editing behaves like a document draft while the durable editor
  state remains words plus generated groups.
- Failure states: Draft is empty or matches committed groups; applying may
  produce different group boundaries because current grouping settings are
  authoritative.
- Related domain concepts: CaptionWord, CaptionGroup, GroupingSettings.

### Align Caption Timings

- Actor: User.
- Trigger: User clicks `Align selected`, `Align edited`, or `Align all`.
- Preconditions: Source media is selected or a CapCut project import has a
  rendered audio stem, API is running, MFA is installed locally, and at least
  one visible caption group has known text.
- Steps:
  1. Workbench resolves the active media source.
  2. Workbench sends each requested group as a padded audio segment plus known
     caption text to `POST /api/align/segment`.
  3. API prepares a temporary mono WAV fragment and text file.
  4. MFA `align_one` aligns known text to the fragment and returns JSON output.
  5. Caption domain applies returned word intervals to the existing group while
     preserving group identity and text overrides.
  6. Workbench clears dirty alignment state for successfully aligned groups and
     project autosave persists the update.
- Result: Caption groups keep their text and grouping but receive tighter word
  and group timestamps.
- Failure states: MFA CLI missing, dictionary/acoustic model missing, G2P model
  missing for OOV words, no aligned words returned, API down, or source media
  unavailable.
- Related domain concepts: CaptionWord, CaptionGroup, ForcedAlignment.

### Edit Timing And Preview

- Actor: User.
- Trigger: User selects a group and uses keyboard or input controls.
- Preconditions: Source media and caption groups exist.
- Steps:
  1. User selects a group in timeline or block list.
  2. Playback controller loops or plays the selected segment.
  3. Caption domain adjusts group boundaries and adjacent group boundary where
     needed.
  4. Workbench writes normalized groups into editor state.
- Result: User hears timing changes immediately and project autosaves.
- Failure states: No media loaded; selected group no longer exists after
  regroup; active loop is stopped if skip-zone edits, undo/redo, or regrouping
  hide or split the looped caption segment.
- Related domain concepts: CaptionGroup, SourceMedia.

### Export SRT

- Actor: User.
- Trigger: User clicks `Export SRT`.
- Preconditions: At least one caption group exists.
- Steps:
  1. Workbench saves the current project.
  2. Caption domain renders groups to SRT text.
  3. Browser download utility downloads the file.
- Result: User receives `capcut-caption-export.srt`.
- Failure states: Local save fails; export can still proceed.
- Related domain concepts: CaptionGroup, SavedProject.

### Export CapCut Cut Manifest

- Actor: User.
- Trigger: User clicks `Export Cut JSON`.
- Preconditions: At least one caption group exists and the timeline has at
  least one kept range after active skip zones are applied.
- Steps:
  1. Workbench saves the current project.
  2. Caption domain renders a JSON manifest with source metadata, kept ranges,
     source-time caption groups, and the source timeline duration.
  3. Browser download utility downloads
     `capcut-caption-cut-manifest.json`.
- Result: User receives the patch contract consumed by the local CapCut draft
  patcher.
- Failure states: Local save fails; export can still proceed. Empty or
  zero-duration ranges are omitted.
- Related domain concepts: CaptionGroup, EmptyZoneCut, SavedProject.

### Patch CapCut Draft

- Actor: User.
- Trigger: User opens `Patch CapCut`, selects a scanned local project or enters
  a manual project path, then runs dry-run or patch.
- Preconditions: CapCut is closed; the draft uses supported track types
  (`video`, `audio`, and optional `text`), and media segments use `speed=1`.
  Existing text tracks may contain subtitle or plain text materials because the
  patcher replaces them with the editor's normalized caption layer. Transitions
  and other dedicated timeline track types remain outside the supported patch
  shape.
- Steps:
  1. Optional local CapCut agent scans the standard project root and returns
     project summaries. If disabled or unavailable, the user enters a project
     path manually.
  2. Workbench builds the patch manifest in memory from current captions and
     kept ranges.
  3. Patcher inspects root and nested timeline draft files.
  4. Patcher intersects manifest kept ranges with every original video/audio
     segment, then writes remapped target segments while preserving source
     offsets and track layering.
  5. Captions are clipped to kept ranges, dropped when fully inside removed
     zones, and remapped to the shortened timeline.
  6. Patcher normalizes the remapped caption stream for CapCut by dropping
     micro-fragments and trimming overlaps so subtitle segments remain on one
     text layer.
  7. Existing text track/materials are replaced or default subtitle templates
     are generated.
  8. Patch mode creates timestamped backups next to every rewritten file and
     writes active draft payloads.
- Result: Reopening the CapCut project shows the video cut around skipped zones
  and captions placed on the shortened timeline.
- Failure states: Unsupported draft shape, CapCut keeps files locked, malformed
  manifest, a patch that would remove the entire timeline, or captions too short
  to survive export cleanup.
- Related domain concepts: CaptionGroup, EmptyZoneCut, CapCutDraft.
