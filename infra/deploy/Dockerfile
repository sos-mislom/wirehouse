FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace apps/api --include-workspace-root && npm cache clean --force
COPY apps/api/src apps/api/src
COPY packages/contracts/src packages/contracts/src
COPY scripts/create-initial-admin.mjs scripts/create-initial-admin.mjs
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001 FILE_STORAGE_DRIVER=local
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/src/index.js"]
