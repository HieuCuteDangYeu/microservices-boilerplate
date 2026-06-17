FROM node:24-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
  g++ \
  make \
  openssl \
  python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm run build call-service


FROM node:24-bookworm-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
  g++ \
  make \
  openssl \
  python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/apps/call-service/apps/call-service/src/main.js"]
