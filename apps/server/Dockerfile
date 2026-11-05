# syntax=docker/dockerfile:1
FROM node:22-alpine AS pruner
WORKDIR /repo
RUN npm i -g turbo@2
COPY . .
RUN turbo prune @zag/server --docker

FROM node:22-alpine AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/package-lock.json .
RUN npm ci --ignore-scripts
COPY --from=pruner /repo/out/full/ .
RUN npx turbo run build --filter=@zag/server
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION PORT=8080
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages/protocol/package.json ./packages/protocol/package.json
COPY --from=builder /repo/packages/protocol/dist ./packages/protocol/dist
COPY --from=builder /repo/apps/server/package.json ./apps/server/package.json
COPY --from=builder /repo/apps/server/dist ./apps/server/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "apps/server/dist/bootstrap.js"]
