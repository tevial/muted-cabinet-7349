# API Server

FastAPI keeps secret-bearing provider calls out of the browser and exposes local
helpers for transcription, regrouping, and SRT export.

## Module Boundaries

- `app/main.py` owns FastAPI routes and request/response payload mapping.
- `app/transcription.py` owns provider-backed transcription calls, long-media
  chunking, selected-range extraction, and word timestamp reassembly. It keeps
  the OpenAI and `stable-ts` adapters behind the same local service boundary.
- `app/alignment.py` owns Montreal Forced Aligner (MFA) single-segment forced
  alignment. It keeps the external `mfa align_one` CLI and JSON parsing behind a
  separate backend boundary.
- `app/audio_processing.py` owns shared `ffmpeg`/`ffprobe` helpers used by
  transcription and alignment.
- `app/captioning.py` owns server-side caption grouping and SRT helpers.
- `app/capcut_draft.py` owns CapCut draft inspection, dry-run patch planning,
  caption remapping, video segment rewriting, subtitle material generation, and
  timestamped backups.
- `app/capcut_timeline.py` owns CapCut project import: normalized timeline-map
  extraction, marker/source-cut projection, per-track ffmpeg stem rendering, and
  hidden source-range previews.
- `app/capcut_local_agent.py` owns the optional local CapCut project scanner and
  cover lookup. It can be disabled without disabling manual project-path
  patching.
- `POST /api/transcribe/segments` accepts one media upload plus a JSON ranges
  form field. It transcribes selected ranges with bounded server-side
  parallelism, avoiding repeated browser uploads of the same source file.
- `POST /api/align/segment` accepts one media upload, a selected time range, and
  known caption text, then asks MFA to refine word intervals for that segment.
- `POST /api/capcut/inspect` reads a draft folder and reports support details.
- `POST /api/capcut/patch-dry-run` previews the video segment and subtitle
  rewrite without writing files.
- `POST /api/capcut/patch` applies the same rewrite to the original draft after
  creating `.capcut-caption.<timestamp>.bak` backups for every rewritten file.
- `POST /api/capcut/timeline-map` returns the normalized project structure
  without rendering audio artifacts.
- `POST /api/capcut/import` returns the normalized project structure plus
  regenerated per-track audio stems.
- `POST /api/capcut/source-preview` renders a hidden source-cut range on demand.
- `GET /api/capcut/imports/{import_id}/stems/{filename}` serves cached import
  stems and source previews.
- `GET /api/capcut/local-agent` reports whether the local project scanner is
  enabled and whether its configured CapCut projects root exists.
- `GET /api/capcut/projects` lists local CapCut projects when the scanner is
  enabled. If disabled, it returns an empty list and the UI falls back to manual
  project-path input.
- `TRANSCRIPTION_PROVIDER=auto` prefers `stable-ts` for local Whisper
  transcription, silence suppression, and VAD-backed timestamp cleanup, then
  falls back to OpenAI if the local model cannot run and `OPENAI_API_KEY` is
  configured.
- Provider word payloads are sanitized before response mapping so
  punctuation-only artifacts, such as a standalone dash, never become caption
  words or groups.
- Transcription routes offload blocking ffmpeg/OpenAI work to worker threads so
  concurrent segment requests do not serialize on the FastAPI event loop.

## Configuration

- `TRANSCRIPTION_PROVIDER` accepts `auto`, `stable-ts`, or `openai`; it defaults
  to `auto`.
- `OPENAI_API_KEY` is required only for `TRANSCRIPTION_PROVIDER=openai` or for
  the OpenAI fallback in `auto`.
- `STABLE_TS_MODEL` defaults to `base`; use a larger model for quality or a
  smaller model for faster local testing.
- `STABLE_TS_VAD` defaults to `true`, following the Stable-ts/Silero VAD path
  for noisier creator audio. Tune `STABLE_TS_VAD_THRESHOLD`,
  `STABLE_TS_MIN_WORD_DURATION`, `STABLE_TS_MIN_SILENCE_DURATION`,
  `STABLE_TS_NONSPEECH_ERROR`, and `STABLE_TS_NONSPEECH_SKIP` before adding
  custom silence heuristics.
- `STABLE_TS_REFINE` defaults to `false`; enabling it can tighten word
  boundaries but is slower.
- `MAX_PARALLEL_SEGMENT_TRANSCRIPTIONS` defaults to `8` and caps server-side
  batch segment parallelism for `POST /api/transcribe/segments`.
- `MAX_SEGMENT_TRANSCRIPTION_RANGES` defaults to `120` and limits one batch
  request's range count.
- `CAPCUT_LOCAL_AGENT_ENABLED` defaults to `true`. Set it to `false` to disable
  automatic CapCut project scanning while keeping manual patch endpoints active.
- `CAPCUT_PROJECTS_ROOT` defaults to
  `~/Movies/CapCut/User Data/Projects/com.lveditor.draft`.
- `CAPCUT_PROJECT_SCAN_LIMIT` defaults to `120`.
- `MFA_COMMAND` defaults to `mfa`.
- `MFA_DICTIONARY` and `MFA_ACOUSTIC_MODEL` can override the inferred
  `ukrainian_mfa`, `russian_mfa`, or `english_mfa` model names.
- `MFA_G2P_MODEL` can be set when OOV words should use a G2P model.
- `MFA_NUM_JOBS`, `MFA_TIMEOUT_SECONDS`, `MFA_SINGLE_SPEAKER`,
  `MFA_TEXTGRID_CLEANUP`, and `MFA_FINE_TUNE` map to local MFA alignment
  behavior.
- Each MFA alignment request receives its own CLI `--temporary_directory` so
  parallel `align_one` calls do not clean or mutate the same MFA work folder.
  Saved acoustic model zips are extracted into that request-scoped folder
  before the CLI call, avoiding races in MFA's shared `extracted_models`
  directory. Keep `MFA_NUM_JOBS=1` for browser-level parallel alignment unless a
  backend corpus batch endpoint is introduced.

Keep provider integration details inside `app/transcription.py`; route handlers
should stay thin and caption grouping should remain separate.

Keep forced-alignment integration details inside `app/alignment.py`; the
transcription module should not know about MFA and the captioning module should
not shell out to provider tools.

Use `tools/capcut_patch_draft.py inspect|dry-run|patch` for local command-line
testing against CapCut draft folders. The patch manifest should come from the
web app's `Export Cut JSON` action or follow the same shape:

```json
{
  "version": 1,
  "duration": 281.466,
  "keptRanges": [{ "start": 0, "end": 12.34 }],
  "captions": [{ "id": "group_1", "text": "Caption text", "start": 0, "end": 1.2 }]
}
```
