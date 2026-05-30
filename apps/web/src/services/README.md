# Web Services

Adapters for browser, API, and persistence side effects.

Services may call browser APIs, local API endpoints, or storage APIs. They must
not own caption grouping rules or render UI.

Current services:

- `audio/audioFingerprint.ts` - source media cache fingerprint.
- `storage/projectRepository.ts` - local project and transcription cache.
- `transcription/transcriptionClient.ts` - local API transcription request.
