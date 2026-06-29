# Getting Started

## Before you start

Use ModuMake on a desktop-width browser window. The current editor officially supports 1024px and wider viewports, with 1280px or wider recommended. Phone-sized screens intentionally show a desktop-use notice instead of the full editor.

## Recommended first flow

1. Place a board and at least one component.
2. Run auto wiring or lock the pins you want manually.
3. Open the review panel and clear the blocking issues first.
4. Generate starter code or keep the default sketch.
5. Run the sketch in the terminal panel.
6. Only move to flashing after review and runtime checks look sane.

## What to look for

- `배치`: at least one real component is on the canvas
- `검증`: error-level issues are gone
- `코드`: a starter sketch or generated sketch exists
- `실행`: the terminal has been used to start the runtime loop
- `플래시`: only worth doing after the earlier steps are green

## Good beginner projects

- Blink LED with resistor
- DHT11 or DHT22 on Arduino Uno
- RC smoothing test from PWM to analog-like output

## Fixture Policy

- Keep small examples in `examples/` and small deterministic test data in `tests/fixtures/`.
- Do not commit `tests/kicad_samples/`; it is for local real-world KiCad stress files only.
- Use `npm run test` for the normal suite.
- Use `npm run test:kicad:real` only on machines that have the large local KiCad samples.
