# Productization Readiness

작성일: 2026-06-30

## 결론

이 저장소의 제품화 기준은 "기능이 많다"가 아니라 "사용자 파일을 안전하게 다루고, 운영자가 실패를 추적하며, 제품이 약속하지 않는 범위를 명확히 막는다"이다.

## 제품으로 노출하는 범위

ModuMake는 KiCad/간단 회로를 가져와서 전원, 배선, 핀, 부품 리스크를 검토하고 리포트로 정리하는 도구다.

제품 문구에서 계속 제외한다.

- full PCB CAD
- 제조 가능 보증
- public cloud compile
- 모든 부품 데이터시트 자동 검증
- 전문 EDA 대체

## 코드상 제품화 장치

- `/api/health`: 배포 상태, 버전, 표면, 위험 기능 활성 여부를 확인한다.
- `src/lib/product-environment.ts`: `MODUMAKE_PRODUCT_ENV=production`에서 위험한 env를 error로 막는다.
- `npm run product:preflight`: 제품 배포 전 env를 점검한다.
- `next.config.ts`: clickjacking, MIME sniffing, referrer, permissions policy, CSP report-only 헤더를 적용한다.
- `/product-scope`: 제품이 하는 일과 하지 않는 일을 사용자에게 보여준다.
- `/privacy`: 베타/제품 운영 이벤트에서 수집하는 값과 수집하지 않는 값을 보여준다.
- `/support`: feedback channel이 설정됐는지 드러낸다.
- `app/not-found.tsx`, `app/global-error.tsx`: 보류 기능 접근과 예외 상황에서 사용자를 복구 가능한 경로로 보낸다.

## 제품 배포 전 env 기준

필수:

- `MODUMAKE_PRODUCT_ENV=production`
- `NEXT_PUBLIC_MODUMAKE_SURFACE=review-mvp`
- `NEXT_PUBLIC_MODUMAKE_ENABLE_FULL_SURFACE=false`
- `NEXT_PUBLIC_MODUMAKE_ALLOW_FULL_SURFACE_OVERRIDE=false`
- `NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL=false`
- `MODUMAKE_ENABLE_LAUNCH_DESK=false`
- `MODUMAKE_ENABLE_UNSANDBOXED_COMPILE=false`
- `MODUMAKE_COMPILE_PUBLIC_ENABLED=false`
- `MODUMAKE_COMPILE_REQUIRE_AUTH=true`
- `NEXT_PUBLIC_MODUMAKE_FEEDBACK_URL` 또는 `NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL`

금지:

- placeholder secret
- public compile 노출
- Launch Desk 노출
- WebSerial 노출
- `surface=full` query override

## 아직 사람이 끝내야 하는 일

- 실제 지원 채널 URL 또는 이메일 결정
- Sentry/오류 수집 서비스 계정, DSN, 보관 정책 설정
- AI/compile rate limit을 단일 프로세스 메모리 Map에서 공유 저장소 기반으로 전환
- 15개 seed를 넘어 20-30개 회로 golden corpus human label 작성
- 베타 사용자 샘플 파일의 재배포 가능 라이선스 확인
- 개인정보 처리방침/이용약관의 법무 검토
- 운영 로그 보관 기간과 접근 권한 확정

## 운영 rate limit 전환 기준

현재 AI 요청 제한과 compile 사용량 제한은 단일 서버 프로세스 안의 메모리 상태를 기준으로 동작한다. 제한 베타나 로컬 검증에는 충분하지만, 공개 운영에서는 서버 재시작 또는 다중 인스턴스 배포로 우회될 수 있다.

공개 운영 전 필수 조건:

- AI 요청과 compile 요청 모두 Supabase 또는 Redis 같은 공유 저장소를 기준으로 제한한다.
- 제한 key에는 원문 IP를 저장하지 않고, 배포별 salt를 적용한 hash 또는 인증 사용자/project 단위 식별자를 사용한다.
- 저장소 장애 시 compile/AI 같은 비용성 기능은 우회 허용이 아니라 명시적 실패 또는 보수적 제한으로 처리한다.
- 테스트는 같은 제한 저장소를 공유하는 두 guard 인스턴스가 한도를 함께 소진하는지 검증한다.
- `MODUMAKE_PRODUCT_ENV=production`에서는 메모리 전용 limiter가 기본값으로 남아 있지 않아야 한다.

## 공개 제품 전환 기준

- 제한 베타에서 업로드 성공률 80% 이상
- import 성공 후 report export율 40% 이상
- critical false-positive 반복 패턴 없음
- `/api/health`가 배포 모니터링에 연결됨
- feedback channel이 실제로 응답됨
- 공유 저장소 기반 AI/compile rate limit이 적용됨
- release checklist가 릴리즈별로 누적됨
