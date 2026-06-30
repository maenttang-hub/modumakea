# Clean KiCad Dataset Quality Triage

Date: 2026-06-30

This note captures the remaining non-fatal findings after running the parser/render/report diff across `/Users/gimdong-il/Desktop/프로그램/clean_kicad_dataset`.

## Current Baseline

- Files scanned: 6,854
- Import failures: 0
- Integrated report failures: 0
- Lightweight report failures: 0
- Netlist failures: 0
- Error-level anomalies: 0
- Warning/info anomalies in the latest full stable pass: 3,932
- Report-count regression set after the final count-policy fix: 109 files, 0 count-divergence findings
- Targeted transmier source-vs-render fix: VCC/GND labels and C1/C2 property text now preserve KiCad source anchors/orientation.

Generated baseline files:

- `tmp/clean-kicad-render-report-diff-summary-pass5.json`
- `tmp/clean-kicad-render-report-diff-full-pass5.jsonl`
- `tmp/report-count-regression-summary.json`
- `tmp/report-count-regression-results.jsonl`
- `tmp/transmier-diff-summary-final.json`
- `tmp/golden-corpus-diff-final-summary.json`

## Remaining Finding Types

| Reason | Count | Decision |
| --- | ---: | --- |
| `render.property-text-far-from-symbol` | 2,459 | Golden corpus review first. Some are real readability issues, but many are original KiCad property placements. |
| `mapping.low-confidence-heavy` | 661 | Spec/catalog coverage issue, not parser failure. Improve mapping by family/SKU priority. |
| `netlist.passive-value-missing` | 509 | Usually source schematic lacks a usable value or stores it in a non-standard field. Review before parser change. |
| `render.power-label-off-connection` | 295 | Mixed. Some are true anchor/label placement issues; some are old schematics with labels used as annotations. |
| `parser.fragment-input` | 7 | Expected unsupported input: subsheet/fragment files, not engine failures. |
| `report.lightweight-component-count-divergence` | 0 | Resolved by preserving no-pin custom symbols and comparing lightweight counts against the correct non-electrical-excluded bucket. |
| `report.integrated-component-count-divergence` | 0 | Resolved by sharing reportable-component counting semantics across imported/integrated report paths. |

## Golden Corpus Candidates

### Text Placement

Use these to decide whether property text should be preserved exactly or readability-normalized.

- `19ce5fdf93610e6b_bretbouchard_kicad-agent_Arduino_Mega.kicad_sch`
- `fee1d255a97df42a_KiCad_kicad-source-mirror_dcdc.kicad_sch`
- `309f447586550989_KiCad_kicad-source-mirror_usb_hub.kicad_sch`
- `b615997cd5c536cf_connorlirette_KiCad-Controller-PCB_io.kicad_sch`
- `60d94bc61e32de2c_KiCad_kicad-source-mirror_usb_debug_pd.kicad_sch`

Review question:

- Is the text far away in the original KiCad file too?
- If yes, keep as quality info only.
- If no, fix symbol property transform/anchor handling.

### Power Label Anchors

Use these to separate real detached labels from annotation-like legacy labels.

- `ca9921245d677df7_cwsimmons_IBM_3174_schematics_66X2491.kicad_sch`
- `50c3ec8cd445f505_Darpan1012_16-channel-manual-variable-power-supply-circuit_power_source_16_ch_manual_ver_4.kicad_sch`
- `44fe205eb2edec3d_Sid93_urine-dipstick-analyzer-cad_urine_dipstick_analyzer.kicad_sch`
- `d054d19942e5f215_cwsimmons_IBM_3174_schematics_66X2450.kicad_sch`
- `3d2a9d40d319f46e_cwsimmons_IBM_3174_schematics_66X2555.kicad_sch`

Review question:

- Is the label intended as a real electrical net label?
- If yes, fix label anchor/geometry parsing.
- If no, down-rank as annotation-quality info.

### Passive Value Missing

Use these to inspect whether values are absent, hidden, or stored in alternate KiCad fields.

- `aa14b24ee1d79428_lucask07_covg_clamp_bath_clamp_top.kicad_sch`
- `d60cb365e5039162_ShazebEngg_projects_Ostron Electronics.kicad_sch`
- `7a0bd0fa4be4c97e_CRImier_MyKiCad_keyboard_whiz.kicad_sch`
- `f9495f74c3058dd3_EDED2314_kicad-designs_STM32_Altimeter_R2.kicad_sch`
- `db20d0d4032509f3_microfarad-de_kicad_water-alarm.kicad_sch`

Review question:

- Is the value actually missing from the source?
- If yes, keep fallback warning.
- If no, add parser support for the alternate field/property.

### Low Confidence Mapping

Use these to improve symbol family mapping without touching electrical rules.

- `031bd5931cb89db2_phodina_openwrt-one_05_MT7976C_DBDC.kicad_sch`
- `0110ee91bd8eb39b_nickradfc_kicad-demo-projects_bus_pci.kicad_sch`
- `00ca64778e3c8403_hbuurmei_TRACBOT21-KiCad_Adafruit PCA9685 rev C.kicad_sch`
- `02d269ca1f09207c_orb1tngu-web_Schwarzemann_FPGA-GPU_bus_interface.kicad_sch`
- `02ab5f88ae7f2b86_wavenumber-eng_kicad_monkey_top_level.kicad_sch`

Review question:

- Is this mostly connector/legacy/custom library content?
- If yes, add family-level mapper rules, not part-master exact records.
- If it is a common IC/module, add catalog/template mapping.

## Recommended Next Step

Use the existing 50-file human-review-ready golden corpus to continue visual-quality triage:

- 15 text-placement files
- 10 power-label files
- 10 passive-value files
- 10 low-confidence mapping files
- 5 historical report count divergence files, now retained as regression examples rather than active bug candidates

Generated corpus files:

- `config/golden-corpus/clean-kicad-golden-corpus-v1.json`
- `docs/clean-kicad-golden-corpus-v1.md`
- `config/golden-corpus/clean-kicad-golden-corpus-v1-agent-review.json`
- `docs/clean-kicad-golden-corpus-agent-review.md`

Only after that should parser/rendering behavior change again. This keeps the next iteration grounded in real visual correctness instead of reducing numbers blindly.

Agent review result:

- `passive-value` is currently source-data-missing, not a parser bug, based on sampled source S-expressions.
- `low-confidence-mapping` is mapper/catalog backlog, not parser failure.
- `report-count-divergence` has been fixed in code and should stay as regression coverage.
- `text-placement` and `power-label-anchor` still require source-vs-render visual review before broad behavior changes. The confirmed transmier case was fixed by preserving KiCad-native power-label anchors and passive property text orientation instead of applying readability re-anchoring.

Latest targeted rerun:

- `transmier`: 1 file, 0 anomalies, 0 import/report/netlist failures.
- Golden corpus v1: 50 files, 0 failures, 0 error-level anomalies.
- Golden corpus remaining warnings/info: `render.property-text-far-from-symbol` 1,362, `render.power-label-off-connection` 243, `netlist.passive-value-missing` 307, `mapping.low-confidence-heavy` 16.
