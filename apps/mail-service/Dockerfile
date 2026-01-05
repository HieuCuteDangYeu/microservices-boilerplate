FROM node:20-alpine

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm run build mail-service

CMD ["node", "dist/apps/mail-service/apps/mail-service/src/main"]
