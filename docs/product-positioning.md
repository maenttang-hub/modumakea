# ModuMake Product Positioning

## One-line description

ModuMake is a review-first hardware tool that imports simple KiCad circuits and turns power, wiring, pin, and component risks into an explainable report.

## What we are

- Datasheet-grounded validation tool for Arduino, ESP32, and Raspberry Pi projects
- Hardware safety reviewer for beginners, makers, educators, and prototype teams
- Design-time assistant that explains why a sensor/board/pin combination is risky
- Beta product surface for KiCad/simple-circuit review, not a general CAD workspace

## What we are not

- Full replacement for professional EDA suites
- Advanced PCB router
- High-precision SPICE simulator
- Manufacturing release authority
- Public cloud compile service
- Automatic verifier for every component datasheet

## Product difference

- Tinkercad focuses on simulation
- EasyEDA focuses on schematic and PCB production
- ModuMake focuses on circuit review and risk explanation before build handoff

## Core value proposition

Users do not mainly lose money because wires look messy.
They lose money because they:

- choose the wrong sensor module
- connect 5V and 3.3V parts incorrectly
- use unsupported pins
- miss pull-up, warm-up, ADC, or current constraints
- trust generic modules without strong vendor documentation

ModuMake should catch those mistakes inside the design surface and say:

- "This does not work."
- "Level shifting is required."
- "Avoid this pin."
- "Official documentation is incomplete."
- "Fix these issues before build handoff."

## Primary target users

1. Non-hardware founders building IoT prototypes
2. Arduino and ESP32 beginners
3. Maker educators and training programs
4. Startup teams before outsourced PCB review work

## MVP priorities

### Tier 1

- Validation report
- Board and sensor compatibility checks
- Datasheet evidence links
- Dangerous connection blocking

### Tier 2

- Auto wiring
- Starter code generation
- BOM generation

### Tier 3

- PCB review assistance
- Simulation
- Advanced manual wiring editing

## Immediate build order

1. Finalize the sensor data model
2. Build a verified sensor pack around 30 core parts
3. Complete board rules for Arduino UNO, ESP32 DevKit, and Raspberry Pi
4. Strengthen the validation report with severity, reason, and fix suggestion
5. Add project PDF report export
6. Add BOM output
7. Ship 5 demo projects showing failure and recovery flows
8. Keep product copy centered on review and validation, not generic AI circuit generation or manufacturing guarantees
