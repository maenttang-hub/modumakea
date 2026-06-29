# Imported Schematic Scene-SVG Refactor Spec

This document defines the refactor that moves imported KiCad schematic rendering away from per-component React Flow node reconstruction and toward a single KiCad-scene SVG model.

The goal is not a cosmetic cleanup.

The goal is to stop mixing two coordinate systems:

- component-local node rendering
- scene-global wire / junction / label rendering

That split is the root cause of the repeated drift, invisible wires, inverted text, and fallback-heavy symbol rendering.

In one line:

**Imported schematic review mode should render one KiCad scene in one world coordinate system.**

---

## Core Decision

For imported schematic review mode, we should no longer treat each imported symbol as a separately reconstructed React Flow component node unless there is a strong interaction reason to do so.

Instead, we should:

1. parse the `.kicad_sch`
2. build one scene model
3. render symbol primitives, pins, wires, junctions, labels, and sheet frames inside one SVG world
4. layer review interactions on top of that scene

This means the React Flow canvas remains the viewport and interaction shell, but the imported schematic itself becomes a scene-first renderer.

---

## Why the Current Structure Keeps Failing

### 1. Two coordinate models are still mixed

Imported component bodies are rendered inside separate React Flow nodes using local bounds and local primitive offsets.

Imported wires, junctions, labels, and frames are rendered from scene-global coordinates.

Even when both appear inside the same viewport, they do not share the same layout contract.

That is why the app can end up in states where:

- the wire count is correct
- the scene is present
- the symbol is present
- but the wire does not visibly meet the pin

### 2. Bounding-box math is doing too much work

The current imported node path keeps re-deriving:

- node width
- node height
- primitive layout origin
- pin anchor offsets
- text placement

That is correct for a block editor.
It is fragile for a KiCad scene viewer.

### 3. Save / reload has to preserve too many coupled assumptions

Right now, save and reload must preserve:

- imported scene coordinates
- imported component positions
- imported geometry bounds
- primitive offsets inside each node

If any one of those shifts slightly, the scene looks broken even when the data technically exists.

---

## Architectural Target

We should treat imported schematic mode as a different rendering product from the normal board editor.

### Normal board editor

- React Flow nodes are the main source of truth
- components are interactive blocks
- edges are editor-managed connections

### Imported schematic review mode

- KiCad scene SVG is the main source of truth
- components are scene primitives, not app-styled blocks
- wires, pins, and text are rendered from the same world-space model
- review comments, focus highlights, and selection overlays are layered on top

---

## Proposed Runtime Structure

```text
.kicad_sch
  -> parser
  -> imported scene model
  -> scene SVG renderer
  -> review overlay layer
  -> validation / AI side panels
```

In imported schematic mode, the renderer should conceptually look like this:

```text
React Flow viewport
  └ scene background node
      └ one SVG scene
          ├ symbol primitives
          ├ pin lines
          ├ pin text
          ├ wires
          ├ junctions
          ├ net labels
          ├ sheet frames
          └ page frame
  └ review overlays
      ├ selection highlight
      ├ validation focus
      └ comment anchors
```

Important:

The scene SVG and its overlays must share one world-space basis.

---

## Scope Boundary

This refactor applies only to:

- imported schematic review mode
- especially `kicad_generic`
- imported projects opened from local save, cloud save, or share link

This refactor does not change:

- the standard board editor path
- board-node based drag-edit workflows
- v3 validation parser architecture
- AI analyze contract

---

## File-Level Refactor Plan

### 1. Build a scene-first renderer

#### Main files

- [src/components/canvas/imported-schematic-overlay.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-overlay.tsx)
- [src/lib/imported-schematic-render.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-render.ts)
- [src/lib/imported-schematic-scene-bounds.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-scene-bounds.ts)

#### Required change

Turn the imported schematic renderer into the primary place where all KiCad primitives are drawn:

- symbol body primitives
- pin stubs
- pin names
- pin numbers
- reference and value text
- wires
- junctions
- labels
- sheet frames
- page frame

The scene SVG must no longer depend on imported component node-local layout for the visual truth of the schematic.

#### Rule

If a symbol has original KiCad primitives, the scene renderer should draw them directly in world coordinates.

Fallback rendering should be a last resort, not the default path.

---

### 2. Reduce imported component nodes to interaction carriers only

#### Main files

- [src/components/canvas/imported-schematic-node.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-node.tsx)
- [src/components/canvas/canvas-graph.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/canvas-graph.ts)

#### Required change

Imported schematic component nodes should stop being the main visual renderer.

They should become one of two things:

1. a minimal invisible hit target for selection / focus / comments
2. or be removed entirely in imported review mode if the scene renderer can provide hit testing directly

#### Rule

Do not draw full fallback boxes inside component nodes when the scene SVG already drew the actual KiCad symbol.

The scene should own the picture.

The node should own only interaction metadata if still needed.

---

### 3. Move pin anchors to scene-space logic

#### Main files

- [src/lib/imported-schematic-geometry.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-geometry.ts)
- [src/components/canvas/imported-schematic-node.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-node.tsx)
- [src/hooks/use-canvas-routing.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/hooks/use-canvas-routing.ts)

#### Required change

Pin anchors used for:

- review focus
- comment targeting
- compatibility hints
- any remaining interaction

must be stored or derivable in the same scene-space coordinates as wires.

#### Rule

Do not require:

- node top-left
- local primitive origin
- local width / height

to recover a pin anchor that already exists in the imported scene model.

---

### 4. Make save / reload preserve one canonical scene

#### Main files

- [src/store/project-document.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/store/project-document.ts)
- [src/lib/cloud-project-store.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/cloud-project-store.ts)
- [src/store/use-board-store.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/store/use-board-store.ts)

#### Required change

For imported schematic mode, the canonical visual snapshot should be:

- original `.kicad_sch` source, plus
- one normalized imported scene representation

Not:

- source text
- scene
- node-local geometry assumptions
- plus extra visual fallback state all competing as visual truth

#### Rule

On reload, we should prefer rebuilding or validating the scene-first representation instead of trusting stale node-local imported geometry when the two disagree.

---

### 5. Keep validation and AI separate from the scene renderer

#### Main files

- [src/lib/resolve-validation-ai-input.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/resolve-validation-ai-input.ts)
- [src/lib/build-lightweight-validation-json.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/build-lightweight-validation-json.ts)
- [src/components/dashboard/validation-ai-section.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/dashboard/validation-ai-section.tsx)

#### Required change

The scene-first renderer should not become the data source for AI.

The v3 parser path remains the canonical logical source for:

- validation
- AI analyze input
- lightweight validation JSON

#### Rule

Do not merge render-time scene repair logic back into validation truth.

Keep:

- render truth
- logical validation truth

close, but still separated by purpose.

---

## Concrete Execution Order

### Phase A. Scene-first visual baseline

1. Extend the imported scene model so symbols can be rendered directly from world-space primitives
2. Render MCU / connector / power / battery / DHT22 from the scene SVG first
3. Keep component nodes minimal or invisible in imported review mode

### Phase B. Pin and wire parity

1. Move pin anchors to scene-space
2. Verify pin-to-wire visual alignment without node-local offset reconstruction
3. Remove duplicate pin text or duplicate primitive text paths

### Phase C. Save / reload hardening

1. Store one canonical scene snapshot
2. Rebuild scene from source when stale visual state is detected
3. Confirm share-link reopen and cloud reload produce the same visible result

### Phase D. Interaction polish

1. Add direct scene hit-target mapping for comments and review focus
2. Keep selected symbol and flagged net highlight overlays independent from symbol drawing
3. Thin the remaining imported schematic node path further

---

## Acceptance Criteria

### Visual parity

- wires visibly connect to symbol pins
- DHT22, MCU, connector, battery, and power symbols look source-faithful first
- fallback boxes appear only when original KiCad primitives are actually unavailable
- text is readable and not visibly upside down or arbitrarily detached

### Reload stability

- local save -> reload keeps the same visible schematic
- cloud save -> reopen keeps the same visible schematic
- share link reopen keeps the same visible schematic
- wire count existing in data but not appearing on screen is no longer possible in a healthy scene

### Architectural cleanliness

- imported schematic visual truth is scene-first
- imported component nodes are no longer the main renderer
- validation / AI still depend on the v3 logical parser path, not on render-time node state

---

## Explicit Non-Goals

This refactor does not aim to complete:

- full PCB geometry kernel work
- generic editor drag-to-rewire workflows for imported KiCad symbols
- autorouter parity with the board editor
- full KiCad editing support inside imported review mode

The goal is:

**render imported KiCad schematics as faithfully and stably as possible for review.**

---

## Short Technical Conclusion

The imported schematic path should stop behaving like a converted block editor document and start behaving like a rendered KiCad scene.

That is the cleanest way to fix all of these together:

- missing wires
- pin / wire drift
- connector and MCU fallback overuse
- text orientation weirdness
- save / reload instability

In one line:

**If the product promise is "review KiCad like KiCad", the scene SVG must become the primary renderer.**
