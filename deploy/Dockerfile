# One image for both processes: the ECS task definition picks api.js or worker.js.
# Build from the repo root:  docker build -f deploy/Dockerfile -t soap-scribe .

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter @soap-scribe/server...
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN pnpm --filter @soap-scribe/server build \
 && pnpm --filter @soap-scribe/server deploy --prod --legacy /out \
 && cp -r packages/server/dist /out/dist

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/package.json ./package.json
USER node
EXPOSE 8787
CMD ["node", "dist/api.js"]
