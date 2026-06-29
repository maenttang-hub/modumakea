FROM node:20-bookworm-slim

ARG INSTALL_ESP32_CORE=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git python3 \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh \
  && mv bin/arduino-cli /usr/local/bin/arduino-cli \
  && arduino-cli config init \
  && arduino-cli core update-index \
  && arduino-cli core install arduino:avr \
  && if [ "$INSTALL_ESP32_CORE" = "true" ]; then arduino-cli core install esp32:esp32; fi \
  && mkdir -p /root/.arduino15 /workspace

WORKDIR /workspace

COPY services/compile-server ./services/compile-server

EXPOSE 4100

CMD ["node", "./services/compile-server/server.mjs"]
