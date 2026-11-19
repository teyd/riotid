# syntax=docker/dockerfile:1

FROM ghcr.io/voidzero-dev/vite-plus:1.7.0 AS build
WORKDIR /app
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./
COPY --chown=vp:vp apps/api/package.json apps/api/package.json
COPY --chown=vp:vp apps/web/package.json apps/web/package.json
COPY --chown=vp:vp packages/contracts/package.json packages/contracts/package.json
COPY --chown=vp:vp packages/riot/package.json packages/riot/package.json
COPY --chown=vp:vp packages/db/package.json packages/db/package.json
COPY --chown=vp:vp packages/ingest/package.json packages/ingest/package.json
COPY --chown=vp:vp packages/identity/package.json packages/identity/package.json
COPY --chown=vp:vp packages/test-utils/package.json packages/test-utils/package.json
RUN vp install --frozen-lockfile
COPY --chown=vp:vp . .
RUN vp build apps/web

FROM ghcr.io/voidzero-dev/vite-plus:1.7.0 AS prod-deps
WORKDIR /app
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./
COPY --chown=vp:vp apps/api/package.json apps/api/package.json
COPY --chown=vp:vp apps/web/package.json apps/web/package.json
COPY --chown=vp:vp packages/contracts/package.json packages/contracts/package.json
COPY --chown=vp:vp packages/riot/package.json packages/riot/package.json
COPY --chown=vp:vp packages/db/package.json packages/db/package.json
COPY --chown=vp:vp packages/ingest/package.json packages/ingest/package.json
COPY --chown=vp:vp packages/identity/package.json packages/identity/package.json
COPY --chown=vp:vp packages/test-utils/package.json packages/test-utils/package.json
RUN vp install --frozen-lockfile --prod

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=prod-deps /app/packages/riot/node_modules ./packages/riot/node_modules
COPY --from=prod-deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=prod-deps /app/packages/ingest/node_modules ./packages/ingest/node_modules
COPY --from=prod-deps /app/packages/identity/node_modules ./packages/identity/node_modules
COPY --from=build /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/api/src/cli.ts", "serve"]
