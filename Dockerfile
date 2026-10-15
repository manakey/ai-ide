# Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Backend + serve frontend
FROM node:20-alpine AS runtime
WORKDIR /app

# Install system tools for code execution
RUN apk add --no-cache python3 py3-pip bash git

# Backend deps
COPY backend/package.json ./
RUN npm install

# Copy backend source
COPY backend/src ./src

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./public

# Serve static frontend from backend
RUN npm install serve --save

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "src/index.js"]
