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
  4. Caption domain ingests returned words and rebuilds groups.
  5. Storage service overwrites the local transcription cache.
  6. Workbench writes words and groups into editor state.
- Result: Editor shows freshly transcribed captions and cache is updated.
- Failure states: API key missing, API down, provider error, invalid response.
- Related domain concepts: CaptionWord, CaptionGroup, TranscriptionCache.

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
