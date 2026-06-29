# Spec DB Priority Top 50

## 목적

이 문서는 `part_master / Spec DB` 1차 확장 대상을 실제 작업 리스트로 고정한다.
기준은 단순 유명세가 아니라 아래 세 가지다.

- 검증 엔진 정확도 체감 효과가 큰가
- fallback / generic 의존도를 실제로 줄이는가
- 전원 / 무선 / 센서 / ADC / analog-front-end 축을 고르게 보강하는가

## 상태 구분

- `existing`: 이미 starter 또는 curated 범위에 들어 있음
- `expand`: 이미 일부 정보가 있으나 전기/전력/핀 규칙 보강이 필요함
- `new`: 이번 1차 확장 대상

---

## A. Power (10)

1. `AMS1117` — `expand`
2. `LM7805` — `expand`
3. `LM317` — `expand`
4. `LM1117` — `new`
5. `MCP1700` — `new`
6. `AP2112K-3.3` — `new`
7. `XC6206P332MR` — `new`
8. `LM2596` — `new`
9. `MP1584EN` — `new`
10. `MT3608` — `new`

우선 이유:
- regulator max input
- dropout / headroom
- thermal / rail budget
- maker 보드/모듈 전원부 커버리지

---

## B. Wireless / MCU / Interface Modules (10)

11. `ESP32-WROOM-32E` — `new`
12. `ESP32-S3-WROOM-1` — `new`
13. `ESP8266EX` — `new`
14. `ESP-01` — `new`
15. `HC-05` — `expand`
16. `HC-06` — `expand`
17. `HM-10` — `new`
18. `nRF24L01+` — `new`
19. `PN532` — `new`
20. `MFRC522` — `expand`

우선 이유:
- mixed-voltage
- UART/SPI/I2C signal-level
- burst current / brown-out sensitivity
- 가장 자주 쓰는 maker 통신 모듈군

---

## C. Environmental / General Sensors (10)

21. `BME280` — `expand`
22. `BMP280` — `expand`
23. `BME680` — `expand`
24. `SHT31` — `expand`
25. `AHT20` — `expand`
26. `DS18B20` — `expand`
27. `DHT22` — `expand`
28. `DHT11` — `expand`
29. `BH1750` — `new`
30. `AHT10` — `new`

우선 이유:
- 실제 사용 빈도 높음
- pull-up / address strap / decoupling 규칙과 직접 연결
- 저전력/배터리 프로젝트에서 자주 등장

---

## D. Motion / Distance / Bio / Mixed Sensors (10)

31. `VL53L0X` — `expand`
32. `VL53L1X` — `expand`
33. `MPU-6050` — `expand`
34. `MPU-9250` — `expand`
35. `ADXL345` — `expand`
36. `BNO055` — `new`
37. `MAX30102` — `expand`
38. `AD8232` — `expand`
39. `INA219` — `expand`
40. `INA226` — `expand`

우선 이유:
- current profile 차이가 커서 rail budget 품질 향상 효과 큼
- IMU / ToF / bio sensor는 support-part 누락 판정 가치가 큼
- INA 계열은 전력/측정 검증 축 강화에 직접 도움

---

## E. ADC / Analog / Timing / Support (10)

41. `ADS1115` — `expand`
42. `ADS1015` — `new`
43. `MCP3208` — `new`
44. `HX711` — `new`
45. `LM358` — `new`
46. `LM324` — `new`
47. `MCP6002` — `new`
48. `OPA2333` — `new`
49. `DS3231` — `expand`
50. `BSS138` — `new`

우선 이유:
- ADC settling / PGA / VREF / excitation rules 정확도 상승
- op-amp GBW / headroom / rail-to-rail 판단 정확도 상승
- RTC / level shifter는 실제 보드에서 출현 빈도 높음

---

## 현재 범위와의 관계

이미 문서상 현재 curated/starter 범위에 포함된 축:

- `DHT11`, `DHT22`, `AHT20`, `SHT31`, `BMP280`, `BME280`, `BME680`, `DS18B20`
- `VL53L0X`, `VL53L1X`, `MPU-6050`, `MPU-9250`, `ADXL345`
- `BH1750`, `MAX30102`, `AD8232`
- `INA219`, `INA226`, `DS3231`
- `HC-05`, `HC-06`, `MCP3008`
- starter power record: `AMS1117`, `LM7805`, `LM317`

즉 이 Top 50은
- 이미 있는 것의 `전기/전력/validationHints 보강`
- 아직 없는 핵심 부품의 `신규 편입`
두 가지를 같이 포함한다.

---

## 1차 입력 필드 우선순위

각 부품마다 처음부터 완전한 모델을 만들지 않고 아래 순서로 채운다.

### P0 필수

- `canonical_mpn`
- `manufacturer`
- `datasheet_url`
- `source_quality`
- `category`
- `supplyVoltage`
- `ioVoltage`
- `absoluteMax.supplyVoltageMax`
- `interfaces`

### P1 신뢰도 향상

- `currentConsumption.typicalActiveUa/maxActiveUa`
- `currentConsumption.typicalPeakMa/maxPeakMa`
- `moduleOverheadMa`
- `defaultMode`
- `modes`
- `requiredExternalParts`

### P2 규칙 고도화

- `validationHints.decoupling`
- `validationHints.signalLevelLimits`
- `validationHints.strapPins`
- `validationHints.biasResistors`
- `analogCharacteristics`
- `adcProfile`

---

## 구현 순서 제안

1. Power 10개
2. Wireless / MCU / interface 10개
3. ADC / analog / timing / support 10개
4. Environmental sensors 10개
5. Motion / bio / mixed sensors 10개

이 순서가 좋은 이유:

- 전원과 무선 쪽이 source bucket / rail budget에 미치는 효과가 가장 큼
- ADC/op-amp/level shifter는 현재 엔진 규칙과 직접 맞물려 판정 질을 바로 올림
- 환경 센서와 IMU/ToF는 그 다음에 대량 보강해도 실익이 큼

---

## 완료 기준

- Top 50 모두 `part_master`에 존재
- 각 항목이 최소 P0 필드를 가짐
- 상위 20개는 P1까지 채워짐
- critical issue 중 `fallback/generic` 비중이 전보다 감소
- source bucket 통계에서 `official/partial` 비중이 증가

## 한 줄 결론

이 50개를 먼저 채우면, 엔진은 “규칙이 부족해서 못 보는 상태”보다
“데이터가 부족해서 보수적으로 보는 상태”를 실질적으로 크게 줄일 수 있다.
