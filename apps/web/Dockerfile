FROM node:20-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

FROM base AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  pkg-config \
  sqlite3 \
  libsqlite3-dev \
  ffmpeg \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libatspi2.0-0 \
  libx11-xcb1 \
  libxshmfence1 \
  libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/audio-core/package.json ./packages/audio-core/package.json
COPY packages/utils/package.json ./packages/utils/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app

COPY . .
RUN pnpm build

FROM base AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  git \
  cmake \
  make \
  g++ \
  pkg-config \
  sqlite3 \
  ffmpeg \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libatspi2.0-0 \
  libx11-xcb1 \
  libxshmfence1 \
  libgtk-3-0 \
  libvulkan1 \
  mesa-vulkan-drivers \
  libegl1 \
  libgles2 \
  libgl1 \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update && apt-get install -y --no-install-recommends \
    google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN cat <<'EOF' >/usr/local/bin/chromium-headless-angle
#!/usr/bin/env bash
set -e
BROWSER_BIN="$(command -v google-chrome-stable || command -v google-chrome || command -v chromium || command -v chromium-browser)"
exec "$BROWSER_BIN" \
  --headless \
  --use-gl=angle \
  --use-angle=vulkan \
  --ignore-gpu-blocklist \
  --enable-webgl \
  --disable-gpu-sandbox \
  "$@"
EOF
RUN chmod +x /usr/local/bin/chromium-headless-angle

# Root workspace metadata + installed deps
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules

# Built web workspace
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/packages ./packages

EXPOSE 3000

CMD ["pnpm", "start"]
