# Remaining Work Spec

## 목적

이 문서는 현재 검증 엔진/ KiCad import / 리뷰 UI 작업에서 **실제로 남아 있는 일**만 정리한 실행용 명세서다.

목표는 세 가지다.

1. 베타 운영에 필요한 기능적 신뢰도를 유지한다.
2. 사용자가 경고를 더 잘 믿을 수 있도록 근거 구조를 강화한다.
3. 이후 리팩토링 전에 꼭 필요한 잔여 작업만 닫는다.

## 현재 상태

- `tsc --noEmit`는 통과한다.
- 핵심 검증 묶음은 통과 중이다.
- `ProjectAuditIssue`에는 `confidence` / `evidence` 구조가 추가되었다.
- AI review / lightweight payload / datasheet payload 쪽에도 기본 근거 필드가 전달된다.
- `kicad-import`, `kicad-reference-fixtures`, `kicad-real-projects`의 타입 정리는 완료되었다.

## 범위 밖

이번 명세는 아래 항목을 포함하지 않는다.

- 대형 파일 분해 리팩토링
- 새 검증 규칙 대량 추가
- PCB 레이아웃 DRC 연동
- 센서/부품 카탈로그 대량 확장

## 우선순위

### P0. 실사용 신뢰도 마감

#### 1. 경고 근거 카드 룰별 보강

배경:
지금은 `createProjectAuditIssue`가 기본 evidence를 자동 생성한다. 하지만 핵심 룰은 룰별 관측 사실과 확인 방법이 더 구체적이어야 한다.

대상 파일:

- [src/lib/datasheet-rules.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/datasheet-rules.ts)
- `netlist` 기반 issue 생성부

대상 룰 우선순위:

- `electrical.logic-level.overvoltage`
- `netlist.power-short.direct`
- `bus.i2c-impedance-voltage.missing-pullup`
- `netlist.led-current-limit-missing`
- `part-master.level-shifter-path-incomplete`

해야 할 일:

- 각 룰에 `evidenceSummary`를 사람이 이해하기 쉬운 문장으로 직접 지정
- `observedFacts`를 2~4개 수준으로 구체화
- 필요한 경우 `assumptions`를 명시
- `howToVerify`를 실제 수정/확인 행동 중심으로 작성

완료 조건:

- 위 핵심 룰 5개 이상이 기본 자동 evidence가 아니라 룰별 evidence를 가진다.
- 관련 테스트가 추가되거나 기존 테스트에서 evidence 필드까지 검증한다.

#### 2. review UI 상세 카드에 근거 표시 확장

배경:
현재 `ai-review-panel`에는 확실도와 근거 요약만 일부 표시된다. 사용자가 실제로 믿으려면 관측 사실과 확인 방법까지 볼 수 있어야 한다.

대상 파일:

- [src/components/sidebar-right/ai-review-panel.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/sidebar-right/ai-review-panel.tsx)
- 관련 상세 패널 또는 선택 이슈 뷰

해야 할 일:

- `confidence` 라벨을 명확한 한국어로 노출
- `evidenceSummary` 외에 `observedFacts` 목록 표시
- `assumptions`가 있으면 “가정”으로 분리 표시
- `howToVerify`를 “확인 방법” 또는 “해결 가이드”로 노출

완료 조건:

- 경고 클릭 시 최소 4개 정보가 보인다:
  - 확실도
  - 근거 요약
  - 관측 사실
  - 확인 방법

#### 3. generic/fallback 해석을 숨기지 않는 표시 추가

배경:
오탐 체감의 상당수는 엔진이 generic/module/fallback 상태를 숨길 때 생긴다.

대상 데이터:

- `importedMapping.confidence`
- `evidence.sourceQuality`
- fallback/custom-fallback mapping

해야 할 일:

- low-confidence mapping이면 UI에 표시
- `generic-module` / `official-partial` / `needs-vendor-pin` 상태를 보여주기
- “정확한 SKU/MPN 입력 시 정확도 향상” 메시지 추가

완료 조건:

- 사용자가 최소한 “왜 보수적으로 판단됐는지”를 UI에서 바로 알 수 있다.

### P1. 베타 운영 안정화

#### 4. `tests/kicad-real-projects.test.ts` 기대값 정리

배경:
타입 정리 후 전체 테스트 중 남은 실패는 타입 문제가 아니라 fixture 기대값과 실제 결과의 불일치다.

대상 파일:

- [tests/kicad-real-projects.test.ts](/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad-real-projects.test.ts)

해야 할 일:

- 실패한 5개 fixture의 기대값이 낡은 것인지 확인
- parser 변화가 의도된 것인지 확인
- 필요한 경우 expected counts 업데이트
- count 비교 외에 구조적 불변식 중심으로 assertions 재조정

완료 조건:

- `tests/kicad-real-projects.test.ts` 전체 통과
- fixture 업데이트 이유를 짧게 주석 또는 커밋 메시지 수준으로 남김

#### 5. 외부 리뷰용 전달 포맷 고정

배경:
외부 LLM/외부 리뷰어에게 넘길 때 어떤 파일을 주는지가 흔들리면 검증 재현성이 떨어진다.

대상 문서:

- 전달 폴더 기준 안내 문서

해야 할 일:

- “최소 전달 세트”를 문서화
- 포함 파일:
  - `.kicad_sch`
  - integrated validation json
  - README
- 선택 파일:
  - part master snapshot
  - rule findings snapshot

완료 조건:

- 누가 봐도 “이 3개만 주면 된다” 수준의 전달 규칙이 문서화된다.

#### 6. 사용자 피드백 상태값 설계

배경:
오탐을 줄이는 가장 빠른 방법은 엔진 수정만이 아니라 사용자 확인 상태를 저장하는 것이다.

추천 상태:

- `fixed`
- `already-handled`
- `included-in-module`
- `verified-by-datasheet`
- `false-positive`

해야 할 일:

- 상태 모델 정의
- issue별 feedback 저장 위치 정의
- 같은 프로젝트에서 재검증 시 톤 다운 규칙 정의

완료 조건:

- 타입 또는 store 레벨에서 feedback 구조가 먼저 정의된다.
- UI 구현 전이라도 데이터 모델이 고정된다.

### P2. 후속 고도화

#### 7. precision 측정용 golden corpus 도입

배경:
신뢰도는 감으로 운영하면 안 되고, 최소한 대표 회로 세트 기준 precision을 봐야 한다.

해야 할 일:

- 회로 샘플 20~30개 선정
- 샘플별 expected issue set 정의
- critical / warning / review precision 구분

완료 조건:

- 회귀 테스트와 별도로 “정답 라벨” 테스트 세트가 생긴다.

#### 8. sourceQuality를 part master / datasheet source와 더 직접 연결

배경:
지금은 일부 기본 추론만 들어간 상태다.

해야 할 일:

- part master source quality를 `ProjectAuditIssueEvidence.sourceQuality`로 연결
- datasheet URL 품질과 일관되게 매핑

완료 조건:

- 공식 데이터시트 기반 경고와 generic 경고가 데이터 레벨에서 구분된다.

## 구현 순서 제안

1. `kicad-real-projects` 실패 5건 정리
2. 핵심 룰 5개 evidence 보강
3. review UI 상세 카드 확장
4. generic/fallback 표시 추가
5. issue feedback 상태 모델 정의
6. 외부 전달 포맷 문서화
7. golden corpus 도입

## 완료 기준

이 명세는 아래 조건을 만족하면 1차 완료로 본다.

- `tsc --noEmit` 통과
- 핵심 테스트 통과
- 핵심 룰 5개 이상이 구체 evidence를 가짐
- UI에서 각 경고의 확실도와 근거가 보임
- generic/fallback 해석 여부를 사용자가 알 수 있음
- `kicad-real-projects.test.ts`의 현재 실패가 정리됨

## 권장 검증 묶음

```bash
npx tsc --noEmit
node --test --experimental-strip-types --loader ./tests/alias-loader.mjs tests/engine-i18n.test.ts tests/issue-utils.test.ts tests/build-lightweight-validation-json.test.ts tests/datasheet-review-payload.test.ts
node --test --experimental-strip-types --loader ./tests/alias-loader.mjs tests/kicad-import.test.ts tests/kicad-real-projects.test.ts tests/kicad-reference-fixtures.test.ts
```

## 메모

- 지금 단계에서 가장 중요한 건 “규칙을 더 많이 넣는 것”이 아니다.
- 가장 중요한 건 “이미 있는 경고를 왜 믿어야 하는지 설명하는 것”이다.
- 그래서 다음 작업의 중심은 규칙 수 확장이 아니라 `confidence + evidence + sourceQuality + user feedback` 정착이다.
