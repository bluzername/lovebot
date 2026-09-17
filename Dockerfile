# Build stage: install all dependencies (including TypeScript) and compile
FROM node:26-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json crypto-polyfill.js ./
COPY src ./src
RUN npm run build \
 && mkdir -p dist/public \
 && cp -r src/public/. dist/public/

# Runtime stage: production dependencies only
FROM node:26-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY crypto-polyfill.js ./
COPY public ./public

# WhatsApp session, conversation contexts and uploads live here; mount a
# volume so a restart does not force a new QR pairing.
RUN mkdir -p auth_info_lovebot data/contexts downloads
VOLUME ["/app/auth_info_lovebot", "/app/data"]

ENV PORT=3000
EXPOSE 3000

CMD ["node", "-r", "./crypto-polyfill.js", "dist/index.js"]
