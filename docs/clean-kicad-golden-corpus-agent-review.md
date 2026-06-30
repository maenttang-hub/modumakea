# Clean KiCad Golden Corpus Agent Review

Date: 2026-06-30

This is an agent-side review of the 50-file golden corpus. It does not fill `humanLabel`; it only separates what can be concluded automatically from what still needs visual review.

## Result

- Corpus entries: 50
- Original KiCad SVG export: 49 success, 1 failure
- Human labels changed: no
- Immediate code-fix candidate from automatic review: none
- Fixed code buckets: `report-count-divergence`, targeted transmier source-anchor preservation
- Needs visual review first: `text-placement`, `power-label-anchor`
- Not parser bugs from automatic review: `passive-value`, `low-confidence-mapping`

The failed SVG export is:

- `text-placement-01-19ce5fdf93610e6b-bretbouchard-kicad-agent-arduino-mega`

KiCad CLI could not load that source schematic. Keep it pending manual review or replace it in a v2 corpus.

## Bucket Decisions

| Bucket | Agent conclusion | Confidence | Decision |
| --- | --- | --- | --- |
| `text-placement` | pending visual review | medium | Do not globally change text placement until original KiCad SVG and ModuMake render are compared. |
| `power-label-anchor` | pending visual review | medium | Fix only entries where original KiCad shows an attached electrical label but ModuMake detaches it. |
| `passive-value` | source data missing | high | Keep as conservative warning unless a non-standard alternate value field is found. |
| `low-confidence-mapping` | mapping backlog | high | Improve family/template mapping; do not rewrite parser logic for this bucket. |
| `report-count-divergence` | fixed / regression coverage | high | Keep historical entries as regression coverage for no-pin custom symbol preservation and count semantics. |

## Concrete Findings

`passive-value` was sampled across all 10 corpus entries. The sampled R/C/L components have a `Value` property in the source S-expression, but the value is empty. That means the current warning is correctly conservative; it is not evidence of a value parser failure.

`low-confidence-mapping` is mostly custom/legacy/imported/prototyping/connectors/family-library content. The parser is importing those symbols. The weak point is classification, so the fix belongs in mapper/catalog rules, not schematic parsing.

`report-count-divergence` was the only bucket safe to fix immediately. It split into two issues:

- Custom symbols without parsed pins disappear from the lightweight path even when other paths preserve them.
- Testpoints, power helpers, and schematic helper symbols are counted differently across validation report builders.

Both issues are now covered by code changes:

1. No-pin custom symbols are preserved as symbol-only components in the lightweight path while unresolved evidence remains visible.
2. Reportable component counting is centralized through a shared policy.
3. Lightweight report count comparison now includes a non-electrical-excluded component bucket, so pure mounting-hole symbols do not create false divergence while `MountingHole_Pad` remains reportable.

The separate transmier visual bug was confirmed from the original KiCad source and screenshots. That fix is intentionally narrow:

1. VCC/GND labels preserve the KiCad source anchor, angle, text anchor, and baseline.
2. Passive reference/value text with native orientation, such as C1/C2 capacitor labels, is no longer flattened or shifted for readability.
3. Parsed passive values still flow into netlist analysis; C1/C2 parse as 0.1 uF in the transmier regression.

## Next Fix Scope

1. Leave broad `text-placement` and `power-label-anchor` behavior untouched until the SVG side-by-side review marks specific entries as `true-bug`.
2. Treat `passive-value` as a source-data-quality warning unless manual review finds populated alternate value fields.
3. Treat `low-confidence-mapping` as mapper/catalog backlog, not parser failure.

## Guardrail

Do not copy `autoProposedLabel` or this agent review into `humanLabel`. The corpus remains useful only if `humanLabel` means a real source-vs-render review happened.
