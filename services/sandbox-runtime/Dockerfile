FROM node:20-bookworm-slim

ARG INSTALL_ESP32_CORE=true
ARG PREBAKED_LIBRARIES=""

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git python3 \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh \
  && mv bin/arduino-cli /usr/local/bin/arduino-cli \
  && arduino-cli config init \
  && arduino-cli core update-index \
  && arduino-cli core install arduino:avr \
  && if [ "$INSTALL_ESP32_CORE" = "true" ]; then arduino-cli core install esp32:esp32; fi \
  && if [ -n "$PREBAKED_LIBRARIES" ]; then IFS=','; for lib in $PREBAKED_LIBRARIES; do arduino-cli lib install "$lib"; done; fi \
  && mkdir -p /opt \
  && cp -R /root/.arduino15 /opt/arduino-data \
  && chmod -R a+rX /opt/arduino-data

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin sandbox \
  && mkdir -p /app /workspace \
  && chown -R sandbox:sandbox /workspace /home/sandbox

WORKDIR /app

COPY services/compile-server/lib ./services/compile-server/lib
COPY services/sandbox-runtime ./services/sandbox-runtime

ENV MODUMAKE_COMPILE_LIBRARY_INSTALL_MODE=preinstalled-only
ENV HOME=/tmp
ENV ARDUINO_DIRECTORIES_DATA=/tmp/.arduino15

USER sandbox

CMD ["node", "./services/sandbox-runtime/execute-job.mjs", "/workspace/job.json", "/workspace/result.json"]
