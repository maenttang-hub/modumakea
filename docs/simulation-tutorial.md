# Simulation Tutorial

## What ModuMake simulates today

ModuMake currently offers a lightweight engine that can:

- analyze the project netlist
- export a SPICE-like representation
- solve DC operating points
- preview transient and AC traces from the solved DC state

## Best current uses

- check if a divider lands near the expected voltage
- catch obvious shorts or over-voltage paths
- sanity-check LED and resistor arrangements
- inspect whether your project is structurally ready to simulate

## Current limitation

Transient and AC charts are still preview-level. They are useful for workflow and education, but they are not yet a drop-in replacement for full ngspice WASM.
