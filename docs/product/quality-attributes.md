# Quality Attributes

| Attribute | Target | Current Mechanism | Risk | Notes |
| --- | --- | --- | --- | --- |
| Maintainability | Clear module owners | Contracts, caption domain, services, feature controller/view | Medium | Continue shrinking feature controller. |
| Debuggability | Trace data flow | Flow logger and timestamp tables | Medium | Needed while transcription quality is unstable. |
| Security | No browser secrets | API server owns OpenAI key | Low | `.env` ignored. |
| Performance | Smooth desktop editing | Local domain transformations and Vite UI | Medium | Long timelines may need virtualization later. |
| Accessibility | Keyboard-first editor | Space/Tab/A/D/Arrow shortcuts | Medium | More focus states may be needed. |
| Reliability | Avoid stale cache surprises | Fingerprint/language cache keys and ingest normalization | Medium | Add cache model/version later. |
