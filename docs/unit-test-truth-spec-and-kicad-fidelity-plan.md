# Unit Test Truth Spec and KiCad Fidelity Plan

This document locks two things down:

1. how we decide whether a unit test is actually proving the right thing
2. the next implementation plan for matching imported KiCad schematics more closely

It exists to stop the project from drifting into two common failure modes:

- tests that pass but do not protect the real user-visible behavior
- rendering fixes that improve one symbol family while breaking another

## 1. Core principle

For imported KiCad review, the real source of truth is not the old editor model.

The source of truth is:

1. the original `.kicad_sch` semantics
2. the imported scene snapshot generated from that source
3. the rendered result staying visually and topologically stable after save and reload

That means a "good" unit test must prove one of these:

- topology is preserved
- native primitive data is preserved
- text alignment and orientation are preserved
- save/load roundtrips do not shift the scene
- fallback is only used when native primitive data is truly unavailable

## 2. What a valid unit test must prove

Every new test in this area should satisfy at least one of the following categories.

### A. Parse truth tests

These tests prove that the parser reads KiCad data correctly.

Examples:

- circle radius from KiCad numeric radius is parsed correctly
- `extends` inheritance resolves base symbol graphics and pins
- `justify left/right/top/bottom` becomes the expected `textAnchor` and `baseline`
- mirror and rotation transform native primitives and pin anchors correctly

These tests should inspect parser output directly, not browser layout.

Primary files:

- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad-import.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts`

### B. Connectivity truth tests

These tests prove that wires, pins, labels, and near-identical points resolve to the same net when they should.

Examples:

- a long wire with tiny coordinate drift still connects to a pin
- points within snap tolerance merge into the same net
- same-label logical nets merge when that is intended by the logical core

These tests should verify net membership, not visual appearance.

Primary files:

- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad-import.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/v3-kicad-parser/solve-schematic-connectivity.ts`

### C. Scene truth tests

These tests prove that the imported scene snapshot contains enough data to reconstruct what the user should see.

Examples:

- `scene.symbols` includes MCU, connector, board, and power-symbol snapshots
- symbol-only scenes are still treated as renderable
- scene bounds include symbols even when wires are sparse or absent

These tests should inspect `importedSchematicScene`, not just component geometry.

Primary files:

- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/imported-schematic-render.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-scene-bounds.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/component-template-utils.ts`

### D. Roundtrip truth tests

These tests prove that save and reload do not corrupt coordinates.

Examples:

- wire start/end stays aligned with the same pin anchor after serialize -> hydrate
- labels and junctions remain visible after cloud/local reload
- stored scene bounds do not drift after repair/recovery

These are the most important tests for bugs that users describe as:

- "it was visible before save"
- "after reload the wires disappeared"
- "the schematic count says wires exist, but I cannot see them"

Primary files:

- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/project-serialization.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/store/project-document.ts`

### E. Fallback discipline tests

These tests prove that fallback graphics are a last resort, not the default path.

Examples:

- if a symbol has native rectangle/polyline/circle/pin primitives, they win
- fallback connector body is only used when no native connector body exists
- fallback quiet mode does not suppress the only readable text left

These tests prevent "app-looking" regressions when KiCad-native data is available.

Primary files:

- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/imported-schematic-render.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-render.ts`

## 3. Anti-patterns: tests that look useful but are weak

The following test styles should be avoided or treated as secondary only.

### A. Pure count-only assertions

Weak:

- "scene has 1 symbol"
- "there are 3 text primitives"

Better:

- "the board symbol exists and contains native primitives"
- "the VCC pin label keeps its expected alignment metadata"

### B. Heuristic assertions on layout when native metadata exists

Weak:

- "this text should not be middle aligned" without checking whether KiCad explicitly defined justification

Better:

- "if KiCad provides justification, preserve it exactly"
- "if KiCad does not provide justification, use outward geometric fallback"

### C. Tests that only prove internal implementation details

Weak:

- checking a private intermediate shape if it does not affect scene output

Better:

- checking the final imported geometry or scene snapshot that downstream renderers actually consume

## 4. Acceptance rules for new tests

Before we accept a new unit test in the imported KiCad area, it should pass this checklist:

1. Is it tied to a real user-visible bug or a parser invariant?
2. Does it assert the final consumed data shape, not just an internal temporary?
3. Does it say whether the behavior is native-KiCad preservation or fallback behavior?
4. Would this test fail if the original bug came back?
5. Does it avoid depending on unrelated theme or UI state?

If the answer is not mostly yes, the test is probably too weak.

## 5. Current gaps in the test suite

These are still worth adding.

### High priority

- serialize -> hydrate -> render data parity for `wireSegments`, `junctions`, and `labels`
- connector text placement parity after reload
- power and ground symbol direction parity after reload
- mixed native + fallback symbol scenes in one project
- top and bottom MCU/connector pin labels centered from native pin geometry rather than side-biased heuristics
- native KiCad `GNDPWR`, `PWR_FLAG`, and external power primitives winning over app fallback shapes when source graphics exist

### Medium priority

- upright text behavior for rotated annotation text in dense MCU symbols
- pin name/number justification preservation when KiCad explicitly defines it on pins
- connector body fidelity when base symbols come through `extends`

### Lower priority

- theme parity tests for dark/light readability
- review badge visibility and non-overlap behavior

## 5.5. Locked real-project fixtures

The following four KiCad schematics are now the standing real-project regression set for imported-schematic fidelity work:

1. `/Users/gimdong-il/Downloads/KICAD-main/Arduino hat/Arduino_hat.kicad_sch`
2. `/Users/gimdong-il/Downloads/KICAD-main/rasphat_proj2/rasphat_proj2.kicad_sch`
3. `/Users/gimdong-il/Downloads/KICAD-main/Flamingo cotnrol project/Flamingo p.kicad_sch`
4. `/Users/gimdong-il/Downloads/KICAD-main/MATRIX PROJECT/MATRIX PROJECT.kicad_sch`

These are not just smoke-test files. They cover different failure surfaces:

- `Arduino_hat`
  - dense MCU text layout
  - passive part stems
  - top power/ground direction
  - top and bottom MCU pin-name centering around the actual pin anchor
- `rasphat_proj2`
  - connector label placement
  - sensor-scale symbol readability
  - sparse but meaningful wire preservation
  - hidden duplicate power pins staying non-visual on `J1`
- `Flamingo p`
  - larger mixed analog/power scene
  - USB connector body fidelity
  - battery / capacitor / ground family stability
- `MATRIX PROJECT`
  - heavier wire count
  - connector + MCU + power mix
  - reload-sensitive scene size and symbol density

Minimum policy:

- every imported-schematic fidelity change must keep all four files parseable
- every scene/rendering change must preserve their scene symbol, wire, and label counts unless we intentionally update the fixture expectation
- at least one targeted symbol-family assertion must exist for each file
- if native KiCad graphics exist for power/ground/power-flag symbols, tests should prefer those primitives over generalized fallback geometry

Primary regression command:

```bash
npm run test:kicad:real
```

Focused parser + real-fixture command:

```bash
node --test --experimental-strip-types --loader ./tests/alias-loader.mjs ./tests/kicad-import.test.ts ./tests/kicad-real-projects.test.ts
```

## 6. Next target plan: real-project fidelity pass

Now that parser-side primitive preservation is healthier, the next step is not broad refactoring. It is a targeted fidelity pass against one real broken project.

That pass should happen in this order.

### Step 1. Lock one real failing project

Pick one actual imported project where users can still see one or more of these:

- wires counted but not visible
- junctions missing after reload
- labels drifting from the wire they belong to
- MCU pin text overlapping body or other pins
- connector text misaligned against the body
- power or ground symbols facing the wrong direction

This project becomes the canonical regression sample.

### Step 2. Trace reload path end-to-end

Trace one project through this full path:

1. `.kicad_sch` parse
2. `importedSchematicScene` generation
3. document serialization
4. storage payload
5. document hydration
6. overlay render input

Goal:

find the first step where `wireSegments`, `junctions`, or `labels` diverge from the original scene.

Primary files:

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/store/project-document.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-overlay.tsx`

### Step 3. Raise native primitive priority for three symbol families

Focus only on the families that still look most "app-like."

#### MCU

- preserve native body and pin primitives first
- reduce synthetic text repositioning when native property placement exists
- verify pin names/numbers do not overlap after reload

#### Connector

- prefer native connector body and primitive outlines over generated rectangles
- preserve left/right text structure from source symbol
- verify labels sit on the correct side after reload

#### Power / Ground

- keep symbol orientation identical to KiCad source or intended fallback family
- ensure top/bottom stem direction matches KiCad convention
- verify label text does not collide with symbol body

### Step 4. Tighten text placement only after primitive priority is fixed

Do not start with more heuristic text nudging.

Order matters:

1. native primitive present -> use native geometry
2. native text justification present -> preserve it
3. only then apply minimal geometric fallback

This prevents another round of symbol-specific drift fixes.

### Step 5. Add real-project regression tests

Once the real failing project is fixed, add tests that mirror that exact failure.

Minimum additions:

- a project-serialization roundtrip test for that project class
- a scene snapshot assertion for the missing wire/junction/label case
- a symbol fidelity assertion for the affected MCU/connector/power family

## 7. Concrete implementation checklist

### Track A. Reload coordinate stability

- [ ] Add a real-project regression fixture or inline schematic sample
- [ ] Snapshot `importedSchematicScene` before serialize
- [ ] Snapshot `importedSchematicScene` after hydrate
- [ ] Compare `wireSegments`, `junctions`, and `labels` for parity
- [ ] Fix the earliest divergence point instead of patching render symptoms

### Track B. Native primitive priority

- [ ] Audit MCU symbols still receiving synthetic body/text paths
- [ ] Audit connector symbols still falling back to generated rectangles
- [ ] Audit power/ground fallback orientation against KiCad expectations
- [ ] Remove symbol-family overrides that conflict with native source data

### Track C. Text layout polish

- [ ] Preserve KiCad justification when present
- [ ] Keep outward geometric fallback when justification is absent
- [ ] Verify no new overlap in dense MCU left/right pin columns
- [ ] Verify connector labels stay readable in dark and light themes

## 8. Definition of done for this next pass

We should call the next pass complete only when all of the following are true:

1. one real previously broken project survives save and reload without losing visible wires
2. MCU, connector, and power/ground symbols in that project render primarily from native primitives
3. text overlap is reduced without reintroducing heuristic drift
4. regression tests exist for the fixed project class
5. build, lint, and targeted import/render tests pass

## 9. Short version

If we reduce this document to one line:

First prove the tests are protecting real KiCad truth, then fix one real reload project end-to-end, then raise native primitive priority for MCU, connector, and power symbols before touching more text heuristics.
