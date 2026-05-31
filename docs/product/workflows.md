# Workflows

## Core Workflows

### Upload Source Media

- Actor: User.
- Trigger: User selects an audio or video file.
- Preconditions: Web app is open.
- Steps:
  1. Web app creates an object URL for playback.
  2. Audio service computes the file fingerprint.
  3. Storage service checks transcription cache for fingerprint/language.
  4. Workbench either keeps the current matching transcript or clears stale
     editor state.
- Result: Source media is staged and cache availability is visible.
- Failure states: Fingerprint generation fails; user can still transcribe but
  cache behavior may be unavailable.
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
  3. API calls the transcription provider and returns word-level timestamps.
  4. Caption domain removes punctuation-only artifacts, ingests returned words,
     and rebuilds groups.
  5. Storage service overwrites the local transcription cache.
  6. Workbench writes words and groups into editor state.
- Result: Editor shows freshly transcribed captions and cache is updated.
- Failure states: API key missing, API down, provider error, invalid response.
- Related domain concepts: CaptionWord, CaptionGroup, TranscriptionCache.

### Retranscribe Kept Chunks

- Actor: User.
- Trigger: User clicks the kept-chunk transcription action after creating or
  detecting skip zones.
- Preconditions: Source media is selected, API is running, and at least one
  non-skipped timeline range exists.
- Steps:
  1. Timeline model exposes ranges left after active skip zones are subtracted.
  2. Workbench inserts temporary loading groups for every kept range.
  3. Workbench sends selected-range requests through a bounded parallel pool.
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
- Related domain concepts: CaptionWord, CaptionGroup, EmptyZoneCut.

### Regroup Captions

- Actor: User.
- Trigger: User clicks `Regroup` after changing caption rules.
- Preconditions: Editor has caption words.
- Steps:
  1. Caption domain normalizes grouping settings.
  2. Caption domain rebuilds groups from current words.
  3. Workbench replaces group state and preserves selection if possible.
- Result: Caption groups reflect current rules.
- Failure states: No words available; group count may be unchanged if settings
  do not change grouping boundaries.
- Related domain concepts: GroupingSettings, CaptionWord, CaptionGroup.

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
- Failure states: No media loaded; selected group no longer exists after regroup.
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
- Preconditions: CapCut is closed; the draft has the supported simple shape:
  one primary video track, one source segment, optional one text track, no
  overlays or transitions.
- Steps:
  1. Optional local CapCut agent scans the standard project root and returns
     project summaries. If disabled or unavailable, the user enters a project
     path manually.
  2. Workbench builds the patch manifest in memory from current captions and
     kept ranges.
  3. Patcher inspects root and nested timeline draft files.
  4. Patcher converts manifest kept ranges into consecutive CapCut target
     segments and preserves original source offsets.
  5. Captions are clipped to kept ranges, dropped when fully inside removed
     zones, and remapped to the shortened timeline.
  6. Existing subtitle text track/materials are replaced or default subtitle
     templates are generated.
  7. Patch mode creates timestamped backups next to every rewritten file and
     writes active draft payloads.
- Result: Reopening the CapCut project shows the video cut around skipped zones
  and captions placed on the shortened timeline.
- Failure states: Unsupported draft shape, CapCut keeps files locked, malformed
  manifest, or a patch that would remove the entire timeline.
- Related domain concepts: CaptionGroup, EmptyZoneCut, CapCutDraft.
