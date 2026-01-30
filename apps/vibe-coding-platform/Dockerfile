# Multi-stage Dockerfile for Vibe Coding Platform (Next.js 16 Standalone)
# Supports Dapr workflow integration

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.13.0 --activate

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package files for workspaces
COPY apps/vibe-coding-platform/package.json ./apps/vibe-coding-platform/
COPY packages/workflow-worlds-dapr/package.json ./packages/workflow-worlds-dapr/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.13.0 --activate

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/vibe-coding-platform/node_modules ./apps/vibe-coding-platform/node_modules
COPY --from=deps /app/packages/workflow-worlds-dapr/node_modules ./packages/workflow-worlds-dapr/node_modules

# Copy source code
COPY . .

# Build the workflow-worlds-dapr package first
WORKDIR /app/packages/workflow-worlds-dapr
RUN pnpm build

# Build the Next.js application
WORKDIR /app/apps/vibe-coding-platform

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time environment variables for Next.js
ARG NEXT_PUBLIC_APP_URL="https://vibe-coding-platform.cnoe.localtest.me:8443"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Build the Next.js application (standalone mode)
RUN pnpm next build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install kubectl for sandbox pod exec operations
RUN apk add --no-cache curl && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/kubectl && \
    apk del curl

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/apps/vibe-coding-platform/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/vibe-coding-platform/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/vibe-coding-platform/.next/static ./apps/vibe-coding-platform/.next/static

USER nextjs

EXPOSE 3000

# Start the server
CMD ["node", "apps/vibe-coding-platform/server.js"]
