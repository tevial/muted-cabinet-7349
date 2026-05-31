# Caption Domain

Owner for deterministic caption logic.

Use this module for:

- Caption data contracts re-export.
- Grouping words into caption blocks.
- Normalizing group timings, adjacent boundaries, and explicit caption gaps.
- Empty-zone calculations.
- CapCut patch manifest generation for direct draft rewrite tooling.
- SRT formatting/export.
- Ingesting transcription responses into editor-ready words/groups.
- Applying forced-alignment word intervals to existing caption groups while
  preserving editor-owned text overrides, group identity, and linked/detached
  boundary behavior.

Do not put API calls, localStorage, DOM downloads, React state, or UI concerns in
this module.

Caption gaps are subtitle-only objects. They keep media intact while leaving a
range with no visible caption group. Do not model them as skip zones, because
skip zones remove or jump media while caption gaps only affect subtitle display.
