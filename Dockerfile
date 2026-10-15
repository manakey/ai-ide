# ── Stage 1: Build frontend ──────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build
# Output: /frontend/dist/

# ── Stage 2: Backend + serve frontend ────────────────────
FROM node:20-alpine
WORKDIR /app

# Runtime tools for code execution
RUN apk add --no-cache python3 bash git

# Install backend deps
COPY backend/package.json ./
RUN npm install --omit=dev

# Copy backend source
COPY backend/src ./src

# Copy built frontend into /app/public
# index.js looks for: join(__dirname, '..', '..', 'public')
# __dirname = /app/src  →  ../../public = /app/public  ✓
COPY --from=frontend-builder /frontend/dist ./public

ENV NODE_ENV=production
ENV PORT=3001
ENV PUBLIC_DIR=/app/public

EXPOSE 3001

CMD ["node", "src/index.js"]
