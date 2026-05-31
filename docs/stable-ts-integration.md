# Stable-ts Integration

This document records how CapCut Caption uses
[`stable-ts`](https://github.com/jianfch/stable-ts) and where the integration
must stay isolated.

## Role

Stable-ts is the first local transcription provider in
`TRANSCRIPTION_PROVIDER=auto`. It improves the primary Whisper path by using
word-level timestamps, silence suppression, and optional Silero VAD before the
caption domain ingests words.

Stable-ts does not own durable caption grouping in this project. Its
`regroup=False` option is intentional: `apps/web/src/domain/captions` and
`apps/api/app/captioning.py` remain the single sources of truth for caption
group rules.

## Provider Boundary

`apps/api/app/transcription.py` exposes a small provider contract:

- `TranscriptionBackend`
- `OpenAiTranscriptionBackend`
- `StableTsTranscriptionBackend`
- `FallbackTranscriptionBackend`

FastAPI routes select the provider from environment settings and then call the
shared chunking/segment extraction functions. Route handlers do not import
`stable_whisper` directly.

## Runtime Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `TRANSCRIPTION_PROVIDER` | `auto` | `auto`, `stable-ts`, or `openai`. |
| `STABLE_TS_MODEL` | `base` | Whisper model loaded by Stable-ts. |
| `STABLE_TS_VAD` | `true` | Use Silero VAD for noisier creator audio. |
| `STABLE_TS_VAD_THRESHOLD` | `0.35` | Stable-ts/Silero speech detection threshold. |
| `STABLE_TS_MIN_WORD_DURATION` | `0.1` | Prevent silence suppression from collapsing words. |
| `STABLE_TS_MIN_SILENCE_DURATION` | unset | Ignore shorter non-speech sections when needed. |
| `STABLE_TS_NONSPEECH_ERROR` | `0.1` | Allowed relative error for non-speech clipping. |
| `STABLE_TS_NONSPEECH_SKIP` | `5.0` | Skip long non-speech sections during transcription. |
| `STABLE_TS_REFINE` | `false` | Run Stable-ts refinement after transcription. Slower. |

Tune these settings before adding custom silence heuristics. Stable-ts already
documents the core controls we need: `vad`, `vad_threshold`, `min_word_dur`,
`min_silence_dur`, `nonspeech_error`, `nonspeech_skip`, `only_voice_freq`,
`refine()`, and `adjust_gaps()`.

## Current Use

1. The browser uploads media or a selected segment to the local API.
2. `TRANSCRIPTION_PROVIDER=auto` builds a Stable-ts backend with the configured
   settings.
3. Stable-ts returns word timestamps with silence-aware adjustments.
4. The API sanitizes punctuation-only artifacts and returns words/groups.
5. The caption domain rebuilds deterministic editor groups.
6. The browser cache namespace is `capcut-caption-transcription-v3` so older
   OpenAI-only cached transcripts are not silently reused as Stable-ts output.

If Stable-ts is unavailable and `OPENAI_API_KEY` is set, `auto` falls back to
OpenAI `whisper-1`.

When `TRANSCRIPTION_PROVIDER=stable-ts` is selected explicitly, long media is
sent to Stable-ts as a whole so it can use its own streaming behavior. In
`auto`, the API keeps the existing server-side chunking path because the request
may fall back to OpenAI.

Before loading the model, the provider sets `SSL_CERT_FILE` from `certifi` when
the variable is absent. This avoids the common macOS/Python certificate failure
during the first Whisper checkpoint download.

## Future Work

- Add provider/model/version to transcription cache identity instead of relying
  on namespace bumps.
- Add an explicit alignment endpoint for edited text. Stable-ts can support
  early `audio + known text -> word timestamps`, but MFA remains the stronger
  long-term forced-alignment candidate.
- Compare `STABLE_TS_REFINE=true` on short edited ranges before enabling it for
  full-project transcription.
- Consider Apple Silicon MLX Whisper only behind a separate provider option and
  dependency extra.

## Constraints

The Stable-ts repository is currently archived/read-only. Keep all usage behind
the provider boundary so it can be replaced by MFA, faster-whisper, MLX Whisper,
or another aligner without changing frontend/domain code.
