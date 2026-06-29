# Imported Schematic Stabilization Status

This document summarizes the current stabilization work for imported KiCad schematics in ModuMake.

It focuses on what is already true in the codebase, what still needs careful wording, and what should happen next.

## What has been stabilized

### 1. Imported schematic reload alignment

When a KiCad imported schematic is saved and opened again, symbols and wires should now stay on the same coordinate basis more reliably than before.

The key fix was to stop using different bounding-box assumptions for:

- imported component placement at parse time
- imported symbol layout at render time
- wire and anchor alignment checks during round-trip restore

This reduces the drift where wires existed in the scene data but no longer visually met the symbol pins after save and reload.

In addition, viewport fitting is no longer allowed to trust only one side of the imported scene.
The current fit path now treats:

- imported wire / junction / label scene bounds
- imported component body bounds

as one merged viewport target, so reloads are less likely to end up in a state where the data exists but one half of the schematic is framed off-screen.

Round-trip regression coverage was also added so we now check:

- initial import alignment
- `serialize -> hydrate` alignment
- pin-anchor and wire-start consistency after restore

### 2. Shared geometry rules for connectivity resolution

The connectivity solver now relies on the same geometry judgment path instead of keeping a separate private point-to-segment rule.

This matters because it reduces false "unrouted" results in cases such as:

- long wires
- tiny coordinate noise
- edge and endpoint proximity cases

The current direction is:

- one shared geometric truth for point-near-segment checks
- one snap tolerance model used consistently across connectivity work

### 3. Text orientation is being corrected role-by-role

One important rendering lesson is now clearer in code:

- source property text and source annotations can preserve more of the original KiCad intent
- pin names and pin numbers should not blindly preserve raw source rotation

Without that split, right-side MCU and connector pin text can end up visually inverted after import.

The current renderer now keeps native orientation more selectively so source-like text survives while pin labels stay readable.

More concretely:

- pin names and pin numbers are forced back into a readable orientation instead of inheriting upside-down source angles
- reference, value, and annotation text now follow an upright display rule more closely
- MCU and connector annotation text can stay visible when original KiCad primitives exist, instead of being suppressed too aggressively

### 4. Validation and AI input path cleanup

Imported schematic validation input is being normalized around the lightweight canonical format.

Current priority order is:

1. if original `.kicad_sch` source exists, rebuild validation input from it
2. if not, use the older integrated snapshot as a legacy fallback
3. if neither exists, use the shared fallback path

This makes AI and validation flows depend less on canvas-era inferred state and more on the original schematic source when available.

### 5. Legacy imported-save recovery guidance

Older imported schematic saves can still exist without complete original wire, label, or source state.

To reduce confusion, the UI now shows clearer recovery guidance in:

- the left review sidebar
- the AI validation section

Those notices are no longer passive text only. They now support:

- direct re-import action
- file picker flow
- drag-and-drop flow for `.kicad_sch`

This is meant to help users recover old imported projects without guessing what went wrong.

## What should not be overstated yet

The following statements are still too strong for the current state of the product:

- "KiCad 100% exact rendering is complete"
- "GPU-accelerated 60fps rendering is finished"
- "All warning-icon and fallback UX is fully complete"
- "All large parser stress suites were revalidated in this exact state"

The more accurate wording is:

- the overlay was split into lighter layers and memoized where appropriate
- the coordinate and wire-alignment path was stabilized first
- the rendering is being pushed closer to KiCad, but it is not exact parity yet
- targeted tests, lint, and production build were verified for this work

## Current technical conclusion

At this stage, the most painful issues were addressed first:

- post-save coordinate drift
- inconsistent geometry rules for connectivity
- confusing legacy fallback behavior for imported projects

This is not the end-state for KiCad-accurate rendering.

It is the stabilization step that makes the next rendering work safer.

## Most natural next steps

### Next step 1. Reduce fallback usage when source primitives exist

The next rendering milestone is to reduce how often the app reinterprets imported symbols when the original KiCad primitive data already exists.

Priority targets:

- MCU symbols
- connectors
- battery symbols
- power and ground symbols
- small passive symbols that still feel "app-styled" instead of source-faithful

The goal is simple:

- if original KiCad primitives exist, prefer them
- let fallback rendering intervene only when source primitives are actually missing or unusable

### Next step 2. Trace a real reload case where wires still do not appear

If there is still a project where:

- wire count exists in data
- but wires, junctions, or labels do not appear on screen after reload

then the next debugging target should be one exact project traced end-to-end through:

1. imported scene generation
2. project document serialization
3. cloud save / reload
4. overlay render

The specific question to answer is:

> At what exact point do `wire / junction / label` coordinates stop matching the visible symbol coordinate space?

That trace is more important than further theme or copy polish.

## Working rule going forward

Do not mix these two tracks again:

- import-and-render behavior
- validation-and-AI behavior

The rendering path should focus on source-faithful visual reconstruction.

The validation path should focus on canonical schematic-derived logical input.

Keeping those separate is what allows KiCad accuracy and verification accuracy to improve without destabilizing each other.
