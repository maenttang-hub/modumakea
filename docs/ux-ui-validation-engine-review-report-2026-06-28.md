# UX/UI 및 검증 엔진 점검 보고서

작성일: 2026-06-28  
기준 저장소: `/Users/gimdong-il/Desktop/프로그램/modumake`  
대상: ModuMake 에디터, 검토 패널, 리포트 화면, DRC/검증 엔진

## 1. 목적

이 문서는 현재 ModuMake의 UX/UI와 검증 엔진 상태를 객관적으로 정리하고,
다음 작업자가 바로 실행할 수 있도록 개선 지침과 수용 기준을 명세화한다.

초점은 아래 네 가지다.

1. 사용자가 검증 결과를 신뢰할 수 있는가
2. 화면의 정보 위계가 검토 업무에 맞는가
3. 검증 엔진의 테스트 기준선이 현재 충분한가
4. 다음 수정 범위를 과하게 넓히지 않고 닫을 수 있는가

## 2. 점검 범위

### 2.1 확인한 제품 화면

- `/editor`
- `/report`
- 데스크톱 기본 viewport
- 모바일 폭 390px viewport

### 2.2 확인한 주요 코드 경로

- `src/hooks/use-validation-report.ts`
- `src/lib/drc-engine.ts`
- `src/lib/circuit-netlist.ts`
- `src/lib/formal-verifier.ts`
- `src/lib/drc-issue-factory.ts`
- `src/lib/drc-issue-policy.ts`
- `src/components/sidebar-right/ai-review-panel.tsx`
- `src/components/dashboard/validation-panel.tsx`
- `src/components/report/project-verification-report-page.tsx`
- `src/components/canvas/imported-schematic-overlay.tsx`
- `src/components/layout/title-bar.tsx`
- `src/components/layout/workspace-shell.tsx`
- `src/components/sidebar-left/sidebar-left.tsx`
- `src/components/sidebar-right/sidebar-right.tsx`

## 3. 실행 검증 결과

| 항목 | 결과 | 해석 |
| --- | --- | --- |
| `npx tsc --noEmit` | 통과 | 타입 기준으로는 붕괴 없음 |
| `npm run lint` | 0 errors, 24 warnings | 빌드는 막지 않지만 정리 필요 |
| `npm run test:validation:baseline` | 244 passed | 핵심 검증 회귀 기준선 통과 |
| `npm run test:validation:extended` | baseline 244 passed + extended 106 passed | KiCad/import/snapshot 계층까지 통과 |
| `npm test` | 720 passed | 전체 테스트 기준선 통과 |
| `npm run build` | 성공 | 프로덕션 빌드 가능 |

### 3.1 검증 신뢰도 해석

현재 검증 엔진은 대표 회로 패턴에 대한 회귀 안정성은 높다.

확인된 강점:

- netlist 기반 전원/GND short 검사
- I2C pull-up, mixed-voltage, level shifter 경로 검사
- LED 전류 제한, flyback diode, resistor/capacitor derating 계열 검사
- op-amp, ADC, ADS1x15, MCP3208, HX711 등 대표 아날로그/계측 회로 검사
- generated code와 회로 핀 사용 간 formal verifier 계층
- KiCad import → netlist → DRC → validation JSON 경로
- snapshot/serialization 회귀 테스트

제한:

- 실제 PCB layout 의존 항목은 아직 자동 검증 범위 밖이다.
- fallback/generic mapping 비중이 높은 imported schematic은 보수적으로 해석해야 한다.
- 일부 UI 경로는 엔진이 지원하는 설정값을 아직 제품 화면에서 충분히 연결하지 못한다.

## 4. UX/UI 현 상태

### 4.1 좋은 점

현재 에디터는 첫 화면에서 제품의 방향을 비교적 명확하게 보여준다.

- 사용자가 회로를 열면 바로 리뷰 중심 작업 공간으로 진입한다.
- 좌측은 회로 구조, 중앙은 schematic, 우측은 검토 결과로 역할이 나뉜다.
- 리포트 페이지는 에디터 우측 패널보다 시각적으로 읽기 쉽다.
- imported schematic의 `원본 / 정리` 전환은 제품 방향과 맞다.
- 이슈 카드가 근거, 가정, 확인 방법, 관련 부품/net으로 나뉘어 있어 리뷰 도구로서의 구조는 좋다.

### 4.2 주요 UX 문제

#### P1. 에디터와 리포트의 이슈 카운트 불일치

실제 화면에서 같은 `Arduino_hat` 프로젝트가 다음처럼 다르게 보였다.

- 에디터 우측 AI 감수 패널: `오류 10 / 경고 22`
- 리포트 페이지: `Errors 8 / Warnings 11 / Must fix 8 / Review recommended 11`

원인 후보:

- 에디터는 `useValidationReport()`로 현재 store 상태를 직접 검증한다.
- 리포트는 `localStorage`의 `WORKSPACE_STORAGE_KEY`를 읽어 별도로 `runProjectDrc()`를 다시 실행한다.
- 자동 저장 타이밍 또는 현재 탭의 임시 상태가 리포트 새 창에 즉시 반영되지 않을 수 있다.

관련 위치:

- `src/hooks/use-validation-report.ts`
- `src/components/report/project-verification-report-page.tsx`
- `src/components/layout/title-bar.tsx`

사용자 영향:

- “어떤 숫자가 진짜인가”를 판단하기 어렵다.
- 검증 엔진 자체가 틀린 것처럼 보일 수 있다.
- PDF/보고서 신뢰도가 낮아진다.

#### P1. React 중복 key 오류

브라우저 콘솔에서 React 중복 key 오류가 반복적으로 확인됐다.

대표 메시지:

- `structured-pin-GND`
- `structured-pin-SCL`
- `Affected component: ...`
- `Rule id: routing.unrouted-component`

원인 후보:

- imported schematic pin 렌더링에서 `pinId`만 key로 사용한다.
- 관측 사실/가정 배열 렌더링에서 문자열 자체를 key로 사용한다.
- 같은 부품 안에 같은 이름의 핀 또는 같은 관측 사실 문구가 반복될 수 있다.

관련 위치:

- `src/components/canvas/imported-schematic-overlay.tsx`
- `src/components/sidebar-right/ai-review-panel.tsx`
- `src/components/dashboard/validation-panel.tsx`
- `src/components/report/project-verification-report-page.tsx`

사용자 영향:

- 화면이 당장 보이더라도 React reconciliation이 불안정해진다.
- 일부 핀/관측 사실이 중복되거나 누락될 수 있다.
- imported schematic처럼 신뢰가 중요한 화면에서 문제를 만들 수 있다.

#### P1. AI 감수 패널의 `통과` 수치가 실제 검증 수치가 아님

현재 우측 AI 감수 패널은 아래 계산을 사용한다.

```ts
const passedCount = Math.max(0, 12 - errorCount - warningCount);
```

이 값은 실제 엔진의 `verifiedCount`나 통과한 룰 수와 직접 연결되어 있지 않다.

사용자 영향:

- `통과`가 실제 검증 통과 수처럼 보인다.
- 검증 결과에 대한 신뢰 지표로 오해할 수 있다.

#### P2. 모바일/좁은 폭 레이아웃 깨짐

390px viewport에서 확인한 현상:

- 상단 액션 버튼이 화면 밖으로 밀림
- 우측 리뷰 패널이 잘림
- 캔버스가 데스크톱 크기를 유지함
- 좌/우 패널이 drawer로 전환되지 않음

원인:

- `WorkspaceShell`이 좌측/중앙/우측 3열 구조를 유지한다.
- `SidebarLeft`, `SidebarRight`가 고정 폭을 가진다.
- `TitleBar` 액션 영역이 접히거나 overflow menu로 바뀌지 않는다.

해석:

- 데스크톱 도구로 한정한다면 치명적인 문제는 아니다.
- 다만 최소 지원 폭을 명시하지 않으면 깨진 화면으로 인식된다.

#### P2. 정보 위계가 다소 촘촘함

우측 패널은 아래 정보가 한 화면에 동시에 나온다.

- `AI Review`
- `Imported schematic`
- 분석 완료 문구
- 파일 상태
- 오류/경고/통과 숫자
- 감수 항목 카드
- 근거/가정/확인 방법

장점:

- 많은 정보를 빠르게 볼 수 있다.

단점:

- 초보 사용자는 “지금 무엇을 먼저 해야 하는지”가 흐려진다.
- 오류/경고 숫자와 confidence 기반 분류가 혼재한다.

## 5. 검증 엔진 현 상태

### 5.1 구조

현재 `runProjectDrc()`는 크게 아래 계층을 합친다.

1. `auditProjectDesign()`
2. `analyzeCircuitNetlist()`
3. `verifyCircuitCodeConsistency()`
4. code drive state를 반영한 netlist 재분석
5. smart linter 계층
6. imported schematic baseline audit
7. deduplication

예외 처리 방식:

- 하위 단계가 실패해도 전체 검증을 죽이지 않는다.
- runtime warning issue로 변환해 결과에 포함한다.

평가:

- 사용자에게 빈 결과를 보여주는 것보다 낫다.
- 다만 runtime warning이 실제 화면에서 눈에 잘 띄는지 별도 확인이 필요하다.

### 5.2 evidence/confidence 정책

`createDrcIssue()`는 policy가 있는 룰에 대해 아래를 강제한다.

- 기본 severity
- 기본 confidence
- 관측 사실 최소 수
- visual target 필요 여부
- assumption 필요 여부
- how-to-verify 필요 여부

평가:

- 엔진 신뢰도 관리 방향은 좋다.
- 하지만 모든 룰이 동일한 정책 강제를 받는 것은 아니다.

룰 카탈로그와 정책 비교 결과:

- `CORE_DRC_RULES`: 28개
- `RULE_CONFIDENCE_POLICIES`: 35개
- 카탈로그 ID와 policy ID가 1:1로 대응하지 않음

해석:

- policy가 세부 rule ID에 붙는 구조라서 그 자체가 문제는 아니다.
- 다만 문서/화면에서 “전체 룰이 동일한 evidence 정책으로 검증된다”고 표현하면 과장이다.

### 5.3 테스트 커버리지

테스트는 현재 상당히 넓다.

확인된 범위:

- 회로 netlist
- DRC engine
- datasheet rules
- real-board KiCad fixture
- virtual circuit E2E
- validation regression scenario
- imported schematic render/serialize/hydrate
- project verification report
- validation snapshot/diff
- API route 일부

현재 부족한 축:

- 브라우저 기반 UI 회귀 테스트
- 콘솔 오류 검출 테스트
- 에디터/리포트 카운트 일치 테스트
- 모바일/좁은 폭 visual regression
- 실제 사용자가 이슈 상태를 `수정 완료`, `오탐`, `모듈 포함` 처리했을 때 리포트와 공유되는지 검증

## 6. 개선 명세

### 6.1 P1-A: 에디터/리포트 검증 결과 일치

#### 목표

같은 프로젝트 상태에서 에디터, 우측 패널, 하단바, 리포트 페이지, PDF가 동일한 이슈 집계를 보여야 한다.

#### 변경 범위

- `TitleBar`의 `/report` 단순 링크 제거 또는 wrapper action화
- 리포트 열기 직전에 현재 workspace snapshot 저장
- 가능하면 리포트가 `localStorage`를 직접 추론하지 않고 명시적 snapshot을 읽도록 정리
- 에디터와 리포트가 같은 classification 함수를 공유하도록 정리

#### 수용 기준

- 같은 프로젝트에서 아래 값이 일치해야 한다.
  - error count
  - warning count
  - info count
  - must-fix count
  - review-recommended count
- 리포트 새 창을 연 직후에도 카운트가 일치해야 한다.
- PDF 저장 경로에서도 같은 카운트가 유지되어야 한다.
- 테스트에 “에디터 audit fixture와 report snapshot audit 결과가 동일한 count를 낸다”는 케이스를 추가한다.

#### 비목표

- 리포트 디자인 전면 개편
- cloud validation history 전체 재설계

### 6.2 P1-B: React key 안정화

#### 목표

브라우저 콘솔에서 중복 key 오류가 없어야 한다.

#### 변경 범위

- imported schematic structured pin key에 index 또는 native pin number/좌표 포함
- observed facts / assumptions 렌더링 key에 index 포함
- related component/net label 렌더링에서 같은 label 반복 가능성 처리

#### 권장 key 형식

```ts
`${symbol.instanceId}-structured-pin-${anchor.pinId}-${anchor.number ?? 'na'}-${anchorIndex}`
```

문자열 배열 렌더링:

```ts
items.map((item, index) => <div key={`${item}-${index}`}>...</div>)
```

#### 수용 기준

- `/editor` 진입 후 console error에 React duplicate key 경고가 없어야 한다.
- `/report` 진입 후 console error에 React duplicate key 경고가 없어야 한다.
- `Arduino_hat` 같은 중복 GND/SCL 핀 fixture에서 재현되지 않아야 한다.

#### 비목표

- imported schematic 렌더러 구조 전면 개편

### 6.3 P1-C: `통과` 지표 정직화

#### 목표

우측 패널의 `통과` 값이 실제 엔진 결과와 일치하거나, 오해를 만들지 않도록 제거한다.

#### 선택지

1. `audit.verifiedCount`를 표시한다.
2. `통과` 대신 `정보` 또는 `검증 제한`으로 바꾼다.
3. MVP에서는 해당 카드를 제거하고 오류/경고/검토 권장만 유지한다.

#### 권장안

MVP에서는 3번이 가장 안전하다.

이유:

- 현재 `verifiedCount`의 의미가 사용자에게 충분히 설명되어 있지 않다.
- 임의 기준의 `통과`는 검증 엔진 신뢰도를 해친다.

#### 수용 기준

- 우측 패널에 임의 계산 기반 pass count가 없어야 한다.
- 리포트와 패널의 용어가 충돌하지 않아야 한다.

### 6.4 P2-A: 최소 지원 viewport 명세

#### 목표

에디터가 어떤 화면 폭을 공식 지원하는지 명시한다.

#### 선택지

1. 데스크톱 전용으로 정의
2. 태블릿까지 지원
3. 모바일까지 지원

#### 권장안

현재 단계에서는 데스크톱 전용으로 정의한다.

권장 기준:

- 공식 최소 폭: 1024px
- 권장 폭: 1280px 이상
- 768px 이하에서는 “데스크톱에서 사용 권장” 안내 또는 간소화 모드

#### 수용 기준

- 1024px 이상에서 상단바/좌우 패널/캔버스가 겹치지 않는다.
- 768px 이하에서는 깨진 3열 화면 대신 안내 또는 drawer 구조가 나온다.
- 모바일 지원을 당장 목표로 삼지 않는다.

### 6.5 P2-B: 우측 검토 패널 정보 위계 정리

#### 목표

사용자가 “무엇을 먼저 해야 하는지”를 즉시 알 수 있게 한다.

#### 권장 구조

1. 상단: 결정 상태
   - 수정 필요
   - 검토 필요
   - 통과
2. 그 아래: 우선 조치 항목
   - 확정 오류
   - 강한 추정
3. 접힌 영역: 근거 상세
   - 관측 사실
   - 가정
   - 확인 방법
4. 하단: 필터
   - official
   - partial
   - generic
   - fallback

#### 수용 기준

- 한 카드의 기본 상태에서 제목, severity/confidence, 한 줄 근거, 조치 버튼만 보여야 한다.
- 관측 사실/가정/확인 방법은 기본 접힘 또는 secondary 영역이어야 한다.
- 오류/경고와 confidence가 섞여 보일 때 의미가 구분되어야 한다.

### 6.6 P2-C: ADC 설정 UI 연결 상태 정리

#### 목표

엔진이 지원하는 ADC configuration이 제품 화면에서 실제로 입력/저장/리포트까지 이어지는지 명확히 한다.

현재 관찰:

- `runProjectDrc()`는 `adcConfigurations`를 받을 수 있다.
- 테스트는 `adcConfigurations` 기반 케이스를 포함한다.
- 현재 UI store/report 경로에서 이를 직접 전달하는 흐름은 약해 보인다.

#### 수용 기준

- 사용자가 ADS1x15/MCP3208 등 ADC 설정을 바꿀 수 있는 UI가 있어야 한다.
- 설정값이 store에 저장되어야 한다.
- 에디터 검증과 리포트 검증이 같은 ADC 설정을 사용해야 한다.
- 설정이 없을 때는 보수적 기본값이라는 표시가 있어야 한다.

## 7. 우선순위

### 먼저 닫을 것

1. 에디터/리포트 카운트 일치
2. React duplicate key 제거
3. 임의 `통과` 수치 제거 또는 정직화

이 세 가지는 사용자 신뢰와 직접 연결된다.

### 그다음

4. 최소 지원 viewport 명세
5. 우측 검토 패널 정보 위계 정리
6. ADC 설정 UI 연결

### 나중에

7. 리포트 디자인 세부 개선
8. 모바일 전체 지원
9. 검증 룰 추가

## 8. 작업 지침

### 8.1 과한 확장을 피하기 위한 기준

- 이번 개선의 목표는 새 검증 룰 추가가 아니다.
- 엔진을 새로 짜지 않는다.
- UI 디자인을 전면 교체하지 않는다.
- 먼저 “같은 결과가 같은 숫자로 보이는지”와 “콘솔 오류가 없는지”를 닫는다.

### 8.2 PR 단위 권장

PR 1:

- 리포트 snapshot 일치
- 카운트 일치 테스트

PR 2:

- React key 안정화
- browser console error 체크

PR 3:

- AI 감수 패널 지표 정리
- UX copy 정리

PR 4:

- 최소 viewport 정책
- 좁은 폭 대응

### 8.3 테스트 추가 권장

- report count consistency test
- duplicate key regression fixture
- Playwright 기반 smoke test
  - `/editor` 로드
  - console error 없음
  - `/report` 로드
  - editor/report count 일치
- viewport smoke test
  - 1280px
  - 1024px
  - 390px 안내 또는 drawer 여부

## 9. 최종 판단

현재 ModuMake의 검증 엔진은 대표 회로 패턴에 대한 회귀 안정성이 높다.
테스트 수와 범위도 단순 프로토타입 수준을 넘는다.

그러나 사용자가 보는 화면에서는 아직 신뢰를 깎는 문제가 남아 있다.

가장 중요한 문제는 아래 세 가지다.

1. 같은 프로젝트의 이슈 숫자가 에디터와 리포트에서 다르게 보인다.
2. imported schematic 화면에서 React key 오류가 반복된다.
3. `통과`처럼 보이는 일부 지표가 실제 엔진 결과와 직접 연결되어 있지 않다.

따라서 다음 작업은 검증 엔진 확장이 아니라
**검증 결과 표현의 일관성, 렌더 안정성, 지표 정직성**을 먼저 닫는 것이 맞다.
