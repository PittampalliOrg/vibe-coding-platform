# syntax=docker/dockerfile:1

# Workflow Web - Observability UI for Dapr Workflows
# Multi-stage build for production deployment

# =============================================================================
# Stage 1: Base image with pnpm
# =============================================================================
FROM node:22-alpine AS base

# Install corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.13.0 --activate

WORKDIR /app

# =============================================================================
# Stage 2: Install dependencies
# =============================================================================
FROM base AS deps

# Copy package files for the monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/workflow-web/package.json ./apps/workflow-web/
COPY packages/workflow-worlds-dapr/package.json ./packages/workflow-worlds-dapr/

# Install dependencies
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: Build the application
# =============================================================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/workflow-web/node_modules ./apps/workflow-web/node_modules
COPY --from=deps /app/packages/workflow-worlds-dapr/node_modules ./packages/workflow-worlds-dapr/node_modules

# Copy source code
COPY apps/workflow-web ./apps/workflow-web
COPY packages/workflow-worlds-dapr ./packages/workflow-worlds-dapr
COPY pnpm-workspace.yaml ./

# Build the workflow-worlds-dapr package first
WORKDIR /app/packages/workflow-worlds-dapr
RUN pnpm run build

# Build the Next.js application
WORKDIR /app/apps/workflow-web
RUN pnpm next build

# =============================================================================
# Stage 4: Production image
# =============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application (standalone output)
COPY --from=builder /app/apps/workflow-web/.next/standalone ./
# Static files must be at .next/static relative to server.js location
COPY --from=builder /app/apps/workflow-web/.next/static ./.next/static
COPY --from=builder /app/apps/workflow-web/public ./public

# Copy pnpm .pnpm folder to where standalone symlinks expect it
# Standalone symlinks point to ../../../node_modules/.pnpm/... which resolves to /node_modules/.pnpm/
COPY --from=builder /app/node_modules/.pnpm /node_modules/.pnpm

# Set ownership
RUN chown -R nextjs:nodejs /app /node_modules

USER nextjs

# Environment variables
ENV NODE_ENV=production
ENV PORT=3456
ENV HOSTNAME=0.0.0.0

EXPOSE 3456

# Start the application
CMD ["node", "server.js"]
