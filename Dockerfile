# ==========================================
# Stage 1: Build TypeScript source code
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Upgrade OS packages to apply security patches
RUN apk update && apk upgrade --no-cache

# Copy dependency definition
COPY package*.json ./

# Install all dependencies (including devDependencies required for compilation)
RUN npm ci

# Copy tsconfig and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to ./dist
RUN npm run build

# ==========================================
# Stage 2: Minimal Production Image
# ==========================================
FROM node:20-alpine AS runner

# Upgrade OS packages to fix OS-level vulnerabilities and install dumb-init
RUN apk update && apk upgrade --no-cache && apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package descriptors
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist

# Create and switch to non-root user (node user is built into node-alpine with uid 1000)
RUN chown -R node:node /app
USER node

# Expose default application port
EXPOSE 3000

# Docker-level healthcheck as safety net
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

# dumb-init forwards signals to node properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
