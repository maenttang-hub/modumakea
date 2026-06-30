# ModuMake Review-First MVP Roadmap

## Current product focus

ModuMake is not trying to be a full PCB CAD right now.

The current MVP is:

- a simple circuit canvas
- board and sensor compatibility review
- datasheet-based warnings
- safer wiring suggestions
- starter firmware generation

The product promise is still:

> Catch hardware mistakes before real-world prototyping.

## What we are actively building now

### 1. Review-first flow

- keep simulation and schematic as the primary workspaces
- reduce UI weight that looks like unfinished professional EDA tools
- show pin usage, power usage, compatibility, and warnings more clearly than layout chrome

### 2. Reliability guardrails

- local project save/load
- undo/redo that stays fast as projects grow
- AI request rate limiting
- duplicate request blocking
- automatic local fallback when cloud AI fails

### 3. Practical circuit safety

- voltage mismatch checks
- rail current budget checks
- companion-part rules such as LED resistors and pull-up requirements
- manual and automatic wiring that stay visually readable

## Explicitly deferred

These are valuable, but they are not part of the current MVP promise:

- full PCB layout workflow
- production-ready output packages
- Gerber generation
- advanced router parity with KiCad / Altium / EasyEDA
- commerce and BOM ordering integrations
- WebSerial firmware flashing
- cloud-scale custom component marketplace
- breadboard real-view mode

## Product decision rule

If a feature makes the app feel more like a half-finished PCB suite than a dependable hardware reviewer, it should be delayed.

If a feature helps beginners avoid real mistakes faster, it belongs in the current roadmap.
