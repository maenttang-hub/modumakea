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

- Keep the in-app official DRC vs ModuMake comparison visible in both the PCB viewer and the report.
- Keep the 50-file render gate green after every KiCad import/render change.
- Keep the plain-language source copy visible where users compare DRC sources.

## 2026-07-01 UI Comparison Follow-Up

The PCB viewer and verification report now separate official KiCad DRC groups from ModuMake review groups when official DRC data is present.

Verification:

- `npm run test:e2e -- tests/e2e/editor-report-smoke.spec.ts`: 10/10 passed
- `npm run test:import-render -- --output=tmp/chrome-render-audit/drc-comparison-ui-50`: 50/50 passed, DOM issues 0

## 2026-07-01 Source Help Text Follow-Up

The PCB viewer and report now include short source explanations:

- Official KiCad DRC: KiCad directly calculated the finding.
- ModuMake review/pre-check: repeated items are grouped into causes to inspect first.

Verification:

- `npm run test:e2e -- tests/e2e/editor-report-smoke.spec.ts`: 10/10 passed
- `npm run test:import-render -- --output=tmp/chrome-render-audit/source-help-text-50`: 50/50 passed, DOM issues 0

Remaining before public beta:

- Run the same comparison with external beta user files, not only the fixed rusefi sample set.
- Decide whether official DRC should run automatically after PCB import or remain an explicit button.

## 2026-07-01 UX Density and Readability Follow-Up

The editor now keeps imported schematic full-page fit as the default confirmation view, and adds a separate `읽기 보기` control for large schematics. On the A4988 schematic sample, the toolbar read view moved the canvas from `54%` to `115%` in browser verification.

The imported PCB viewer now defaults to compact layer controls and a compact review summary:

- Layer controls show the primary layers first and keep extra layers behind a `+N` expander.
- PCB review groups are collapsed by default behind `상위 묶음 보기` or `공식/보조 묶음 보기`.
- KiCad official DRC and ModuMake review grouping remain separated after expansion.
- KiCad import success toasts are shortened so they do not cover the PCB review summary during normal inspection.

Verification:

- `npm run lint -- src/hooks/use-component-canvas-controller.ts src/components/canvas/canvas-toolbar.tsx src/components/app/home-shell.tsx src/components/dashboard/imported-pcb-viewer.tsx src/components/dashboard/pcb-workspace.tsx tests/e2e/editor-report-smoke.spec.ts`: passed
- `npm run test:e2e -- tests/e2e/editor-report-smoke.spec.ts`: 10/10 passed
- `npm run build`: passed
- `npm run test:import-render -- --schematics=5 --pcbs=5 --output=tmp/chrome-render-audit/ux-density-read-view-10-final`: 10/10 passed, DOM issues 0
- `npm run product:preflight`: passed with the expected non-production strict-mode reminder

Do not do yet:

- Do not split `circuit-netlist.ts`, `kicad-sch-parser.ts`, or `datasheet-rules.ts`.
- Do not add a large batch of new rules before this baseline is stable.
- Do not market ModuMake as a replacement for KiCad DRC.
