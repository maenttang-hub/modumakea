# Clean KiCad Golden Corpus v1

Generated from `tmp/clean-kicad-render-report-diff-full-pass3.jsonl`.

Purpose: manually classify the remaining non-fatal parser/render/report findings before changing behavior again.

Labels:

- `true-bug`: ModuMake parsing/render/report behavior is wrong.
- `source-as-authored`: ModuMake is preserving the source schematic, even if the schematic is visually odd.
- `conservative-warning`: The engine is warning because source data is incomplete or ambiguous.
- `mapping-improvement`: The parser worked, but component/template/part mapping should improve.

| ID | Bucket | Auto Label | Human Label | Count | File | Review Question |
| --- | --- | --- | --- | ---: | --- | --- |
| text-placement-01-19ce5fdf93610e6b-bretbouchard-kicad-agent-arduino-mega | text-placement | source-as-authored | pending | 258 | `19ce5fdf93610e6b_bretbouchard_kicad-agent_Arduino_Mega.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-02-fee1d255a97df42a-kicad-kicad-source-mirror-dcdc | text-placement | source-as-authored | pending | 172 | `fee1d255a97df42a_KiCad_kicad-source-mirror_dcdc.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-03-309f447586550989-kicad-kicad-source-mirror-usb-hub | text-placement | source-as-authored | pending | 102 | `309f447586550989_KiCad_kicad-source-mirror_usb_hub.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-04-b615997cd5c536cf-connorlirette-kicad-controller-pcb-io | text-placement | source-as-authored | pending | 80 | `b615997cd5c536cf_connorlirette_KiCad-Controller-PCB_io.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-05-60d94bc61e32de2c-kicad-kicad-source-mirror-usb-debug-pd | text-placement | source-as-authored | pending | 74 | `60d94bc61e32de2c_KiCad_kicad-source-mirror_usb_debug_pd.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-06-ec1d2900a3b68ae9-maxlab-io-tokay-lite-pcb-ai-camera-rev2 | text-placement | source-as-authored | pending | 73 | `ec1d2900a3b68ae9_maxlab-io_tokay-lite-pcb_ai-camera-rev2.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-07-ffc93857b96128de-maxlab-io-tokay-lite-pcb-ai-camera-rev3 | text-placement | source-as-authored | pending | 73 | `ffc93857b96128de_maxlab-io_tokay-lite-pcb_ai-camera-rev3.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-08-b12bc985b3034cab-maxlab-io-tokay-lite-pcb-ai-camera-rev3-2 | text-placement | source-as-authored | pending | 73 | `b12bc985b3034cab_maxlab-io_tokay-lite-pcb_ai-camera-rev3.2.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-09-d3c45a13eb770504-maxlab-io-tokay-lite-pcb-ai-camera-rev3-1 | text-placement | source-as-authored | pending | 73 | `d3c45a13eb770504_maxlab-io_tokay-lite-pcb_ai-camera-rev3.1.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-10-56ab100b1132c96b-maxlab-io-tokay-lite-pcb-ai-camera | text-placement | source-as-authored | pending | 71 | `56ab100b1132c96b_maxlab-io_tokay-lite-pcb_ai-camera.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-11-3df968fe0dc30407-kicad-kicad-source-mirror-som-io2 | text-placement | source-as-authored | pending | 69 | `3df968fe0dc30407_KiCad_kicad-source-mirror_som_io2.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-12-adbc3997093bc617-kicad-kicad-source-mirror-som-power | text-placement | source-as-authored | pending | 64 | `adbc3997093bc617_KiCad_kicad-source-mirror_som_power.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-13-940cb06421de5eae-kicad-kicad-source-mirror-usb | text-placement | source-as-authored | pending | 63 | `940cb06421de5eae_KiCad_kicad-source-mirror_USB.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-14-88c30801ce6ca909-kicad-kicad-source-mirror-csi | text-placement | source-as-authored | pending | 56 | `88c30801ce6ca909_KiCad_kicad-source-mirror_csi.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| text-placement-15-dedbbbe2842256c3-kicad-kicad-source-mirror-usb-dp | text-placement | source-as-authored | pending | 52 | `dedbbbe2842256c3_KiCad_kicad-source-mirror_usb_dp.kicad_sch` | 원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가? |
| power-label-anchor-01-ca9921245d677df7-cwsimmons-ibm-3174-schematics-66x2491 | power-label-anchor | conservative-warning | pending | 183 | `ca9921245d677df7_cwsimmons_IBM_3174_schematics_66X2491.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| power-label-anchor-02-50c3ec8cd445f505-darpan1012-16-channel-manual-variable-power-supply-circ | power-label-anchor | conservative-warning | pending | 16 | `50c3ec8cd445f505_Darpan1012_16-channel-manual-variable-power-supply-circuit_power_source_16_ch_manual_ver_4.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| power-label-anchor-03-d054d19942e5f215-cwsimmons-ibm-3174-schematics-66x2450 | power-label-anchor | conservative-warning | pending | 10 | `d054d19942e5f215_cwsimmons_IBM_3174_schematics_66X2450.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| power-label-anchor-04-44fe205eb2edec3d-sid93-urine-dipstick-analyzer-cad-urine-dipstick-analyz | power-label-anchor | conservative-warning | pending | 10 | `44fe205eb2edec3d_Sid93_urine-dipstick-analyzer-cad_urine_dipstick_analyzer.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| power-label-anchor-05-3d2a9d40d319f46e-cwsimmons-ibm-3174-schematics-66x2555 | power-label-anchor | conservative-warning | pending | 8 | `3d2a9d40d319f46e_cwsimmons_IBM_3174_schematics_66X2555.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| power-label-anchor-06-b5eaa77928c00981-81823650800wzy-sketch-pcb-designer-desktop-controller | power-label-anchor | conservative-warning | pending | 5 | `b5eaa77928c00981_81823650800wzy-sketch_pcb-designer_desktop-controller.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| power-label-anchor-07-d28f490622856553-shawez17-chandra-chandu | power-label-anchor | conservative-warning | pending | 4 | `d28f490622856553_Shawez17_Chandra_chandu.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| power-label-anchor-08-e3f9bc4d7bc5418c-t-dsp-t-dsp-mic-array-module-t-dsp-mic-array-module | power-label-anchor | conservative-warning | pending | 3 | `e3f9bc4d7bc5418c_t-dsp_t-dsp_mic_array_module_t-dsp_mic_array_module.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| power-label-anchor-09-79be3cd94135b8df-branc-00-zmk-config-main-board | power-label-anchor | conservative-warning | pending | 2 | `79be3cd94135b8df_branc-00_zmk-config_main_board.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| power-label-anchor-10-28b50caf400fea1f-shawez17-chandra-sunny | power-label-anchor | conservative-warning | pending | 2 | `28b50caf400fea1f_Shawez17_Chandra_sunny.kicad_sch` | VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가? |
| passive-value-01-aa14b24ee1d79428-lucask07-covg-clamp-bath-clamp-top | passive-value | conservative-warning | pending | 48 | `aa14b24ee1d79428_lucask07_covg_clamp_bath_clamp_top.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| passive-value-02-d60cb365e5039162-shazebengg-projects-ostron-electronics | passive-value | conservative-warning | pending | 44 | `d60cb365e5039162_ShazebEngg_projects_Ostron Electronics.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| passive-value-03-7a0bd0fa4be4c97e-crimier-mykicad-keyboard-whiz | passive-value | conservative-warning | pending | 43 | `7a0bd0fa4be4c97e_CRImier_MyKiCad_keyboard_whiz.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| passive-value-04-f9495f74c3058dd3-eded2314-kicad-designs-stm32-altimeter-r2 | passive-value | conservative-warning | pending | 34 | `f9495f74c3058dd3_EDED2314_kicad-designs_STM32_Altimeter_R2.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| passive-value-05-db20d0d4032509f3-microfarad-de-kicad-water-alarm | passive-value | conservative-warning | pending | 27 | `db20d0d4032509f3_microfarad-de_kicad_water-alarm.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| passive-value-06-e67a1fb86dbd9d15-seantedesco-kicad-projects-usb-rf | passive-value | conservative-warning | pending | 27 | `e67a1fb86dbd9d15_SeanTedesco_kicad_projects_usb-rf.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| passive-value-07-5992135b6d06aaec-north-x-kicad-projects-booster | passive-value | conservative-warning | pending | 25 | `5992135b6d06aaec_north-x_kicad-projects_booster.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| passive-value-08-61c1e426b34995f3-freerouting-freerouting-motorizedopener | passive-value | conservative-warning | pending | 22 | `61c1e426b34995f3_freerouting_freerouting_motorizedopener.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| passive-value-09-82d9a9d6e8c72d73-rebeccapaz-kicad-schematics-adafruit-096-ssd1306 | passive-value | conservative-warning | pending | 19 | `82d9a9d6e8c72d73_rebeccapaz_kicad-schematics_adafruit-096-ssd1306.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| passive-value-10-6bcb1968cd42f394-crimier-mykicad-mpcie-breakout | passive-value | conservative-warning | pending | 18 | `6bcb1968cd42f394_CRImier_MyKiCad_mpcie_breakout.kicad_sch` | R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가? |
| low-confidence-mapping-01-0e85ac1d16e5ec63-feastorg-protokit-project-board-grid-smt | low-confidence-mapping | mapping-improvement | pending | 1 | `0e85ac1d16e5ec63_feastorg_protokit_project-board-grid-smt.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| low-confidence-mapping-02-031bd5931cb89db2-phodina-openwrt-one-05-mt7976c-dbdc | low-confidence-mapping | mapping-improvement | pending | 1 | `031bd5931cb89db2_phodina_openwrt-one_05_MT7976C_DBDC.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| low-confidence-mapping-03-d8c76357f65b547b-deltecent-kicad-mits-88-2sio | low-confidence-mapping | mapping-improvement | pending | 1 | `d8c76357f65b547b_deltecent_KiCad_MITS 88-2SIO.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| low-confidence-mapping-04-e963ff83d1e6acee-bwack-c64c-250469-kicad-replica-c64-250469-kicad | low-confidence-mapping | mapping-improvement | pending | 1 | `e963ff83d1e6acee_bwack_C64C-250469-KiCAD-Replica_C64-250469-KiCad.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| low-confidence-mapping-05-38802dde61646d1f-phodina-openwrt-one-03-mt7981-pcie-usb-gphy | low-confidence-mapping | mapping-improvement | pending | 1 | `38802dde61646d1f_phodina_openwrt-one_03_MT7981_PCIe_USB_GPHY.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| low-confidence-mapping-06-e7cc807e5bc48ef7-yodor-kicad-power-ctrl | low-confidence-mapping | mapping-improvement | pending | 1 | `e7cc807e5bc48ef7_yodor_kicad_power_ctrl.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| low-confidence-mapping-07-dc6716fbf8702ed6-phodina-openwrt-one-04-power-external-usb | low-confidence-mapping | mapping-improvement | pending | 1 | `dc6716fbf8702ed6_phodina_openwrt-one_04_Power_External_USB.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| low-confidence-mapping-08-232f8236bc89eed2-kicad-kicad-source-mirror-tinytapeout-demo | low-confidence-mapping | mapping-improvement | pending | 1 | `232f8236bc89eed2_KiCad_kicad-source-mirror_tinytapeout-demo.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| low-confidence-mapping-09-39fff1d46d5bfbcc-phodina-openwrt-one-07-m2-keym-mikrobus-eeprom-rtc | low-confidence-mapping | mapping-improvement | pending | 1 | `39fff1d46d5bfbcc_phodina_openwrt-one_07_M2_KEYM_mikroBUS_EEPROM_RTC.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| low-confidence-mapping-10-0a754113af3293e3-420-enghighneering-projects-kicad-110-000-s1a-phasor-pc | low-confidence-mapping | mapping-improvement | pending | 1 | `0a754113af3293e3_420-enghighneering_projects-kicad_#110-000-S1A - Phasor PCB.kicad_sch` | 대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가? |
| report-count-divergence-01-23d796fa7c1fe190-shazebengg-projects-uno-th-rev3e | report-count-divergence | true-bug | pending | 1 | `23d796fa7c1fe190_ShazebEngg_projects_UNO-TH_Rev3e.kicad_sch` | legacy importer, integrated report, lightweight parser 중 어느 쪽 component counting 기준이 틀렸는가? |
| report-count-divergence-02-8f9dc90f0443b0cb-jotego-jtcores-registers | report-count-divergence | true-bug | pending | 1 | `8f9dc90f0443b0cb_jotego_jtcores_registers.kicad_sch` | legacy importer, integrated report, lightweight parser 중 어느 쪽 component counting 기준이 틀렸는가? |
| report-count-divergence-03-7f0e21d9f2051c88-jotego-jtcores-counters | report-count-divergence | true-bug | pending | 1 | `7f0e21d9f2051c88_jotego_jtcores_counters.kicad_sch` | legacy importer, integrated report, lightweight parser 중 어느 쪽 component counting 기준이 틀렸는가? |
| report-count-divergence-04-0404877533f82723-f1ac0-breakout-and-simple-connector-boards-minipill-215 | report-count-divergence | true-bug | pending | 1 | `0404877533f82723_f1ac0_Breakout-and-simple-connector-boards_Minipill 215.kicad_sch` | legacy importer, integrated report, lightweight parser 중 어느 쪽 component counting 기준이 틀렸는가? |
| report-count-divergence-05-8b51fa7f9386a321-jotego-jtcores-outputs | report-count-divergence | true-bug | pending | 1 | `8b51fa7f9386a321_jotego_jtcores_outputs.kicad_sch` | legacy importer, integrated report, lightweight parser 중 어느 쪽 component counting 기준이 틀렸는가? |

## Next Use

1. Open each source KiCad file and compare it with the ModuMake render/report.
2. Fill `humanLabel` in the JSON manifest.
3. Only change parser/render/report behavior for entries labeled `true-bug`.
4. Use `mapping-improvement` entries for mapper/catalog backlog, not parser rewrites.

## Agent Review

Automatic agent-side review is captured separately:

- `config/golden-corpus/clean-kicad-golden-corpus-v1-agent-review.json`
- `docs/clean-kicad-golden-corpus-agent-review.md`

Important: the agent review does not fill `humanLabel`. It only narrows the next engineering target to `report-count-divergence` and keeps text/power-label placement pending real visual review.
