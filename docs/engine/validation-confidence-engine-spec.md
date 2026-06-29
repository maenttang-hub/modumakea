# Validation Confidence Engine Spec

## 목적

이 문서는 검증 엔진이 `rule 발생 여부`만 내는 단계를 넘어, **이 이슈를 왜 믿어야 하는지**를 일관되게 설명하도록 만드는 기준선이다.

핵심 목표는 세 가지다.

1. 같은 성격의 이슈는 어디서 생성되든 같은 `confidence semantics`를 쓴다.
2. `confirmed`와 `needs-review`가 같은 톤으로 섞이지 않도록 엔진 레벨에서 구분한다.
3. UI 카드, validation JSON, AI payload가 같은 근거 구조를 공유한다.

## 현재 상태

현재 파이프라인의 큰 방향은 맞다.

- `runProjectDrc()`가 audit / netlist / formal / imported schematic checks를 잘 묶고 있다.
  - [src/lib/drc-engine.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/drc-engine.ts:1594)
- `ProjectAuditIssue`에는 `confidence`와 `evidence`가 이미 들어간다.
- review UI와 lightweight / datasheet payload에도 기본 근거 필드는 전달되고 있다.
- v3 parser public entrypoint는 legacy import 경로와 분리되어 있다.
  - [src/lib/parse-kicad-for-validation.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/parse-kicad-for-validation.ts:1)

## 현재 문제

### 1. rule catalog는 있지만 rule policy 객체가 없다

지금은 rule ID와 설명은 있지만, 아래 성격을 함께 정의하는 중앙 정책 계층이 없다.

- 기본 severity
- 기본 confidence
- false-positive risk
- suppress 가능 여부
- evidence 최소 요구 수준

이 때문에 같은 유형의 issue라도 생성 위치에 따라 톤이 흔들릴 수 있다.

### 2. confidence / evidence 추론이 아직 범용 heuristic 성격이 강하다

`createProjectAuditIssue()` 계열에서 기본 근거를 자동 생성하지만, 아직 rule-specific policy 기반이라기보다 범용 추론에 가깝다.

- [src/lib/engine-i18n.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/engine-i18n.ts:618)

### 3. issue 생성이 여러 파일에 퍼져 있다

`createProjectAuditIssue()` 호출 지점이 많아지면서, 새 rule 추가 시 품질 기준이 조용히 흔들릴 여지가 있다.

문제는 단순 중복이 아니라 아래의 불일치다.

- 어떤 rule은 `visualTargets`가 있고 어떤 rule은 없다
- 어떤 rule은 `observedFacts`가 충분하고 어떤 rule은 거의 없다
- 어떤 rule은 `confirmed`인데도 확인 방법이 모호하다

## 설계 원칙

### 1. AI finding은 단독으로 `confirmed`가 되지 않는다

AI 또는 imported interpretation이 관여한 판단은 단독으로 `confirmed`를 만들지 않는다.

- AI only: 최대 `needs-review`
- AI + netlist / formal corroboration: `strong-inference` 가능
- 직접 netlist / solver / formal evidence가 있는 경우에만 `confirmed`

### 2. confidence는 문장용 장식이 아니라 계약이다

`confirmed`, `strong-inference`, `needs-review`, `informational`은 UI 문구가 아니라 데이터 계약으로 본다.

- validation JSON
- review UI card
- AI payload
- 외부 전달용 integrated snapshot

위 모든 출력이 같은 의미 체계를 써야 한다.

### 3. evidence 최소 요건을 confidence별로 강제한다

- `confirmed`
  - `observedFacts` 필수
  - `visualTargets` 필수
  - 가능하면 `affectedNets` 또는 `affectedComponents` 포함
- `strong-inference`
  - `observedFacts` 필수
  - `howToVerify` 권장
- `needs-review`
  - `assumptions` 필수
  - `howToVerify` 필수
- `informational`
  - 요약 중심 허용

## 해야 할 일

### 1. `RuleConfidencePolicy` 도입

rule별 정책 객체를 추가한다.

추천 형태:

```ts
type RuleConfidencePolicy = {
  ruleId: string;
  defaultSeverity: 'error' | 'warning' | 'info';
  defaultConfidence: 'confirmed' | 'strong-inference' | 'needs-review' | 'informational';
  falsePositiveRisk: 'low' | 'medium' | 'high';
  suppressible: boolean;
  evidenceRequirements: {
    observedFactsMin?: number;
    requireVisualTargets?: boolean;
    requireAssumptions?: boolean;
    requireHowToVerify?: boolean;
  };
};
```

최소한 상위 critical rule부터 먼저 넣는다.

### 2. `createDrcIssue()` factory 추가

현재 흩어진 issue 생성 방식을 한 번 더 감싸는 factory를 만든다.

역할:

- rule policy 조회
- 기본 confidence / severity 주입
- evidence 최소 요건 검사
- `visualTargets`, `affectedComponents`, `affectedNets` 정규화
- JSON / UI / AI payload에서 같은 semantics 보장

방향:

- 기존 `createProjectAuditIssue()`를 바로 없애지 않는다
- `createDrcIssue()`를 추가하고, 신규 rule과 핵심 rule부터 점진 마이그레이션한다

### 3. confidence별 테스트 강제

테스트에서 아래 계약을 강제한다.

- `confirmed`는 `observedFacts + visualTargets`가 없으면 실패
- `needs-review`는 `assumptions + howToVerify`가 없으면 실패
- `AI finding only`는 `confirmed`가 되면 실패

이건 단위 테스트뿐 아니라 policy regression test로도 묶는 게 좋다.

### 4. legacy import audit와 v3 validation 책임 경계 명문화

현재 public entrypoint 분리는 잘 되어 있다.

- [src/lib/parse-kicad-for-validation.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/parse-kicad-for-validation.ts:1)

이제 문서와 코드 주석에서 아래를 더 명확히 한다.

- legacy imported audit는 “연결 누락 / 고립 / 구조 경고” 중심
- v3 validation은 “검증 모델 기반 electrical reasoning” 중심
- 둘이 섞일 때 confidence 상한선은 무엇인지

### 5. imported schematic checks에도 import-confidence 근거 포함

현재 imported audit는 경고를 잘 만들지만, “이 판단이 얼마나 구조 복원에 의존하는지”가 충분히 드러나지 않는다.

- [src/lib/imported-schematic-audit.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/imported-schematic-audit.ts:43)

추가할 것:

- import source quality
- imported mapping confidence
- fallback / unresolved dependency 여부
- `why conservative` 설명

즉 imported audit도 단순 warning 나열이 아니라 confidence-bearing finding이 되어야 한다.

### 6. 엔진 인덱스 계층 추가

rule가 늘수록 `net`, `component`, `pin`, `manualConnections` 반복 lookup 비용이 커진다.

추가할 인덱스 예:

- component by instanceId
- component by templateId
- net by id
- pin-to-net lookup
- board-pin-to-component lookup
- alias / imported mapping lookup

목표는 성능 최적화만이 아니라, rule 구현이 같은 조회 방식을 재사용하게 해서 결과 일관성을 높이는 것이다.

## 구현 순서 제안

1. `RuleConfidencePolicy` 스키마와 기본 registry 추가
2. `createDrcIssue()` factory 추가
3. 상위 critical rule 20개를 factory 기반으로 이전
4. confidence contract regression test 추가
5. imported schematic audit에 import-confidence 근거 주입
6. validation JSON / UI card / AI payload confidence semantics 교차 점검
7. lookup index 계층 도입

## 완료 조건

- 상위 20개 critical rule에 policy와 evidence regression test가 있다.
- AI finding은 단독으로 `confirmed`가 되지 않는다.
- validation JSON과 UI 카드가 같은 confidence semantics를 쓴다.
- `confirmed`와 `needs-review`의 evidence 최소 요건이 테스트로 강제된다.
- imported schematic audit도 source quality / import confidence를 issue 근거로 노출한다.

## 실행 메모

- 이 문서는 rule 확장 명세가 아니다.
- 우선순위는 “더 많이 잡기”보다 “이미 잡은 경고를 왜 믿어야 하는지 설명하기”다.
- 큰 파일 분해 리팩토링은 별도 문서로 미뤄도 되지만, confidence contract는 베타 전에 기준선이 잡혀야 한다.

## 관련 문서

- [docs/remaining-work-spec.md](/Users/gimdong-il/Desktop/프로그램/modumake/docs/remaining-work-spec.md)
- [docs/drc-audit-reality-check.md](/Users/gimdong-il/Desktop/프로그램/modumake/docs/drc-audit-reality-check.md)
- [docs/v3-kicad-validation-pipeline.md](/Users/gimdong-il/Desktop/프로그램/modumake/docs/v3-kicad-validation-pipeline.md)
