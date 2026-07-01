# Public KiCad Beta Audit - 2026-07-01

## 목적

공개 GitHub KiCad 프로젝트 30개를 임시로 내려받아 ModuMake 제한 베타 전에 import/render/PCB DRC 흐름을 확인했다.
원본 KiCad 파일은 `downloads/public-kicad-beta-audit/` 아래 ignored 경로에만 두었고, 저장소에는 커밋하지 않는다.

## 샘플 구성

- 공개 GitHub 저장소: 30개
- schematic: 15개
- PCB: 15개
- 샘플 manifest: `tmp/public-kicad-beta-audit/public-kicad-beta-audit-30-manifest.json`
- 렌더 캡처: `tmp/public-kicad-beta-audit/render-audit-30-production/`
- DRC 비교 결과: `tmp/public-kicad-beta-audit/pcb-drc-comparison-15-v2.json`
- 요약 JSON: `tmp/public-kicad-beta-audit/summary.json`

## 검증 결과

| 항목 | 결과 |
| --- | ---: |
| 브라우저 import/render | 30 / 30 통과 |
| schematic render | 15 / 15 통과 |
| PCB render | 15 / 15 통과 |
| 공식 KiCad DRC | 15 / 15 완료 |
| 공식 KiCad DRC raw issues | 3,868 |
| ModuMake PCB pre-check issues | 575 |
| KiCad CLI | /Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli 10.0.3 |

## 중요한 발견

1. 공개 샘플 30개에서는 실제 파일 업로드, 렌더링, DOM 접근성 기본 지표가 모두 통과했다.
2. PCB 공식 DRC는 샘플 15개에서 모두 완료됐고, raw issue 수가 11개부터 664개까지 크게 흔들렸다.
3. ModuMake pre-check는 같은 PCB에서 총 575개로, 공식 DRC raw issue 3,868개보다 훨씬 적다. 제품 방향은 “공식 DRC 대체”가 아니라 “공식 DRC와 보조 검토를 이해 가능하게 묶기”가 맞다.
4. 큰 schematic은 열리지만 기본 fit 배율이 27-54% 수준이라 글자를 읽기 어렵다. 큰 회로용 읽기 보기 개선은 여전히 필요하다.
5. PCB 화면은 렌더링은 정상이나, 레이어 버튼/검토 패널/토스트가 동시에 떠서 중앙 보드 영역이 좁아진다.
6. dev server로 30개 파일을 연속 audit할 때 메모리 부족으로 서버가 죽었다. 긴 회귀 테스트는 production build, Docker, 또는 서버 재시작 단위로 돌려야 한다.

## 교체한 부적합 샘플

- `sethhillbrand/kicad_templates`의 AISLER 템플릿 PCB: 실제 보드가 아니라 그래픽 수가 1개뿐이라 corpus 후보에서 제외.
- `yaqwsx/KiKit`의 `docs/resources/conn.kicad_pcb`: KiCad CLI에서 보드 로드 실패. 같은 repo의 assembly project PCB로 교체.

## PCB DRC 상위 샘플

| 샘플 | 저장소 | ModuMake pre-check | 공식 KiCad DRC |
| --- | --- | ---: | ---: |
| `public-pcb-ethersweep-406` | [Neumi/ethersweep](https://github.com/Neumi/ethersweep/blob/master/electronic_design/development/ethersweep406/ethersweep.kicad_pcb) | 64 | 664 |
| `public-pcb-color-scheme-help` | [pointhi/kicad-color-schemes](https://github.com/pointhi/kicad-color-schemes/blob/master/_help/kit-dev-coldfire-xilinx_5213/kit-dev-coldfire-xilinx_5213.kicad_pcb) | 30 | 614 |
| `public-pcb-chocofi` | [pashutk/chocofi](https://github.com/pashutk/chocofi/blob/main/pcb/chocofi.kicad_pcb) | 60 | 512 |
| `public-pcb-temper` | [raeedcho/temper](https://github.com/raeedcho/temper/blob/main/pcb/temper.kicad_pcb) | 49 | 458 |
| `public-pcb-elelab-bus100` | [Chrismettal/EleLab_v2](https://github.com/Chrismettal/EleLab_v2/blob/master/PCB_CAD/EleLab_v2_Bus100/EleLab_v2_Bus100.kicad_pcb) | 70 | 405 |

## Corpus 후보 분류

| 분류 | 개수 | 의미 |
| --- | ---: | --- |
| good-corpus-candidate | 8 | MIT / Apache-2.0 / CC0. 라이선스 문구 포함 전제로 가장 쓰기 좋음 |
| hardware-license-review | 4 | CERN-OHL 계열. 하드웨어 라이선스 고지 방식 확인 필요 |
| license-review-required | 9 | GPL / CC-BY 계열. repo 포함 전 법적/고지 검토 필요 |
| local-test-only | 9 | GitHub API 기준 license 없음. 로컬 임시 테스트 전용 |

## 샘플별 결과

| ID | Type | Source | License | Render | Official DRC | ModuMake pre-check | Corpus use |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| `public-sch-splitflap-sensor` | schematic | [scottbez1/splitflap](https://github.com/scottbez1/splitflap/blob/master/electronics/sensor_smd/sensor_smd.kicad_sch) | NOASSERTION | ok |  |  | local regression only |
| `public-sch-kicad-cm5` | schematic | [KiCad/kicad-source-mirror](https://github.com/KiCad/kicad-source-mirror/blob/master/demos/cm5_minima/CM5.kicad_sch) | GPL-3.0 | ok |  |  | metadata/local only until review |
| `public-sch-stack-chan-pantilt` | schematic | [stack-chan/stack-chan](https://github.com/stack-chan/stack-chan/blob/develop/schematics/m5-pantilt/m5-pantilt.kicad_sch) | Apache-2.0 | ok |  |  | candidate |
| `public-sch-skidl-esp32s3` | schematic | [devbisme/skidl](https://github.com/devbisme/skidl/blob/master/tests/examples/netlist_to_skidl/kicad_project/esp32s3mini1.kicad_sch) | MIT | ok |  |  | candidate |
| `public-sch-bitaxe-ultra` | schematic | [skot/bitaxe](https://github.com/skot/bitaxe/blob/master/bitaxeUltra.kicad_sch) | CERN-OHL-S-2.0 | ok |  |  | candidate after license notice |
| `public-sch-spirit-usbc` | schematic | [SPIRIT-org/SPIRIT](https://github.com/SPIRIT-org/SPIRIT/blob/main/EDA-kicad/USB-C.kicad_sch) | NOASSERTION | ok |  |  | local regression only |
| `public-sch-kicanvas-analogins` | schematic | [theacodes/kicanvas](https://github.com/theacodes/kicanvas/blob/main/debug/examples/analogins.kicad_sch) | NOASSERTION | ok |  |  | local regression only |
| `public-sch-tzarc-ghoul` | schematic | [tzarc/keyboards](https://github.com/tzarc/keyboards/blob/main/Ghoul/v1.0/ghoul.kicad_sch) | CERN-OHL-S-2.0 | ok |  |  | candidate after license notice |
| `public-sch-piantor-left` | schematic | [beekeeb/piantor](https://github.com/beekeeb/piantor/blob/main/pcb/left/keyboard_pcb.kicad_sch) | GPL-3.0 | ok |  |  | metadata/local only until review |
| `public-sch-megadesk` | schematic | [gcormier/megadesk](https://github.com/gcormier/megadesk/blob/master/pcb/megadesk.kicad_sch) | GPL-3.0 | ok |  |  | metadata/local only until review |
| `public-sch-upsy-desky` | schematic | [tjhorner/upsy-desky](https://github.com/tjhorner/upsy-desky/blob/master/pcb/upsy-desky.kicad_sch) | NOASSERTION | ok |  |  | local regression only |
| `public-sch-haxo` | schematic | [cardonabits/haxo-hw](https://github.com/cardonabits/haxo-hw/blob/main/haxophone001.kicad_sch) | NOASSERTION | ok |  |  | local regression only |
| `public-sch-ottercast-main` | schematic | [Ottercast/OtterCastAudioV2](https://github.com/Ottercast/OtterCastAudioV2/blob/main/OtterCastAudioV2.kicad_sch) | MIT | ok |  |  | candidate |
| `public-sch-easyduino-uno` | schematic | [Hanqaqa/Easyduino](https://github.com/Hanqaqa/Easyduino/blob/master/Atmega328p Arduino Uno/Easyduino_Atmega.kicad_sch) | CERN-OHL-P-2.0 | ok |  |  | candidate after license notice |
| `public-sch-urchin-main` | schematic | [duckyb/urchin](https://github.com/duckyb/urchin/blob/main/main.kicad_sch) | MIT | ok |  |  | candidate |
| `public-pcb-kikit-assembly` | pcb | [yaqwsx/KiKit](https://github.com/yaqwsx/KiKit/blob/master/test/resources/assembly_project_1_KiCAD6/assembly_project_1_KiCAD6.kicad_pcb) | MIT | ok | 11 | 3 | candidate |
| `public-pcb-freerouting-tutorial` | pcb | [freerouting/freerouting](https://github.com/freerouting/freerouting/blob/master/examples/tutorial_board/tutorial_board.kicad_pcb) | GPL-3.0 | ok | 201 | 8 | metadata/local only until review |
| `public-pcb-pcbdraw-arduino` | pcb | [yaqwsx/PcbDraw](https://github.com/yaqwsx/PcbDraw/blob/master/examples/resources/ArduinoLearningKitStarter.kicad_pcb) | MIT | ok | 322 | 55 | candidate |
| `public-pcb-chocofi` | pcb | [pashutk/chocofi](https://github.com/pashutk/chocofi/blob/main/pcb/chocofi.kicad_pcb) | NOASSERTION | ok | 512 | 60 | local regression only |
| `public-pcb-haswitchplate` | pcb | [aderusha/HASwitchPlate](https://github.com/aderusha/HASwitchPlate/blob/master/PCB/HASwitchPlate.kicad_pcb) | MIT | ok | 64 | 50 | candidate |
| `public-pcb-nand-programmer-tsop48` | pcb | [bbogush/nand_programmer](https://github.com/bbogush/nand_programmer/blob/master/kicad/adapter_tsop48/adapter_tsop48.kicad_pcb) | GPL-3.0 | ok | 97 | 21 | metadata/local only until review |
| `public-pcb-kiswitch-demo` | pcb | [kiswitch/kiswitch](https://github.com/kiswitch/kiswitch/blob/main/demo/demo.kicad_pcb) | NOASSERTION | ok | 19 | 16 | local regression only |
| `public-pcb-color-scheme-help` | pcb | [pointhi/kicad-color-schemes](https://github.com/pointhi/kicad-color-schemes/blob/master/_help/kit-dev-coldfire-xilinx_5213/kit-dev-coldfire-xilinx_5213.kicad_pcb) | CC0-1.0 | ok | 614 | 30 | candidate |
| `public-pcb-espressif-help-button` | pcb | [pcbreflux/espressif](https://github.com/pcbreflux/espressif/blob/master/esp32/kicad/ESP32-HELP-Button/Ref1 201701/ESP32-HELP-Button-18650.kicad_pcb) | GPL-3.0 | ok | 198 | 49 | metadata/local only until review |
| `public-pcb-kcores-csps-atx` | pcb | [KCORES/KCORES-CSPS-to-ATX-Converter](https://github.com/KCORES/KCORES-CSPS-to-ATX-Converter/blob/main/Electrical/KCORES CSPS to ATX Converter/KCORES CSPS to ATX Converter.kicad_pcb) | NOASSERTION | ok | 84 | 39 | local regression only |
| `public-pcb-ethersweep-406` | pcb | [Neumi/ethersweep](https://github.com/Neumi/ethersweep/blob/master/electronic_design/development/ethersweep406/ethersweep.kicad_pcb) | NOASSERTION | ok | 664 | 64 | local regression only |
| `public-pcb-elelab-bus100` | pcb | [Chrismettal/EleLab_v2](https://github.com/Chrismettal/EleLab_v2/blob/master/PCB_CAD/EleLab_v2_Bus100/EleLab_v2_Bus100.kicad_pcb) | GPL-3.0 | ok | 405 | 70 | metadata/local only until review |
| `public-pcb-kbplacer-demo` | pcb | [adamws/kicad-kbplacer](https://github.com/adamws/kicad-kbplacer/blob/master/demo/demo.kicad_pcb) | GPL-3.0 | ok | 111 | 15 | metadata/local only until review |
| `public-pcb-temper` | pcb | [raeedcho/temper](https://github.com/raeedcho/temper/blob/main/pcb/temper.kicad_pcb) | CERN-OHL-P-2.0 | ok | 458 | 49 | candidate after license notice |
| `public-pcb-gb-bench` | pcb | [Gekkio/gb-hardware](https://github.com/Gekkio/gb-hardware/blob/main/GB-BENCH-G1/GB-BENCH-G1.kicad_pcb) | CC-BY-4.0 | ok | 108 | 46 | metadata/local only until review |

## 베타 전 조치

- 제한 베타용 public sample baseline은 이 30개를 임시 기준선으로 쓸 수 있다.
- repo에 원본 파일을 넣을 샘플은 MIT/Apache/CC0부터 시작한다.
- no-license 샘플은 로컬 반복 테스트에만 사용한다.
- 큰 schematic 읽기 보기, PCB 레이어 버튼 overflow, import 성공 toast 위치는 UX backlog로 남긴다.
- 긴 브라우저 audit는 dev server가 아니라 production/Docker 기반으로 돌린다.
