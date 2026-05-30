# Product Brief

## Problem

CapCut auto-captions produce sentence-sized subtitle blocks, while the target
editing style needs short 1-3 word captions with precise timing and easy manual
adjustment.

## Audience

Desktop video creators editing short-form videos in CapCut.

## Goals

- Generate word-level captions from uploaded source media.
- Rebuild short caption groups deterministically from word timestamps.
- Provide fast keyboard-first timing edits and audio preview.
- Export captions in a CapCut-friendly format, starting with SRT.

## Non-Goals

- Mobile editor.
- Cloud collaboration.
- Hidden AI cleanup that cannot be inspected or reproduced.

## Success Criteria

- The user can see exactly what words and groups were loaded, transcribed,
  cached, regenerated, and exported.
- Caption grouping changes are owned by one domain module.
- UI components render props and emit events instead of owning business rules.

## Assumptions

- The workflow remains local-first for the current phase.
- A local API server is acceptable for protecting provider credentials.
- SRT export is sufficient until direct CapCut draft export is proven.

## Open Questions

- Which transcription/forced-alignment stack gives the best Ukrainian word
  timestamps for this material?
- What CapCut project format should receive direct caption/cut data?
