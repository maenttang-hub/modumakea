# Next Phase Spec

This document fixes the next execution order for the imported KiCad schematic path.

The main priority is not visual polish first.
The main priority is to make the imported schematic stable after save, reload, and share-link reopen, and then reduce fallback rendering so the canvas looks closer to KiCad itself.

## Core Principle

We should separate the work into two layers:

1. Coordinate stability:
   wires, junctions, labels, component bodies, and pin anchors must keep the same world-space meaning after save and reload.
2. Visual fidelity:
   if original KiCad primitives exist, the renderer should prefer them and avoid app-style reinterpretation.

In one line:

**First fix the coordinate system so it does not drift after save/reload. Then reduce fallback rendering so the original KiCad symbol language shows through more directly.**

---

## Recommended Execution Order

1. Trace wire and label coordinates after reload
2. Increase primitive-first rendering for DHT22, connector, and MCU symbols
3. Fine-tune text rotation and alignment
4. Split and thin the validation panel further
5. Re-run stress samples and verify no regressions

---

## Phase 1: Reload Coordinate Stability

### Goal

After:

- cloud save
- refresh
- shared-link reopen

the same imported schematic must render with:

- the same wire positions
- the same label positions
- the same component positions
- the same pin-to-wire alignment

### Why this is first

Right now, this is the highest user pain:

- wires exist in the data but are not visible
- labels drift
- pin anchors and wire endpoints can appear separated

If this layer is unstable, visual cleanup on top of it is wasted effort.

### Main files

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-overlay.tsx`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/hooks/use-component-canvas-controller.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-scene-bounds.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/store/project-document.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/cloud-project-store.ts`

### Implementation focus

#### 1. Overlay projection audit

Confirm that:

- wire segments
- junctions
- labels
- page frame
- sheet frames

all use the same world-space basis that imported component nodes use.

Specifically verify:

- overlay points are projected from the same stored coordinate space
- node `position` is still top-left aligned to the same stored bounds origin
- no extra offset is introduced during viewport fit or reload

#### 2. Bounds and fit timing audit

Confirm that:

- `getImportedSchematicSceneBounds(...)`
- merged viewport bounds across scene + imported component bodies
- `rfInstance.fitBounds(...)`
- imported node layout with `preserveStoredBounds: true`

all agree about the same scene extents.

Check whether a one-frame timing mismatch causes overlay placement to happen before the viewport is in its final position.

#### 3. Save/read repair guarantee

Keep the current repair behavior intact:

- if `importedSchematicSource` exists and `importedSchematicScene` is missing or empty, the scene should be rebuilt before or during read/hydration
- unsafe empty imported cloud overwrites should remain blocked

### Acceptance criteria

- importing a `.kicad_sch`, then cloud saving, then refreshing must preserve visible wires
- reopening from a share link must preserve visible wires
- viewport fitting should not frame only wires or only bodies when both exist
- a pin anchor and its connected wire endpoint should not visibly separate
- labels should not shift after reload

---

## Phase 2: Primitive-First Symbol Rendering

### Goal

Reduce the number of symbols that still look app-generated when original KiCad primitives are already available.

### Why this is second

Once reload stability is fixed, the most obvious remaining quality gap is symbol fidelity:

- DHT22 pins can look wrong
- connectors still fall back too often
- MCU and power symbols still look partially reinterpreted

### Main files

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-render.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-node.tsx`

### Implementation focus

#### 1. DHT22 and small sensor symbols

Prefer the original primitive path more aggressively.

Avoid reshaping small quiet symbols into overbuilt app-style boxes or label-heavy renderings.

#### 2. Connector bodies

Reduce the rate at which connectors fall back to generic bodies when the original symbol graphics are already available.

#### 3. MCU bodies and pins

Keep the KiCad-like yellow MCU body where appropriate, but make sure:

- body outline
- pin positions
- pin numbers
- pin names

stay aligned with the original primitive data as directly as possible.

#### 4. Power, GND, and battery symbols

Keep app-added helper labels minimal.

If the original primitive is enough, do not layer unnecessary extra UI text on top.

### Acceptance criteria

- DHT22 pins should appear on the correct outward side
- connectors should more often use original structure instead of fallback boxes
- MCU and power symbols should feel closer to KiCad than to an app mockup
- helper overlays should get quieter where original primitives already communicate enough

---

## Phase 3: Text Rotation and Alignment Cleanup

### Goal

Make symbol text readable and quiet:

- no upside-down text
- less overlap
- fewer awkward vertical labels

### Main files

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-render.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-node.tsx`

### Implementation focus

Split text behavior by role:

- reference
- value
- pin-name
- pin-number
- annotation

For each role, tune:

- display angle
- anchor
- baseline
- suppression rules when native text already exists

Important working rule:

- native source text may preserve its orientation when that improves KiCad parity
- pin-name and pin-number text must remain readable first, not mechanically inherit upside-down source rotation

### Acceptance criteria

- no obviously inverted text in imported schematic mode
- reduced overlap for MCU-side text
- value/reference text should not sit noisily on top of the body unless the original KiCad symbol does so

---

## Phase 4: Validation Panel Separation

### Goal

Keep imported schematic rendering work separate from validation and AI work.

### Why this matters

The canvas render path and the AI/validation input path should not become coupled again.

### Main files

- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/validation-panel.tsx`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/validation-ai-section.tsx`
- `/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/resolve-validation-ai-input.ts`

### Implementation focus

- keep `LightweightValidationJson` as the canonical AI input
- keep integrated validation snapshots as background storage/state history
- split AI preview/export UI from AI execution/result UI more clearly

### Acceptance criteria

- imported schematic render issues do not break AI input generation
- validation panel stays thinner and easier to reason about
- legacy imported saves and new imported saves follow clearly separated resolution rules

---

## Phase 5: Stress Sample Verification

### Goal

Verify that the fixes are not only good for one friendly sample, but also survive real-world imported KiCad schematics.

### Main files

- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/project-serialization.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/cloud-project-route.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/imported-schematic-render.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad-import.test.ts`
- `/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/`

### Required checks

#### Serialization and reload

- wire, label, and pin alignment survives roundtrip
- imported scene is repaired if source text exists

#### Render fidelity

- MCU
- connector
- DHT22
- power symbols

should not regress into noisier fallback renderings

#### Real samples

Test at least one project that previously showed:

- missing visible wires
- label drift
- fallback-heavy connector rendering

### Acceptance criteria

- no new regression in import tests
- no new regression in cloud project route tests
- at least one previously broken project now survives save/reload with visible wires

---

## What Not To Do

To keep momentum and avoid reintroducing the old coupling:

- do not mix the legacy canvas importer and the v3 validation parser into one new path
- do not treat visual cleanup as finished before coordinate stability is proven
- do not add more fallback drawing rules before checking whether original primitives can be preserved instead

---

## Immediate Next Move

The next active task should be:

**trace the imported scene -> cloud save/load -> overlay render path until we can explain exactly why a project can report wire counts but still fail to display visible wires**

Only after that should we spend the next major chunk on:

**primitive-first rendering improvements for DHT22, connector, MCU, and power symbols**
