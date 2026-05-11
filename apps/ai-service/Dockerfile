FROM node:20-bullseye AS builder

WORKDIR /usr/src/app
RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm run build ai-service


FROM node:20-bullseye AS production

WORKDIR /usr/src/app
RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/apps/ai-service/apps/ai-service/src/main.js"]