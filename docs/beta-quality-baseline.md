# Beta Quality Baseline

This document fixes the current pre-beta quality baseline. The goal is not to add more rules first. The goal is to keep real KiCad import, rendering, and PCB review behavior repeatable.

## Current Scope

- Sample set: `tests/fixtures/kicad-beta-sample-set.json`
- Sample count: 50 real KiCad files
- Schematic samples: 25
- PCB samples: 25
- Primary render command:

```bash
npm run test:import-render -- --output=tmp/chrome-render-audit/manifest-expanded-50
```

- PCB DRC comparison command:

```bash
npm run test:pcb-drc-compare -- --output=tmp/kicad-drc-comparison/beta-pcb-review-report.json
```

## 2026-07-01 Baseline Result

Render/import gate:

- Result: 50/50 passed
- DOM issues: 0
- Output: `tmp/chrome-render-audit/manifest-expanded-50/report.json`
- Checked: file input import, schematic overlay visibility, schematic clipping, unnamed visible buttons, horizontal overflow, PCB default helper-layer state, PCB layer-control overlap

PCB DRC comparison:

- KiCad CLI: `/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli`
- KiCad version: 10.0.3
- PCB samples: 25/25 official DRC completed
- Official KiCad DRC raw issues: 8,119
- ModuMake representative pre-check issues: 1,124
- ModuMake top review groups shown across samples: 138
- Output: `tmp/kicad-drc-comparison/beta-pcb-review-report.json`

High-volume official DRC samples:

| Sample | ModuMake pre-checks | Top groups | Official KiCad DRC |
| --- | ---: | ---: | ---: |
| `pcb-gdi-4ch` | 68 | 6 | 1,117 |
| `pcb-lambda-main` | 62 | 6 | 1,005 |
| `pcb-l9779-micro` | 68 | 6 | 999 |
| `pcb-gdi-stm` | 55 | 6 | 954 |
| `pcb-gdi-6ch` | 52 | 6 | 877 |
| `pcb-wideband` | 56 | 6 | 816 |

## Interpretation

ModuMake should not claim to replace KiCad official DRC. The better product behavior is:

- Run or ingest official KiCad DRC when possible.
- Keep ModuMake PCB checks labeled as pre-check/review signals.
- Group repeated findings into visible causes before showing raw candidate volume.
- Prioritize what a beta user should inspect first: source, rule family, affected parts/nets/layers, representative count, hidden count.

The current data supports that direction. Official DRC can produce hundreds or thousands of raw items on real boards. ModuMake's useful role is to make that volume understandable, not to pretend every local pre-check is a final DRC error.

## Next Gates

Before public beta:

- Add an in-app official DRC result summary that highlights the largest official rule families.
- Compare official DRC groups and ModuMake review groups in the UI, not just in the JSON audit.
- Keep the 50-file render gate green after every KiCad import/render change.
- Add user-facing copy that explains `official DRC`, `ModuMake pre-check`, and `review group` in plain language.

Do not do yet:

- Do not split `circuit-netlist.ts`, `kicad-sch-parser.ts`, or `datasheet-rules.ts`.
- Do not add a large batch of new rules before this baseline is stable.
- Do not market ModuMake as a replacement for KiCad DRC.
