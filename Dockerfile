FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/diff-core/package.json packages/diff-core/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build --workspace client

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY packages/diff-core/package.json packages/diff-core/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev
COPY --from=build /app/packages/diff-core/src packages/diff-core/src
COPY --from=build /app/packages/diff-core/bin packages/diff-core/bin
COPY --from=build /app/server/src server/src
COPY --from=build /app/client/dist client/dist
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
