# Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Transcription provider returns repeated or low-quality word timestamps. | High | High | Keep ingest/logging explicit; evaluate provider/forced alignment. | Engineering | Open |
| R-002 | localStorage keeps stale bad transcripts. | Medium | Medium | Cache keyed by fingerprint/language; fresh transcribe overwrites; ingest rebuilds groups. | Engineering | Open |
| R-003 | Feature controller grows too large again. | Medium | Medium | Continue extracting playback and project workflows into hooks/services. | Engineering | Open |
| R-004 | Direct CapCut draft export requires undocumented format changes. | Medium | High | Keep SRT exporter isolated; research draft format before implementation. | Engineering | Open |
