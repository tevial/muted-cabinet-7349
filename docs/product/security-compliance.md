# Security And Compliance

## Sensitive Data

| Data | Sensitivity | Location | Protection |
| --- | --- | --- | --- |
| OpenAI API key | Secret | `apps/api/.env` | Never imported by web app; `.env` ignored. |
| Source media | User content | Browser session and transcription API request | Not persisted by app. |
| Transcript/cache | User content | Browser localStorage | Local-only; user can clear browser data. |

## Baseline Rules

- Browser code must call the local API instead of provider APIs directly.
- Do not log API keys, auth headers, or raw secrets.
- Do not commit `.env`, `.venv`, source media uploads, or exports.
- Treat imported transcript/cache JSON as untrusted and validate shape before use.

## Compliance

No formal compliance target is defined for this local tool.
