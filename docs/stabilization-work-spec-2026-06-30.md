# ModuMake 안정화 작업 명세서

작성일: 2026-06-30  
대상 저장소: `/Users/gimdong-il/Desktop/프로그램/modumake`

## 1. 목적

현재 ModuMake는 검증 엔진과 KiCad import 회귀 테스트가 상당히 갖춰져 있지만, 공식 빌드, E2E, 작업 트리 정리, 제품 범위 통제가 아직 안정화 기준에 못 미친다.

이 문서는 새 기능 추가가 아니라, 현재 구현을 신뢰 가능한 개발/배포 단위로 정리하기 위해 해야 할 일을 명세한다.

## 2. 전체 우선순위

1. 공식 빌드 기준 복구
2. E2E smoke 테스트 복구
3. 작업 트리와 산출물 정리
4. MVP 노출 범위 고정
5. 서버 파일 접근/번들 추적 경고 해소
6. 큰 핵심 모듈의 변경 규칙 수립
7. 운영 보안/쿼터 기준 명확화
8. 문서와 실제 상태 동기화

## 2.1 진행 기록

2026-06-30 안정화 패스에서 아래 항목을 처리했다.

- 공식 빌드 기준을 Next 16 기본 Turbopack 빌드로 전환했다.
- `npm run build`가 경고 없이 통과하도록 서버 파일 경로 trace 경고를 해소했다.
- E2E smoke 테스트의 UI 문구 mismatch를 수정했다.
- `tmp/`를 Git 무시 대상으로 돌려 일회성 산출물이 상태 목록에 섞이지 않게 했다.
- `.DS_Store`와 오래된 `test-results` 산출물을 정리했다.
- Node 22 기준을 `.nvmrc`, README, CI 기준과 맞췄다.
- MVP 노출 범위를 `docs/review-mvp-scope.md`에 분리해 명시했다.
- 핵심 엔진 변경 규칙을 `docs/core-engine-change-rules.md`에 분리해 명시했다.
- production 환경에서 compile/shared token과 artifact download secret에 예시 placeholder 값을 쓰지 못하도록 정책 방어와 테스트를 추가했다.
- `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run test:validation:baseline`, `npm run test:validation:extended`를 재실행해 모두 통과를 확인했다.

## 3. 작업 항목별 명세

### 3.1 공식 빌드 기준 복구

#### 현재 상태

- `npm run build`는 `next build --webpack`을 실행한다.
- 현재 환경에서 webpack 빌드는 Next/webpack 내부 `WasmHash` 오류로 실패한다.
- `next build` 기본 Turbopack 경로는 성공한다.
- CI는 `npm run build`를 사용하므로 현재 기준으로는 CI 실패 가능성이 높다.

#### 해야 할 일

1. 공식 빌드 경로를 하나로 정한다.
   - 권장: Next 16 기본값인 Turbopack을 공식 빌드로 채택한다.
   - 대안: webpack을 반드시 유지해야 한다면, Next/webpack/Node 조합 오류를 별도 이슈로 재현하고 해결한다.
2. `package.json`의 `build` 스크립트에서 `--webpack` 강제를 제거할지 결정한다.
3. CI 문서와 README의 품질 체크 명령을 실제 통과하는 기준으로 맞춘다.
4. Node 버전을 명시한다.
   - CI는 Node 22를 사용 중이다.
   - 로컬도 Node 22 LTS 또는 프로젝트가 정한 버전을 사용하도록 `.nvmrc` 또는 문서에 고정한다.

#### 완료 조건

- `npm run build`가 로컬과 CI에서 통과한다.
- 빌드 실패 시 앱 코드 문제인지 도구chain 문제인지 구분 가능한 로그가 남는다.
- README의 빌드 안내와 CI가 같은 명령을 기준으로 삼는다.

#### 하지 말 것

- 실패하는 webpack 빌드를 그대로 두고 "Turbopack으로 직접 돌리면 된다"는 식으로 운영하지 않는다.
- 빌드 실패를 테스트 통과로 덮지 않는다.

### 3.2 E2E Smoke 테스트 복구

#### 현재 상태

- Playwright E2E는 5개 중 4개 통과, 1개 실패한다.
- 실패 원인은 기능 오류가 아니라 UI 문구 변경과 테스트 기대값 불일치다.
- 실제 UI: `KiCad 파일을 올려서 바로 리뷰 시작`
- 테스트 기대값: `KiCad 회로도를 올려서 바로 리뷰 시작`

#### 해야 할 일

1. 테스트 기대 문구를 현재 UI 문구로 갱신한다.
2. 가능하면 긴 문구 직접 매칭보다 역할/테스트 id 기반 검증으로 바꾼다.
3. 빈 워크스페이스, 복원된 프로젝트, imported schematic, report 이동 흐름을 계속 smoke 범위에 둔다.
4. E2E 실패 시 실제 화면 스냅샷을 확인하는 절차를 문서화한다.

#### 완료 조건

- `npm run test:e2e`가 통과한다.
- 테스트가 UI 카피 변경에 과도하게 취약하지 않다.
- 테스트 이름이 실제 검증 목적을 설명한다.

#### 하지 말 것

- 실패하는 assertion만 삭제하지 않는다.
- 브라우저 콘솔 오류 수집은 유지한다.

### 3.3 작업 트리와 산출물 정리

#### 현재 상태

- tracked 변경 파일이 많고, 미추적 파일도 많다.
- `tmp/` 산출물이 Git 상태에 노출되어 있다.
- `tmp/` 크기가 약 234MB다.
- `.DS_Store` 파일이 여러 디렉터리에 존재한다.

#### 해야 할 일

1. `tmp/`를 커밋 대상에서 제외할지 결정한다.
   - 권장: 일반 산출물은 `.gitignore`에 추가한다.
   - 예외: golden corpus로 보존할 파일만 `config/golden-corpus/` 같은 명시적 위치로 승격한다.
2. `.DS_Store` 파일은 추적하지 않는다.
3. 미추적 파일을 세 범주로 분류한다.
   - 제품 코드
   - 테스트/fixture/golden corpus
   - 일회성 산출물
4. 커밋을 기능 단위로 쪼갠다.
   - 빌드/CI
   - E2E
   - KiCad golden corpus
   - PCB DRC/report
   - UI shell

#### 완료 조건

- `git status`가 리뷰 가능한 수준으로 줄어든다.
- 일회성 산출물이 Git 상태에 나타나지 않는다.
- 각 커밋이 독립적으로 설명 가능하다.

#### 하지 말 것

- 300개 이상의 미추적 파일을 한 번에 커밋하지 않는다.
- `tmp/` 전체를 근거 없이 golden data로 취급하지 않는다.

### 3.4 MVP 노출 범위 고정

#### 현재 상태

- 기본 제품 표면은 `review-mvp`다.
- 코드에는 PCB, manufacturing, compile, Launch Desk 등 확장 기능이 함께 들어 있다.
- 일부 기능은 UI에서 숨겨져도 빌드와 API에는 영향을 준다.

#### 해야 할 일

1. 현재 베타/MVP에서 실제로 노출할 기능을 명시한다.
   - 권장 MVP: schematic review, KiCad schematic import, validation panel, report export.
   - 보류 후보: manufacturing, cloud compile, full PCB authoring, Launch Desk.
2. `review-mvp`에서 숨기는 기능과 완전히 비활성화할 기능을 구분한다.
3. 숨겨진 기능이 빌드, 라우트, 상태 저장소에 주는 영향을 점검한다.
4. README와 제품 문구에서 PCB 제조 가능성을 과장하지 않는다.

#### 완료 조건

- MVP에서 사용자가 실제로 볼 수 있는 기능 목록이 문서화된다.
- 보류 기능은 "숨김", "내부 실험", "운영 비활성" 중 하나로 분류된다.
- MVP 화면에서 접근 불가능한 기능이 품질 게이트를 불필요하게 깨지 않는다.

#### 하지 말 것

- MVP를 유지한다고 말하면서 모든 실험 기능을 같은 품질 기준 없이 계속 추가하지 않는다.
- review-first 제품을 full PCB CAD처럼 표현하지 않는다.

### 3.5 서버 파일 접근과 번들 추적 경고 해소

#### 현재 상태

- Turbopack 빌드는 성공하지만 서버 파일 접근 경로가 너무 넓다는 경고가 난다.
- 원인은 `process.cwd()`와 동적 path 조합, 동적 read/write 경로다.
- 주요 위치는 compile queue/result/artifact store와 KiCad PCB DRC route다.

#### 해야 할 일

1. 파일 저장소 경로를 프로젝트 루트 전체가 아니라 고정 하위 디렉터리로 제한한다.
2. 동적 파일 경로는 입력값 검증과 path traversal 차단을 명확히 한다.
3. Turbopack이 과도하게 trace하지 않도록 정적 경로 또는 ignore 주석 사용을 검토한다.
4. file store는 개발용/단일 인스턴스용임을 문서에 표시한다.
5. 운영 환경에서는 Supabase/object storage 같은 외부 저장소를 우선하도록 기준을 정한다.

#### 완료 조건

- `next build`에서 broad file pattern 경고가 사라지거나, 의도된 예외로 문서화된다.
- 서버 저장소 경로가 `.modumake/` 같은 제한된 루트 바깥으로 나가지 않는다.
- 운영 모드에서 로컬 파일 저장소 사용 여부가 명확하다.

#### 하지 말 것

- 경고를 무시한 채 배포하지 않는다.
- 사용자 입력을 파일 경로에 직접 반영하지 않는다.

### 3.6 큰 핵심 모듈의 변경 규칙 수립

#### 현재 상태

- `circuit-netlist.ts`, `kicad-sch-parser.ts`, `datasheet-rules.ts`가 매우 크다.
- 테스트는 많지만, 새 규칙을 계속 한 파일에 추가하면 회귀 원인 추적이 어려워진다.

#### 해야 할 일

1. 큰 파일에 새 기능을 추가할 때 최소 기준을 정한다.
   - 새 rule은 rule id, evidence, confidence, 테스트를 함께 추가한다.
   - fallback/generic 판단은 UI에 드러나야 한다.
2. 새 기능이 독립 도메인이라면 별도 모듈로 분리한다.
3. 기존 대형 파일은 당장 대규모 리팩터링하지 말고, 새 변경부터 경계를 지킨다.
4. parser/render/validation 책임을 섞지 않는다.

#### 완료 조건

- 새 검증 rule마다 회귀 테스트가 있다.
- 새 fallback 판단은 source bucket 또는 evidence에 남는다.
- 대형 파일 라인 수 증가가 무제한으로 이어지지 않는다.

#### 하지 말 것

- "정리" 명목의 대규모 리팩터링을 테스트 없이 진행하지 않는다.
- 렌더링 보정을 검증 로직의 사실 근거로 사용하지 않는다.

### 3.7 운영 보안과 쿼터 기준 명확화

#### 현재 상태

- AI 요청에는 인메모리 rate limit과 중복 요청 차단이 있다.
- 컴파일은 기본 비활성화이고 내부 라우트는 공유 토큰을 사용한다.
- Docker sandbox는 read-only, no-new-privileges, cap-drop 같은 제한을 둔다.
- 다만 인메모리 제한은 다중 인스턴스 운영에서는 충분하지 않다.
- production 환경에서는 `change_me...`, `placeholder...`, `your_..._here` 같은 예시 secret 값을 compile/shared token 또는 artifact download secret으로 사용할 수 없게 막는다.

#### 해야 할 일

1. AI 요청 제한을 운영 기준으로 명시한다.
   - 현재 인메모리 제한은 개발/단일 인스턴스용으로 본다.
   - 운영은 사용자/프로젝트/IP 단위 지속 저장소가 필요하다.
2. compile 기능의 공개 조건을 문서화한다.
   - 공개 전 필수 조건: 인증, 쿼터, artifact 만료, 로그 보존, sandbox 격리.
3. 내부 공유 토큰은 placeholder 금지 기준을 둔다.
4. artifact download signature secret은 production에서 필수로 검증한다.

#### 완료 조건

- 운영 모드에서 placeholder secret으로 서버가 뜨지 않는다.
- compile 공개 여부가 env 하나로 우연히 열리지 않는다.
- abuse/quota/retention 문서와 실제 env 동작이 일치한다.

#### 하지 말 것

- 인메모리 rate limit만 믿고 공개 API로 운영하지 않는다.
- unsandboxed compile을 외부 사용자에게 열지 않는다.

### 3.8 문서와 실제 상태 동기화

#### 현재 상태

- 문서량이 많고 방향은 잘 잡혀 있다.
- 2026-06-30 안정화 패스 이후 README, CI 검증 명령, 명세서의 현재 상태를 다시 맞췄다.
- 공식 빌드와 E2E smoke는 현재 통과 상태다.
- 단, 작업 트리는 기존 대량 변경이 남아 있어 커밋 전 분류가 계속 필요하다.

#### 해야 할 일

1. README의 품질 체크 명령이 실제로 통과하는지 보장한다.
2. 현재 상태 보고 문서에 아래 사실을 반영한다.
   - 타입/린트/단위/validation baseline/extended 통과
   - 공식 `npm run build` 통과
   - 기본 Turbopack 빌드 채택
   - E2E smoke 통과
   - 기존 대량 변경과 새 파일 분류 필요
3. 문서마다 "주장"과 "검증 완료"를 구분한다.
4. 새 스펙 문서는 구현 완료 후 체크박스로 갱신한다.

#### 완료 조건

- README, CI, 실제 명령 결과가 서로 모순되지 않는다.
- 상태 문서가 과장 없이 현재 리스크를 보여준다.
- 다음 작업자가 문서만 보고도 무엇부터 해야 하는지 안다.

#### 하지 말 것

- 문서에 "완료"라고 쓰고 실제 명령을 재실행하지 않는다.
- 실험 기능을 제품 완료 기능처럼 표현하지 않는다.

## 4. 권장 실행 순서

### 1단계: CI 차단 요인 제거

1. `build` 스크립트 기준 결정
2. E2E 문구 mismatch 수정
3. `npm run lint`
4. `npm test`
5. `npm run test:e2e`
6. `npm run build`

### 2단계: 작업 트리 정리

1. `tmp/` 처리 방침 결정
2. `.DS_Store` 제거
3. 미추적 파일 분류
4. 커밋 단위 설계

### 3단계: MVP 경계 정리

1. 공개 MVP 기능 목록 작성
2. 보류 기능 분류
3. 숨김 기능이 빌드/CI에 주는 영향 제거 또는 문서화

### 4단계: 운영 리스크 축소

1. 파일 store 경로 제한
2. Turbopack trace 경고 해소
3. AI/compile 쿼터와 secret 정책 검증

## 5. 최종 수락 기준

아래 조건을 모두 만족하면 현재 안정화 작업을 1차 완료로 본다.

- `npm run lint` 통과
- `npm test` 통과
- `npm run test:validation:baseline` 통과
- `npm run test:validation:extended` 통과
- `npm run test:e2e` 통과
- `npm run build` 통과
- `git status`가 리뷰 가능한 수준으로 정리됨
- README와 CI가 같은 품질 기준을 가리킴
- MVP 노출 기능과 보류 기능이 문서화됨

## 5.1 2026-06-30 검증 결과

아래 항목은 실제 재실행으로 통과를 확인했다.

- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `npm run build`
- `npm run test:validation:baseline`
- `npm run test:validation:extended`

남은 정리 항목은 코드 실패가 아니라 리뷰/커밋 운영 문제다.

- `tmp/`는 Git 무시 대상이어서 상태 목록에는 섞이지 않는다.
- `.DS_Store`는 `node_modules` 밖에서 발견되지 않는다.
- 미추적 파일은 30개이며, 제품 코드/테스트 fixture/문서로 분류 후 커밋 단위를 나눠야 한다.
- tracked 변경 파일은 기존 작업이 많이 섞여 있으므로, 안정화 변경만 골라 staging하거나 기능별 브랜치/커밋으로 나누는 작업이 필요하다.

## 5.2 현재 변경 분리 기준

현재 작업 트리는 한 번에 커밋하기에는 크다. 아래 단위로 나누는 것이 리뷰 가능한 최소 기준이다.

1. 안정화/품질 게이트
   - `.env.example`, `.gitignore`, `.nvmrc`, `README.md`, `package.json`, `package-lock.json`
   - `src/lib/compile-policy.ts`
   - `src/lib/server/compile-*-store.ts`
   - `tests/compile-policy.test.ts`
   - `tests/e2e/editor-report-smoke.spec.ts`
   - `docs/stabilization-work-spec-2026-06-30.md`, `docs/review-mvp-scope.md`, `docs/core-engine-change-rules.md`
2. validation/engine/parser 회귀 보강
   - `src/lib/circuit-netlist.ts`, `src/lib/datasheet-rules.ts`, `src/lib/drc-engine.ts`
   - `src/lib/kicad-*.ts`, `src/lib/v3-kicad-parser/**`
   - 관련 `tests/*.test.ts`
3. KiCad golden corpus와 public fixture
   - `config/golden-corpus/**`
   - `scripts/build-clean-kicad-golden-corpus.ts`
   - `scripts/export-clean-kicad-golden-corpus-svg.ts`
   - `tests/clean-kicad-golden-corpus.test.ts`, `tests/kicad-public-fixtures.test.ts`
4. PCB/report 확장
   - `src/app/api/kicad/**`, `src/app/api/report/**`
   - `src/lib/*pcb*`, `src/lib/report-workspace-snapshot.ts`
   - `tests/imported-pcb-parser.test.ts`
5. UI shell/report surface
   - `src/components/**`, `src/hooks/**`, `src/store/**`, `src/app/globals.css`
   - report page and validation panel changes

이 분리 전에는 대량 커밋을 만들지 않는다.

## 6. 판단 기준

이번 단계에서 새 기능을 추가할지 여부는 아래 기준으로 판단한다.

- 공식 빌드가 깨져 있으면 새 기능 추가 금지
- E2E smoke가 깨져 있으면 UI 기능 확장 금지
- 작업 트리가 분류되지 않았으면 대형 기능 커밋 금지
- fallback/generic 판단을 숨긴 채 critical finding을 만들지 않기
- PCB 제조 가능성을 자동 검증 결과만으로 표현하지 않기
