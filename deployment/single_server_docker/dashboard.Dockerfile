# =========================================================================
# Stage 1: Dependency Installation
# =========================================================================
FROM node:lts-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 复制 package.json 并使用 npm 进行依赖安装，以避免容器内 pnpm 软链接导致的 standalone 依赖丢失问题
COPY dashboard/package.json ./
RUN npm install

# =========================================================================
# Stage 2: Next.js Production Build
# =========================================================================
FROM node:lts-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY dashboard/ ./

# 编译 Next.js 独立运行版本 (Standalone Output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# =========================================================================
# Stage 3: Runtime Stage
# =========================================================================
FROM node:lts-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 拷贝 Next.js 独立运行版本所需核心产物
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8079
ENV PORT=8079
ENV HOSTNAME="0.0.0.0"

# 启动 standalone Next.js 服务
CMD ["node", "server.js"]
