# Modules And Services Catalog

This catalog tracks reusable logic modules, services, workflows, exporters,
integrations, tools, and other public non-UI surfaces.

## Modules

### Caption Contracts

- Type: contract
- Location: `apps/web/src/contracts/captions.ts`
- Purpose: Shared TypeScript data contracts for words, groups, settings, and
  transcription responses.
- Public API: `CaptionWord`, `CaptionGroup`, `GroupingSettings`,
  `TranscriptionResult`, `AlignmentResult`.
- Depends on: No app modules.
- Used by: Caption domain, services, feature workbench, UI components.
- Use when: A module needs typed caption data.
- Do not use for: Business rules or UI state transitions.
- Related: [Domain Model](../product/domain-model.md).

### CapCut Timeline Contracts

- Type: contract
- Location: `apps/web/src/contracts/capcut.ts`
- Purpose: Shared TypeScript data contracts for imported CapCut timeline maps,
  per-track audio stems, projected markers, project gaps, and source-cut
  boundaries.
- Public API: `CapCutTimelineMap`, `CapCutTimelineTrack`,
  `CapCutTimelineSegment`, `CapCutAudioStem`, `CapCutProjectImport`,
  `CapCutSourcePreview`.
- Depends on: No app modules.
- Used by: CapCut client, caption workbench, CapCut import dialog, and
  multitrack preview.
- Use when: Browser modules need typed CapCut project-import data from the
  local API.
- Do not use for: Draft parsing, ffmpeg rendering, browser persistence, or UI
  state transitions.
- Related: [CapCut Cut Export Plan](../capcut-cut-export-plan.md).

### Caption Domain

- Type: domain module
- Location: `apps/web/src/domain/captions`
- Purpose: Own deterministic caption rules, character-wrap grouping with
  optional skip-zone break ranges, timing normalization, word-layer text
  editing, detached-boundary empty space, empty-zone calculations, SRT
  export, CapCut patch manifest generation, and transcription ingest.
- Public API: `groupWords`, `ingestTranscription`, `normalizeGroupTimings`,
  `setGroupBoundary`, `rebuildGroupTiming`, `exportSrt`,
  `getEmptyZoneCuts`, `buildCapCutPatchManifest`, `sanitizeCaptionWords`,
  `applyAlignedWordsToGroup`, `applyGroupTextEditToWords`,
  `applyCaptionGroupDraftToWords`, grouping defaults.
- Depends on: Caption contracts only.
- Used by: Caption workbench feature, storage normalization, UI formatting.
- Use when: Transforming caption words/groups or exporting captions.
- Do not use for: API calls, localStorage, DOM downloads, React state.
- Related: [Module Boundaries](../module-boundaries.md).

### Transcription Client

- Type: integration service
- Location: `apps/web/src/services/transcription/transcriptionClient.ts`
- Purpose: Browser-side client for local API transcription requests.
- Public API: `transcribeFile(file, language)`, `transcribeFileSegment(...)`,
  `transcribeFileSegments(...)`.
- Depends on: Caption contracts, flow logger.
- Used by: Caption workbench feature.
- Use when: Uploading source media to the local API.
- Do not use for: Grouping words or mutating editor state.
- Related: [Fresh Transcription workflow](../product/workflows.md#fresh-transcription).

### Media Conversion Client

- Type: integration service
- Location: `apps/web/src/services/media/mediaConversionClient.ts`
- Purpose: Detect selected video sources and ask the local API to extract a
  compact MP3 editor audio file before the workbench creates playback URLs,
  fingerprints, transcription requests, or alignment requests.
- Public API: `isVideoSourceFile`, `extractEditorAudioFromVideo`,
  `prepareSourceMediaFile`.
- Depends on: Shared API config, shared API error parsing, flow logger.
- Used by: Caption workbench feature upload flow.
- Use when: Browser source-media selection needs to normalize video input into
  the same audio-file pipeline used by existing editor workflows.
- Do not use for: Caption grouping, persistence, WaveSurfer orchestration, or
  CapCut draft parsing.
- Related: [Upload Source Media workflow](../product/workflows.md#upload-source-media).

### Alignment Client

- Type: integration service
- Location: `apps/web/src/services/alignment/alignmentClient.ts`
- Purpose: Browser-side client for local API MFA forced-alignment requests.
- Public API: `alignFileSegment(file, language, start, end, text)`,
  `AlignmentRequestError`, `isAlignmentServiceError`.
- Depends on: Caption contracts, flow logger, shared API config.
- Used by: Caption workbench feature.
- Use when: Refining existing caption text against source audio.
- Do not use for: Transcription, grouping, or mutating editor state directly.
- Notes: The workbench currently calls this API with bounded concurrency and
  applies results through the caption domain helper in caption order. Repeated
  service errors stop large queues before every group emits the same failure.
- Related: [MFA Alignment Integration](../mfa-alignment.md).

### CapCut Client

- Type: browser integration service
- Location: `apps/web/src/services/capcut/capcutClient.ts`
- Purpose: Own browser calls to the local CapCut API for optional project
  scanning, inspect, import, source preview, dry-run, and patch actions.
- Public API: `listCapCutProjects`, `inspectCapCutProject`,
  `loadCapCutTimelineMap`, `importCapCutProject`,
  `loadCapCutStemFile`, `loadCapCutSourcePreview`, `dryRunCapCutPatch`,
  `patchCapCutProject`.
- Depends on: Shared API config, CapCut patch manifest contract, CapCut
  timeline contracts.
- Used by: Caption workbench feature.
- Use when: Browser UI needs to interact with local CapCut project tooling.
- Do not use for: Building manifests, rendering UI, or direct filesystem
  access.
- Related: [Patch CapCut Draft workflow](../product/workflows.md#patch-capcut-draft),
  [CapCut Cut Export Plan](../capcut-cut-export-plan.md).

### CapCut Timeline Map

- Type: backend integration/domain mapper
- Location: `apps/api/app/capcut_timeline.py`
- Purpose: Read CapCut draft files into a normalized timeline map, identify
  project gaps/source-cut boundaries/markers, render per-track audio stems, and
  render hidden source previews.
- Public API: `build_capcut_timeline_map`, `render_capcut_track_stems`,
  `render_capcut_source_preview`, `get_import_stem_path`.
- Depends on: CapCut draft file resolution helpers and local `ffmpeg`.
- Used by: CapCut API routes for project import and source preview.
- Use when: Loading a CapCut project into the editor without treating a rendered
  waveform as the project source of truth.
- Do not use for: Browser state, caption grouping, SRT export, or directly
  patching draft files.
- Related: [CapCut Cut Export Plan](../capcut-cut-export-plan.md).

### MFA Alignment Backend

- Type: backend integration service
- Location: `apps/api/app/alignment.py`
- Purpose: Run `mfa align_one` against a selected audio fragment and known text,
  parse JSON output, and return editor-timeline word intervals.
- Public API: `MfaAlignmentBackend`, `MfaOptions`, `align_audio_segment`.
- Depends on: Local MFA CLI, shared audio processing helpers, temporary files.
- Used by: `POST /api/align/segment`.
- Use when: Tightening timestamps for already-known caption text.
- Do not use for: Primary speech recognition, caption grouping, browser state,
  or CapCut draft patching.
- Notes: Each `align_one` call receives a request-scoped MFA temporary
  directory and a request-local extracted acoustic model when a saved MFA model
  zip exists, preventing parallel requests from cleaning or reading the same MFA
  work folder. Large-project batch/corpus alignment is planned as a separate
  backend endpoint so the UI can keep progress visible without overloading
  local MFA.
- Related: [MFA Alignment Integration](../mfa-alignment.md).

### Project Repository

- Type: persistence service
- Location: `apps/web/src/services/storage/projectRepository.ts`
- Purpose: Own browser-local project autosave, source-keyed project restore,
  manual-vs-auto grouping mode, serialized skip-zone restore, and transcription
  cache access.
- Public API: `loadProject`, `loadProjectBySource`, `saveProject`,
  `loadTranscriptionCache`, `saveTranscriptionCache`,
  `getTranscriptionCacheMeta`, `getSavedProjectSourceKey`,
  `createSavedProject`, `SavedProjectSource`, `SavedTimelineSkipState`.
- Depends on: Caption contracts, caption settings normalization.
- Used by: Caption workbench feature.
- Use when: Reading or writing project/cache state, including per-file or
  per-CapCut-project editor snapshots and serialized skip-zone state.
- Do not use for: Transcription API calls, grouping decisions, UI rendering, or
  activating saved transcript state before source media is selected.
- Related: [Data Governance](../product/data-governance.md).

### Audio Fingerprint Service

- Type: utility service
- Location: `apps/web/src/services/audio/audioFingerprint.ts`
- Purpose: Create stable local cache keys from source media bytes and size.
- Public API: `createAudioFingerprint(file)`.
- Depends on: Browser Crypto API.
- Used by: Caption workbench feature.
- Use when: Checking cache identity for a selected file.
- Do not use for: Playback or transcription.
- Related: [Upload Source Media workflow](../product/workflows.md#upload-source-media).

### Flow Logger

- Type: observability utility
- Location: `apps/web/src/shared/observability/flowLogger.ts`
- Purpose: Console diagnostics for upload, cache, transcription, ingest, and
  editor state commits.
- Public API: `flowLog`, `flowWarn`, `flowTimedTable`,
  `summarizeTimestampDiagnostics`, summary helpers.
- Depends on: Caption contracts.
- Used by: Services and caption workbench feature during active debugging.
- Use when: Auditing data flow without adding in-app debug UI.
- Do not use for: Product analytics or logging secrets/private tokens.
- Related: [Operations Observability](../product/operations-observability.md).

### Browser Download Utility

- Type: browser adapter
- Location: `apps/web/src/shared/browser/downloadTextFile.ts`
- Purpose: Isolate DOM file-download side effects.
- Public API: `downloadTextFile(filename, content)`.
- Depends on: Browser DOM APIs.
- Used by: Caption workbench export action.
- Use when: Downloading generated text artifacts.
- Do not use for: Domain export formatting.
- Related: [Export SRT workflow](../product/workflows.md#export-srt).

### Shared UI Styling

- Type: UI utility module
- Location: `apps/web/src/shared/ui`
- Purpose: Own reusable Tailwind class constants and the `cx` helper for
  composing conditional class names without reintroducing large CSS files.
- Public API: `ui`, `cx`.
- Depends on: Tailwind theme tokens declared in `apps/web/src/index.css`.
- Used by: Shared components and caption workbench feature views.
- Use when: Reusing a common visual pattern such as buttons, panels, dialogs,
  compact row actions, timeline host structure, or form controls.
- Do not use for: Caption domain rules, feature state transitions, or direct
  WaveSurfer instance orchestration.
- Notes: `apps/web/src/index.css` remains as the Tailwind entry and token file;
  its only component-level selectors are WaveSurfer `::part(...)` bridge rules
  for plugin shadow/part styling.

### CapCut Patch Manifest Export

- Type: domain exporter
- Location: `apps/web/src/domain/captions/capcutManifest.ts`
- Purpose: Build the JSON contract consumed by CapCut draft patching tools from
  editor caption groups and kept timeline ranges.
- Public API: `buildCapCutPatchManifest`.
- Depends on: Caption contracts and caption timing utilities.
- Used by: Caption workbench export action.
- Use when: Exporting current editor skip-zone intent and captions for direct
  CapCut draft rewriting.
- Do not use for: Writing CapCut files, DOM downloads, or API calls.
- Related: [Export CapCut Cut Manifest workflow](../product/workflows.md#export-capcut-cut-manifest).

### Caption Workbench Feature

- Type: feature workflow
- Location: `apps/web/src/features/caption-workbench`
- Purpose: Own current page orchestration for upload, cache, transcription,
  grouping, playback, editing, undo/redo history, selected-range transcription,
  progressive kept-chunk retranscription, skip-zone persistence, saving, and
  export.
- Public API: `CaptionWorkbench`.
- Depends on: Caption domain, services, shared UI components.
- Used by: `apps/web/src/App.tsx`.
- Use when: Rendering the main caption editing experience.
- Do not use for: Shared caption domain rules or reusable UI primitives.
- Related: [UI Architecture](../ui-architecture.md).

### WaveSurfer Timeline Model

- Type: feature model
- Location: `apps/web/src/features/caption-workbench/model/useWaveSurferTimeline.ts`
- Purpose: Own WaveSurfer instances, official plugins, playback commands,
  playback-speed control, caption region reconciliation, whole-surface
  horizontal wheel scrolling, two-lane scroll/zoom synchronization,
  synchronized zoom-event feedback guards, separate Minimap container wiring
  with viewport drag and range-select-to-zoom controls,
  editable manual/automatic empty-zone skip regions, non-destructive caption
  region masking, temporary range selection actions, empty-zone skip playback,
  overlapping skip-zone normalization, detected-silence tuning controls,
  stale/duplicate plugin-region cleanup after skip-zone merges,
  selected-region scroll alignment, skip-aware group loop ranges, loop
  invalidation when skip edits hide or split the active segment, and
  keyboard-compatible audition commands. Synchronization is time-based rather
  than raw-scroll-pixel-based, and normalized lanes share a decoded-audio
  `maxPeak` so waveform height remains stable across zoom/redraw.
- Public API: `useWaveSurferTimeline`.
- Depends on: WaveSurfer.js, caption contracts, and caption domain
  formatting/empty-zone rules.
- Used by: Caption workbench feature controller.
- Use when: The workbench needs to render, seek, zoom, loop, or audition source
  media, caption regions, transcript-derived skip overlays, or user-created
  skip overlays.
- Do not use for: Transcription ingest, grouping, persistence, or rendering
  presentational UI.
- Related: [Caption Workbench Feature](#caption-workbench-feature).

### Timeline Silence Detection

- Type: feature model helper
- Location: `apps/web/src/features/caption-workbench/model/silenceDetection.ts`
- Purpose: Extract audible regions from a WaveSurfer-decoded `AudioBuffer`,
  derive the silent gaps between them, and return editable skip-zone cuts that
  can be widened or narrowed before confirmation. Supports local loudness
  normalization, RMS threshold, minimum duration, and speech-edge guard
  settings. The minimum duration is enforced after boundary tuning as well as
  during initial detection. Default tuning starts at `RMS 0.02`, `Min gap 0.2s`,
  and `Guard 0.12s`.
- Public API: `detectSilenceCuts`, `defaultSilenceDetectionSettings`,
  `normalizeSilenceDetectionSettings`.
- Depends on: Browser Web Audio `AudioBuffer` and caption timing formatting.
- Used by: WaveSurfer timeline model when the user asks the editor to detect
  silent zones from the waveform.
- Use when: Generating skip-zone candidates from source audio without
  transcription or LLM calls.
- Do not use for: Text grouping, SRT export, or CapCut draft rewriting.
- Related: [WaveSurfer Timeline Model](#wavesurfer-timeline-model).

### WaveSurfer Timeline Config

- Type: feature configuration
- Location: `apps/web/src/features/caption-workbench/model/waveSurferTimelineConfig.ts`
- Purpose: Provide the single source of truth for WaveSurfer visual options,
  zoom limits, playback-speed limits, plugin labels, and caption region colors.
  Waveform lanes use WaveSurfer's continuous waveform rendering instead of
  bar-style rendering so speech shape remains inspectable while editing.
- Public API: `timelineZoomConfig`, `waveformLaneOptions`,
  `captionLaneOptions`, `captionRegionColors`, `formatTimelineLabel`,
  `formatZoomLabel`, `playbackSpeedConfig`, `formatPlaybackRateLabel`.
- Depends on: No app state.
- Used by: WaveSurfer timeline model and workbench screen controls.
- Use when: Adjusting WaveSurfer timeline presentation or zoom behavior.
- Do not use for: Caption grouping, playback orchestration, or persistence.
- Related: [WaveSurfer Refactor Plan](../wavesurfer-refactor-plan.md).

### Kept Chunk Transcription Helper

- Type: feature model helper
- Location: `apps/web/src/features/caption-workbench/model/chunkTranscription.ts`
- Purpose: Own kept-chunk transcription UI helpers, pending loading groups,
  bounded client-side concurrency, and merge helpers for progressive chunk
  recognition.
- Public API: `getKeptChunkTranscriptionConcurrency`,
  `createPendingChunkGroups`, `mergeGroupsWithPendingChunks`,
  `isPendingChunkGroup`, `runWithConcurrency`.
- Depends on: Caption contracts.
- Used by: Caption workbench feature and WaveSurfer timeline model.
- Use when: The workbench needs visible loading placeholders or bounded
  parallel selected-range transcription.
- Do not use for: Provider API calls, caption grouping, or persistence.
- Related: [Caption Workbench Feature](#caption-workbench-feature).

### API Captioning Module

- Type: API domain module
- Location: `apps/api/app/captioning.py`
- Purpose: Server-side caption grouping and SRT helpers for API routes.
- Public API: `Word`, `CaptionGroup`, `GroupingSettings`, `group_words`,
  `export_srt`.
- Depends on: Python standard library.
- Used by: FastAPI routes.
- Use when: API needs server-side caption grouping/export behavior.
- Do not use for: Browser editor state or localStorage behavior. Keep grouping
  parity with the browser caption domain: current rules wrap by `maxChars` and
  never split a word to satisfy the character limit. The browser layer adds
  active skip-zone break ranges when rebuilding editor groups.
- Related: [Architecture Context](../product/architecture-context.md).

### API Transcription Service

- Type: integration service
- Location: `apps/api/app/transcription.py`
- Purpose: Own provider-backed transcription requests, long-media chunking, and
  timestamp reassembly before the API route builds response payloads. Also owns
  ffmpeg-backed selected-segment extraction for partial and kept-chunk
  retranscription. Provider adapters include OpenAI and Stable-ts behind a
  shared `TranscriptionBackend` contract.
- Public API: `TranscriptionBackend`, `OpenAiTranscriptionBackend`,
  `StableTsTranscriptionBackend`, `FallbackTranscriptionBackend`,
  `StableTsOptions`, `transcribe_audio(backend, filename, audio_bytes, language)`,
  `transcribe_audio_segment(backend, filename, audio_bytes, language, start, end)`.
- Depends on: OpenAI SDK, optional Stable-ts/PyTorch/Whisper runtime, local
  `ffmpeg`/`ffprobe` when chunking long media.
- Used by: API transcription route.
- Use when: Server-side code needs provider transcription with word timestamps.
- Do not use for: Caption grouping, browser cache, or UI state. Stable-ts
  provider regrouping is intentionally disabled because grouping belongs to the
  caption domain.
- Related: [Fresh Transcription workflow](../product/workflows.md#fresh-transcription).

### API Audio Processing Helpers

- Type: backend utility service
- Location: `apps/api/app/audio_processing.py`
- Purpose: Own shared `ffmpeg`/`ffprobe` operations for source-video audio
  extraction, request-local audio segment rendering, and duration probing.
- Public API: `has_ffmpeg`, `probe_duration`, `extract_editor_audio`,
  `create_mono_wav_segment`, `AudioProcessingError`.
- Depends on: Local `ffmpeg`/`ffprobe` binaries.
- Used by: Source media extraction route, API transcription service, and MFA
  alignment backend.
- Use when: Backend code needs deterministic media preparation before handing
  audio to WaveSurfer-facing browser workflows, transcription providers, or
  alignment tools.
- Do not use for: Browser state, caption grouping, or CapCut draft rewriting.
- Notes: Editor audio extraction currently returns a 96k MP3 from the first
  source audio stream so direct video uploads follow the same browser pipeline
  as manually prepared audio files.
- Related: [Upload Source Media workflow](../product/workflows.md#upload-source-media).

### API CapCut Draft Patcher

- Type: API domain module
- Location: `apps/api/app/capcut_draft.py`
- Purpose: Inspect supported CapCut draft folders, preview or apply direct
  timeline cuts, remap all source video/audio segments against kept ranges,
  replace text tracks, sanitize the final caption stream for CapCut's one-layer
  subtitle behavior, and create timestamped backups before writes.
- Public API: `inspect_capcut_draft`, `preview_capcut_patch`,
  `patch_capcut_draft`, `TimeRange`, `CaptionPatch`, `CapCutDraftError`.
- Depends on: Python standard library and CapCut draft JSON shape.
- Used by: FastAPI CapCut routes and `tools/capcut_patch_draft.py`.
- Use when: Local tooling needs to transform an exported cut manifest into a
  patched CapCut draft.
- Do not use for: Browser editor state, transcription provider calls, or SRT
  formatting.
- Related: [Patch CapCut Draft workflow](../product/workflows.md#patch-capcut-draft).

### API CapCut Local Agent

- Type: optional local filesystem adapter
- Location: `apps/api/app/capcut_local_agent.py`
- Purpose: Scan the standard local CapCut projects root, summarize project
  folders, and serve draft cover previews for the project picker.
- Public API: `get_local_agent_status`, `list_capcut_projects`,
  `get_project_cover_path`, `get_default_projects_root`.
- Depends on: API CapCut draft inspector and local filesystem access.
- Used by: FastAPI CapCut project list and cover routes.
- Use when: The UI should offer a local project picker without requiring a
  pasted path.
- Do not use for: Draft rewriting or manual project-path patching; those remain
  in the CapCut draft patcher.
- Related: [Patch CapCut Draft workflow](../product/workflows.md#patch-capcut-draft).

### API Transcription Route

- Type: integration adapter
- Location: `apps/api/app/main.py`
- Purpose: Keep transcription provider integration and any remote API key on the
  local server.
- Public API: `POST /api/transcribe`, `POST /api/regroup`, `POST /api/export/srt`,
  `POST /api/media/extract-audio`,
  `POST /api/transcribe/segment`, `POST /api/transcribe/segments`,
  `POST /api/capcut/inspect`, `POST /api/capcut/patch-dry-run`,
  `POST /api/capcut/patch`, `GET /api/capcut/local-agent`,
  `GET /api/capcut/projects`, `GET /api/capcut/projects/cover`,
  `POST /api/capcut/timeline-map`, `POST /api/capcut/import`,
  `POST /api/capcut/source-preview`,
  `GET /api/capcut/imports/{import_id}/stems/{filename}`, `GET /health`.
- Depends on: FastAPI, API transcription service, API captioning module, API
  CapCut draft patcher, CapCut timeline map importer, optional API CapCut local
  agent.
- Used by: Web transcription client.
- Use when: Browser needs secret-bearing transcription or API helper endpoints.
- Do not use for: Browser-only deterministic regrouping.
- Related: [Security Baseline](../security-baseline.md).
