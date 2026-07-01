# Beta Import And Rendering UX Gate

This gate covers the beta-blocking import and first-screen review experience for real KiCad files.

## Required Behavior

- Real `.kicad_sch` files must complete through the browser file input path.
- The import flow must show a visible running state while reading, detecting, parsing, and hydrating a file.
- Worker parsing must not leave the UI waiting forever. If the worker fails, times out, or cannot decode the response, the browser must fall back to the main-thread parser once.
- Imported schematic review should open on readable schematic content, not the full page frame when that makes the circuit too small.
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
- Initial schematic zoom must stay at a readable baseline for A4988-class samples.
- PCB upload must show `ModuMake 사전점검` / `KiCad 공식 DRC 미실행` until official DRC is run.
- Visible buttons in imported schematic and PCB states must not be unnamed.

## Non-Goals

- Do not split `circuit-netlist.ts`, `kicad-sch-parser.ts`, or `datasheet-rules.ts` as part of this gate.
- Do not add new validation rules to solve UX confidence issues.
- Do not replace KiCad official DRC with ModuMake pre-checks in product wording.
