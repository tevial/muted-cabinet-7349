# Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Transcription provider returns repeated or low-quality word timestamps. | Medium | High | Stable-ts is the default local provider in `auto`; keep ingest/logging explicit and compare future MFA alignment on edited text. | Engineering | Open |
| R-002 | localStorage keeps stale bad transcripts. | Medium | Medium | Cache prefix was bumped after adding Stable-ts; future work should include provider/model/version in cache identity. | Engineering | Open |
| R-003 | Feature controller grows too large again. | Medium | Medium | Continue extracting playback and project workflows into hooks/services. | Engineering | Open |
| R-004 | Direct CapCut draft export requires undocumented format changes. | Medium | High | Keep SRT exporter isolated; research draft format before implementation. | Engineering | Open |
