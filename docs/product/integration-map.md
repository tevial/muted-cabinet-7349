# Integration Map

| Integration | Owner | Direction | Protocol | Data | Failure Modes | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI transcription API | `apps/api` | Outbound | HTTPS via OpenAI SDK | Source audio/video upload, transcript response | Missing API key, provider error, poor timestamps | Server-side only |
| Local FastAPI API | `apps/web/src/services/transcription` | Outbound from browser | HTTP multipart | Source media file + language | API unavailable, non-200 response | Defaults to `http://localhost:8787` |
| Browser localStorage | `apps/web/src/services/storage` | Local | Web Storage API | Saved project and transcription cache | Quota errors, stale cache | Ingest normalizes cache |
| Browser File API | Caption workbench | Local | DOM File/Object URL | Source media | Missing metadata, revoked URL | Source media not persisted |
| Browser download | `apps/web/src/shared/browser` | Local | DOM Blob/Object URL | SRT text | User browser blocks download | No server roundtrip |
