FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_CORE_API_URL=http://localhost:3001
ARG VITE_AI_AGENT_URL=http://localhost:8000
ENV VITE_CORE_API_URL=$VITE_CORE_API_URL
ENV VITE_AI_AGENT_URL=$VITE_AI_AGENT_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
RUN printf 'server {\n    listen 80;\n    server_name _;\n    root /usr/share/nginx/html;\n    index index.html;\n    location / {\n        try_files $uri $uri/ /index.html;\n    }\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
