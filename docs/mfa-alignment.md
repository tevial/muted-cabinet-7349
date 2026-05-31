# MFA Alignment Integration

This document records how CapCut Caption uses Montreal Forced Aligner (MFA) for
caption timing refinement.

## Official References

- MFA command reference:
  https://montreal-forced-aligner.readthedocs.io/en/stable/user_guide/commands.html
- MFA alignment workflow and `align_one` command:
  https://montreal-forced-aligner.readthedocs.io/en/stable/user_guide/workflows/alignment.html
- MFA corpus structure:
  https://montreal-forced-aligner.readthedocs.io/en/stable/user_guide/corpus_structure.html
- MFA corpus reference:
  https://montreal-forced-aligner.readthedocs.io/en/stable/reference/corpus/index.html

## Role In The Product

MFA is not the primary transcription engine. Primary recognition stays in the
transcription module through Stable-ts/OpenAI. MFA is used after text exists, so
the user can ask the editor to refine word and caption-group timestamps against
the source audio.

Supported UX entry points:

- Align selected: run MFA for the currently selected visible caption group, even
  if its text was not edited.
- Align edited: run MFA only for caption groups marked dirty by text editing,
  splitting, or merging.
- Align all: run MFA for all currently visible caption groups.

This keeps caption correction document-like while still giving users a direct
button for "the text is right; make the timestamps tighter."

## Backend Boundary

Backend alignment lives in `apps/api/app/alignment.py`.

The public route is:

```text
POST /api/align/segment
multipart/form-data:
  file: source audio/video or rendered CapCut stem
  start: segment start in editor seconds
  end: segment end in editor seconds
  text: known caption text to align
  language: optional language code
```

The route is intentionally thin. It maps request/response payloads and delegates
all provider work to the MFA backend.

## MFA Command Shape

For single caption groups, the implementation follows the official `align_one`
workflow instead of building a full corpus:

```bash
mfa align_one \
  --output_format json \
  --single_speaker \
  --clean \
  --overwrite \
  --temporary_directory REQUEST_TEMP_DIR \
  SOUND_FILE_PATH \
  TEXT_FILE_PATH \
  DICTIONARY_PATH \
  ACOUSTIC_MODEL_PATH \
  OUTPUT_PATH
```

The API writes a temporary mono 16 kHz WAV fragment and a text file containing
the exact caption text. It parses MFA JSON output and shifts word intervals back
to the editor timeline by the requested segment start.

Each `/api/align/segment` request passes a unique MFA `--temporary_directory`.
This is required for browser-side group parallelism: MFA's default temporary
directory is shared by all CLI invocations, and running multiple `align_one`
processes with `--clean` can otherwise remove or rewrite temporary model files
while another process is still using them. When `MFA_NUM_JOBS=1`, the API also
passes `--no_use_mp` to avoid nested MFA multiprocessing inside already-parallel
browser requests.

For saved acoustic model names such as `ukrainian_mfa`, the API resolves
`~/Documents/MFA/pretrained_models/acoustic/<name>.zip` and extracts it into the
request-scoped MFA temporary directory before calling `align_one`. This avoids
parallel reads from MFA's shared `extracted_models/acoustic` folder, which can
surface as intermittent Kaldi/FileNotFound 502 responses under load.

## Model Selection

The backend can infer MFA model names for the languages we currently use:

- `uk`, `ukr`, `ukrainian` -> `ukrainian_mfa`
- `ru`, `rus`, `russian` -> `russian_mfa`
- `en`, `eng`, `english` -> `english_mfa`

Environment variables can override this when the user installs custom model
paths or saved MFA model names:

```env
MFA_COMMAND=mfa
MFA_DICTIONARY=
MFA_ACOUSTIC_MODEL=
MFA_G2P_MODEL=
MFA_NUM_JOBS=1
MFA_TIMEOUT_SECONDS=180
MFA_SINGLE_SPEAKER=true
MFA_TEXTGRID_CLEANUP=true
MFA_FINE_TUNE=false
```

MFA itself remains an external local dependency. If the CLI is not installed or
models are missing, `/api/align/segment` returns a clear 502 error rather than
falling back to transcription.

When `MFA_COMMAND` is an absolute path, the API prepends that command's
directory to the subprocess `PATH`. This is required because MFA launches
OpenFST/Kaldi binaries such as `fstcompile` from the same conda environment;
calling only the absolute `mfa` executable is not enough.

## Frontend Boundary

Browser calls live in `apps/web/src/services/alignment/alignmentClient.ts`.
Caption data application lives in `apps/web/src/domain/captions/alignment.ts`.
The workbench owns orchestration only:

1. Resolve active source media.
2. Add a small alignment pad around the caption group.
3. Call `/api/align/segment`.
4. Apply returned word intervals through the caption domain helper.
5. Clear dirty alignment state for successful groups.

The domain helper preserves existing word IDs where possible, creates IDs only
for inserted aligned words, keeps `textOverride` intact, and respects the
linked/detached boundary model:

- If the aligned group was linked to the previous group, the aligned start
  becomes the shared boundary and updates the previous group's end.
- If the aligned group was linked to the next group, the right boundary stays at
  the next group's start.
- If the aligned group is detached on the right, or is the final group, MFA can
  update both start and end.

The workbench runs up to four group-level MFA requests in parallel, but applies
completed results back to editor state in group order. That gives live progress
in the caption list/timeline while keeping neighboring caption boundaries
deterministic.

If repeated 5xx alignment responses occur, the workbench stops queueing new
groups after the current in-flight requests settle. This keeps a broken local
MFA environment from flooding the browser console with one failed request per
caption group.

## Current Limits

- Alignment is group-scoped. It does not yet align a long edited passage as one
  corpus with multiple utterances.
- `Align all` uses a conservative browser-side concurrency of four requests.
  MFA-internal parallelism should still be controlled by `MFA_NUM_JOBS`.
- A future corpus-backed batch endpoint should replace many `align_one` calls
  for large projects once we add streamed progress from the backend.
- Restore/re-open source-cut material is still a separate CapCut draft editing
  phase. MFA only updates caption/word timings.
