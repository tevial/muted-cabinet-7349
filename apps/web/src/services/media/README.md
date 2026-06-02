# Media Conversion Service

Browser adapter for preparing selected source media before it enters the editor.

- `mediaConversionClient.ts` detects video uploads and asks the local API to
  extract the first audio stream into a compact MP3 editor audio file.
- Audio uploads pass through unchanged.
- The caption workbench receives a normal `File` either way, so playback,
  fingerprinting, transcription, alignment, cache, and local project restore use
  the existing audio-first pipeline.

Keep ffmpeg details in the API. Do not put caption grouping, WaveSurfer
orchestration, or localStorage behavior in this service.
