# Validation Next Execution Plan

## 목적

이 문서는 현재 검증 엔진의 다음 투자 우선순위를 실행 가능한 형태로 정리한다.
목표는 세 가지다.

- 신뢰도 기준선을 자동으로 지킨다.
- 데이터 부족 때문에 생기는 판정 한계를 줄인다.
- 과도 상태 분석은 오버엔지니어링 없이 단계적으로 올린다.

## 우선순위

1. CI에 신뢰도 기준선 고정
2. Spec DB 커버리지 확대
3. Transient / peak / inrush 분석 단계적 도입

---

## 1. CI 테스트 묶음 명세

### 목적

규칙 추가나 리팩토링 이후에도 핵심 검증 성질이 흔들리지 않게 한다.

### P0 게이트

매 PR / main merge 전에 반드시 통과해야 하는 묶음:

- `npx next typegen`
- `npx tsc --noEmit`
- `tests/virtual-circuit-e2e.test.ts`
- `tests/validation-regression-scenarios.test.ts`
- `tests/datasheet-rules.test.ts`
- `tests/drc-engine.test.ts`
- `tests/circuit-netlist.test.ts`
- `tests/real-board-netlist-validation.test.ts`
- `tests/kicad-public-fixtures.test.ts`

### 권장 실행 명령

```bash
npx next typegen
npx tsc --noEmit
node --test --experimental-strip-types --import ./tests/register-alias-loader.mjs \
  tests/virtual-circuit-e2e.test.ts \
  tests/validation-regression-scenarios.test.ts \
  tests/datasheet-rules.test.ts \
  tests/drc-engine.test.ts \
  tests/circuit-netlist.test.ts \
  tests/real-board-netlist-validation.test.ts \
  tests/kicad-public-fixtures.test.ts
```

### P1 보조 게이트

주기 실행 또는 nightly에 적합:

- `tests/kicad-public-fixtures.test.ts`
- `tests/kicad-import.test.ts`
- `tests/kicad-real-projects.test.ts`
- `tests/build-integrated-validation-json.test.ts`
- `tests/validation-snapshot.test.ts`
- `tests/datasheet-review-payload.test.ts`
- `tests/project-serialization.test.ts`
- `tests/kicad-mapper.test.ts`

### 실패 시 해석 규칙

- `kicad-public-fixtures` 실패:
  - 공개 KiCad sample subset 기준 파서/렌더링/통합 회귀 가능성 높음
- `virtual-circuit-e2e` 실패:
  - 대표 회로 패턴 회귀 가능성 높음
- `real-board-netlist-validation` 실패:
  - 실제 수입/배선/복원 경로 회귀 가능성 높음
- `datasheet-rules` 실패:
  - 전원/부품 규칙 근거 체계 회귀 가능성 높음
- `validation-snapshot` 실패:
  - 외부 리뷰/비교 관측값 회귀 가능성 높음

### 완료 기준

- P0 명령이 CI에 고정된다.
- 실패 로그에 어떤 묶음이 깨졌는지 바로 보인다.
- 최소 weekly 또는 nightly에 P1 묶음이 돈다.
- baseline은 저장소 포함 public fixture만 사용하고, 로컬/대형 fixture는 extended로 분리된다.

---

## 2. Spec DB 확장 우선 부품군

### 목적

현재 엔진의 실제 병목인 `generic / fallback / partial` 의존도를 줄인다.

### 1차 우선군

정확도 체감 효과가 큰 순서:

- 전원 부품
  - AMS1117 / LM1117 / LM317 / 7805 / MCP1700 / AP2112 / XC6206
  - buck/boost 모듈에 자주 쓰이는 MP1584 / LM2596 / MT3608
- 무선/MCU 모듈
  - ESP32-WROOM / ESP8266 / ESP-01 / HC-05 / HC-06 / HM-10 / nRF24L01
- 대표 센서
  - BME280 / BMP280 / SHT31 / AHT20 / DS18B20 / DHT22
  - RC522 / PN532 / VL53L0X / MPU6050 / MPU9250 / MAX30102
- 계측/아날로그
  - ADS1115 / ADS1015 / MCP3208 / HX711
  - LM358 / LM324 / MCP6002 / TLV2372 / OPA2333
- 보호/레벨 변환
  - BSS138 level shifter
  - common TVS / Schottky / reverse polarity diode families

### 부품별 최소 필드

처음부터 모든 필드를 채우려 하지 말고, 아래 최소 세트부터 채운다.

- `canonical_mpn`
- `manufacturer`
- `datasheet_url`
- `logic_voltage_min/max`
- `supply_voltage_min/max`
- `abs_max_supply`
- `current_typ/max`
- `mode_table`
- `required_external_parts`
- `reserved_boot_reset_pins`
- `signal_level_constraints`
- `source_quality`

### source_quality 기준

- `official-complete`
- `official-partial`
- `generic-module`
- `fallback-family`

### 1차 성공 기준

- 상위 사용 부품 50개에 대해 `official-complete` 또는 `official-partial` 확보
- 전원 / 무선 / 대표 센서 / ADC / op-amp 축이 모두 포함
- `fallback` 기반 critical finding 비중이 눈에 띄게 감소

### 측정 지표

- source bucket counts
  - `official / partial / generic / fallback`
- top issue codes by source bucket
- part master hit rate
- low-confidence mapping count

---

## 3. Transient 분석 단계 설계

### 목표

정밀 SPICE 수준으로 바로 가지 않고, 실무에서 자주 터지는 brown-out / inrush / burst 전류 위험만 먼저 보수적으로 잡는다.

### 단계 0

현재 상태:

- static current profile
- typ/max 일부 존재
- module overhead 일부 반영
- rail over-budget / low-headroom / regulator thermal 가능

### 단계 1. peak profile 추가

먼저 넣을 것:

- `peak_current_ma`
- `peak_duration_us_ms`
- `startup_inrush_ma`
- `startup_duration_ms`
- `brownout_sensitive: true/false`

적용 대상:

- ESP32 / ESP8266
- HC-05 / HC-06
- nRF24L01
- OLED / TFT display
- relay / motor driver / pump / fan module

엔진 동작:

- static average가 아니라 `peak overlap`을 보수적으로 가정
- regulator / rail budget에 `burst margin` review 추가

출력 rule 예시:

- `power.peak-burst-review`
- `power.startup-inrush-review`
- `power.brownout-risk-review`

### 단계 2. rail capacitor / source impedance 반영

추가 입력:

- bulk capacitor presence/value
- regulator transient response hint
- source path resistance / cable / USB source class

엔진 동작:

- 큰 peak 전류를 bulk cap이 어느 정도 흡수 가능한지 보수적 계산
- source impedance가 큰 공급 경로에서 brown-out review 강화

출력 rule 예시:

- `power.bulk-capacity-insufficient-review`
- `power.source-impedance-brownout-review`

### 단계 3. mode transition profile

추가 입력:

- `idle -> tx`
- `sleep -> wake`
- `boot -> active`
- `motor start -> steady`

엔진 동작:

- 사용자가 선택한 `componentPowerModes`와 연결
- 특정 프로젝트에서 동시에 깨어나는 부품군을 기준으로 worst-case review

### 하지 말아야 할 것

지금 단계에서 바로 하지 않는 것이 맞는 것:

- full transient analog simulation
- layout parasitic까지 반영한 detailed power integrity 해석
- 모든 부품의 time-domain waveform 모델링

이유:

- 데이터 입력 품질이 아직 충분히 차지 않았다.
- 설명 가능성이 떨어지고 오탐 제어가 어려워진다.
- 현재 단계에선 review-quality heuristic이 더 비용 대비 효과가 좋다.

### 완료 기준

- 단계 1 rule이 대표 무선/디스플레이/모터 부품군에 적용된다.
- 기존 static rule과 충돌하지 않는다.
- golden corpus에 peak/inrush 관련 케이스가 추가된다.

---

## 권장 실행 순서

1. CI에 P0 묶음 고정
2. source bucket 통계와 snapshot diff를 CI 아티팩트에 노출
3. Spec DB 1차 우선군 50개 채우기
4. peak/inrush 최소 필드 추가
5. transient review rule 2~3개만 먼저 도입
6. golden corpus에 transient 케이스 추가

## 한 줄 결론

지금 가장 중요한 것은 규칙을 더 많이 넣는 것이 아니라,
`기준선 자동화 → 데이터 커버리지 확대 → 보수적 transient review 도입`
순서로 신뢰도를 잃지 않으면서 올라가는 것이다.
