# Validation Engine Reliability Report

## 목적

이 문서는 현재 검증 엔진의 **회귀 안정성 기준 신뢰도**를 기록한다.
여기서 말하는 신뢰도는 “실제 제품에서 100% 정답”이 아니라,
현재 엔진이 이미 알고 있는 대표 회로 패턴에 대해 **판정이 흔들리지 않는지**를 뜻한다.

## 이번 점검 범위

실행한 검증 묶음:

- `tests/virtual-circuit-e2e.test.ts`
- `tests/validation-regression-scenarios.test.ts`
- `tests/datasheet-rules.test.ts`
- `tests/drc-engine.test.ts`
- `tests/circuit-netlist.test.ts`
- `tests/real-board-netlist-validation.test.ts`
- `npx tsc --noEmit`

## 결과 요약

- 총 테스트 수: `244`
- 결과: `244 passed, 0 failed`
- 타입체크: `npx tsc --noEmit` 통과

## 신뢰도 해석

현재 엔진은 아래 영역에서 **회귀 신뢰도 높음**으로 볼 수 있다.

- 디지털 인터페이스 기본 검증
  - I2C pull-up 있음/없음
  - SPI/UART mixed-voltage direct path
  - level shifter same-channel path 확인
  - address strap / boot strap / reset supervisor

- 전원/전류 예산 검증
  - rail over-budget
  - rail low-headroom
  - regulator thermal / headroom
  - reverse polarity 관련 전원 경고
  - low-power mode 적용 시 전류 감소

- 아날로그 프런트엔드 검증
  - op-amp feedback 유무
  - AC coupling + midpoint bias + bypass
  - gain sanity
  - output headroom / common-mode / GBW review
  - ADC over-range / source impedance / settling

- 외부 ADC / 계측 프런트엔드
  - ADS1115 differential / PGA / data rate review
  - MCP3208 source impedance / VREF / scan-rate review
  - HX711 excitation / sense / balanced wiring

- 회로 물리 및 보호
  - direct short
  - LED series resistor
  - flyback diode
  - capacitor / resistor derating
  - inductor current rating review

- 실제 보드 end-to-end 경로
  - import → netlist → DRC → integrated validation JSON
  - 실제 KiCad fixture 3종 통과

## Golden Corpus 상태

현재 [tests/virtual-circuit-e2e.test.ts](/Users/gimdong-il/Desktop/프로그램/modumake/tests/virtual-circuit-e2e.test.ts)에
대표 가상 회로 `20개`가 들어 있다.

의도:

- “깨진 회로는 실제로 경고가 떠야 한다”
- “정상 회로는 같은 경고가 사라져야 한다”

즉, 단순 rule existence 테스트가 아니라
**오탐/누락 방향 둘 다 확인하는 최소 기준선** 역할을 한다.

## 아직 조심해야 할 해석

아래는 테스트가 통과해도 **현실 정확도를 과신하면 안 되는 구간**이다.

- fallback / generic mapping 비중이 높은 imported schematic
- exact datasheet profile이 없는 부품 family
- placement / routing / 실제 signal path가 schematic 수준에서 완전히 복원되지 않는 경우
- module overhead, 실제 mode 전이, board 자체 소비전류가 세밀하지 않은 전류 예산
- layout dependent 이슈
  - decoupler proximity
  - return path
  - high-current copper
  - EMI / stability / thermal spreading

## 현재 판단

실무적으로 현재 상태는 아래처럼 보는 것이 가장 정확하다.

- **회귀 안정성:** 높음
- **대표 회로 패턴 검출 신뢰도:** 높음
- **실제 양산 정확도:** 중간 이상, 하지만 아직 보수적 review가 필요한 영역 존재
- **fallback/generic 해석 의존 구간:** 여전히 주의 필요

## 다음 권장 단계

지금 가장 효율적인 다음 단계는 규칙 추가가 아니라 아래 둘 중 하나다.

1. 이 golden corpus 20개를 CI 기준선으로 고정
2. snapshot diff에 source bucket 변화까지 연결해서 “이번 변경으로 fallback성 이슈가 늘었는지” 추적

## 한 줄 결론

현재 엔진은 **대표 회로 패턴에 대한 회귀 신뢰도는 충분히 높다.**
다만 이것을 곧바로 “실제 모든 회로에 대한 절대 정확도”로 해석하면 안 되고,
특히 generic/fallback 매핑과 layout 의존 항목은 계속 보수적으로 다뤄야 한다.
