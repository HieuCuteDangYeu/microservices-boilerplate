FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY apps/user-service/prisma ./apps/user-service/prisma/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN npx prisma generate --schema=./apps/user-service/prisma/schema.prisma

RUN pnpm run build user-service


FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY apps/user-service/prisma ./apps/user-service/prisma/

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

RUN npx prisma generate --schema=./apps/user-service/prisma/schema.prisma

COPY --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/apps/user-service/apps/user-service/src/main"]