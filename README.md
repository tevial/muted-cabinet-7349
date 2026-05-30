# CapCut Caption

CapCut Caption is a local caption-editing tool for short-form videos. It keeps word-level timestamps as the source of truth, lets you regroup words into punchy 1-3 word caption blocks, and exports subtitles for CapCut.

## Structure

- `apps/web` - React + Vite caption editor.
- `apps/api` - FastAPI backend for transcription and export helpers.

## MVP Flow

1. Upload audio or video in the web app.
2. Transcribe with OpenAI `whisper-1` word timestamps.
3. Regroup words locally with deterministic caption rules.
4. Edit split/merge/text in the UI.
5. Export `.srt`.

Manual text and timing edits are autosaved in the browser and are included in the SRT export. Caption groups are normalized so each non-final group is trimmed to the next group start, preventing overlapping subtitle blocks without moving the next group's start. Timeline detail is based on real time units and 30 fps frame steps, so manual nudges move caption starts by one video frame. Audio files are fingerprinted locally, so repeated uploads of the same file and language reuse the cached transcription instead of calling the API again. `Regroup` rebuilds blocks from the original word timestamps, so use it before text polishing or manual timing nudges.

## Local Setup

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
