FROM node:20-alpine AS builder

WORKDIR /usr/src/app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm run build media-service


FROM node:20-alpine AS production

WORKDIR /usr/src/app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/apps/media-service/apps/media-service/src/main"]