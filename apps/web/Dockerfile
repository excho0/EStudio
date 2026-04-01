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
  git \
  cmake \
  make \
  g++ \
  pkg-config \
  sqlite3 \
  ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Root workspace metadata + installed deps
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules

# Built web workspace
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/packages ./packages

EXPOSE 3000

CMD ["pnpm", "start"]
