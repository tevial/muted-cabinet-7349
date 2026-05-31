# Integration Map

| Integration | Owner | Direction | Protocol | Data | Failure Modes | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Stable-ts local transcription | `apps/api/app/transcription.py` | Local process | Python/PyTorch/Whisper | Source audio/video upload, word timestamp result | Missing dependency, model download/load failure, slow CPU inference | First provider in `TRANSCRIPTION_PROVIDER=auto`; provider regrouping disabled |
| OpenAI transcription API | `apps/api/app/transcription.py` | Outbound | HTTPS via OpenAI SDK | Source audio/video upload, transcript response | Missing API key, provider error, poor timestamps | Server-side fallback or explicit provider |
| Local FastAPI API | `apps/web/src/services/transcription` | Outbound from browser | HTTP multipart | Source media file + language | API unavailable, non-200 response | Defaults to `http://localhost:8787` |
| Browser localStorage | `apps/web/src/services/storage` | Local | Web Storage API | Saved project and transcription cache | Quota errors, stale cache | Ingest normalizes cache |
| Browser File API | Caption workbench | Local | DOM File/Object URL | Source media | Missing metadata, revoked URL | Source media not persisted |
| Browser download | `apps/web/src/shared/browser` | Local | DOM Blob/Object URL | SRT text | User browser blocks download | No server roundtrip |
