# KiCad Schematic Viewer: From-Scratch System Architecture Spec

This document defines a clean-sheet architecture for imported KiCad schematic review mode.

The goal is simple:

**Do not awkwardly mix imported KiCad rendering with the existing web editor model.**

Instead, we rebuild the imported review path around one promise:

**show the original KiCad schematic as faithfully as possible, then layer review interactions on top.**

---

## 1. Core Principles

### 1.1 Single-Axis Rendering

Everything visible in imported schematic review mode must be rendered inside one unified SVG scene:

- wires
- junctions
- page frame
- sheet frames
- symbol body primitives
- pin stems
- pin names
- pin numbers
- reference text
- value text

There must not be one visual path for wires and a different visual path for symbols.

### 1.2 Lightweight Interaction Layer

React Flow component nodes are no longer allowed to own the visible symbol drawing.

They exist only for:

- hover
- selection
- context menu
- comment anchors
- focus targeting

In other words:

**the scene draws**

**the nodes interact**

### 1.3 No Runtime Alignment Math

The renderer should not keep trying to reconcile:

- local node offsets
- world-space wire positions
- re-derived bounding-box origins
- post-hydration correction math

All imported review coordinates should be transformed into absolute canvas-space once during parsing / scene-building.

After that, render time should be almost entirely dumb.

---

## 2. Product Goal

Imported schematic review mode is not a block editor.

It is a:

**KiCad scene viewer with review overlays**

The user expectation is:

1. import a `.kicad_sch`
2. see the original schematic as close to KiCad as possible
3. review it
4. comment on it
5. inspect validation and AI findings

The user expectation is not:

- generic app-style boxes
- local node-based symbol reconstruction
- wires sliding relative to pins
- fallback-heavy rendering when original primitives exist

---

## 3. Data Flow Pipeline

```text
[KiCad .kicad_sch Source Text]
           │
           ▼
  [KiCad Parser Core]
           │
           ├───────────────────────────────┐
           ▼                               ▼
[Visual Scene Snapshot]         [Logical Circuit Model]
(Wires, Symbols, Text,          (Nets, Components, Values,
 Frames, Labels)                Pins Metadata)
           │                               │
           ▼                               ▼
[Single Background SVG]         [v3 DRC & AI Verification]
(Visual Parity Renderer)        (Validation-only Pipeline)
           │
           ▼
[Transparent React Flow Nodes]
(Selection, Hover, Comments)
```

### 3.1 Parse-Time Split

The parser must produce two separate outputs from the same source text:

#### A. Visual Scene Snapshot

This is for rendering only.

It should already contain:

- absolute symbol primitive geometry
- absolute wire geometry
- absolute text placements
- absolute frame geometry

No editor-time reconstruction should be required to display the schematic.

#### B. Logical Circuit Model

This is for verification only.

It should contain:

- connectivity
- pins
- component identities
- values
- labels
- unresolved symbol information

This feeds:

- DRC
- ERC
- HW/SW consistency checks
- AI analysis

### 3.2 Render-Time Rule

At render time:

- the scene snapshot renders the picture
- the logical model powers validation and AI

These two outputs come from the same source, but they must not be collapsed into one editor-centric data structure.

---

## 4. Renderer Contract

### 4.1 Scene Ownership

The single background SVG owns the visible truth of the schematic:

- symbol body
- pin stems
- text
- wires
- junctions
- labels
- sheet frames
- page frame

### 4.2 Interaction Ownership

React Flow owns:

- panning
- zooming
- viewport shell
- selection hit targets
- review affordances

It must not own the symbol picture in imported review mode.

### 4.3 Strong Fidelity Rule

If KiCad source primitives exist, they win.

Rendering priority must be:

1. original KiCad primitives
2. original KiCad pin anchors
3. original source text
4. minimal fallback only when source graphics are truly missing

Never prefer an app-generated box when KiCad already told us how to draw the symbol.

---

## 5. Current Problem Statement

The imported path has historically mixed:

- scene-global wire rendering
- node-local symbol rendering
- bounding-box-based origin recovery
- save / reload repair logic

That mix is exactly why we keep seeing:

- wires present in data but invisible on screen
- pins that do not visually meet wires
- text that rotates, flips, or overlaps
- MCU / connector / sensor symbols that look app-generated
- cloud save / reload drift

This spec explicitly rejects that mixed model.

---

## 6. File-Level Refactoring Map

### 6.1 Parser: `kicad-sch-parser.ts`

File:

- [src/lib/kicad-sch-parser.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/kicad-sch-parser.ts)

#### Current role

This file already parses imported KiCad data and builds scene-like structures, but symbol visual ownership is still split between scene and component nodes.

#### Required direction

`buildImportedSchematicScene` must become strong enough that the scene alone can visually render the schematic.

That means:

- loop through all imported component instances
- resolve their symbol primitives
- apply mirror -> rotate -> translate during scene build
- emit fully absolute scene-space symbol geometry into `scene.symbols`

The scene output should be sufficient to render the imported schematic even if component nodes render nothing except interaction hitboxes.

#### Acceptance rule

If `scene.symbols` is present, the renderer must not need to reconstruct visible symbol bodies from component node-local geometry.

---

### 6.2 Visual Engine: `imported-schematic-overlay.tsx`

File:

- [src/components/canvas/imported-schematic-overlay.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-overlay.tsx)

#### Current role

This component already renders:

- wires
- junctions
- labels
- frames

It has now started to take on more symbol rendering responsibility, but it should become the single visual engine for imported review mode.

#### Required direction

Add a first-class `SymbolsLayer` that renders:

- rect
- polyline
- circle
- arc
- text
- pin stems

directly from `scene.symbols`.

Text should use already-resolved upright display angles and anchors from the parser / scene builder rather than reinterpreting editor assumptions.

#### Acceptance rule

The imported review screen should remain visually understandable even if imported component nodes are rendered as invisible hitboxes only.

---

### 6.3 Interaction Layer: `imported-schematic-node.tsx`

File:

- [src/components/canvas/imported-schematic-node.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/imported-schematic-node.tsx)

#### Current role

This file has historically rendered:

- body primitives
- pin text
- fallback labels
- outlines
- handles

That is too much responsibility for imported review mode.

#### Required direction

Demote this node to an interaction-only layer:

- transparent hitbox
- selected / hovered outline
- comment anchor target
- optional highlight chrome

Remove or progressively retire:

- full body drawing
- text rendering
- primitive ownership
- fallback symbol body ownership

#### Acceptance rule

In imported review mode, this node should be almost visually empty unless the user is interacting with it.

---

### 6.4 Node Assembly: `canvas-graph.ts`

File:

- [src/components/canvas/canvas-graph.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/canvas/canvas-graph.ts)

#### Required direction

The imported overlay node becomes the canonical scene node:

- inserted first in imported review mode
- positioned using scene bounds
- non-selectable
- non-draggable
- non-deletable
- pointer-events transparent

Component nodes remain in the graph only as interaction carriers.

#### Acceptance rule

The visible schematic should no longer depend on node z-index tricks or duplicated body drawing between overlay and component nodes.

---

## 7. Scene Snapshot Shape

The scene snapshot should eventually be treated as a stable render asset.

Suggested structure:

```ts
interface ImportedSchematicScene {
  wireSegments: SceneWireSegment[];
  junctions: ScenePoint[];
  labels: SceneLabel[];
  pageFrame?: ScenePageFrame;
  sheetFrames?: SceneSheetFrame[];
  symbols: SceneSymbolInstance[];
}

interface SceneSymbolInstance {
  id: string;
  reference?: string;
  value?: string;
  family?: 'mcu' | 'connector' | 'power' | 'passive' | 'generic';
  bounds: SceneBounds;
  primitives: ScenePrimitive[];
  pins: ScenePinAnchor[];
}
```

This keeps the render model explicit and decoupled from editor node state.

---

## 8. Save / Reload Contract

### 8.1 Storage Rule

Cloud save / browser save must preserve:

- imported source text
- scene snapshot
- logical validation snapshot

But the visible imported schematic should prefer:

1. scene snapshot rebuilt from source when possible
2. stored scene snapshot only as fallback

### 8.2 Stability Rule

Save -> reload must not require a second alignment pass to make wires meet pins.

If a scene snapshot is valid, the renderer should display it directly without editor-time correction math.

---

## 9. Acceptance Criteria

### 9.1 Zero Drift

Under pan and zoom, the following must remain visually locked:

- wires
- pin endpoints
- junctions
- labels
- symbol bodies

No visible pixel drift should appear between wires and pins.

### 9.2 Repeatable Reload

After repeated save / reload cycles, the imported schematic should retain the same visual result.

The user should not see:

- missing wires
- shifted labels
- floating pin text
- symbols moving relative to wires

### 9.3 Cleaner Code

Imported review mode should no longer rely on:

- duplicated symbol rendering paths
- node-local re-derivation of visible bodies
- bounding-box correction chains to recover wire alignment

### 9.4 Review UX Intact

The user must still be able to:

- hover a symbol
- select a symbol
- open context actions
- place comments
- follow validation focus

without reintroducing editor-style visual ownership.

---

## 10. Migration Strategy

### Phase A

Make the overlay node the single world-space renderer for:

- wires
- junctions
- labels
- frames
- symbol bodies

### Phase B

Reduce imported component nodes to:

- hitboxes
- outlines
- handles only if still required

### Phase C

Move pin anchor and comment targeting to scene-first coordinates.

### Phase D

Retire remaining app-style fallback rendering for any symbol that already has recoverable KiCad primitives.

---

## 11. Relationship to Validation / AI

This scene-viewer architecture does not replace the validation-first parser architecture.

We keep two separate truths with one source:

### Visual truth

- scene snapshot
- SVG renderer

### Logical truth

- v3 parser
- connectivity solver
- lightweight validation JSON
- integrated validation snapshots
- AI analyze input

This separation is healthy.

What must stop is mixing editor rendering assumptions into the visual truth of imported review mode.

---

## 12. Final Rule

If we want imported KiCad review mode to feel trustworthy, we have to stop treating imported schematics like half-converted app components.

The clean architectural decision is:

**one KiCad scene**

**one scene-space SVG renderer**

**one lightweight interaction layer on top**

That is the path that gives us:

- visual parity
- reload stability
- simpler code
- better AI / validation separation

