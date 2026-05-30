# Requirements

## Functional Requirements

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| FR-001 | Upload local audio/video source media. | Must | Desktop workflow only. |
| FR-002 | Compute a stable local fingerprint for cache lookup. | Must | Fingerprint includes bytes and file size. |
| FR-003 | Show cache availability without automatically consuming paid API tokens. | Must | `Load Cache` and `Transcribe` are separate actions. |
| FR-004 | Transcribe source media with word-level timestamps. | Must | API server owns provider integration. |
| FR-005 | Build caption groups from words using deterministic local rules. | Must | Provider groups are not durable editor source. |
| FR-006 | Let users edit group text, split/merge groups, and nudge timing boundaries. | Must | Word timestamps remain unchanged by group edits. |
| FR-007 | Loop selected group playback and play full timeline from playhead. | Must | Keyboard workflow is primary. |
| FR-008 | Export current groups as SRT. | Must | CapCut draft rewrite export is future work. |
| FR-009 | Log transcription/cache/group ingest data flow for debugging. | Should | Console tables are acceptable during active development. |

## Non-Functional Requirements

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| NFR-001 | Keep modules DRY with clear ownership. | Must | Follow `docs/module-boundaries.md`. |
| NFR-002 | Keep OpenAI API key server-side. | Must | Browser never receives secrets. |
| NFR-003 | Prefer deterministic local transformations over hidden model-side fixes. | Must | Debuggability matters more than magic corrections. |
| NFR-004 | Keep UI desktop-first and operational, not mobile/marketing oriented. | Should | Current user workflow is desktop editing. |
| NFR-005 | Keep build/lint fast and runnable locally. | Should | Vite + FastAPI local stack. |

## Constraints

- No browser automation testing unless the user asks for it.
- Browser storage is local and can contain stale historical data; ingest must
  normalize old cached data.
- CapCut draft mutation is out of active scope until the export format is proven.

## Out Of Scope

- Mobile layout.
- Multi-user accounts.
- Cloud persistence.
- Push notifications and webhooks; no event-driven external workflow currently
  exists in this local tool.

## Open Questions

- Which transcription model gives the best Ukrainian word timestamps for this
  source material?
- Is a separate forced-alignment stage needed after manual text edits?
- What CapCut project format should be targeted for direct caption/cut import?
