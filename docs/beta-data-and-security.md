# Beta Data and Security

작성일: 2026-06-30

## 기본 원칙

하드웨어 파일은 사용자의 프로젝트 자산이다. 베타에서도 파일명, 회로 원문, 소스 코드, 프로젝트 경로를 불필요하게 수집하지 않는다.

## 현재 기본값

- browser-local project persistence 사용
- public cloud compile 비활성
- Launch Desk 비활성
- full product surface 비활성
- beta telemetry 비활성
- beta event collection route 비활성

## 베타 이벤트 수집을 켤 때

클라이언트:

- `NEXT_PUBLIC_MODUMAKE_ENABLE_BETA_TELEMETRY=true`

서버:

- `MODUMAKE_ENABLE_BETA_EVENTS=true`

수집 가능한 값:

- event name
- source
- route
- outcome
- 파일 확장자
- 파일 크기 구간
- KiCad 파일 종류
- 실패 stage
- issue severity/confidence/source bucket
- report export 여부

수집하지 않는 값:

- 파일명
- 로컬 경로
- KiCad 원문
- 코드 원문
- 에러 원문 전체
- 프로젝트 본문

## 로그 기준

- `/api/beta/events`는 `x-request-id`를 응답 헤더에 붙인다.
- 서버 로그에는 request id, event name, source, outcome, coarse attributes만 남긴다.
- import 실패 원인 분석은 파일명 없이 확장자/크기/stage 기준으로 한다.

## 공개 베타 전 재점검

- `.env.local`과 배포 환경에 placeholder secret이 없는지 확인
- `NEXT_PUBLIC_MODUMAKE_SURFACE=review-mvp`
- `NEXT_PUBLIC_MODUMAKE_ENABLE_FULL_SURFACE=false`
- `NEXT_PUBLIC_MODUMAKE_ALLOW_FULL_SURFACE_OVERRIDE=false`
- `NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL=false`
- `MODUMAKE_ENABLE_LAUNCH_DESK=false`
- `MODUMAKE_ENABLE_UNSANDBOXED_COMPILE=false`
- `MODUMAKE_COMPILE_PUBLIC_ENABLED=false`
- event retention 기간과 접근 권한 명시

## 외부 서비스

Sentry 같은 클라이언트 오류 수집은 계정/DSN/보관 정책이 정해진 뒤 붙인다. 그 전에는 코드에 DSN을 하드코딩하지 않는다.
