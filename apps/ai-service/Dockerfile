FROM node:20-bullseye AS builder

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN chown -R node:node /usr/src/app/node_modules

RUN pnpm run build ai-service


FROM node:20-bullseye AS production

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

RUN chown -R node:node /usr/src/app/node_modules

COPY --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/apps/ai-service/apps/ai-service/src/main.js"]