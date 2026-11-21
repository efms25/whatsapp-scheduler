# ---- deps ----
FROM node:24-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY web/package.json ./web/
# better-sqlite3 e esbuild publicam binários pré-compilados; ignorar scripts
# evita exigir Python/compilador na imagem de build.
RUN npm ci --ignore-scripts \
  && node -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); if (!db.prepare('select 1 as ok').get().ok) process.exit(1); db.close()"

# ---- build ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY web ./web
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app --create-home app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/web/dist ./web/dist
COPY --chown=app:app package.json ./

RUN mkdir -p /app/storage/db /app/storage/media /app/storage/auth \
  && chown -R app:app /app/storage

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
