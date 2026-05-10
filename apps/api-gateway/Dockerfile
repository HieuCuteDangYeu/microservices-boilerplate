FROM node:20-alpine AS builder

WORKDIR /usr/src/app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm run build api-gateway


FROM node:20-alpine AS production

WORKDIR /usr/src/app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

USER node

CMD ["node", "dist/apps/api-gateway/main.js"]