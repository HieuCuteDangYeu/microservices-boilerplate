FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY apps/auth-service/prisma ./apps/auth-service/prisma/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN npx prisma generate --schema=./apps/auth-service/prisma/schema.prisma

RUN pnpm run build auth-service

CMD ["node", "dist/apps/auth-service/apps/auth-service/src/main"]