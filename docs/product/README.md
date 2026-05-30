# Product Context

This file is the project-specific context for `CapCut Caption`.

## Product Summary

CapCut Caption is a local desktop-first caption editor for creators who need
short, precisely timed subtitle blocks for CapCut projects. The app uploads an
audio or video source, obtains word-level transcription data, groups words into
1-3 word caption blocks, lets the user adjust text/timing, and exports subtitle
data that CapCut can ingest.

## Goals

- Keep word-level timestamps as the canonical source for caption grouping.
- Make caption grouping deterministic, inspectable, and easy to regenerate.
- Keep API, storage, domain rules, playback orchestration, and UI presentation
  in separate modules with clear public APIs.
- Preserve manual timing and text edits locally until export.
- Provide console diagnostics that show the exact data flow from transcription
  response to editor state.

## Non-Goals

- Full mobile UX.
- Cloud multi-user collaboration.
- Video cutting inside CapCut until draft rewrite support is proven.
- Hidden model-side corrections that cannot be inspected in logs.

## Core Workflows

- Upload source media.
- Detect whether a local transcription cache exists for the file/language.
- Load cached transcription or run fresh transcription.
- Ingest transcription words into deterministic caption groups.
- Regroup after caption rule changes.
- Adjust group text and start/end boundaries.
- Preview full timeline or selected caption group.
- Export SRT.

## Domain Concepts

- Source media: uploaded audio or video file.
- Audio fingerprint: local cache key derived from file bytes and file size.
- Caption word: one recognized word with start/end timestamps.
- Caption group: one subtitle block containing one or more caption words.
- Grouping settings: deterministic rules used to rebuild groups from words.
- Transcription cache: browser-local copy of transcription data for one
  fingerprint/language pair.
- Saved project: browser-local editor state including words, groups, settings,
  and source metadata.

## Architecture Notes

- [Architecture Context](architecture-context.md)
- [Domain Model](domain-model.md)
- [Runtime View](runtime-view.md)
- [Workflows](workflows.md)
- [Modules Catalog](../catalog/modules.md)
- [UI Components Catalog](../catalog/ui-components.md)

## Environment Notes

The current environment is local-first:

- Web app: React + Vite on `127.0.0.1:5173`.
- API: FastAPI on `127.0.0.1:8787`.
- Storage: browser `localStorage`.
- Transcription provider: OpenAI audio transcription API through the local API
  server only.

## Agent Notes

- Do not put transcription, cache, grouping, playback, or export logic directly
  in presentational UI components.
- Treat API `groups` as provider/adaptor data. The editor should ingest
  `words` through the caption domain and rebuild groups deterministically.
- Keep diagnostic logging concise but preserve enough table output to audit the
  transcription-to-editor-state pipeline.
