# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ubuntu:24.04 AS runner
WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV KICAD_CLI_PATH=/usr/bin/kicad-cli

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg software-properties-common \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && add-apt-repository --yes ppa:kicad/kicad-10.0-releases \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs kicad \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --create-home --home-dir /home/nextjs --shell /usr/sbin/nologin nextjs \
  && mkdir -p /home/nextjs/.cache /home/nextjs/.config /home/nextjs/.local/share \
  && chown -R nextjs:nodejs /home/nextjs

ENV HOME=/home/nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
