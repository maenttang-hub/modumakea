# Imported KiCad Structure Recognition Spec

## Goal

Imported KiCad review mode must distinguish between:

- real schematic symbols
- hierarchical sheet frames
- page/document frame elements
- freeform document annotations

The viewer should not make hierarchical sheets look like connector bodies or ordinary placed parts.

## Why

In several imported projects such as `Arduino_hat` and `L9779WD-breakout_adc`, large dashed KiCad sheet frames visually resemble component outlines. That makes people read sub-sheet boundaries as if they were connector graphics.

This is not a coordinate bug by itself. It is a structure-recognition and presentation problem.

## Rules

### 1. Structural truth comes from the KiCad parser

- `(sheet ...)` nodes become `sheetFrames`
- `(title_block ...)` and page paper info become `pageFrame`
- `(symbol ...)` instances remain symbols
- free drawings remain `drawings`

We should prefer parsed structure over visual guessing whenever the source file gives us that structure.

### 2. Hierarchical sheet frames are document objects

Sheet frames must be treated as review/document structure, not as components.

Viewer implications:

- lighter stroke weight than symbol outlines
- title rendered inside the frame, not like a component label floating above it
- optional file hint rendered as secondary text
- pin labels kept, but visually quieter than symbol pin labels

### 3. No automatic spatial rearrangement

We do not auto-move symbols, wires, pins, connectors, or sheet frames during import review.

If layout cleanup is ever proposed later, it must be:

- diagnosis-driven
- explicit
- previewable
- user-approved

## Phase 1 implementation

1. Add imported structure helpers that classify sheet frames as hierarchical document objects.
2. Use those helpers in the overlay so sheet titles and file labels render in a calmer, document-like style.
3. Add regression tests proving:
   - a KiCad `(sheet ...)` is recognized as a hierarchical sheet
   - recognized sheet labels are derived from `name` and `file`
   - real symbol rendering behavior is untouched

## Non-goals

- no connector/body auto separation by image vision alone
- no overlap auto-resolution
- no viewport auto-arrangement
- no symbol geometry rewriting
