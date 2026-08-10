# ---- Stage 1: Dependencies ----
FROM docker.m.daocloud.io/library/node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci

# ---- Stage 2: Build ----
FROM docker.m.daocloud.io/library/node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---- Stage 3: Production ----
FROM docker.m.daocloud.io/library/nginx:1.25-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3100
