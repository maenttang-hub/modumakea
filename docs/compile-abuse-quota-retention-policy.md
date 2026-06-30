# Compile Abuse, Quota, and Retention Policy

작성일: 2026-06-29

## 목적

이 문서는 compile 기능을 beta/production에 노출할 때 필요한 abuse control, usage quota, artifact retention 기준을 고정한다.

## 현재 판정

현재 저장소에는 다음이 있다.

- internal token auth
- queue 경계
- one-shot runtime 경계
- signed artifact download path

그리고 이번 MVP 기준으로 public compile API 앞단에 다음 방어선이 들어가 있다.

- `MODUMAKE_COMPILE_PUBLIC_ENABLED=false` 기본 차단
- `MODUMAKE_COMPILE_REQUIRE_AUTH=true` 기본 인증 요구
- 단일 인스턴스 in-memory per-IP / per-user rate limit
- 단일 인스턴스 in-memory per-user hourly / daily quota

아직 production-grade 운영 정책 전체가 코드로 완성된 것은 아니다.

이 문서는 운영 기준을 고정하지만, 모든 항목이 코드로 enforcement된 것은 아니다.

- 누가 얼마나 compile할 수 있는지에 대한 지속 저장소 기반 quota
- 실패 반복이나 burst traffic을 막는 다중 인스턴스 rate limit
- artifact/log retention cleanup worker

현재 코드에는 production placeholder secret 차단, signed artifact download path, public compile gate, auth gate, 단일 인스턴스 rate/quota 방어가 들어가 있다.

## 기본 원칙

1. compile은 무료 무제한 백엔드 기능이 아니다.
2. source, log, artifact는 민감 데이터로 취급한다.
3. job 수, 동시성, 결과 보관 기간을 모두 제한한다.

## 주체 단위

정책 단위는 아래 셋이다.

- `user`
- `project`
- `ip`

가능하면 `user` 우선, 익명 사용자는 `ip` 우선으로 적용한다.

## 권장 quota

### 익명 / 미인증

- public cloud compile: 기본 비활성화
- beta allowlist 외: preflight only

현재 코드 동작:

- `MODUMAKE_COMPILE_PUBLIC_ENABLED=false`: `POST /api/compile/job`는 `503 COMPILE_PUBLIC_DISABLED`
- `MODUMAKE_COMPILE_REQUIRE_AUTH=true`이고 사용자 식별자가 없으면 `401 COMPILE_AUTH_REQUIRED`
- 임시/dev 인증 식별자는 `x-modumake-user-id`, `x-user-id`, 또는 충분히 긴 `Authorization: Bearer ...` 값을 사용한다.

### 인증 사용자 기본

- compile requests: `30 / hour`
- compile requests: `150 / day`
- concurrent queued + running jobs: `2`
- single project concurrent jobs: `1`

### trusted / staff / paid tier

- compile requests: `300 / day`
- concurrent queued + running jobs: `5`
- single project concurrent jobs: `2`

## 권장 hard limits

### 요청 단위

- source code length: `30_000`
- required libraries count: `8`
- build log return size: `12_000 chars`
- error details size: `2_000 chars`
- artifact size: `2 MB`

### runtime 단위

- wall-clock timeout: `20s`
- cpu: `1`
- memory: `512 MB`
- pids: `128`
- workspace disk: `256 MB`

## rate limit 정책

### API 계층

`POST /api/compile/job`

- per-IP burst: `5 / 1 min`
- per-user burst: `10 / 1 min`
- sustained limit: token bucket or leaky bucket

### internal launch 계층

- app worker poll interval lower bound
- launcher worker max concurrent dispatch cap

## abuse 분류

다음은 abuse signal로 취급한다.

1. 짧은 시간 내 반복 timeout
2. 반복 OOM / disk quota 초과
3. 동일 IP의 다수 project/job fan-out
4. artifact/log size limit 반복 초과
5. allowlist 밖 library 반복 요청
6. sandbox policy 위반 시도
   - fork bomb
   - giant output
   - host path read attempt
   - network reachability dependency

## 대응 단계

### Stage 0

- 정상

### Stage 1

- soft throttle
- poll interval 증가
- temporary reduced quota

### Stage 2

- compile request reject
- 일정 시간 block
- project-level temporary lock

### Stage 3

- manual review
- account / IP denylist

## failure class 표준

result / audit log에는 아래 failure class를 명시한다.

- `bad_request`
- `queue_rejected`
- `rate_limited`
- `quota_exceeded`
- `runtime_timeout`
- `runtime_oom`
- `runtime_disk_exceeded`
- `runtime_network_denied`
- `runtime_policy_denied`
- `compile_error`
- `artifact_truncated`
- `internal_error`

## retention 정책

### queue metadata

- kept: `30 days`
- fields:
  - request id
  - queue job id
  - owner key / project id
  - board id
  - source hash
  - state / timestamps / failure class

### source code

- 장기 저장 기본 금지
- queue payload 원문은 terminal result 후 즉시 삭제 또는 short retention
- 권장:
  - file/memory store: terminal 후 삭제
  - DB store: `24 hours` 이하, 가능하면 raw source 미저장

### build logs

- default retention: `7 days`
- redaction 후 보관
- user-facing full logs는 `24 hours` signed access

### artifacts

- default retention: `7 days`
- signed download TTL: `5 min`
- object storage lifecycle rule 필수

### audit logs

- retention: `30-90 days`
- raw source 대신 source hash 기록

## redaction 기준

로그에서 아래는 그대로 노출하지 않는다.

- absolute host paths
- internal service URL
- credential-like env values
- container host details

## 권장 env 초안

```env
MODUMAKE_COMPILE_PUBLIC_ENABLED=false
MODUMAKE_COMPILE_REQUIRE_AUTH=true
MODUMAKE_COMPILE_RATE_LIMIT_IP_PER_MINUTE=5
MODUMAKE_COMPILE_RATE_LIMIT_USER_PER_MINUTE=10
MODUMAKE_COMPILE_QUOTA_USER_PER_HOUR=30
MODUMAKE_COMPILE_QUOTA_USER_PER_DAY=150
MODUMAKE_COMPILE_QUOTA_CONCURRENT_PER_USER=2
MODUMAKE_COMPILE_QUOTA_CONCURRENT_PER_PROJECT=1
MODUMAKE_COMPILE_LOG_RETENTION_DAYS=7
MODUMAKE_COMPILE_ARTIFACT_RETENTION_DAYS=7
MODUMAKE_COMPILE_QUEUE_RETENTION_DAYS=30
MODUMAKE_COMPILE_SIGNED_ARTIFACT_TTL_SECONDS=300
MODUMAKE_COMPILE_DELETE_SOURCE_AFTER_TERMINAL=true
```

## 구현 우선순위

1. durable multi-instance quota store
2. per-user concurrent quota
3. retention cleanup worker
4. audit failure class 표준화
5. denylist / abuse escalation

## 운영 체크리스트

- rate limit threshold가 실제 traffic에 맞는지 확인
- queue backlog alert 설정
- repeated timeout/OOM alert 설정
- object storage lifecycle rule 적용
- signed download TTL 검증
- staff override / beta allowlist 절차 문서화

## 명시적 금지

- 익명 public user에게 unlimited cloud compile 제공
- artifact/log 무기한 보관
- raw source 전체를 장기 audit log에 저장
- signed artifact URL을 장시간 유효하게 유지
