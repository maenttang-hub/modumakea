# ModuMake Sandbox Launcher

one-shot sandbox runtime launch 요청을 받는 내부 전용 서비스입니다.

## 엔드포인트

- `GET /health`
- `POST /api/v1/sandbox-launch`

## 현재 역할

- worker에서 넘긴 sandbox launch request를 검증합니다.
- one-shot runtime spec을 생성합니다.
- launch queue file에 runtime spec을 적재합니다.
- launcher worker가 queue를 claim해서 executor backend로 넘기고 callback result를 기록합니다.

현재 executor backend의 기본값은 `docker-cli-one-shot`입니다. launcher worker는 per-job `docker run`으로 sandbox runtime image를 한 번 띄우고, 결과를 callback route로 되돌립니다. `compile-server-proxy`는 legacy internal fallback으로만 남아 있습니다.

## 로컬 실행

```bash
node ./services/sandbox-launcher/server.mjs
```

```bash
node ./services/sandbox-launcher/run-worker.mjs
```

기본 포트는 `4200`입니다.

환경 변수:

- `MODUMAKE_SANDBOX_LAUNCHER_HOST`
- `MODUMAKE_SANDBOX_LAUNCHER_PORT`
- `MODUMAKE_SANDBOX_LAUNCHER_BODY_LIMIT`
- `MODUMAKE_SANDBOX_LAUNCHER_ALLOW_NON_LOOPBACK`
- `MODUMAKE_SANDBOX_LAUNCHER_ALLOW_OPEN_HEALTH`
- `MODUMAKE_SANDBOX_LAUNCH_QUEUE_FILE`
- `MODUMAKE_SANDBOX_WORKER_MAX_JOBS`
- `MODUMAKE_SANDBOX_EXECUTOR_BACKEND`
- `MODUMAKE_SANDBOX_DOCKER_BIN`
- `MODUMAKE_SANDBOX_RUNTIME_BACKEND`
- `MODUMAKE_SANDBOX_RUNTIME_IMAGE`
- `MODUMAKE_SANDBOX_RUNTIME_USER`
- `MODUMAKE_SANDBOX_RUNTIME_UID_GID`
- `MODUMAKE_SANDBOX_WORKSPACE_ROOT`
- `MODUMAKE_SANDBOX_CPU_LIMIT`
- `MODUMAKE_SANDBOX_MEMORY_LIMIT_MB`
- `MODUMAKE_SANDBOX_PIDS_LIMIT`
- `MODUMAKE_SANDBOX_DISK_LIMIT_MB`
- `MODUMAKE_SANDBOX_TIMEOUT_MS`
- `MODUMAKE_SANDBOX_DEP_INSTALL_NETWORK`
- `MODUMAKE_SANDBOX_SECCOMP_PROFILE`
- `MODUMAKE_SANDBOX_APPARMOR_PROFILE`
- `MODUMAKE_PREBAKED_LIBRARY_ALLOWLIST`
- `MODUMAKE_COMPILE_SERVER_SHARED_TOKEN`

## 운영 주의

- public internet에 직접 공개하지 않습니다.
- compile worker와 같은 internal token으로만 호출합니다.
- 기본값으로는 loopback host에만 바인딩됩니다.
- real one-shot sandbox runtime backend는 Docker CLI 기준으로 구현되어 있습니다.
- `compile-server-proxy`는 internal-only fallback으로만 써야 합니다.
