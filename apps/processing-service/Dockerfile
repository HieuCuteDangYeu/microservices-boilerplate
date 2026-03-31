FROM node:20-alpine AS builder

WORKDIR /usr/src/app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm run build processing-service


FROM node:20-alpine AS production

RUN apk add --no-cache ffmpeg

WORKDIR /usr/src/app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/apps/processing-service/apps/processing-service/src/main"]