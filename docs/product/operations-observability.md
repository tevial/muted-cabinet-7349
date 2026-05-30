# Operations Observability

## Current Signals

| Signal | Where | Purpose |
| --- | --- | --- |
| `[CC flow] upload:*` | Browser console | File selection, fingerprint, cache hit/miss. |
| `[CC flow] transcribe:*` | Browser console | Request, response, ingest summary, cache write. |
| `[CC flow] words/groups state:*` | Browser console | State commits after cache/transcribe/regroup. |
| `console.table` timed rows | Browser console | Inspect word/group timestamp rows. |
| Uvicorn logs | API terminal | API startup and request errors. |

## Rules

- Keep logs short at top level; use collapsed tables for full rows.
- Do not add in-app debug UI unless explicitly requested.
- Do not log secrets or API keys.
- Prefer logging source, input summary, output summary, and diagnostics at module
  boundaries.

## Future

- Add structured API logs for transcription provider response shape.
- Add cache version/model metadata once model choice becomes configurable.
