FROM node:20-slim AS deps
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /usr/src/app
COPY ./src ./src
COPY ./prisma ./prisma
COPY tsconfig.json .
COPY public ./public
RUN pnpm exec prisma generate
RUN pnpm build
RUN pnpm prune --prod

FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=builder --chown=node:node /usr/src/app/dist ./dist
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/package.json ./

USER node

EXPOSE 3000
CMD ["node", "./dist/index.js"]
