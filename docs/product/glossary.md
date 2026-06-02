# Glossary

| Term | Meaning | Notes |
| --- | --- | --- |
| Source media | Uploaded audio or video file used for transcription and playback. | Stored only as a browser `File` during the session. |
| Audio fingerprint | SHA-256 hash plus file size. | Used as local cache identity. |
| Caption word | One recognized word with `start` and `end` timestamps. | Source of truth for generated groups. |
| Caption group | Subtitle block containing one or more caption words. | Exported as SRT cue. |
| Caption rules | User-adjustable grouping settings. | Applied by caption domain; current grouping wraps whole words by maximum character count and does not link groups across active skip zones. |
| Caption draft | Staged caption row text/split/merge edits. | Applied explicitly back into words before regroup/export/alignment. |
| Manual grouping | Committed caption rows arranged by the user. | `maxChars` changes are stored but do not auto-regroup until the user confirms `Regroup`; corrected words remain. |
| Ingest | Conversion from transcription response/cache to editor-ready words/groups. | Rebuilds groups from words. |
| Transcription cache | Browser-local cached transcription by fingerprint and language. | Avoids repeated paid API calls. |
| Saved project | Browser-local editor state. | Includes words, groups, settings, source metadata. |
