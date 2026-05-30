# Deployment View

## Current Deployment

| Environment | Purpose | Deployment | Notes |
| --- | --- | --- | --- |
| Local web | Editor UI | `npm run dev` in `apps/web` | Usually `127.0.0.1:5173`. |
| Local API | Transcription adapter | `uvicorn app.main:app --reload --port 8787` in `apps/api` | Requires `OPENAI_API_KEY`. |

## Future Deployment

No preview or production deployment is configured. If deployment is added, keep
the API as the secret-bearing boundary and do not expose provider keys to the
browser bundle.
