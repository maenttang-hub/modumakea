# Worktree Commit Organization

작성일: 2026-07-01

## 목적

이번 작업 트리는 보안, 제품화, UI, KiCad 렌더링, 베타 운영 코드가 한 번에 섞여 있었다. 한 커밋으로 묶으면 회귀 원인 추적이 어렵기 때문에 아래 책임 단위로 나눠 커밋한다.

## 커밋 단위

### 1. validation 권한

프로젝트 validation job 생성, 조회, diff, 프로젝트별 목록 조회가 기존 cloud project visibility/edit token 권한 모델을 따르도록 고정한다.

포함 범위:

- validation job API 권한 helper
- validation job 저장 요청의 `x-modumake-edit-token` 전달
- private project read/write 차단 테스트
- cross-project validation diff 차단

### 2. WebSerial 보안 정책

기본 제품 표면에서는 WebSerial UI를 숨기고, Permissions-Policy도 `usb=(), serial=()`로 닫아 둔다. 내부 검증에서 `NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL=true`일 때만 UI와 브라우저 권한을 함께 연다.

포함 범위:

- Permissions-Policy header
- serial action surface flag
- terminal panel serial tab gating
- next config security header regression test

### 3. 베타 telemetry / health / support

제한 베타 운영에서 실패율과 피드백 흐름을 볼 수 있도록 이벤트 수집, health check, support/privacy/product-scope 노출을 추가한다. 기본값은 비활성 또는 안전한 안내 페이지다.

포함 범위:

- `/api/beta/events`
- `/api/health`
- `/privacy`, `/support`, `/product-scope`
- import 실패 리포트와 coarse telemetry
- Launch Desk 기본 비활성 gate

### 4. 제품화 / 문서 / 환경 게이트

공개 제품으로 노출할 범위와 배포 전 env 조건을 문서와 preflight로 고정한다.

포함 범위:

- `.env.example`, README 제품 surface 안내
- beta 운영 문서
- product preflight script
- production 환경 guard
- P1 잔여 작업 기준: 공유 저장소 기반 rate limit, 대형 rule 파일 변경 규칙

### 5. UI shell

빈 작업공간, 모바일 폭, report/export/share 비활성 상태를 제품 표면에 맞게 정리한다.

포함 범위:

- empty workspace 상태 표시
- title/bottom/right/left panel 비활성 상태
- product scope/privacy/feedback entry point
- validation feedback telemetry 호출부

### 6. KiCad 렌더링 / 파서

KiCad import 결과의 net label 정규화, 전원/그라운드 판정, imported schematic text layout과 PCB graphic type guard를 개선한다.

포함 범위:

- net label 공통 유틸
- board signal limit 전원 alias 처리
- integrated validation payload 정리
- imported schematic overview text collision 완화
- parser/connectivity power alias 공통화

## 남은 원칙

- 공개 운영 전 AI/compile rate limit은 Supabase 또는 Redis 같은 공유 저장소 기반으로 이전한다.
- `circuit-netlist.ts`, `kicad-sch-parser.ts`, `datasheet-rules.ts`는 지금 분해하지 않는다.
- 새 validation rule은 `rule id`, `confidence`, `evidenceSummary`, `observedFacts`, `howToVerify`, regression test 없이 추가하지 않는다.
- 정리 목적의 리팩터링은 베타 후로 미룬다.
