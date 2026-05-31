# Alignment Service

Browser adapter for local MFA forced-alignment requests.

Use `alignFileSegment` when the UI has known caption text and needs word
intervals refined against source media. Keep editor state mutation in the
caption workbench and caption domain, not in this service.

Large "align all" operations are orchestrated by the workbench with bounded
parallel calls and ordered state application. This service stays a thin request
adapter. Non-OK responses are raised as `AlignmentRequestError` with the HTTP
status so the workbench can stop a large queue after repeated local MFA service
failures.
