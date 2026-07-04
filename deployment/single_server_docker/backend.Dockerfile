# =========================================================================
# Stage 1: Build JS SDK
# =========================================================================
FROM node:lts-alpine AS sdk-builder
WORKDIR /app

# 复制 SDK 依赖配置并使用 npm 进行安装，以避免容器内 pnpm 软链接导致的文件丢失问题
COPY sdk_js/package.json ./
RUN npm install

# 拷贝 SDK 源码并编译
COPY sdk_js/ ./
RUN npm run build

# =========================================================================
# Stage 2: Build Go Binaries
# =========================================================================
FROM golang:1.26-alpine AS go-builder
WORKDIR /app
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download

# 确保目标目录存在，并将构建出的 JS SDK 产物复制到 Go 嵌入路径中
RUN mkdir -p ./backend/cmd/collector/sdk
COPY --from=sdk-builder /app/dist/mpa.iife.js ./backend/cmd/collector/sdk/mpa.iife.js
COPY --from=sdk-builder /app/dist/spa.js ./backend/cmd/collector/sdk/spa.js
COPY --from=sdk-builder /app/dist/ui/index.css ./backend/cmd/collector/sdk/index.css

# 拷贝后端源码并执行编译
COPY backend/ ./backend/
RUN go build -o /app/bin/api ./backend/cmd/api && \
    go build -o /app/bin/collector ./backend/cmd/collector && \
    go build -o /app/bin/worker ./backend/cmd/worker && \
    go build -o /app/bin/updater ./backend/cmd/updater && \
    go build -o /app/bin/cy_migrate ./backend/cmd/cy_migrate

# =========================================================================
# Stage 3: Runtime Stage
# =========================================================================
FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata

# 从构建器拷贝二进制文件和数据库迁移脚本
COPY --from=go-builder /app/bin/ /app/
COPY backend/migrations/ /app/migrations/

ENV PATH="/app:${PATH}"
