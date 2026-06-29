# ModuMake Compile Server

독립된 로컬/클라우드 컴파일 마이크로서비스입니다.

## 엔드포인트

- `GET /health`
- `POST /api/v1/compile/job`

## 로컬 실행

```bash
node ./services/compile-server/server.mjs
```

기본 포트는 `4100`입니다.

환경 변수:

- `MODUMAKE_COMPILE_SERVER_PORT`
- `MODUMAKE_COMPILE_SERVER_HOST`
- `MODUMAKE_COMPILE_TIMEOUT_MS`
- `MODUMAKE_COMPILE_SOURCE_LIMIT`
- `MODUMAKE_COMPILE_SERVER_BODY_LIMIT`
- `ARDUINO_CLI_BIN`
- `MODUMAKE_COMPILE_SERVER_SHARED_TOKEN`
- `MODUMAKE_COMPILE_SERVER_ALLOW_NON_LOOPBACK`
- `MODUMAKE_COMPILE_SERVER_ALLOW_OPEN_HEALTH`

## 운영 주의

- 이 서버는 아직 public untrusted compile sandbox가 아닙니다.
- production/beta에서 직접 공개하지 않습니다.
- 앱 서버와 compile server 사이에는 `MODUMAKE_COMPILE_SERVER_SHARED_TOKEN`을 같은 값으로 맞춰 내부 호출만 허용합니다.
- 기본값으로는 loopback host(`127.0.0.1` / `localhost` / `::1`)에만 바인딩됩니다.
- `0.0.0.0` 같은 non-loopback bind는 `MODUMAKE_COMPILE_SERVER_ALLOW_NON_LOOPBACK=true` 없이는 시작 자체를 거부합니다.
- `/health`도 기본값으로는 같은 shared token이 필요합니다. 공개 health endpoint가 꼭 필요할 때만 `MODUMAKE_COMPILE_SERVER_ALLOW_OPEN_HEALTH=true`를 명시합니다.
- 실제 서비스에서는 sandboxed one-shot runner가 붙기 전까지 unsandboxed compile을 기본 비활성화 상태로 유지합니다.
- 앱 서버가 `queue` 모드일 때는 durable queue record를 만든 뒤 내부 launcher route(`/api/internal/compile/queue/launch`)가 이 서버로 one-shot 전달만 수행합니다. 이 단계 역시 sandbox 구현이 아니라 내부 경계 정리입니다.
- 현재 launcher의 기본 동작은 이 서버 직접 호출이 아니라 sandbox launch request outbox 생성입니다. 이 서버 직접 호출은 `MODUMAKE_COMPILE_LAUNCH_MODE=direct-http`일 때만 남겨 둔 레거시 내부 fallback입니다.
- 현재 app-side polling worker는 `one-shot-sandbox-launcher` backend로 launcher service에 handoff하고, launcher worker가 기본적으로 Docker one-shot sandbox를 실행합니다. 이 서버는 `compile-server-proxy` legacy fallback일 때만 뒤에 붙습니다.

## 헬스 체크

`GET /health`는 현재 `arduino-cli` 버전, 설치된 코어 목록, 지원 보드 매핑을 함께 돌려주므로 내부용 endpoint로 취급합니다.

## Docker 실행

```bash
docker build -f services/compile-server/Dockerfile -t modumake-compile-server .
docker run --rm -p 4100:4100 modumake-compile-server
```

ESP32 코어 설치를 생략하고 더 가볍게 올리고 싶다면:

```bash
docker build -f services/compile-server/Dockerfile \
  --build-arg INSTALL_ESP32_CORE=false \
  -t modumake-compile-server .
```

## 요청 예시

```json
{
  "jobId": "demo-job",
  "boardId": "uno",
  "sourceCode": "void setup() { Serial.begin(9600); } void loop() {}",
  "requiredLibraries": ["Wire"]
}
```

`jobId`는 영문, 숫자, `_`, `-`만 허용됩니다.

## 응답 예시

```json
{
  "success": true,
  "status": "COMPILATION_SUCCESS",
  "buildLogs": "...",
  "hexBinary": "BASE64..."
}
```
