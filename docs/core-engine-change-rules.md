# Core Engine Change Rules

작성일: 2026-06-30

## 목적

검증 엔진과 KiCad import 계층은 이미 큰 파일과 많은 회귀 테스트를 갖고 있다. 이 문서는 새 규칙을 추가할 때 오탐, 과장, 회귀를 줄이기 위한 최소 기준이다.

## 적용 대상

- `src/lib/circuit-netlist.ts`
- `src/lib/datasheet-rules.ts`
- `src/lib/drc-engine.ts`
- `src/lib/kicad-sch-parser.ts`
- `src/lib/v3-kicad-parser/**`
- validation/report 변환 계층

## 변경 규칙

1. 새 검증 rule은 `ruleId` 또는 `code`를 갖는다.
2. 사용자가 볼 수 있는 finding은 `evidence`, `confidence`, `recommendation` 중 가능한 항목을 함께 제공한다.
3. fallback, generic, partial mapping 기반 판단은 숨기지 않는다.
4. critical 또는 error finding은 fallback/generic 추정만으로 만들지 않는다. 단독 근거가 약하면 `needs-review` 또는 warning으로 낮춘다.
5. 렌더링 보정 결과를 검증의 원천 사실처럼 사용하지 않는다. 검증 근거는 netlist, parsed source, part data, 명시적 사용자 설정을 우선한다.
6. 새 rule은 대표 pass/fail 테스트를 함께 추가한다.
7. 대형 파일에 새 도메인을 계속 붙이지 않는다. 독립 도메인은 별도 모듈로 분리한다.

## 테스트 기준

새 엔진 변경은 최소 아래 중 관련 테스트를 갱신해야 한다.

- 회로 해석: `tests/circuit-netlist.test.ts`
- DRC 통합: `tests/drc-engine.test.ts`
- 데이터시트 규칙: `tests/datasheet-rules.test.ts`
- KiCad import: `tests/kicad-import.test.ts`
- public fixture 회귀: `tests/kicad-public-fixtures.test.ts`
- 저장/복원: `tests/project-serialization.test.ts`

## 금지 사항

- 테스트 없이 confidence 판정 기준 변경
- fallback mapping을 확정 오류처럼 표시
- parser, renderer, validator 책임을 한 함수에서 섞는 변경
- 제품 문구에서 자동 검증 결과를 제조 보증처럼 표현
