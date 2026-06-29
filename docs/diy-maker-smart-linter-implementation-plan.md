# DIY/Maker Smart Linter Implementation Plan

This document folds the new DIY/Maker-focused verification rules into the current ModuMake validation stack without pretending that everything is missing or that everything is already done.

It is grounded in the current codebase:

- DRC entrypoint: [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts)
- Net / passive extraction: [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts)
- Datasheet / thermal layer: [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/datasheet-rules.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/datasheet-rules.ts)
- Validation issue model: [`/Users/gimdong-il/Desktop/프로그램/modumake/src/types/index.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/types/index.ts)
- DRC tests: [`/Users/gimdong-il/Desktop/프로그램/modumake/tests/drc-engine.test.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/tests/drc-engine.test.ts)
- Netlist tests: [`/Users/gimdong-il/Desktop/프로그램/modumake/tests/circuit-netlist.test.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/tests/circuit-netlist.test.ts)

## Why This Exists

The new DIY/Maker rules are valuable, but they should be merged into the existing validation engine in the right order:

1. extend what already exists
2. reuse the current net graph and passive-element extraction
3. avoid duplicating thermal/power logic in multiple places
4. keep every new rule tied to regression tests

## Reality Check

Some of the requested behavior is already present in partial form.

| Area | Current status | Existing rule(s) / code |
| --- | --- | --- |
| LDO thermal warning | already implemented | `power.regulator-thermal`, datasheet power report |
| regulator max input voltage | already implemented | `power.regulator-max-input` |
| flyback / inductive-load protection | partially implemented | `protection.inductive-load` |
| pinout mismatch for polarity-sensitive parts | partially implemented | `electrical.pinout-mismatch` |
| short / rail conflict / low-impedance trace | already implemented | `netlist.power-topology`, `netlist.power-short.trace` |
| I2C pullup / impedance / voltage | already implemented | `bus.i2c-pullup`, `bus.i2c-impedance-voltage` |

What is still missing is the maker-specific deepening:

- negative-rail polarity checks
- LM317 / LM337 divider math and downstream overvoltage check
- audio input coupling / zobel / minimum-gain checks
- explicit MOSFET gate resistor audit
- resistor wattage derating warnings

## Recommended Priority

This is the order that gives the best payoff with the least engine churn.

1. **Dual-power polarity check**
2. **MOSFET gate resistor check**
3. **LM317 / LM337 adjustable regulator audit**
4. **Resistor wattage derating**
5. **Audio amp stability checks**

Reason:

- 1 and 2 reuse today’s netlist model almost directly
- 3 needs one small graph helper, but the math is straightforward
- 4 depends on current estimation and should piggyback on existing power work
- 5 is the most semantic and heuristic-heavy, so it should come after the net math is firmer

## Rule Map

### 1. Dual Power Polarity Check

**Goal**

Catch reversed polarized capacitors and dangerous diode orientation on negative rails such as `-12V`, `-15V`, `-VEE`, `-VS`.

**New rule IDs**

- `power.dual-rail-polarity.capacitor`
- `power.dual-rail-polarity.diode`

**Where it should live**

- issue generation in [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts)
- surfaced through [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts)

**Data already available**

- `CircuitNet.knownVoltage`
- `CircuitNet.solvedVoltage`
- `CircuitCapacitorElement`
- `CircuitDiodeElement`

**Needed helper**

- `isNegativePowerNet(net)`:
  - true if solved/known voltage `< 0`
  - or net label contains `-V`, `-VEE`, `-VS`, `-12V`, `-15V`

**Capacitor rule**

For polarized capacitors on a negative rail:

- `plus` pin must point toward `GND` or the higher potential side
- `minus` pin must point toward the negative rail

**Implementation note**

Current capacitor extraction is pairwise only. If polarity is not already preserved in `CircuitCapacitorElement`, we need to extend the capacitor model with explicit `netPlus` / `netMinus`.

That means this rule depends on one prerequisite:

- extend capacitor extraction to preserve polarity, not just `netA/netB`

### 2. MOSFET Gate Resistor Check

**Goal**

Catch direct MCU-to-gate wiring with no damping resistor in the usual `10Ω ~ 220Ω` range.

**New rule ID**

- `signal.mosfet-gate-series-resistor`

**Where it should live**

- [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts)

**Data already available**

- MOSFET role inference already exists in the pinout mismatch logic
- resistors are extracted
- net membership graph exists

**Detection outline**

1. find MOSFET-like component
2. locate its gate pin net
3. inspect whether a resistor sits between:
   - board GPIO / driver output net
   - MOSFET gate net
4. if not, emit warning
5. if yes but outside `10Ω ~ 220Ω`, emit weaker warning

**Needed helper**

- find “one-hop series resistor” between two nets
- infer “driver source” as either:
  - board signal pin
  - driver IC output pin

### 3. Adjustable Regulator Audit

**Goal**

Detect dangerous LM317 / LM337 divider choices before they overdrive downstream logic.

**New rule ID**

- `power.adjustable-regulator-divider`

**Where it should live**

- [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts)
- with graph helpers in [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts)

**Detection outline**

1. identify regulator by template/name/value:
   - `LM317`, `LM337`, `LT1085`, etc.
2. map `OUT`, `ADJ`, `GND`
3. find:
   - `R1`: `OUT <-> ADJ`
   - `R2`: `ADJ <-> GND`
4. compute:

   `Vout = 1.25 * (1 + R2 / R1) + (50uA * R2)`

5. compare expected output to downstream device max-safe voltage

**Needed helper**

- resistor search by adjacent nets
- downstream consumer scan from regulator output net
- max-safe voltage from board pin + template voltage compatibility

### 4. Audio Amp Stability Checks

**Goal**

Catch the classic self-inflicted audio mistakes:

- no input DC-block cap
- no zobel network
- gain set below stable minimum

**New rule IDs**

- `audio.input-dc-block-missing`
- `audio.output-zobel-missing`
- `audio.minimum-gain-unstable`

**Where it should live**

- [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts)

**This is the most heuristic-heavy area**

It requires semantic identification of:

- “audio input connector”
- “power amplifier input”
- “speaker/output terminal”
- feedback pair `Rf/Ri`

This should be built only after the regulator and MOSFET rules are stable.

### 5. LDO + Resistor Derating

**Goal**

Turn “it technically works” into “it will not cook itself.”

**New rule IDs**

- `power.regulator-derating`
- `power.resistor-wattage`

**Current state**

- regulator thermal is already present
- power rail budget is already present

**What remains**

- expose wattage-based resistor warnings explicitly
- unify thermal and derating wording in the same report section

**Implementation note**

Resistor power depends on either:

- solved voltage drop across resistor, or
- known current estimate from surrounding path

The first pass can use solved voltages where available.

## Proposed File-Level Work

### A. Expand circuit passive models

**File**

- [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts)

**Changes**

- extend capacitor extraction to preserve polarity
- add helpers:
  - `isNegativePowerNet`
  - `findSeriesResistorBetweenNets`
  - `findResistorBetweenRoles`
  - `findRegulatorDivider`

### B. Extend DRC rule catalog carefully

**File**

- [`/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts)

**Add only when implemented**

- `power.dual-rail-polarity.capacitor`
- `power.dual-rail-polarity.diode`
- `signal.mosfet-gate-series-resistor`
- `power.adjustable-regulator-divider`
- `audio.input-dc-block-missing`
- `audio.output-zobel-missing`
- `audio.minimum-gain-unstable`
- `power.resistor-wattage`

Important:

do **not** advertise a rule in `CORE_DRC_RULES` before it really emits issues.

### C. Tests

**Files**

- [`/Users/gimdong-il/Desktop/프로그램/modumake/tests/circuit-netlist.test.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/tests/circuit-netlist.test.ts)
- [`/Users/gimdong-il/Desktop/프로그램/modumake/tests/drc-engine.test.ts`](/Users/gimdong-il/Desktop/프로그램/modumake/tests/drc-engine.test.ts)

**New fixture families**

1. negative rail polarized capacitor reversed
2. negative rail diode reversed
3. MOSFET gate direct-drive with no resistor
4. MOSFET gate with valid `100Ω` resistor
5. LM317 valid divider
6. LM317 dangerous divider overvolting a `3.3V` consumer
7. audio amp with missing input cap
8. audio amp with missing zobel
9. resistor dissipating over `0.25W`

## Suggested Delivery Sequence

### Phase A

- capacitor polarity-aware extraction
- dual-power polarity rule
- MOSFET gate resistor rule

### Phase B

- adjustable regulator divider rule
- resistor wattage rule

### Phase C

- audio amp heuristics
- panel UX wording polish

## What This Does Not Replace

This maker-focused linter does **not** replace:

- the imported KiCad visual-fidelity cleanup
- the unknown-part pin classifier
- the pinout visual matcher
- the AI repair / ghost-fix flow

Those stay as parallel tracks.

## Practical Priority Right Now

If we want the highest value per unit time, the next engineering order should be:

1. finish the remaining KiCad text/primitive visual cleanup
2. add `power.dual-rail-polarity.*`
3. add `signal.mosfet-gate-series-resistor`
4. add `power.adjustable-regulator-divider`
5. add `power.resistor-wattage`
6. save audio-specific rules for the next pass

That gives us visible review trust first, then the most dangerous maker electrical mistakes second.
