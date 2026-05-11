FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm run build ai-service


FROM node:20-alpine AS production

RUN apk add --no-cache openssl gcompat libstdc++ zlib

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/apps/ai-service/apps/ai-service/src/main.js"]