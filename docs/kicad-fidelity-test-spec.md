# KiCad Fidelity Test Spec

## Goal

This viewer should converge toward KiCad-native rendering by following general geometry and text rules, not per-project visual hacks.

The test suite exists to prove three things at the same time:

1. `.kicad_sch` files remain parseable.
2. save and reload do not drift wire, junction, label, or symbol coordinates.
3. the rendered symbol primitives and text layout remain close to the KiCad source layout.

## Why green tests are not enough by themselves

A fully passing parser test suite can still miss visual bugs when it only checks:

- component counts
- wire counts
- net counts
- presence of imported primitives

That is necessary, but not sufficient.

To trust the UI, tests must also assert:

- pin-name and pin-number spacing
- anchor and baseline direction after rotate, mirror, and upright normalization
- diode cathode/anode orientation
- power and ground symbol direction
- connector body visibility and pin text density
- round-trip stability after serialize -> hydrate

## Canonical real fixtures

These five files are the visual truth fixtures for imported KiCad review:

1. `/Users/gimdong-il/Downloads/KICAD-main/Arduino hat/Arduino_hat.kicad_sch`
2. `/Users/gimdong-il/Downloads/KICAD-main/rasphat_proj2/rasphat_proj2.kicad_sch`
3. `/Users/gimdong-il/Downloads/KICAD-main/Flamingo cotnrol project/Flamingo p.kicad_sch`
4. `/Users/gimdong-il/Downloads/KICAD-main/MATRIX PROJECT/MATRIX PROJECT.kicad_sch`
5. `/Users/gimdong-il/Downloads/KICAD-main/Breadboard-powersupply/P_supply.kicad_sch`

These are not project-specific override targets. They are regression fixtures for general rules.

## What each fixture is responsible for

### Arduino_hat

Use for:

- dense MCU pin text spacing
- AREF / RESET / VCC / AVCC placement
- top GNDPWR / PWR_FLAG direction
- passive symbol scene stability

### rasphat_proj2

Use for:

- large connector body proportion
- top and bottom connector pin text density
- DHT22 orientation
- board-header-like connector behavior

### Flamingo p

Use for:

- USB connector pin-name / pin-number density
- charger IC text layout
- connector and ground native primitive visibility
- dense mixed passive and diode scenes

### MATRIX PROJECT

Use for:

- connector family rendering breadth
- barrel jack / header / shift-register text layout
- power and ground symbol consistency in larger scenes

### P_supply

Use for:

- diode direction regression lock
- direction-sensitive component orientation

## Required assertion classes

### 1. Parseability and scene completeness

Located in:

- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad-real-projects.test.ts`

Must assert:

- imported scene exists
- expected symbol / wire / label counts remain stable
- unified and lightweight validation outputs stay parseable

### 2. Visual primitive fidelity

Must assert:

- native symbol primitives remain present
- connector, MCU, passive, power, and diode primitives are still rendered
- deduped native polylines are validated semantically, not by brittle point-count assumptions

Examples:

- “has an angled native branch”
- “has an upward stem”
- “cathode bar stays on the cathode side”

### 3. Text layout fidelity

Must assert:

- `originalAngle` survives through transform
- `textAnchor` and `baseline` remain correct after mirror and upright normalization
- dense MCU and connector pin texts keep a readable gap
- top and bottom power pins do not collapse into the body

### 4. Round-trip stability

Located in:

- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/project-serialization.test.ts`

Must assert:

- serialize -> hydrate keeps wires, labels, symbols, and pin anchors locked
- stale imported snapshots rebuild from source without new drift
- imported scene bounds do not crop symbol-only or low-wire scenes

## Anti-patterns to avoid in tests

Do not write tests that only prove:

- an exact primitive point count
- a specific internal helper path was taken
- a project-specific hardcoded offset was applied

Those are fragile and can stay green while the UI is wrong.

Prefer tests that prove:

- orientation
- spacing
- attachment
- alignment intent
- round-trip stability

## Current finishing targets

The current remaining work is visual finishing, not core connectivity math.

### Immediate targets

1. Arduino_hat:
   - tighten AREF / RESET / VCC / AVCC neighborhood
   - keep dense U2 pin-name / pin-number spacing KiCad-like

2. rasphat_proj2 / Flamingo p / MATRIX PROJECT:
   - push connector / power / capacitor / battery / GND symbols further toward native primitive rendering
   - reduce “boxy app-like” connector feel
   - refine baseline and anchor behavior for top and side connector pins

3. P_supply:
   - keep diode direction regressions permanently locked
   - reuse the same direction rules for other directional components

## Acceptance bar

We are done with this phase when:

- the five real fixtures remain stable across parse, render, save, and reload
- no wire / junction / label drift reappears after round-trip
- dense MCU / connector text no longer visibly collapses into pin stems
- power, ground, capacitor, battery, and diode symbols look native enough that remaining differences are minor cosmetic polish, not structural mismatch
