# Caption Workbench Feature

Owner for the main caption editing workflow.

This feature contains:

- `CaptionWorkbench.tsx` - feature controller for source media upload,
  fingerprinting, cache load, transcription, ingest, group editing, keyboard
  shortcuts, autosave, and export.
- `model/useTimelinePlayback.ts` - playback, playhead, loop, seek, and
  timeline audition state.
- `ui/CaptionWorkbenchScreen.tsx` - feature view that renders controller props.
- Presentational components from `apps/web/src/components`.

Rules:

- Do not duplicate caption grouping or timing logic here; call the caption
  domain.
- Do not read or write localStorage directly outside the storage service.
- Do not call OpenAI or external providers from browser code; call the local API
  transcription client.
- Keep playback and timeline audition state in `model`, not in the screen.
- Keep reusable UI in `components` only when it has no feature orchestration.
