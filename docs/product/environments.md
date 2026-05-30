# Environments

## Stack

| Capability | Current local stack | Future production notes |
| --- | --- | --- |
| Web UI | React + Vite | Static hosting or desktop wrapper can be evaluated later. |
| API runtime | FastAPI + Uvicorn | Needed wherever provider secrets live. |
| Database | Browser `localStorage` | Cloud/project database is out of scope. |
| Auth | None | Single-user local tool for now. |
| Storage | Browser session file + localStorage metadata | Source media is not uploaded anywhere except transcription API call. |
| Background jobs | None | Transcription runs request/response. |
| Observability | Browser console + API logs | Structured logging can be added later. |

## Environment Matrix

| Environment | Purpose | Resources | Data policy | Notes |
| --- | --- | --- | --- | --- |
| Local | Development and real editing | Local web/API server | User-selected local files | Active target |
| Preview/Staging | Not configured | TBD | Test data only | Future |
| Production | Not configured | TBD | TBD | Future |

## Local Commands

```bash
cd apps/web
npm install
npm run dev
```

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
OPENAI_API_KEY=... uvicorn app.main:app --reload --port 8787
```

## Parity Gaps

| Gap | Risk | Mitigation | Owner |
| --- | --- | --- | --- |
| Browser localStorage only | Cache can contain stale historical data | Ingest normalizes cached transcription before editor write | Storage service + caption domain |
| No production API deployment | Local-only workflow | Keep API adapter isolated | API server |
| No direct CapCut draft export | User must import SRT manually | Keep export module isolated for future exporter | Caption domain/exporter |
