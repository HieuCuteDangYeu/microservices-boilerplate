FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY apps/payment-service/prisma ./apps/payment-service/prisma/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN npx prisma generate --schema=./apps/payment-service/prisma/schema.prisma

RUN pnpm run build payment-service

CMD ["node", "dist/apps/payment-service/apps/payment-service/src/main"]
