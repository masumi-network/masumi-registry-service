FROM node:20-slim AS deps
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /usr/src/app
COPY ./src ./src
COPY ./prisma ./prisma
COPY tsconfig.json .
COPY public ./public
RUN pnpm run build
RUN pnpm prune --prod

FROM node:20-slim AS frontend-builder
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile
WORKDIR /usr/src/app/frontend
ARG NEXT_PUBLIC_REGISTRY_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_REGISTRY_API_BASE_URL=${NEXT_PUBLIC_REGISTRY_API_BASE_URL}
COPY frontend/package.json ./
COPY frontend/openapi-ts.config.ts ./openapi-ts.config.ts
COPY frontend/openapi-docs.json ./openapi-docs.json
COPY frontend/src ./src
COPY frontend/public ./public
COPY frontend/next.config.ts ./
COPY frontend/postcss.config.mjs ./
COPY frontend/tsconfig.json ./
COPY frontend/components.json ./
COPY frontend/eslint.config.mjs ./
RUN pnpm run openapi-ts
RUN pnpm run build

FROM node:20-slim AS runner
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
