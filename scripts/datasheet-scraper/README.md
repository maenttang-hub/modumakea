# Datasheet-to-Code Pipeline

이 폴더는 보드 데이터시트나 레지스트리에서 추출한 핀 메타데이터를 ModuMake 보드 정의 포맷으로 바꾸는 로컬 생성기입니다.

핵심 원칙은 두 가지입니다.

1. 원본 문서를 직접 파싱하려고 버티지 않습니다.
2. 먼저 LLM, Zephyr DTS, PlatformIO, Arduino Core JSON 같은 상위 추출층에서 핀 목록을 뽑고, 여기서는 그 결과를 안정적으로 정규화합니다.

## 포함 파일

- `datasheet_to_board.py`
  - 추출된 JSON을 `src/constants/boards.ts`와 호환되는 보드 정의 JSON/TS로 변환합니다.
- `examples/super52840.raw.json`
  - nRF52840 계열 보드용 예시 입력입니다.

## 입력 JSON 예시

```json
{
  "board": {
    "id": "super52840",
    "name": "Super52840",
    "chipset": "nRF52840",
    "logicVoltage": "3.3V",
    "targetLanguage": "C++"
  },
  "pins": [
    { "name": "P0.02", "features": ["GPIO", "ADC"] },
    { "name": "P0.13", "features": ["GPIO", "PWM"] },
    { "name": "3V3", "features": ["POWER"] },
    { "name": "GND", "features": ["GND"] }
  ]
}
```

## 사용 예시

JSON 출력:

```bash
python3 scripts/datasheet-scraper/datasheet_to_board.py \
  scripts/datasheet-scraper/examples/super52840.raw.json \
  --format json
```

TypeScript 출력:

```bash
python3 scripts/datasheet-scraper/datasheet_to_board.py \
  scripts/datasheet-scraper/examples/super52840.raw.json \
  --format ts \
  --output /tmp/super52840.ts \
  --export-name SUPER52840_BOARD
```

## 자동 매핑 규칙

- `GPIO`, `I2C`, `SPI`, `UART`, `TX`, `RX` → `DIGITAL`
- `ADC`, `AIN`, `ANALOG` → `ANALOG`
- `PWM`, `TIMER` → `PWM`
- `VCC`, `VDD`, `VIN`, `3V3`, `5V` → `POWER`
- `GND`, `VSS`, `GROUND` → `GND`

추가 규칙:

- `PWM` 핀은 자동으로 `DIGITAL`도 포함합니다.
- `ANALOG` 핀은 전원 핀이 아닌 경우 자동으로 `DIGITAL`도 포함합니다.
- `POWER`, `GND`, `ANALOG` 핀은 기본적으로 좌측(`leftPins`)으로 배치됩니다.

## 권장 파이프라인

1. 제조사 PDF나 보드 레지스트리에서 핀 표를 추출합니다.
2. LLM에게 아래처럼 정형 JSON만 뽑게 합니다.
3. 이 스크립트로 ModuMake 보드 정의를 생성합니다.
4. 생성 결과를 리뷰한 뒤 `src/constants/boards.ts` 또는 별도 generated 파일에 편입합니다.

### LLM 추출 프롬프트 뼈대

```text
Read the board pinout table and return JSON only.

Schema:
{
  "board": {
    "id": "short_machine_id",
    "name": "display name",
    "chipset": "chipset name",
    "logicVoltage": "3.3V or 5V",
    "targetLanguage": "C++ or Python"
  },
  "pins": [
    {
      "name": "pin label exactly as printed",
      "features": ["GPIO", "ADC", "PWM", "POWER", "GND"],
      "side": "optional: left or digital"
    }
  ]
}

Rules:
- Return valid JSON only.
- Keep pin names exact.
- Mark power rails as POWER and grounds as GND.
- Include ADC and PWM only when the datasheet explicitly supports them.
```
