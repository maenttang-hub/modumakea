# Simulator Layer

ModuMake now exposes two simulation-facing engine entry points:

- [src/lib/circuit-netlist.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts)
- [src/lib/spice-simulator.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/spice-simulator.ts)

## What is available now

- Circuit analysis still builds the internal net graph and solves DC resistor/diode networks.
- `toSpiceNetlist(...)` exports a SPICE-like text netlist from the current project state.
- `runSpice(...)` accepts that netlist and runs it through a lightweight fallback solver.
- `op`, `dc`, `tran`, and `ac` modes all return a consistent result shape so the UI can be wired once.

## Why this matters

This gives the app a stable simulation boundary now, while keeping room for a future WASM ngspice worker later.

## Current limitation

The fallback simulator is intentionally conservative. Transient and AC traces are preview data derived from the DC operating point, not a full physical solver yet.
