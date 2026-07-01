# Beta Golden Corpus Protocol

작성일: 2026-06-30

## 목적

검증 신뢰도는 느낌으로 판단하지 않는다. 제한 베타 전후로 대표 회로 20-30개를 골라 expected issue set을 사람이 라벨링하고 precision을 추적한다.

## 현재 자산

- `tests/validation-regression-scenarios.test.ts`: 룰별 회귀 샘플 다수
- `tests/kicad-public-fixtures.test.ts`: 공개 KiCad fixture 일부
- `tests/kicad-real-projects.test.ts`: 로컬 real fixture 묶음
- `config/golden-corpus/clean-kicad-golden-corpus-v1.json`: parser/render/report anomaly 50건, human label은 의도적으로 pending
- `config/golden-corpus/beta-validation-golden-corpus-v1.json`: 베타 validation precision용 합성 회로 5건, human-reviewed seed
- `tests/beta-validation-golden-corpus.test.ts`: 위 합성 회로의 expected / non-expected rule을 CI에서 검증

주의: 기존 clean corpus는 import/render 품질용이다. 베타 precision 측정용 expected issue set과 동일하지 않다.
베타 validation corpus는 작게 시작하며, 실제 사용자 허가 샘플을 추가하기 전까지 엔진 기준선이 흔들리는지 보는 seed 역할만 한다.

## 베타 validation corpus 구성

20-30개 샘플을 아래 비율로 고른다.

- 5개: 정상 또는 거의 정상 회로
- 5개: 전원/그라운드/short 리스크
- 5개: I2C/SPI/UART/pin assignment 리스크
- 5개: analog/ADC/op-amp/front-end 리스크
- 5개: generic/fallback/custom symbol 때문에 보수 판단이 필요한 회로
- 선택 5개: import 실패 또는 부분 해석 실패 사례

## 라벨 형식

각 샘플마다 사람이 아래 값을 채운다.

```json
{
  "sampleId": "uno-i2c-missing-pullup-01",
  "source": "tests or beta user permissioned file",
  "labelStatus": "human-reviewed",
  "expectedIssues": [
    {
      "ruleId": "bus.i2c-impedance-voltage.missing-pullup",
      "severity": "warning",
      "confidence": "strong-inference",
      "expected": true,
      "notes": "SDA/SCL에 외부 pull-up 또는 모듈 내장 pull-up 증거 없음"
    }
  ],
  "expectedNonIssues": [
    {
      "ruleId": "netlist.power-short.direct",
      "notes": "전원/GND 직접 short 없음"
    }
  ]
}
```

## 측정 기준

- critical precision: false-positive를 거의 허용하지 않는다.
- warning precision: 보수 판단은 허용하되 근거와 확인 방법이 있어야 한다.
- review precision: generic/fallback/sourceQuality를 숨기지 않는다.
- recall은 베타 초기에 참고 지표로만 본다. 지금 목표는 사용자가 믿을 수 있는 경고다.

## 완료 조건

- 20개 이상 human-reviewed
- 각 샘플 expected issue set 존재
- false-positive feedback과 corpus 결과가 rule id 기준으로 연결
- 릴리즈마다 동일 corpus를 다시 실행하고 결과를 release checklist에 기록

## 금지

- 자동 실행 결과를 human label처럼 취급하지 않는다.
- pending label을 통과 기준에 섞지 않는다.
- 제품 문구에 "검증 완료"라고 쓰지 않는다.
