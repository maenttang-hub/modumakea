# Part Master Catalog

이 문서는 MPU/센서용 `part_master` 카탈로그를 어떤 기준으로 모으고,
어디서 데이터시트를 얻는지 정리합니다.

## 목적

- `components` 템플릿 카탈로그와 별도로 실제 부품 단위의 기준 테이블을 둡니다.
- 하나의 부품마다 공식 데이터시트 URL과 전기/인터페이스 스펙을 정규화합니다.
- 이후 검증 엔진은 `part_master 규칙 + netlist fact` 조합으로 판정합니다.

## 데이터시트 출처 우선순위

1. 제조사 공식 제품 페이지의 datasheet PDF
2. 제조사 공식 문서 포털의 product brief / datasheet
3. 제조사 공식 product page + 공식 user manual 조합
4. 위가 없을 때만 대형 유통사 미러를 임시 링크로 사용

강한 판정에 쓰려면 최소한 `1` 또는 `2`를 만족시키는 편이 안전합니다.

## 어디서 얻나

가장 좋은 출처는 항상 제조사 공식 사이트입니다.

- TI: `ti.com/product/...` 와 `ti.com/lit/gpn/...`
- Analog Devices / Maxim: `analog.com/en/products/...` 와 `analog.com/media/.../data-sheets/...`
- Bosch Sensortec: `bosch-sensortec.com/.../downloads/datasheets/...`
- ST: `st.com/resource/en/datasheet/...`
- Microchip: `microchip.com` 또는 `ww1.microchip.com/downloads/...`
- Espressif: `espressif.com/sites/default/files/documentation/...`
- Raspberry Pi: `datasheets.raspberrypi.com/...`
- NXP: `nxp.com/docs/en/data-sheet/...`
- Sensirion: `sensirion.com/media/documents/...`

자동 다운로드가 필요하면 아래 스크립트로 starter part master 기준 공식 링크를 로컬에 저장할 수 있습니다.

```bash
python3 ./scripts/datasheet-scraper/download_part_master_datasheets.py
python3 ./scripts/datasheet-scraper/download_part_master_datasheets.py --mpn BME280 --mpn ESP32-WROOM-32E
```

기본 저장 위치:

- PDF/HTML: `downloads/datasheets/`
- 결과 manifest: `downloads/datasheets/manifest.json`

레포 내부 KiCad 자산과 starter part master에서 후보 URL을 먼저 뽑고 싶으면:

```bash
python3 ./scripts/datasheet-scraper/extract_datasheet_candidates.py
python3 ./scripts/datasheet-scraper/download_datasheet_candidates.py --quality official --limit 100
```

이 경로는 현재 레포에 이미 들어 있는 샘플 라이브러리의 datasheet 링크까지 재사용합니다.

공식 벤더 도메인 자체를 직접 훑고 싶으면:

```bash
python3 ./scripts/datasheet-scraper/crawl_vendor_datasheets.py --vendors espressif,raspberrypi,bosch
python3 ./scripts/datasheet-scraper/crawl_vendor_datasheets.py --vendors microchip,st,adi,nxp,espressif --max-pages 50
python3 ./scripts/datasheet-scraper/download_datasheet_candidates.py \
  --input ./downloads/vendor-datasheet-candidates.json \
  --quality official
```

이 스크립트는 지정한 공식 도메인 내부 링크만 따라가고, datasheet/PDF처럼 보이는 URL만 후보로 저장합니다.

센서 위주로 다시 모으려면 벤더 전용 수집기를 쓰는 편이 훨씬 품질이 좋습니다.

```bash
python3 ./scripts/datasheet-scraper/collect_popular_sensor_datasheets.py \
  --vendors st,adi,bosch,sensirion \
  --skip-validate \
  --output ./downloads/popular-sensor-datasheet-candidates.raw.json

python3 ./scripts/datasheet-scraper/download_datasheet_candidates.py \
  --input ./downloads/popular-sensor-datasheet-candidates.raw.json \
  --output ./downloads/popular-sensor-pdfs \
  --quality official
```

이 수집기는 다음 성격에 맞춰 설계되어 있습니다.

- Sensirion: 다운로드 센터에서 `Datasheet ...` 항목만 추출
- Bosch Sensortec: 제품 페이지 안의 `Datasheet` 카드만 추출
- ST: ToF 센서 계열 공식 PDF 시드
- ADI / Maxim: 많이 쓰이는 센서 계열 공식 PDF 시드

Adafruit는 보통 `브레이크아웃 모듈 문서 + Learn 가이드 + Downloads 페이지` 구조라서 별도 수집기를 씁니다.

```bash
python3 ./scripts/datasheet-scraper/collect_adafruit_sensor_docs.py \
  --output ./downloads/adafruit-sensor-docs.json

python3 ./scripts/datasheet-scraper/download_datasheet_candidates.py \
  --input ./downloads/adafruit-sensor-docs.json \
  --output ./downloads/adafruit-sensor-docs-pdfs \
  --quality official
```

이 경로는 다음 두 종류를 같이 저장합니다.

- Adafruit Learn guide PDF
- Guide `Downloads` 페이지에 연결된 원칩/벤더 PDF

## 초기 수집 정책

- `canonical_mpn`: 하나의 대표 주문형 MPN 또는 벤더가 쓰는 대표 부품명
- `manufacturer_name`: 제조사 표준 이름
- `normalized_part_name`: 검색 친화적인 일반 이름
- `datasheet_url`: 공식 primary source URL
- `source_quality`: `official-complete`, `official-partial`, `module-verified`, `generic-module`
- `alias_names`: clone/module 판매명 alias
- `supporting_urls`: 모듈 위키, 브레이크아웃 가이드, 보조 문서
- `pin_schema_json`: 전원/그라운드/예약/부트/인터페이스 핀 메타데이터
- `pin_schema_json.signalPins`: 검증에 직접 쓰는 신호 핀 이름
- `specs_json`: 전원 범위, IO 전압, 절대최대정격, 인터페이스, 필수 외부부품, 권장 회로
- `specs_json.currentConsumption`: 전력 예산 검증용 스타터 전류 프로파일

`currentConsumption` 권장 필드:

- `sleepUa`
- `idleUa`
- `measureUa`
- `peakMa`
- `typicalActiveUa`
- `maxActiveUa`
- `typicalPeakMa`
- `maxPeakMa`
- `moduleOverheadMa`
- `modes`
- `notes`

이 값은 다음 검증에 직접 연결됩니다.

- 한 전원 레일에 여러 센서를 동시에 달았을 때 총 소비전류 추정
- `BME680`, `MAX30102`, `HC-05/06`, `ToF` 센서처럼 피크 전류가 큰 부품 경고
- 배터리/레귤레이터 여유 전류 계산

정확도 고도화 단계에서는 아래를 같이 합산합니다.

- 칩 자체 `typ/max` 전류
- 모듈 오버헤드 (`LED`, `LDO`, `level shifter`)
- mode table (`sleep`, `idle`, `sample`, `heater`, `tx-burst`, `display-full-on`)
- 보드 자체 quiescent current

## Curated Build Pipeline

지금부터는 손으로 바로 TS에만 적는 대신, 아래 3단계로 관리합니다.

1. 원본 curated JSON 편집
   - `config/part-master/curated-part-master-source.json`
2. 생성 스크립트 실행
   - `python3 ./scripts/datasheet-scraper/build_curated_part_master.py`
3. seed / SQL 산출물 생성
   - `node --experimental-strip-types --loader ./tests/alias-loader.mjs ./scripts/seed-supabase.ts --dry-run --target part_master`

생성 결과:

- curated JSON artifact: `downloads/curated-part-master.json`
- generated TS catalog: `src/generated/curated-part-master-records.ts`
- merged seed JSON: `scripts/component-catalog/generated/part-master.seed.json`
- merged SQL import: `scripts/component-catalog/generated/part-master.import.sql`

## Current Curated Scope

현재 curated source에는 우선 실제 메이커에서 자주 쓰는 27개를 넣었습니다.

- 환경 센서: `DHT11`, `DHT22`, `AHT20`, `SHT31`, `BMP280`, `BME280`, `BME680`, `DS18B20`, `LM35`, `TMP36`
- 고온/특수 측정: `MAX31855`, `MAX6675`
- 거리/모션: `VL53L0X`, `VL53L1X`, `MPU-6050`, `MPU-9250`, `ADXL345`
- 광/생체: `BH1750`, `MAX30102`, `AD8232`
- 전력/RTC: `INA219`, `INA226`, `DS3231`
- 통신/주변장치: `HC-05`, `HC-06`, `SSD1306`, `MCP3008`

`STARTER_PART_MASTER_RECORDS`와 합치면 현재 merged `part_master` seed는 34개입니다.

## Clone Module Alias 정책

`GY-*`, `HW-*`, 무명 브레이크아웃처럼 판매자/클론명이 원칩 MPN과 다를 때는
`part_master`에 바로 넣기보다 alias 테이블로 먼저 다루는 편이 안전합니다.

- `part_master`: 원칩 기준 정규 정보
- `module alias`: 보드/브레이크아웃 판매명과 대표 원칩의 연결

현재 starter alias는 [module-alias-catalog.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/module-alias-catalog.ts:1)에 들어 있습니다.

예시:

- `GY-521` -> `MPU-6050`
- `GY-BME280` -> `BME280`
- `GY-BMP280` -> `BMP280`
- `GY-MAX4466` -> `MAX4466`
- `GY-87` -> `MPU-6050 + HMC5883L/QMC5883L + BMP180`

추가로 흔한 판매명도 같이 다룹니다.

- `GY-302` / `GY-30` -> `BH1750`
- `GY-906` -> `MLX90614`
- `GY-68` -> `BMP180`
- `GY-MAX30102` -> `MAX30102`
- `CJMCU-811` -> `CCS811`
- `CJMCU-680` -> `BME680`
- `DHT11-MODULE` -> `DHT11`
- `DHT22-MODULE` -> `DHT22/AM2302`
- `DS18B20-MODULE` -> `DS18B20`
- `HC-SR04` -> ultrasonic module family
- `HC-05` / `HC-06` -> Bluetooth UART module family
- `GY-NEO6MV2` -> `NEO-6M`

## 품질 단계

- `official-complete`: 공식 데이터시트로 전원/핀/인터페이스/필수 외부부품 확인 완료
- `official-partial`: 정체성과 기본 인터페이스는 확인됐지만 세부 전기표는 미완료
- `generic-module`: clone-heavy 모듈이라 부품 자체보다 브레이크아웃 편차가 큼
- `needs-vendor-pin`: 정확한 SKU 또는 벤더 문서 pinout 고정이 필요함

## Starter Scope

현재 starter part master는 아래 축을 우선 포함합니다.

- MCU: ATmega328P, ESP32-WROOM-32E, RP2040
- Sensors: BMP280, BME280, BME680, DS18B20, LM35, SHT31, VL53L0X, VL53L1X, BNO055
- Mixed signal / monitor: INA219
- RF: MFRC522

이 단계에서는 `수량`보다 `스키마 안정성`을 우선합니다.
