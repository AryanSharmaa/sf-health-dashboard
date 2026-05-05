FROM node:20-alpine

WORKDIR /app

# Install deps first (layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

CMD ["node", "src/server.js"]
