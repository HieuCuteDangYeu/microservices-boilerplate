FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN npx prisma generate --schema=./apps/payment-service/prisma/schema.prisma

RUN pnpm run build payment-service


FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /usr/src/app/dist ./dist

RUN npx prisma@5.22.0 generate --schema=./apps/payment-service/prisma/schema.prisma

USER node

CMD ["node", "dist/apps/payment-service/apps/payment-service/src/main.js"]