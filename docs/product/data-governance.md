# Data Governance

| Data | Classification | Stored Where | Retention | Owner |
| --- | --- | --- | --- | --- |
| OpenAI API key | Secret | `apps/api/.env` | User-managed | API server |
| Source media file | User content | Browser session; sent to API/provider during transcription | Not persisted by app | User/browser |
| Caption words/groups | User content | Browser localStorage | Until browser data is cleared or overwritten | Storage service |
| Caption settings | User preferences | Browser localStorage | Until browser data is cleared or overwritten | Storage service |
| Console diagnostics | Developer diagnostics | Browser console | Session/devtools retention | Flow logger |

## Rules

- Never expose API keys to browser code.
- Do not log secrets or raw auth headers.
- Do not persist source media bytes in browser storage.
- Keep cache identity scoped by fingerprint and language.
- Normalize cached data through the caption domain before editor state writes.
