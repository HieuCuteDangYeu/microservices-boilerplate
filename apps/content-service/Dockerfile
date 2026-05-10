FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN npx prisma generate --schema=./apps/content-service/prisma/schema.prisma

RUN pnpm run build content-service


FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

RUN npx prisma@5.22.0 generate --schema=./apps/content-service/prisma/schema.prisma

USER node

CMD ["node", "dist/apps/content-service/apps/content-service/src/main.js"]