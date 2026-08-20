FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate

COPY . .

# Keep package files independent inside the Docker layer. pnpm's default
# import strategy may hardlink files from its content-addressable store;
# those hardlinks can be preserved when node_modules is copied into the
# runtime image and fail to unpack on containerd/overlayfs hosts.
RUN pnpm install --frozen-lockfile --ignore-scripts --package-import-method=copy

RUN pnpm exec prisma generate --schema=./apps/conversation-service/prisma/schema.prisma

RUN pnpm run build conversation-service


FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /usr/src/app
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/apps/conversation-service/apps/conversation-service/src/main.js"]
