# Beta Import And Rendering UX Gate

This gate covers the beta-blocking import and first-screen review experience for real KiCad files.

## Required Behavior

- Real `.kicad_sch` files must complete through the browser file input path.
- The import flow must show a visible running state while reading, detecting, parsing, and hydrating a file.
- Worker parsing must not leave the UI waiting forever. If the worker fails, times out, or cannot decode the response, the browser must fall back to the main-thread parser once.
- Imported schematic review must not clip the imported source drawing on first open. The source-faithful view should fit the full imported drawing; any readable/structured view may focus content, but must clamp zoom to the canvas bounds.
- Imported PCB review should default to board-review layers. Fabrication/helper layers such as `F.Fab`, `B.Fab`, and `Dwgs.User` must stay available but should not be enabled on first open.
- Imported PCB findings from ModuMake pre-checks must be labeled as pre-check/review findings unless KiCad official DRC data is present.
- Imported PCB review must group repeated findings into visible causes before listing raw candidates. The grouping layer should help users decide what to inspect first, without claiming to replace KiCad official DRC.
- Icon-only controls must expose accessible names.

## Regression Samples

The first beta smoke set must include:

- `tests/kicad_samples/rusefi/A4988_stepper_motor_driver/Motor_driver_A4988.kicad_sch`
- `tests/kicad_samples/rusefi/A4988_stepper_motor_driver/Motor_driver_A4988.kicad_pcb`
- One larger schematic from `tests/kicad_samples/100_samples/mini48-stm32_mini48-stm32.kicad_sch`
- One sparse/custom schematic from `tests/kicad_samples/100_samples/ZF8HP Transmission_8HPTCUAdapter.kicad_sch`

## Test Expectations

- Schematic upload must make the title bar show the uploaded `.kicad_sch` filename.
- Imported schematic source must be persisted to browser workspace state.
- Imported schematic overlay must render in the canvas.
- Initial schematic viewport must keep at least 92% of the imported overlay width and height inside the canvas.
- PCB upload must keep `F.Fab`, `B.Fab`, and `Dwgs.User` disabled by default when those layers exist.
- PCB layer controls must not overlap rendered board graphics on first open.
- ModuMake PCB pre-checks must show representative candidates instead of every repeated geometry candidate. Official KiCad DRC may show exact DRC counts; local pre-checks should keep repeated candidates capped and summarized.
- PCB review and report surfaces must show top review groups for repeated findings, including representative and hidden candidate counts when applicable.
- PCB upload must show `ModuMake 사전점검` / `KiCad 공식 DRC 미실행` until official DRC is run.
- Visible buttons in imported schematic and PCB states must not be unnamed.

## Expanded Audit Command

Run the 50-file browser rendering gate against a running local editor:

```bash
npm run test:import-render -- --output=tmp/chrome-render-audit/expanded-50-final
```

The default sample manifest is `tests/fixtures/kicad-beta-sample-set.json`. It covers 25 schematic files and 25 PCB files from the real KiCad sample set. The script uploads each file through the browser file input, captures a screenshot, and writes DOM metrics to `report.json`.

Run the PCB official DRC comparison baseline:

```bash
npm run test:pcb-drc-compare -- --output=tmp/kicad-drc-comparison/beta-pcb-review-report.json
```

That comparison requires `kicad-cli` for official DRC counts. If `kicad-cli` is unavailable, the script still records ModuMake pre-check/group summaries and marks official DRC as skipped. Use `--require-kicad` when the official DRC comparison must be a hard gate.

## 2026-07-01 Chrome DOM Audit

Audit environment:

- Browser: Google Chrome through Playwright, 1440x900 viewport.
- Flow: `/editor` file input upload, screenshot capture, DOM metrics after render settle.
- Generated report: `tmp/chrome-render-audit/final/report.json`.

Schematic samples:

- `tests/kicad_samples/rusefi/A4988_stepper_motor_driver/Motor_driver_A4988.kicad_sch`
- `tests/kicad_samples/rusefi/mini48-stm32/mini48-stm32.kicad_sch`
- `tests/kicad_samples/rusefi/ZF8HP Transmission/8HPTCUAdapter.kicad_sch`
- `tests/kicad_samples/rusefi/GDI-STM/GDI-STM.kicad_sch`
- `tests/kicad_samples/rusefi/CDI-test/CDI-test.kicad_sch`
- `tests/kicad_samples/rusefi/tle9104-breakout/tle9104-breakout.kicad_sch`
- `tests/kicad_samples/rusefi/MC33810-breakout/MC33810-breakout.kicad_sch`
- `tests/kicad_samples/rusefi/VR-Hall/VR-Hall.kicad_sch`
- `tests/kicad_samples/rusefi/frequency-divider/frequency-divider.kicad_sch`
- `tests/kicad_samples/rusefi/GDI-6ch/GDI-6ch.kicad_sch`

PCB samples:

- `tests/kicad_samples/rusefi/A4988_stepper_motor_driver/Motor_driver_A4988.kicad_pcb`
- `tests/kicad_samples/rusefi/mini48-stm32/mini48-stm32.kicad_pcb`
- `tests/kicad_samples/rusefi/ZF8HP Transmission/8HPTCUAdapter.kicad_pcb`
- `tests/kicad_samples/rusefi/GDI-STM/GDI-STM.kicad_pcb`
- `tests/kicad_samples/rusefi/CDI-test/CDI-test.kicad_pcb`
- `tests/kicad_samples/rusefi/tle9104-breakout/tle9104-breakout.kicad_pcb`
- `tests/kicad_samples/rusefi/MC33810-breakout/MC33810-breakout.kicad_pcb`
- `tests/kicad_samples/rusefi/VR-Hall/VR-Hall.kicad_pcb`
- `tests/kicad_samples/rusefi/GDI-4ch/GDI-4ch.kicad_pcb`
- `tests/kicad_samples/rusefi/GDI-6ch/GDI-6ch.kicad_pcb`

Result: 20/20 samples passed the gate with zero DOM issues. The audit checked schematic clipping, visible unnamed buttons, page horizontal overflow, and PCB default layer state for `F.Fab`, `B.Fab`, and `Dwgs.User`.

## 2026-07-01 Expanded Chrome DOM Audit

Audit environment:

- Browser: Google Chrome through Playwright, 1440x900 viewport.
- Flow: `/editor` file input upload, screenshot capture, DOM metrics after render settle.
- Generated report: `tmp/chrome-render-audit/expanded-50-final/report.json`.
- Script: `scripts/audit-import-rendering.mjs`.

Result: 50/50 samples passed the gate with zero DOM issues. The audit checked schematic clipping, visible unnamed buttons, page horizontal overflow, PCB default layer state for `F.Fab`, `B.Fab`, and `Dwgs.User`, and whether PCB layer controls overlapped board graphics.

Follow-up PCB pre-check adjustment:

- Repeated ModuMake pre-check candidates are capped to representative entries and summarized.
- Official KiCad DRC remains the source for exhaustive board-rule counts.
- Large real PCB samples that previously showed hundreds of local pre-check entries now show representative counts instead of full candidate counts.

Follow-up PCB review grouping:

- Repeated representative candidates are grouped by source and rule code into top review causes.
- Editor and report surfaces show the highest-priority PCB review groups with visible and hidden candidate counts.
- The grouping layer is an interpretation aid. It does not change the underlying KiCad DRC/pre-check issue records.
- Verified with `npm run test:import-render -- --output=tmp/chrome-render-audit/pcb-review-groups-50`; result: 50/50 samples passed with zero DOM issues.

Fixed baseline follow-up:

- The 50-file KiCad sample set now lives in `tests/fixtures/kicad-beta-sample-set.json`.
- Manifest-driven render audit: `tmp/chrome-render-audit/manifest-expanded-50/report.json`; result: 50/50 samples passed with zero DOM issues.
- Official DRC comparison: `tmp/kicad-drc-comparison/beta-pcb-review-report.json`; result: 25/25 PCB samples completed with KiCad CLI 10.0.3.
- Across the 25 PCB samples, KiCad official DRC produced 8,119 raw issues, while ModuMake produced 1,124 representative pre-check issues and 138 top review groups.
- Full baseline summary: `docs/beta-quality-baseline.md`.

## Non-Goals

- Do not split `circuit-netlist.ts`, `kicad-sch-parser.ts`, or `datasheet-rules.ts` as part of this gate.
- Do not add new validation rules to solve UX confidence issues.
- Do not replace KiCad official DRC with ModuMake pre-checks in product wording.
