# Render Beta Deployment Guide

작성일: 2026-07-01

## 목표 구성

제한 베타는 단일 Render Web Service로 시작한다.

```text
Browser
  -> Render Web Service
     -> Next.js app
     -> KiCad CLI for official PCB DRC
     -> temporary server files deleted after DRC
```

지금 단계에서는 별도 DB, Redis, Kubernetes, AWS 복합 구성이 필요 없다.

## 먼저 할 일

이미 채팅에 계정 비밀번호를 적었다면 GitHub와 Render 비밀번호를 모두 바꾸고 2FA를 켠다.
GitHub와 Render에는 같은 비밀번호를 쓰지 않는다.
베타 접속 비밀번호도 계정 비밀번호와 다르게 만든다.

## 준비된 파일

- `Dockerfile`: Next.js 앱과 KiCad 10 CLI를 함께 담는 Docker 이미지
- `render.yaml`: Render Web Service 기본 설정
- `middleware.ts`: `MODUMAKE_BETA_ACCESS_PASSWORD`가 있으면 Basic Auth로 베타 URL 보호
- `.env.example`: 필요한 환경변수 예시

## Render에서 만들 것

1. GitHub에 이 저장소를 push한다.
2. Render에 로그인한다.
3. `New +` -> `Blueprint` 또는 `Web Service`를 선택한다.
4. GitHub 저장소를 연결한다.
5. `render.yaml`을 사용하거나 Docker Web Service로 생성한다.
6. 배포 전에 환경변수를 확인한다.

## Render 환경변수

`render.yaml`에 기본값이 들어가 있지만, 아래 값은 Render 화면에서 직접 확인한다.

```env
MODUMAKE_PRODUCT_ENV=production
NEXT_PUBLIC_MODUMAKE_SURFACE=review-mvp
NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL=maenttang@gmail.com
NEXT_PUBLIC_MODUMAKE_ENABLE_FULL_SURFACE=false
NEXT_PUBLIC_MODUMAKE_ALLOW_FULL_SURFACE_OVERRIDE=false
NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL=false
NEXT_PUBLIC_MODUMAKE_ENABLE_BETA_TELEMETRY=false
MODUMAKE_ENABLE_BETA_EVENTS=false
MODUMAKE_ENABLE_LAUNCH_DESK=false
MODUMAKE_ENABLE_UNSANDBOXED_COMPILE=false
MODUMAKE_COMPILE_PUBLIC_ENABLED=false
MODUMAKE_COMPILE_REQUIRE_AUTH=true
KICAD_CLI_PATH=/usr/bin/kicad-cli
MODUMAKE_BETA_ACCESS_USER=beta
```

Render에서 직접 입력해야 하는 secret:

```env
MODUMAKE_BETA_ACCESS_PASSWORD=계정과_다른_긴_베타_비밀번호
```

비밀번호 예시는 문서나 Git에 남기지 않는다.

## 배포 후 확인

Render 기본 URL로 먼저 확인한다. 도메인이 없어도 제한 베타는 가능하다.

1. `/api/health`가 `status: ok`를 반환한다.
2. `/editor`를 열면 브라우저가 beta username/password를 묻는다.
3. username은 `beta`, password는 Render에 넣은 `MODUMAKE_BETA_ACCESS_PASSWORD`를 입력한다.
4. `.kicad_sch` 샘플을 업로드해서 화면이 열리는지 본다.
5. `.kicad_pcb` 샘플을 업로드하고 공식 KiCad DRC를 실행한다.
6. 실패하면 Render 로그에서 `kicad-cli` 또는 `/api/kicad/pcb-drc` 오류를 먼저 본다.

## 중단 조건

- `/api/health`가 `ok`가 아님
- beta password 없이 `/editor`에 들어가짐
- 공식 KiCad DRC가 `kicad-cli` 없음으로 실패함
- 사용자 파일명, 경로, 원문이 로그에 남음
- support email 또는 feedback URL이 없음

## 제한 베타 운영

- 처음에는 Render 기본 URL을 5-10명에게만 공유한다.
- 외부 사용자 파일은 공유 허가를 받은 것만 디버깅에 사용한다.
- telemetry는 기본으로 끄고, 피드백 폼 또는 이메일로 수동 수집한다.
- 공개 베타 전에 외부 KiCad 파일 30-50개로 import/render/DRC 결과를 다시 확인한다.
