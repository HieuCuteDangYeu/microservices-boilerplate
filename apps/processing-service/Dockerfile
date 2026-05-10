FROM node:20-alpine AS builder

RUN apk add --no-cache ffmpeg

WORKDIR /usr/src/app
RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm run build processing-service


FROM node:20-alpine AS production

RUN apk add --no-cache ffmpeg

WORKDIR /usr/src/app
RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

USER node

CMD ["node", "dist/apps/processing-service/main.js"]