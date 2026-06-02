# Web Services

Adapters for browser, API, and persistence side effects.

Services may call browser APIs, local API endpoints, or storage APIs. They must
not own caption grouping rules or render UI.

Current services:

- `audio/audioFingerprint.ts` - source media cache fingerprint.
- `api/apiConfig.ts` - shared local API base URL.
- `alignment/alignmentClient.ts` - local API MFA forced-alignment request.
- `capcut/capcutClient.ts` - local API CapCut project scan, inspect, import,
  stem-file download, source-preview, dry-run, and patch requests.
- `media/mediaConversionClient.ts` - local API source-video to editor-audio
  extraction before browser playback, fingerprinting, and transcription.
- `storage/projectRepository.ts` - source-keyed local projects, serialized
  skip-zone state, and transcription cache.
- `transcription/transcriptionClient.ts` - local API transcription request.
