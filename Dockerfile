# Build on the SAME Debian base as the runtime so better-sqlite3's native
# binding carries over cleanly. Build on the machine you'll run on (arm64 vs
# amd64 images are not interchangeable).

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json tailwind.config.js postcss.config.js ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# prod deps only; native module compiles here against the runtime image
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# tsx-run sources needed for `npm run scrape` inside the container
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./
COPY config ./config

# non-root user owning the writable data dir (WAL sidecars need rw)
RUN useradd -m hunter && mkdir -p /app/data && chown -R hunter:hunter /app
USER hunter

EXPOSE 3000

# Healthcheck hits a cheap JSON endpoint; "unhealthy" surfaces in `docker ps`.
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/api/runs/latest').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
