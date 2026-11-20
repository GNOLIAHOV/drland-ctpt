FROM node:22-alpine AS builder
WORKDIR /app

# Cho phép prisma generate chạy thành công trong bước build Docker
ARG DATABASE_URL="postgresql://postgres:postgres@postgres:5432/core_api?schema=public"
ENV DATABASE_URL=$DATABASE_URL

COPY package*.json prisma.config.ts ./
COPY src/prisma ./src/prisma
RUN npm install --no-audit --no-fund

COPY src ./src
COPY tsconfig*.json nest-cli.json ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json prisma.config.ts ./
COPY --from=builder /app/src/prisma ./src/prisma
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/uploads/properties

EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push && node dist/prisma/bootstrap-prod.js && node dist/main.js"]
