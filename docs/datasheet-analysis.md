# Datasheet Analysis Notes

This file collects primary-source hardware references for the current board and sensor set
and converts them into implementation rules for ModuMake.

## Goal

Use vendor documentation to drive:

- allowed voltage rails
- recommended interfaces and pins
- warning messages
- auto-routing priorities
- PCB-conversion eligibility

## Boards

### Arduino UNO R3

Primary sources:

- https://docs.arduino.cc/hardware/uno-rev3
- https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf
- https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf

Derived rules:

- Board logic rail is 5 V.
- Public header exposes 14 digital pins and 6 analog inputs.
- Six PWM channels are available.
- A4 is SDA and A5 is SCL on the board-level pinout.
- ATmega328P absolute maximum DC current per I/O pin is 40 mA.
- The tool should treat 40 mA as an absolute maximum, not a recommended design target.
- Pins D0 and D1 are UART and should be low-priority for auto-routing.

Implementation guidance:

- Prefer D2-D13 before D0/D1 for generic digital routing.
- Prefer A4/A5 when an I2C part is detected.
- Add a hard warning when a design implies direct LED drive or other loads near the MCU limit.

### ESP32-WROOM-32

Primary sources:

- https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf
- https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf

Derived rules:

- Operating supply is 3.0 V to 3.6 V.
- Up to 32 GPIOs are available.
- Five strapping GPIOs exist and need extra care during boot.
- Digital interfaces include UART, SPI, I2C, PWM and ADC/DAC functions.

Implementation guidance:

- Treat ESP32 boards as 3.3 V only.
- Avoid assigning boot-strapping pins by default for generic sensors unless explicitly allowed.
- Prefer stable GPIOs that do not affect boot mode for default routing.

### Raspberry Pi 4 Model B

Primary source:

- https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-datasheet.pdf

Derived rules:

- GPIO bank voltage is tied to the on-board 3.3 V rail.
- 28 GPIOs are exposed through the 40-pin header.
- GPIO pins are multiplexed across I2C, UART and SPI functions.
- Output current guidance in the datasheet is much lower than an "Arduino-style" direct load workflow.

Implementation guidance:

- Treat Raspberry Pi GPIO as 3.3 V only.
- Add stronger warnings for direct-drive actuators.
- Prefer external driver recommendations for motors, relays and higher-current loads.

## Sensors and Modules

### DHT11

Primary sources:

- https://www.aosong.com/en/Products/info.aspx?itemid=2257&lcid=139
- https://www.aosong.com/en/DownloadCenter/index.aspx?page=2

Observed official-public data:

- Official product page confirms the part identity.
- Official download center exposes a dedicated single-bus routine for DHT11/DHT12.
- The public English product page does not expose a full electrical spec table.

Derived rules:

- Treat DHT11 as a single-wire digital sensor.
- Do not assume I2C or analog behavior.
- Mark this part as requiring a datasheet follow-up before adding strict timing and pull-up rules.

Implementation guidance:

- Keep DHT11 on digital-capable pins only.
- Add a "single-bus timing-sensitive device" tag in the rule engine.
- Track this part as "partial public spec" rather than "fully modeled".

### AM2302 / DHT22

Primary sources:

- https://www.aosong.com/en/Products/info.aspx?itemid=2294&lcid=139
- https://www.aosong.com/en/DownloadCenter/index.aspx?page=2

Observed official-public data:

- Official product page confirms the AM2302 module identity.
- Official download center exposes AM230X single-bus routines.
- Public page again does not expose the full electrical table.

Derived rules:

- Treat AM2302 as a single-bus digital temperature/humidity sensor.
- Keep it on digital-capable pins only.
- Model as higher precision than DHT11, but still "partial public spec" until the PDF is acquired.

### MQ-2

Primary sources:

- https://www.winsen-sensor.com/product/mq-2.html
- https://www.winsen-sensor.com/d/files/manual/mq-2.pdf

Derived rules:

- Target gases: flammable gas and smoke.
- Detection range: 300 to 10000 ppm for flammable gas.
- Loop voltage: 5.0 V +/- 0.1 V.
- Heater voltage: 5.0 V +/- 0.1 V.
- Heater consumption: <= 950 mW.
- Load resistance is adjustable.
- Preheat time is at least 48 hours.
- Sensor output is analog in the basic circuit.

Implementation guidance:

- Treat MQ-2 as a 5 V device.
- Mark it as "heater-based" and "high warm-up cost".
- Do not present it as an instant-ready classroom sensor.
- Prefer analog-capable pins for primary reading.
- Add warnings for ESP32/Raspberry Pi direct power compatibility.

### MFRC522

Primary source:

- https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf

Derived rules:

- Operating supply is 2.5 V to 3.3 V, with reduced performance below 3 V.
- Host interfaces include SPI, UART and I2C.
- The chip is a 13.56 MHz RFID frontend, not a generic digital module.
- The IC expects a dedicated antenna and supporting RF circuitry in raw-chip form.

Implementation guidance:

- Treat RC522 modules as 3.3 V-only in the app.
- Prefer SPI routing by default.
- Keep SDA label interpretation aligned with module breakout usage, not generic I2C SDA.
- Distinguish "module breakout rules" from "raw IC datasheet rules".

## Coverage Gaps

These current library entries do not yet have a clean, single public primary document pinned:

- HC-SR04 ultrasonic module
- generic PIR module entry
- photoresistor entry
- soil moisture module entry
- generic sound sensor module entry
- button, LED and buzzer breakouts as currently modeled

Why this matters:

- many of these are "family" or clone-heavy modules
- the same product name often maps to different breakout circuits
- module-level pin labels and required support parts vary by vendor

Recommendation:

- Pin supported variants to exact vendor/module SKUs before writing strict routing rules.
- Keep generic entries labeled as "simulation-first" until a vendor document is linked.

## Rule Engine Priorities

The next useful schema fields should be:

- `power.requiredRail`
- `power.allowedRails`
- `power.warmupTimeMs`
- `interfaces.preferred`
- `interfaces.allowed`
- `pins.reserved`
- `pins.preferred`
- `warnings`
- `requiresExternalParts`
- `datasheetStatus`
- `datasheetUrl`

Suggested status values:

- `official-complete`
- `official-partial`
- `generic-module`
- `needs-vendor-pin`

## Immediate Product Decisions

The tool should start enforcing these now:

- UNO routes generic digital parts away from D0/D1 by default.
- ESP32 and Raspberry Pi are 3.3 V-only environments.
- MFRC522 is 3.3 V-only and should prefer SPI.
- MQ-2 should require 5 V and display a warm-up warning.
- DHT11 and AM2302 should be modeled as single-bus digital parts with partial-spec status.
