FROM node:20-bullseye AS builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN chown -R node:node /usr/src/app/node_modules

RUN pnpm exec prisma generate --schema=./apps/ai-service/prisma/schema.prisma

RUN pnpm run build ai-service


FROM node:20-bullseye AS production

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

RUN chown -R node:node /usr/src/app/node_modules

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/@prisma/ai-client ./node_modules/@prisma/ai-client

USER node

CMD ["node", "dist/apps/ai-service/apps/ai-service/src/main.js"]
