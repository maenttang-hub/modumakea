# KiCad Scene Reviewer Single-Axis Spec

This document defines the rule that imported schematic review mode must converge onto a single rendering axis.

That axis is:

**KiCad scene-based review rendering**

This is not a soft preference.
This is a structural decision meant to stop the imported schematic path from mixing:

- block-editor rendering assumptions
- node-local geometry reconstruction
- scene-global wire rendering
- validation-only data transforms

In one line:

**Imported schematic review mode must behave like a KiCad scene reviewer, not like a partially converted block editor.**

---

## 1. Product Rule

For imported `.kicad_sch` projects, the user expectation is:

- open the schematic
- see it as close to KiCad as possible
- review it
- comment on it
- inspect validation and AI findings

The user expectation is not:

- drag around app-style component cards
- re-route imported nets using editor abstractions
- reconstruct every symbol into a generic node box first

So the rendering architecture must match the product promise.

---

## 2. Single-Axis Decision

Imported schematic review mode must be organized around one rendering truth only:

### Canonical visual truth

- symbol primitives
- pin lines
- pin names
- pin numbers
- reference text
- value text
- wires
- junctions
- local/global labels
- sheet frames
- page frame

All of the above must come from one KiCad scene model and be rendered inside one world coordinate system.

### What this explicitly rejects

Do not split the visible schematic across:

- React Flow component-local render math
- node top-left offset recovery
- separately reconstructed pin anchors
- scene-global wire SVG
- app fallback boxes rendered as the default visual path

If we keep doing that, the imported review path will keep breaking in exactly the same ways:

- wires exist in data but are not visible
- pins look disconnected from wires
- text flips or overlaps
- DHT22 / connector / MCU look app-generated instead of source-faithful
- cloud save / reload keeps drifting

---

## 3. Architectural Principle

Imported schematic review mode should be treated as:

**a scene viewer with review overlays**

Not as:

**a standard component editor with imported decoration**

### Correct mental model

```text
KiCad source
  -> scene model
  -> scene SVG renderer
  -> review overlays
  -> validation / AI side panels
```

### Wrong mental model

```text
KiCad source
  -> imported component nodes
  -> local node primitive reconstruction
  -> separately drawn wire overlay
  -> patch missing parity with more fallbacks
```

The second model is what creates most of the instability.

---

## 4. What Stays

The following pieces stay, but their role becomes narrower and cleaner.

### A. React Flow stays as the viewport shell

React Flow still provides:

- pan
- zoom
- minimap
- shared viewport interaction
- review shell integration

But React Flow should not remain the primary imported symbol renderer.

### B. v3 logical parser stays as the validation truth

The following remains the canonical source for:

- validation
- AI analyze input
- lightweight validation JSON
- integrated validation snapshots

Files:

- [src/lib/parse-kicad-for-validation.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/parse-kicad-for-validation.ts)
- [src/lib/v3-kicad-parser/](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/v3-kicad-parser/)

This path should not be replaced by render-time scene logic.

### C. Review overlays stay

We still need:

- comment anchors
- selected component highlight
- validation focus highlight
- clickable issue targeting

But these should sit on top of the scene, not redefine the scene.

---

## 5. What Must Be Demoted or Removed

### A. Imported component nodes must stop owning the visual truth

Files:

- [src/components/canvas/imported-schematic-node.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-node.tsx)
- [src/components/canvas/canvas-graph.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/canvas-graph.ts)

Current problem:

Imported component nodes still do too much:

- shape drawing
- pin layout
- text placement
- fallback box rendering
- selection hitbox

Required direction:

In imported schematic review mode, these nodes should be reduced to:

- invisible or near-invisible interaction carriers
- or removed entirely if the scene renderer can support hit testing directly

### B. App-style fallback rendering must stop being the default path

If original KiCad primitives exist, those must win.

Fallback should only appear when:

- primitives are actually missing
- symbol resolution truly failed
- the source is incomplete beyond recovery

### C. Node-local layout math must stop deciding where the schematic is

The visible position of symbol pins and symbol text should not depend on:

- node-local bbox origin
- node-local width / height
- re-derived local layout when the source already contains the graphic truth

---

## 6. Rendering Contract

### Required contract

Imported schematic review mode renders one scene:

- one world-space basis
- one SVG scene
- one symbol language

### Practical contract

The renderer must prefer:

1. original symbol primitives
2. original pin anchors
3. original source text where it remains readable
4. original wire/junction/label coordinates

And only then fall back to app helpers.

### Strong rule

The app must not invent a boxy or editor-like component body when KiCad already told us how to draw the symbol.

---

## 7. Data Flow Rule

Imported review mode now has three different truths, each with one job.

### Visual truth

KiCad scene model

Used for:

- what the user sees
- what the user clicks in review mode

### Logical truth

v3 validation parser output

Used for:

- validation
- AI review
- code/hardware consistency

### Persistence truth

Saved source text plus normalized imported scene snapshot

Used for:

- reload
- cloud reopen
- share link reopen

### Non-negotiable rule

Do not let these three collapse back into one confused hybrid runtime object.

They can be related.
They should not be fused.

---

## 8. File-Level Refactor Direction

### Main renderer path

- [src/components/canvas/imported-schematic-overlay.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-overlay.tsx)
- [src/lib/imported-schematic-render.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-render.ts)
- [src/lib/imported-schematic-scene-bounds.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-scene-bounds.ts)

These files should become the primary visual engine for imported schematic mode.

### Interaction layer

- [src/components/canvas/imported-schematic-node.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-node.tsx)
- [src/hooks/use-component-canvas-controller.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/hooks/use-component-canvas-controller.ts)
- [src/lib/project-comments.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/project-comments.ts)

These files should move toward:

- hit targets
- review focus
- comment placement

Not toward re-rendering the symbol again.

### Persistence and reload

- [src/store/project-document.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/store/project-document.ts)
- [src/lib/cloud-project-store.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/cloud-project-store.ts)
- [src/store/use-board-store.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/store/use-board-store.ts)

These files must preserve one stable imported scene path and avoid reviving stale visual assumptions on reload.

---

## 9. Execution Order

### Phase 1. Coordinate stability first

Goal:

- save -> reload -> reopen still shows the same wires, labels, and symbols

Focus:

- imported scene coordinates
- overlay node basis
- reload repair path

### Phase 2. Primitive-first symbol rendering

Goal:

- DHT22
- MCU
- connector
- battery
- power / GND

should all prefer original KiCad primitives before fallback

### Phase 3. Text cleanup

Goal:

- no upside-down pin text
- less overlap
- better role-based text placement

### Phase 4. Interaction thinning

Goal:

- scene owns the picture
- overlays own the review interaction
- imported nodes stop behaving like mini editors

---

## 10. Acceptance Criteria

This refactor is successful only if all of these become true.

### Visual behavior

- wires visibly connect to pins
- labels stay where KiCad expects them
- MCU and connector symbols no longer default to app-like reinterpretation
- DHT22 and other small symbols do not get overbuilt into generic boxes
- helper text gets quieter when source primitives already explain enough

### Reload behavior

- local save -> reload preserves visible wires
- cloud save -> reopen preserves visible wires
- share link reopen preserves visible wires
- “wire count exists but no line appears on screen” is no longer a normal failure mode

### Structural behavior

- imported scene SVG is the main renderer
- imported component nodes are secondary or invisible in review mode
- validation and AI still depend on the v3 logical path, not on visual fallback state

---

## 11. Explicit Non-Goals

This spec does not attempt to complete:

- a full editable KiCad-like schematic editor
- drag-to-rewire imported symbols as if they were native board-editor nodes
- full PCB editing
- generic fallback beautification as the main rendering strategy

The goal is much narrower and much more important:

**make imported KiCad schematics render stably and faithfully for review.**

---

## 12. Final Rule

If imported schematic mode is a KiCad reviewer, then the renderer must think in scenes, not in editor cards.

In one sentence:

**Do not half-convert KiCad into an app-shaped editor surface. Render KiCad as KiCad, then layer review on top.**
