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
  `TranscriptionResult`.
- Depends on: No app modules.
- Used by: Caption domain, services, feature workbench, UI components.
- Use when: A module needs typed caption data.
- Do not use for: Business rules or UI state transitions.
- Related: [Domain Model](../product/domain-model.md).

### Caption Domain

- Type: domain module
- Location: `apps/web/src/domain/captions`
- Purpose: Own deterministic caption rules, timing normalization, grouping,
  empty-zone calculations, SRT export, and transcription ingest.
- Public API: `groupWords`, `ingestTranscription`, `normalizeGroupTimings`,
  `setGroupBoundary`, `rebuildGroupTiming`, `exportSrt`, `getEmptyZoneCuts`,
  grouping defaults.
- Depends on: Caption contracts only.
- Used by: Caption workbench feature, storage normalization, UI formatting.
- Use when: Transforming caption words/groups or exporting captions.
- Do not use for: API calls, localStorage, DOM downloads, React state.
- Related: [Module Boundaries](../module-boundaries.md).

### Transcription Client

- Type: integration service
- Location: `apps/web/src/services/transcription/transcriptionClient.ts`
- Purpose: Browser-side client for local API transcription requests.
- Public API: `transcribeFile(file, language)`.
- Depends on: Caption contracts, flow logger.
- Used by: Caption workbench feature.
- Use when: Uploading source media to the local API.
- Do not use for: Grouping words or mutating editor state.
- Related: [Fresh Transcription workflow](../product/workflows.md#fresh-transcription).

### Project Repository

- Type: persistence service
- Location: `apps/web/src/services/storage/projectRepository.ts`
- Purpose: Own browser-local project autosave and transcription cache access.
- Public API: `loadProject`, `saveProject`, `loadTranscriptionCache`,
  `saveTranscriptionCache`, `getTranscriptionCacheMeta`, `createSavedProject`.
- Depends on: Caption contracts, caption settings normalization.
- Used by: Caption workbench feature.
- Use when: Reading or writing project/cache state.
- Do not use for: Transcription API calls, grouping decisions, UI rendering.
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

### Caption Workbench Feature

- Type: feature workflow
- Location: `apps/web/src/features/caption-workbench`
- Purpose: Own current page orchestration for upload, cache, transcription,
  grouping, playback, editing, saving, and export.
- Public API: `CaptionWorkbench`.
- Depends on: Caption domain, services, shared UI components.
- Used by: `apps/web/src/App.tsx`.
- Use when: Rendering the main caption editing experience.
- Do not use for: Shared caption domain rules or reusable UI primitives.
- Related: [UI Architecture](../ui-architecture.md).

### Timeline Playback Model

- Type: feature model
- Location: `apps/web/src/features/caption-workbench/model/useTimelinePlayback.ts`
- Purpose: Own audio element refs, playhead state, looped group playback,
  timeline seeking, empty-zone skip playback, and keyboard-compatible playback
  commands.
- Public API: `useTimelinePlayback`.
- Depends on: Caption contracts and caption domain formatting/empty-zone rules.
- Used by: Caption workbench feature controller.
- Use when: The workbench needs to play, seek, loop, or audition caption groups.
- Do not use for: Transcription ingest, grouping, persistence, or rendering UI.
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
- Do not use for: Browser editor state or localStorage behavior.
- Related: [Architecture Context](../product/architecture-context.md).

### API Transcription Route

- Type: integration adapter
- Location: `apps/api/app/main.py`
- Purpose: Keep OpenAI transcription integration and API key on the local server.
- Public API: `POST /api/transcribe`, `POST /api/regroup`, `POST /api/export/srt`,
  `GET /health`.
- Depends on: FastAPI, OpenAI SDK, API captioning module.
- Used by: Web transcription client.
- Use when: Browser needs secret-bearing transcription or API helper endpoints.
- Do not use for: Browser-only deterministic regrouping.
- Related: [Security Baseline](../security-baseline.md).
