# Deployment View

## Current Deployment

| Environment | Purpose | Deployment | Notes |
| --- | --- | --- | --- |
| Local web | Editor UI | `npm run dev` in `apps/web` | Usually `127.0.0.1:5173`. |
| Local API | Transcription adapter | `uvicorn app.main:app --reload --port 8787` in `apps/api` | `TRANSCRIPTION_PROVIDER=auto` prefers local Stable-ts; `OPENAI_API_KEY` enables fallback or explicit OpenAI mode. |

## Future Deployment

No preview or production deployment is configured. If deployment is added, keep
the API as the secret-bearing boundary and do not expose provider keys to the
browser bundle.
