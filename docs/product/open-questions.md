# Open Questions

| ID | Question | Owner | Status | Notes |
| --- | --- | --- | --- | --- |
| Q-001 | Which transcription model or forced-alignment stack should replace/augment `whisper-1` for better Ukrainian word timestamps? | Product/engineering | Partially decided | `stable-ts` is now the first local provider in `TRANSCRIPTION_PROVIDER=auto`; MFA remains the leading candidate for edited-text forced alignment. |
| Q-002 | Which CapCut draft/import format should be targeted after SRT? | Engineering | Open | Needed before video cut/export work. |
| Q-003 | Should cache keys include transcription provider/model/version? | Engineering | Open | The browser cache prefix was bumped to avoid mixing older OpenAI results with the new Stable-ts default, but provider/model-aware cache identity is still needed. |
| Q-004 | Should caption rule changes auto-regroup or require explicit `Regroup`? | Product | Decided | Settings rebuild committed groups immediately when no text draft is pending; text edits require explicit `Update groups`. |
