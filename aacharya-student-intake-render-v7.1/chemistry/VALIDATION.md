# Validation — 20 September 2026

## Passed

- `npm test`: 11 tests covering all 133 questions, all 19 chapters, mixed chapter selection, randomized options and repeated set generation.
- Scoring: correct and incorrect responses, equivalent short-answer names, Unicode chemical symbols, positive/negative numbers, zero, numeric precision and scientific notation.
- DOM interaction tests: class/topic selection, answer entry, 5/5 and 0/5 scoring, reveal/cancel/lock behavior, skipped-question confirmation, review, discard protection, reset, browser-storage persistence and invalid numeric input.
- Static production archive accepted; private deployment succeeded.
- Production screenshot inspected: academy header, typography, hero and practice layout rendered correctly.
- Authenticated owner HTTP request returned 200 with application HTML. Anonymous HTTP request was denied (403); browser navigation showed the ChatGPT sign-in gate.
- Access policy verified: custom audience with only the owner allowed, zero external visitors, no groups or other editors.

## Scope

The browser interaction test script is included for a future environment with a local Chromium installation. It could not run here because the local browser binary was unavailable. Interface flows were instead tested using JSDOM against the actual application scripts. The deployed desktop screenshot was inspected; a mobile browser screenshot was not obtained. Responsive CSS covers small screens at 740 px and below.

This is a fixed, original starter question bank with seven questions per chapter, not exhaustive syllabus coverage or an official CBSE assessment.
