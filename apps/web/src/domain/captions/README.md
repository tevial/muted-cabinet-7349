# Caption Domain

Owner for deterministic caption logic.

Use this module for:

- Caption data contracts re-export.
- Grouping words into caption blocks.
- Normalizing group timings and adjacent boundaries.
- Empty-zone calculations.
- SRT formatting/export.
- Ingesting transcription responses into editor-ready words/groups.

Do not put API calls, localStorage, DOM downloads, React state, or UI concerns in
this module.
