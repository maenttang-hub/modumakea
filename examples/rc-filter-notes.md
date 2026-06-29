# RC Filter Example

This example is meant to pair with the circuit netlist checks.

Target idea:

- PWM output from an Arduino pin
- series resistor
- capacitor to ground
- observe whether the review engine reports good or weak smoothing

Suggested values to try:

- `R = 1k`, `C = 10uF`
- `R = 10k`, `C = 100nF`
- `R = 220`, `C = 1uF`
