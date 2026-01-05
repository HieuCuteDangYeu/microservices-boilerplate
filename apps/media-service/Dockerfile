FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY apps/media-service/prisma ./apps/media-service/prisma/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN npx prisma generate --schema=./apps/media-service/prisma/schema.prisma

RUN pnpm run build media-service

CMD ["node", "dist/apps/media-service/apps/media-service/src/main"]
