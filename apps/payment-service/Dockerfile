FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY apps/payment-service/prisma ./apps/payment-service/prisma/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN npx prisma generate --schema=./apps/payment-service/prisma/schema.prisma

RUN pnpm run build payment-service


FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY apps/payment-service/prisma ./apps/payment-service/prisma/

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

RUN npx prisma@5.22.0 generate --schema=./apps/payment-service/prisma/schema.prisma

COPY --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/apps/payment-service/apps/payment-service/src/main"]