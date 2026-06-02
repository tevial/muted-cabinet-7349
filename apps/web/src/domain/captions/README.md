# Caption Domain

Owner for deterministic caption logic.

Use this module for:

- Caption data contracts re-export.
- Grouping words into caption blocks.
- Normalizing group timings and adjacent or deliberately detached boundaries.
- Empty-zone calculations.
- CapCut patch manifest generation for direct draft rewrite tooling.
- SRT formatting/export.
- Ingesting transcription responses into editor-ready words/groups.
- Applying document-style group text edits to the editor word layer so
  corrected, inserted, or removed words remain the source for later regrouping.
- Grouping by maximum caption characters with whole-word wrapping and optional
  hard break ranges from active skip zones. `maxWords`, `minDuration`, and
  `pauseThreshold` stay in the shared settings contract only for
  backward-compatible saved settings.
- Applying forced-alignment word intervals to existing caption groups while
  preserving editor-owned text overrides, group identity, and linked/detached
  boundary behavior.

Do not put API calls, localStorage, DOM downloads, React state, or UI concerns in
this module.

Detached caption boundaries are represented as plain empty timeline space
between neighboring groups. They are not separate subtitle objects; dragging
back within snap tolerance relinks the boundary.
