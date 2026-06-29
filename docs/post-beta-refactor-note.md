# Post-Beta Refactor Note

현재 상태:
- 판정 일관성 수정 완료
- 하드코딩 제거 완료
- 핵심 회귀 테스트 유지 확인 완료

원칙:
- 베타 중에는 기능 안정성을 우선한다.
- 큰 파일 분해는 베타 피드백 반영 직후 시작한다.
- 리팩토링은 동작 변경 없이 책임 분리만 먼저 진행한다.

## 1. circuit-netlist.ts 분리

목표:
- ADC
- op-amp / analog front-end
- power / regulator / flyback
- imported pinout / electrical mismatch

메모:
- 먼저 순수 계산 함수와 규칙 함수부터 바깥으로 이동
- `analyzeCircuitNetlist`의 입출력 계약은 유지
- 기존 회귀 테스트를 분할 기준으로 그대로 유지

## 2. drc-engine.ts 분리

목표:
- power
- reset / clock
- interface / mixed-voltage
- protection
- imported schematic / baseline

메모:
- `buildCriticalElectricalIssues`를 우선 해체
- 규칙별 helper를 파일 단위로 분리
- 최종 `runProjectDrc` 조립 흐름은 최대한 그대로 유지

## 3. kicad-sch-parser.ts 분리

목표:
- 연결 복원
- 심볼 매핑
- geometry / scene 생성
- label / sheet scope 처리

메모:
- connectivity 로직과 geometry 로직을 먼저 분리
- KiCad import 회귀 테스트를 보호막으로 유지
- multi-sheet / power label / sheet pin 동작은 분리 후에도 절대 바뀌지 않게 확인

## 시작 순서

1. `circuit-netlist.ts`
2. `drc-engine.ts`
3. `kicad-sch-parser.ts`

## 착수 조건

- 베타 사용자 피드백 1차 반영 완료
- 급한 판정 오류 수정이 잠잠해진 시점
- 회귀 테스트 묶음을 기준선으로 다시 한 번 고정한 뒤 시작
