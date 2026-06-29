# ModuMake Sandbox Runtime

one-shot compile sandbox container image입니다.

## 역할

- launcher worker가 생성한 단일 compile payload를 받아 한 번 실행합니다.
- compile phase는 container network 없이 돌도록 설계되어 있습니다.
- 라이브러리 설치는 runtime 시점이 아니라 image build 시점의 prebaked allowlist로 제한합니다.

## 이미지 빌드

```bash
docker build -f ./services/sandbox-runtime/Dockerfile -t modumake/compile-sandbox-runtime:local .
```

빠른 local smoke 용도라면 AVR-only 빌드가 더 현실적입니다.

```bash
docker build \
  --build-arg INSTALL_ESP32_CORE=false \
  -f ./services/sandbox-runtime/Dockerfile \
  -t modumake/compile-sandbox-runtime:local .
```

prebaked library를 넣고 싶으면:

```bash
docker build \
  --build-arg PREBAKED_LIBRARIES="Wire,DHT sensor library" \
  -f ./services/sandbox-runtime/Dockerfile \
  -t modumake/compile-sandbox-runtime:local .
```

## 실행 계약

container는 기본적으로 아래 command를 기대합니다.

```bash
node /app/services/sandbox-runtime/execute-job.mjs /workspace/job.json /workspace/result.json
```

- 입력: `/workspace/job.json`
- 출력: `/workspace/result.json`

## 운영 주의

- 이 이미지는 launcher worker가 붙이는 `docker run` 보안 플래그와 함께 써야 의미가 있습니다.
- runtime 시점 `arduino-cli lib install`은 기본 금지입니다.
- allowlist 밖 라이브러리는 compile 전에 실패시킵니다.
