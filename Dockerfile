FROM node:22-slim AS deps
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /usr/src/app
COPY ./src ./src
COPY ./prisma ./prisma
COPY tsconfig.json .
COPY public ./public
RUN pnpm run build:backend
RUN pnpm prune --prod

# The admin UI is a static export built in its own stage, so its packages never reach
# the backend's node_modules (pruning a workspace that includes frontend/ fails).
FROM node:22-slim AS frontend-builder
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile --filter registry-admin-frontend
COPY ./frontend ./frontend
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm -C frontend run build

FROM node:22-slim AS runner
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=builder --chown=node:node /usr/src/app/dist ./dist
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/package.json ./
COPY --from=frontend-builder --chown=node:node /usr/src/app/frontend/dist ./frontend/dist

USER node

EXPOSE 3000
CMD ["node", "./dist/index.js"]
