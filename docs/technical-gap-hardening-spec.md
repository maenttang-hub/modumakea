# Technical Gap Hardening Spec

작성일: 2026-06-29

## 목적

이 문서는 현재 ModuMake의 핵심 기술 부채를 과장 없이 정리하고, 다음 구현자가 따라야 할 세부 지침을 고정한다.

대상은 아래 세 축이다.

1. C++/Arduino 코드 분석 파이프라인
2. 회로 시뮬레이션 파이프라인
3. 클라우드 저장과 협업 파이프라인
4. 컴파일 서버 보안과 운영 파이프라인

## 현재 결론

현재 저장소 기준으로 세 영역 모두 이미 경계는 만들어져 있다. 문제는 기능이 전혀 없다는 것이 아니라, 제품 문구가 암시하는 신뢰도와 실제 구현 충실도 사이에 차이가 있다는 점이다.

| 영역 | 현재 상태 | 정확한 판정 |
| --- | --- | --- |
| C++ 분석 | TypeScript fallback + Rust/WASM 문자열 스캐너 경계 | Tree-sitter/Clang급 AST는 아님 |
| 시뮬레이션 | SPICE-like netlist + 내부 fallback solver | ngspice급 물리 시뮬레이터는 아님 |
| 클라우드 저장 | Supabase `projects.state_json` 저장/로드/공유/포크 존재 | 실시간 영속 CRDT 협업은 아님 |
| 컴파일 서버 | Node 서비스 + `arduino-cli` 실행 + Dockerfile 존재 | public untrusted compile sandbox는 아님 |

## 1. C++ AST 파서

### 확인된 현재 상태

- `src/lib/ast-parser.ts`는 파서 facade다.
- `src/lib/ast-parser-core.ts`는 C++ 주석 제거, 단순 매크로 치환, 호출 수집, wrapper 일부 추적을 담당한다.
- `rust/modumake-kernel/src/lib.rs`도 Tree-sitter가 아니라 자체 문자열 스캐너다.
- `docs/engine/parser.md`는 현재 구현을 "lightweight fallback parser"라고 명시한다.
- Python 쪽에는 `tree-sitter` provider 경계가 있지만, vendored provider는 아직 `null`을 반환한다.

### 위험

현재 파서는 검증 도구의 최종 근거로 쓰기에는 약하다.

- 함수형 매크로, 조건부 컴파일, include graph를 정확히 해석하지 못한다.
- 클래스/상속/템플릿/포인터/참조 기반 호출을 의미론적으로 추적하지 못한다.
- Arduino 라이브러리 객체의 메서드 호출을 타입 기준으로 판별하지 못한다.
- False negative가 특히 위험하다. "문제가 없음"으로 보이면 사용자가 그대로 제작할 수 있기 때문이다.

### 세부 지침

1. 기존 `ast-parser.ts` facade는 유지한다.
   - 검증 엔진이 특정 parser 구현에 직접 의존하지 않게 해야 한다.
   - 새 엔진은 `CppReviewArtifacts` 모양으로만 노출한다.

2. 단기 목표는 Tree-sitter C++를 우선한다.
   - Clang AST Dump는 정확하지만 브라우저 WASM/서버 운영 비용이 크다.
   - 현재 제품 단계에서는 Tree-sitter로 syntax tree 안정성을 먼저 확보하는 편이 현실적이다.

3. Tree-sitter 도입 범위는 "파싱"과 "추출"을 분리한다.
   - Parser adapter: source -> concrete syntax tree
   - Extractor: tree + board/library registry -> operations/i2c/interrupt/includes
   - Resolver: aliases, constants, simple wrapper, condition/scope metadata

4. 전처리기는 과하게 만들지 않는다.
   - 전체 C preprocessor를 직접 구현하지 않는다.
   - 지원 범위는 object-like `#define`, `const`, `constexpr`, `enum`부터 시작한다.
   - 함수형 매크로와 조건부 컴파일은 "unsupported with confidence downgrade"로 표시한다.

5. 실패 시 fallback을 조용히 숨기지 않는다.
   - 결과에는 `parserBackend`, `parserTier`, `unsupportedSyntax[]`, `confidence`를 포함해야 한다.
   - fallback 결과로 critical issue를 만들 때는 evidence에 fallback임을 남긴다.

### 수용 기준

- fixture 30개 이상: Arduino UNO, Nano, ESP32, 라이브러리 예제, 매크로-heavy sketch 포함.
- 기존 `tests/ast-parser.test.ts` 통과.
- 새 Tree-sitter path와 fallback path의 golden output 비교 테스트 추가.
- unsupported syntax가 있는 경우 UI/report가 "검증 제한"을 표시한다.

## 2. 회로 시뮬레이션

### 확인된 현재 상태

- `src/lib/circuit-netlist.ts`는 내부 회로 모델을 SPICE-like netlist로 내보낸다.
- `src/lib/spice-simulator.ts`는 fallback solver를 실행한다.
- `SpiceResult.backend`는 현재 `'fallback-solver'`만 가진다.
- Transient/AC는 `preview-grade` 또는 DC 기반 근사로 표시된다.
- `docs/engine/simulator.md`와 `docs/simulation-tutorial.md`도 ngspice WASM 전 단계임을 명시한다.

### 위험

현재 시뮬레이터는 리뷰와 교육용 미리보기에는 쓸 수 있지만, 물리 회로 검증 엔진으로 포장하면 안 된다.

- op-amp, switching regulator, oscillator, nonlinear semiconductor 모델을 제대로 다루지 못한다.
- transient 결과가 실제 소자 모델 기반이 아니라 제한적 companion/근사다.
- AC 분석이 주파수 응답 해석이라기보다 결과 shape를 맞춘 preview에 가깝다.

### 세부 지침

1. `runSpice(...)` API는 유지하되 backend를 확장한다.
   - 예: `'fallback-solver' | 'ngspice-wasm'`
   - UI는 backend와 fidelity를 그대로 노출해야 한다.

2. ngspice WASM은 worker에서만 실행한다.
   - 메인 스레드에서 로드/해석하지 않는다.
   - `spice-worker-protocol.ts`를 실제 worker protocol로 확장한다.

3. netlist export와 solver를 분리한다.
   - `toSpiceNetlistFromAnalysis(...)`는 ngspice가 읽을 수 있는 문법을 목표로 정제한다.
   - fallback solver는 계속 단순 회로 빠른 피드백 용도로 남긴다.

4. 모델 지원 범위를 제품 문구와 일치시킨다.
   - 지원: R, C, L, V/I source, diode, BJT/MOSFET 기본 모델부터.
   - 보류: op-amp macro model, vendor subckt, switching regulator는 별도 단계로 둔다.

5. 시뮬레이션 결과를 검증 결과와 혼동하지 않는다.
   - `preview-grade` 결과는 critical DRC 근거로 단독 사용하지 않는다.
   - ngspice 결과라도 모델 누락 시 `modelCoverage`를 함께 표시한다.

### 수용 기준

- fallback solver 테스트는 유지한다.
- ngspice worker smoke test: resistor divider `.op`, RC `.tran`, RC low-pass `.ac`.
- worker timeout/cancel/error 테스트 추가.
- UI에 backend, model coverage, warning이 노출된다.

## 3. 클라우드 저장과 협업

### 확인된 현재 상태

- `docs/supabase_schema.sql`에는 `projects`, `comments`, validation 관련 테이블이 있다.
- `src/lib/cloud-project-store.ts`는 Supabase `projects.state_json`에 프로젝트 스냅샷을 저장한다.
- `src/store/slices/persistence-slice.ts`는 브라우저 저장, 클라우드 생성, 저장, 링크 로드, 포크를 제공한다.
- `src/components/collaboration/project-collaboration-provider.tsx`는 Supabase Realtime broadcast를 사용한다.
- `src/lib/collaboration-doc.ts`와 `src/generated/yjs-collaboration/vendor/index.ts`는 `yjs` 엔진명을 쓰지만 실제 vendored 구현은 BroadcastChannel/메모리 채널 기반이다.

### 정정

"Supabase 연동이 Catalog seed 단계에 머문다"는 표현은 현재 저장소 기준으로 맞지 않다. 프로젝트 스냅샷 저장과 공유 링크는 이미 있다.

정확한 문제는 이것이다.

- 클라우드 저장은 문서 전체 스냅샷 중심이다.
- 협업은 Realtime broadcast 중심이며, 영속 CRDT document가 아니다.
- 충돌 해결, 오프라인 merge, 서버 재접속 복구 기준이 부족하다.

### 위험

- 동시 편집 중 마지막 저장자가 전체 `state_json`을 덮어쓸 수 있다.
- broadcast 이벤트는 durable log가 아니므로 늦게 접속한 사용자는 중간 편집 이력을 복원할 수 없다.
- 현재 구조에서는 Figma식 협업이라고 말하기 어렵다.

### 세부 지침

1. 저장 모델을 세 층으로 나눈다.
   - Project snapshot: 현재처럼 `projects.state_json`
   - Collaboration document: Yjs update 또는 CRDT operation log
   - Presence: Supabase Realtime broadcast

2. Yjs 또는 동등 CRDT를 실제 문서 저장소로 붙인다.
   - code text와 circuit patch를 별도 shared type으로 둔다.
   - 서버에는 binary update log 또는 compacted document snapshot을 저장한다.
   - reconnect 시 서버 snapshot + 이후 updates를 재생한다.

3. `state_json` 전체 덮어쓰기는 안전장치를 둔다.
   - `revision` 또는 `version` 조건부 업데이트를 추가한다.
   - 충돌 시 overwrite 대신 reload/merge 요구 상태를 반환한다.

4. Realtime broadcast는 presence와 wake-up 용도로 제한한다.
   - 최종 데이터 신뢰성은 Postgres 저장 CRDT/update log가 책임진다.
   - broadcast만 받은 상태를 "저장됨"으로 표시하지 않는다.

5. 인증/권한 모델을 명확히 한다.
   - 현재 edit token 방식은 빠른 공유에는 유용하지만 장기 협업 권한 모델로는 약하다.
   - owner/editor/viewer 역할을 별도 테이블로 분리할지 결정해야 한다.

### 수용 기준

- 두 브라우저 세션에서 동시에 코드와 회로를 수정해도 둘 다 최종 상태에 반영된다.
- 새로 접속한 세션이 서버 저장 상태에서 동일 문서를 재구성한다.
- 네트워크 끊김 후 재접속 시 중복/역순 update가 깨지지 않는다.
- 전체 snapshot 저장 충돌은 감지되고, 조용한 overwrite가 발생하지 않는다.

## 4. 컴파일 서버 보안과 운영

### 확인된 현재 상태

- `services/compile-server/server.mjs`는 독립 Node HTTP 서버다.
- `services/compile-server/lib/compiler.mjs`는 요청을 검증한 뒤 `execFile`로 `arduino-cli`를 실행한다.
- `jobId`, `boardId`, source length, request body size, library name 문자는 제한한다.
- `arduino-cli` 실행에는 `MODUMAKE_COMPILE_TIMEOUT_MS` 기반 timeout이 있다.
- `services/compile-server/Dockerfile`은 단일 장기 컨테이너 형태이며 root 사용자와 `/root/.arduino15` 캐시를 사용한다.
- `src/app/api/compile/job/route.ts`는 앱 API에서 compile server로 요청을 프록시한다.
- 앱 API에는 `direct-http` / `queue` dispatch 경계가 있고, `queue` 모드에서는 durable queue record와 internal launcher route가 존재한다.
- durable queue store는 현재 file 또는 Supabase admin-backed store를 선택할 수 있다.
- launcher는 이제 기본적으로 compile server 직접 호출 대신 sandbox launch request outbox를 생성한다.
- internal worker route는 sandbox launch request를 `pending -> claimed -> submitted/failed`로 전이시킨다.
- runner 결과와 artifact는 queue record에 직접 적재하지 않고 별도 result/artifact store에 기록한다.
- internal polling worker 스켈레톤은 claim -> submitted -> result 계약을 관통할 수 있어야 하며, 마지막 hop은 sandbox runner adapter 경계 뒤에 둔다. 실제 one-shot sandbox가 없을 때만 그 adapter의 placeholder backend를 허용한다.
- one-shot sandbox launcher backend는 launch request payload와 callback URL/token 계약만 책임지고, 실제 compile 결과는 sandbox runtime이 result route로 되돌려준다.
- launcher service는 launch request를 받아 one-shot runtime spec으로 정규화하고, durable launch queue에 적재하는 모듈 경계를 가져야 한다.
- launcher worker는 그 durable launch queue를 claim해서 executor backend에 넘기고, callback result contract를 통해 app 쪽 result route를 갱신해야 한다.
- artifact 본문은 queue/result metadata와 분리된 blob/object store에 저장하고, polling 응답에는 short-lived signed download path만 노출한다.
- local/internal 기준의 first real backend는 Docker CLI one-shot sandbox로 두고, 여기서 `--read-only`, `--network none`, `--cap-drop ALL`, `--pids-limit`, `--memory`, `--cpus`, non-root user를 강제한다.
- sandbox runtime은 request 시점 `lib install`을 하지 않고 prebaked image + allowlist만 허용한다.

### 정정

현재 구현은 무방비 문자열 shell 실행은 아니다. `execFile`을 쓰고, 입력 크기와 라이브러리명 검증도 있다.

하지만 이것은 public untrusted code compile sandbox가 아니다. Arduino sketch와 라이브러리, compiler, builder, archive extractor, toolchain 전체가 공격 표면이다. "명령어 인젝션 방어"와 "격리된 빌드 실행"은 다른 문제다.

현재 추가된 queue/launcher는 다음 의미까지만 가진다.

- compile request를 durable queue record로 저장한다.
- internal-only launcher가 queued job을 claim한 뒤 sandbox launch request outbox를 생성한다.
- sandbox launcher service가 launch request를 one-shot runtime spec과 durable launch queue record로 정규화한다.
- sandbox launcher worker가 그 launch queue를 claim해 executor backend를 호출하고 result callback을 되돌린다.
- 기존 compile server를 직접 호출하는 경계를 분리한다.
- Supabase store는 다중 앱 인스턴스에서 queue record를 공유할 수 있지만, 아직 sandbox runner나 강한 분산 claim 보장은 아니다.
- `direct-http` launch mode는 레거시 내부 fallback으로만 유지한다.

이것은 sandbox runner 구현이 아니라, 그 앞단 구조를 정리한 단계다.

### 위험

- 장기 실행 컨테이너에서 여러 유저 빌드가 같은 OS/process/user/cache 경계를 공유한다.
- root 사용자로 빌드 도구와 library install을 실행한다.
- 컴파일 중 source가 컨테이너 파일시스템을 읽거나 toolchain 취약점을 건드릴 수 있다.
- `arduino-cli lib install`은 per-job 네트워크와 외부 패키지 해석 표면을 만든다.
- timeout은 있지만 CPU, 메모리, process count, filesystem, network egress 제한이 명세되어 있지 않다.
- 앱 API와 compile server 양쪽에 production-grade auth, rate limit, job queue, abuse control이 아직 없다.
- Docker run 예시는 기능 실행용이지 보안 샌드박스 실행 예시가 아니다.

### 세부 지침

1. public compile 기능은 sandbox가 붙기 전까지 beta/production에서 비활성화한다.
   - `cloud-compiler-ready`는 "manifest상 가능"과 "운영 sandbox 준비"를 분리해서 표시한다.
   - sandbox 준비 전 UI는 local review/preflight만 제공한다.

2. compile server는 직접 public internet에 노출하지 않는다.
   - 앱 서버 또는 job API만 compile 요청을 만들 수 있어야 한다.
   - compile backend에는 내부 네트워크, service token, mTLS 또는 equivalent 인증을 둔다.
   - `Access-Control-Allow-Origin: *`는 production compile backend에서 금지한다.

3. 각 compile job은 일회성 격리 환경에서 실행한다.
   - 선택지: gVisor, Firecracker, AWS Fargate one-task-per-job, Kubernetes Job + sandboxed runtime.
   - 단일 장기 컨테이너 안에서 job만 폴더로 나누는 방식은 보안 경계가 아니다.
   - Docker를 쓴다면 Docker socket을 컨테이너에 절대 마운트하지 않는다.

4. 컨테이너 권한을 최소화한다.
   - non-root user
   - read-only root filesystem
   - writable tmpfs workspace만 허용
   - no privileged mode
   - drop all Linux capabilities
   - seccomp/AppArmor profile 적용
   - no host path mount
   - no secret/env credential inside build sandbox

5. 자원 제한을 강제한다.
   - wall-clock timeout
   - CPU quota
   - memory limit
   - pids limit
   - output log/artifact size limit
   - workspace disk quota
   - concurrent job limit per user/IP/project

6. 네트워크 정책을 단계별로 분리한다.
   - dependency install phase와 compile phase를 분리한다.
   - compile phase는 기본적으로 network disabled로 실행한다.
   - 장기적으로는 라이브러리를 allowlist/prebaked image로 전환하고 per-job `lib install`을 제거한다.

7. 라이브러리 설치 정책을 보수적으로 둔다.
   - user가 임의 library string을 직접 설치하게 하지 않는다.
   - catalog에서 매핑된 library 이름만 허용한다.
   - 버전 pinning과 cache image build를 우선한다.
   - unknown header는 compile로 넘기지 않고 preflight에서 막는다.

8. 로그와 산출물을 민감 정보 경계로 취급한다.
   - compiler stderr/stdout에 컨테이너 경로, env, include된 파일 내용이 노출될 수 있다.
   - 사용자에게 반환하는 로그는 크기 제한과 redaction을 적용한다.
   - hex artifact만 allowlisted path에서 읽는다.

9. 운영 계층을 job queue로 바꾼다.
   - API route: 인증, rate limit, request normalization
   - Queue: job id, owner, board, dependency manifest, resource profile
   - Worker launcher: one-shot sandbox 생성
   - Artifact store: hex/log 저장
   - Result API: status polling 또는 short-lived signed URL

10. 감사와 대응 기준을 둔다.
    - requestId/jobId/user/project/source hash를 기록한다.
    - raw source 전체를 장기 저장하지 않는 정책을 정한다.
    - timeout/OOM/seccomp/network-denied 같은 failure class를 구분한다.
    - 동일 사용자의 반복 실패나 대량 요청은 차단한다.

### 수용 기준

- compile job이 non-root 일회성 sandbox에서 실행된다.
- sandbox는 network disabled compile phase를 가진다.
- CPU, memory, pids, disk, wall-clock timeout이 테스트 또는 배포 설정으로 확인된다.
- compile server는 public internet에서 직접 접근할 수 없다.
- 앱 API에는 인증 또는 abuse control이 있다.
- `arduino-cli lib install`은 allowlist 또는 prebaked dependency image로 제한된다.
- malicious sketch fixture가 host file read, fork bomb, large output, long compile을 시도해도 sandbox 밖에 영향이 없다.
- 보안 준비 전에는 UI가 cloud compile을 production 기능으로 노출하지 않는다.

## 우선순위

0. 컴파일 서버 sandbox
   - public untrusted code compile을 켜는 순간 보안 리스크가 제품 리스크보다 커진다.
   - 현재 compile server는 개발/내부 검증용 경계로 보는 것이 맞다.

1. C++ parser 신뢰도
   - 검증 도구의 신뢰도에 직접 연결된다.
   - False negative가 사용자 안전과 제품 신뢰를 동시에 깎는다.

2. 클라우드 저장 충돌 방지
   - 이미 클라우드 저장 기능이 있으므로, silent overwrite 방지가 먼저다.
   - 실시간 CRDT 전체 구현보다 version 조건부 저장이 더 빠른 안전장치다.

3. ngspice WASM
   - 제품 가치를 크게 올리지만, 범위가 크다.
   - 먼저 현재 preview-grade 표시를 유지하고, 물리 시뮬레이션이라고 과장하지 않는 것이 중요하다.

## 구현 금지선

- C++ 전처리기 전체를 직접 구현하지 않는다.
- fallback parser 결과를 full AST 결과처럼 표시하지 않는다.
- preview-grade 시뮬레이션을 제작 가능 판단의 단독 근거로 쓰지 않는다.
- Supabase broadcast만으로 "동시 편집 저장 완료"라고 표시하지 않는다.
- 기존 facade를 우회해서 UI나 verifier가 특정 엔진 구현에 직접 붙지 않는다.
- sandbox 없는 compile server를 public production 기능으로 노출하지 않는다.
- 장기 실행 root 컨테이너를 유저 코드 컴파일 보안 경계로 간주하지 않는다.
