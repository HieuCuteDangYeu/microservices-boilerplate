FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY apps/conversation-service/prisma ./apps/conversation-service/prisma/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN npx prisma generate --schema=./apps/conversation-service/prisma/schema.prisma

RUN pnpm run build conversation-service

CMD ["node", "dist/apps/conversation-service/main.js"]
