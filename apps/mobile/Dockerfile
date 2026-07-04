FROM node:22-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
RUN apk add --no-cache git

WORKDIR /workspace

# Install phase
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/types/package.json packages/types/tsconfig.json ./packages/types/
COPY apps/mobile/package.json apps/mobile/tsconfig.json apps/mobile/metro.config.js apps/mobile/app.json ./apps/mobile/
RUN pnpm install --frozen-lockfile

# Source — overridé par les volumes en dev
COPY packages/types/src ./packages/types/src/
COPY apps/mobile/src ./apps/mobile/src/
COPY apps/mobile/assets ./apps/mobile/assets/

WORKDIR /workspace/apps/mobile
EXPOSE 8081 19000 19001

# --tunnel : pas besoin de configurer l'IP, fonctionne sur n'importe quel réseau
CMD ["pnpm", "start", "--", "--tunnel"]
