# Beta Import And Rendering UX Gate

This gate covers the beta-blocking import and first-screen review experience for real KiCad files.

## Required Behavior

- Real `.kicad_sch` files must complete through the browser file input path.
- The import flow must show a visible running state while reading, detecting, parsing, and hydrating a file.
- Worker parsing must not leave the UI waiting forever. If the worker fails, times out, or cannot decode the response, the browser must fall back to the main-thread parser once.
- Imported schematic review must not clip the imported source drawing on first open. The source-faithful view should fit the full imported drawing; any readable/structured view may focus content, but must clamp zoom to the canvas bounds.
- Imported PCB review should default to board-review layers. Fabrication/helper layers such as `F.Fab`, `B.Fab`, and `Dwgs.User` must stay available but should not be enabled on first open.
- Imported PCB findings from ModuMake pre-checks must be labeled as pre-check/review findings unless KiCad official DRC data is present.
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
- PCB upload must show `ModuMake 사전점검` / `KiCad 공식 DRC 미실행` until official DRC is run.
- Visible buttons in imported schematic and PCB states must not be unnamed.

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

## Non-Goals

- Do not split `circuit-netlist.ts`, `kicad-sch-parser.ts`, or `datasheet-rules.ts` as part of this gate.
- Do not add new validation rules to solve UX confidence issues.
- Do not replace KiCad official DRC with ModuMake pre-checks in product wording.
