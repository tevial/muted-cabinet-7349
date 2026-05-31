# Web Services

Adapters for browser, API, and persistence side effects.

Services may call browser APIs, local API endpoints, or storage APIs. They must
not own caption grouping rules or render UI.

Current services:

- `audio/audioFingerprint.ts` - source media cache fingerprint.
- `api/apiConfig.ts` - shared local API base URL.
- `capcut/capcutClient.ts` - local API CapCut project scan, inspect, import,
  source-preview, dry-run, and patch requests.
- `storage/projectRepository.ts` - local project, serialized skip-zone state,
  and transcription cache.
- `transcription/transcriptionClient.ts` - local API transcription request.
