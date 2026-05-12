FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN npx prisma generate --schema=./apps/auth-service/prisma/schema.prisma

RUN pnpm run build auth-service


FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /usr/src/app/dist ./dist

RUN npx prisma@5.22.0 generate --schema=./apps/auth-service/prisma/schema.prisma

USER node

CMD ["node", "dist/apps/auth-service/apps/auth-service/src/main.js"]