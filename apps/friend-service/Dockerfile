FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm exec prisma generate --schema=./apps/friend-service/prisma/schema.prisma

RUN pnpm run build:friend


FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/@prisma/friend-client ./node_modules/@prisma/friend-client
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

USER node

CMD ["node", "dist/apps/friend-service/apps/friend-service/src/main.js"]
