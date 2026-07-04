FROM node:22-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

WORKDIR /workspace

# Install phase — cached tant que les manifests ne changent pas
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/types/package.json packages/types/tsconfig.json ./packages/types/
COPY apps/api/package.json apps/api/tsconfig.json apps/api/drizzle.config.ts ./apps/api/
RUN pnpm install --frozen-lockfile

# Source — overridé par les volumes en dev
COPY packages/types/src ./packages/types/src/
COPY apps/api/src ./apps/api/src/

WORKDIR /workspace/apps/api
EXPOSE 3000
ENV NODE_ENV=production
# Prod par défaut : tsx sans watch (le package @watchy/types est consommé en
# source TS), secrets via variables d'env du provider — pas de .env embarqué.
# Le mode dev (tsx watch + volumes) est réactivé par docker-compose.
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
