# syntax=docker/dockerfile:1.7
# The API's image (B13a). From the repository root:  docker build -f apps/api/Dockerfile -t primolar-api .
# Service:  docker run … primolar-api                                            (node dist/main.mjs)
# Release:  docker run … primolar-api node_modules/.bin/prisma migrate deploy    (before every service update, E4)
ARG NODE_VERSION=22

# Pinned by digest (the multi-arch index of node:22-bookworm-slim, 2026-11-19): a moved tag can't change the image
# unseen. With NODE_VERSION, update it: `docker buildx imagetools inspect node:<version>-bookworm-slim`, its Digest.
FROM node:${NODE_VERSION}-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS base
# Prisma's schema engine (the release step) links against OpenSSL, which the slim image lacks.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
# `prisma generate` (the api's postinstall) reads DATABASE_URL through prisma.config.ts. Nothing connects during a build.
ENV DATABASE_URL=mysql://build:build@127.0.0.1:3306/build
# Manifests first, so the install layer is cached until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/seed/package.json packages/seed/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "api..."
COPY packages/shared packages/shared
COPY packages/seed packages/seed
COPY apps/api apps/api
RUN pnpm --filter api build
# Production dependencies only, with @pedia/* copied in (the bundle inlines them, but the demo seed still imports them).
# Without install scripts (the api's postinstall can't run outside the workspace); then only @prisma/engines' one, which
# downloads the schema engine `migrate deploy` needs: the runtime has no network to fetch it.
RUN pnpm --filter api deploy --prod --ignore-scripts /out \
 && cd "$(dirname "$(find /out/node_modules/.pnpm -path '*/node_modules/@prisma/engines/package.json' | head -1)")" \
 && node scripts/postinstall.js

FROM base AS runtime
# APP_ENV=production: a container started without its settings fails closed (env.ts's hosted checks). CDK sets APP_ENV
# on every task (demo or production), which overrides this.
ENV NODE_ENV=production APP_ENV=production PORT=4100
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/api/prisma.config.ts ./prisma.config.ts
# TLS to RDS (#15): AWS's RDS CA bundle, fetched at build time. DATABASE_URL's sslcert points here (packages/infra service-stack.ts).
ADD --chown=node:node --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-global-bundle.pem
USER node
EXPOSE 4100
# For `docker run` locally; ECS ignores this and uses the task definition's check on the same path (B13b).
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/api/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.mjs"]
