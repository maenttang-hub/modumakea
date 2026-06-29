# Verification Report Standardization

## Current state

### What already exists

1. The review engine already merges rule-engine, netlist/power, and code-circuit findings into one report source.
2. The validation UI already distinguishes confidence levels such as `confirmed`, `strong-inference`, and `needs-review`.
3. The exported verification report builder now produces a pre-fabrication review structure instead of a generic audit dump.

### What is still missing

1. The current workspace does not expose a dedicated PDF rendering pipeline. The visible export path is still text-first.
2. Because the PDF renderer is not located yet, Korean font embedding cannot be fixed in this turn.
3. Report export is structurally stronger now, but final typography, page breaks, and font fallback still depend on the eventual PDF layer.

## Target standard

The report should read as a fabrication review artifact, not an AI summary.

1. Title:
   `ModuMake Circuit Review Report`
   `Pre-Fabrication Circuit Review Report`
2. Opening decision:
   `Ready for fabrication` / `Review required` / `Fix required`
3. Action buckets:
   `Must fix`
   `Review recommended`
   `Passed checks`
   `Verification limits`
4. Every issue card must show:
   `certainty badge`
   `location`
   `evidence`
   `impact`
   `how to fix`
5. Final section must always disclose:
   `limits`
   `assumptions`
   `engine/parser notes`

## Implemented in this turn

1. Reframed the report title away from front-loaded AI wording.
2. Added a pre-fabrication decision section at the top.
3. Split issues into `Must fix` and `Review recommended`.
4. Added certainty badges derived from existing confidence metadata.
5. Rewrote each issue block as `Evidence / Impact / How to fix`.
6. Added component recognition counts and verification-limit disclosure.
7. Added explicit limitations and parser honesty notes at the end.

## Next work

### Priority 1: PDF Korean rendering

Required outcome:
all Korean text must render correctly in the final exported PDF on a clean machine.

Implementation checklist:

1. Locate the actual PDF renderer used in production.
2. Verify whether the renderer depends on browser print, server-side HTML-to-PDF, or a PDF library.
3. Embed a Korean-capable font such as Noto Sans KR at the PDF layer, not only the app UI layer.
4. Verify fallback behavior when the primary font is unavailable.
5. Snapshot-test one mixed Korean/English report and check the final binary output, not just browser preview.

### Priority 2: Real PDF layout layer

Required sections:

1. Cover / project meta
2. Pre-fabrication decision
3. Must-fix findings
4. Review-recommended findings
5. Power/GND analysis
6. Component recognition
7. Code-circuit cross-check
8. Action checklist
9. Limits / assumptions / engine version

### Priority 3: Export parity

The following outputs should stay semantically aligned:

1. In-app validation summary
2. Downloaded text/markdown report
3. Final PDF report

Any wording change to status, certainty, or action labels should update all three paths together.
