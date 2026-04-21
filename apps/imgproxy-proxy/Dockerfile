FROM node:24-alpine AS base
FROM base AS base-installer

FROM --platform=$BUILDPLATFORM node:24-alpine AS base-build-platform
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

# for some reason --platform=$BUILDPLATFORM can't use other stage 
FROM --platform=$BUILDPLATFORM base-build-platform AS builder
# Set working directory
WORKDIR /app
RUN yarn global add turbo
COPY . .
RUN turbo prune @jh0project/imgproxy-proxy --docker

# for some reason --platform=$BUILDPLATFORM can't use other stage 
# Add lockfile and package.json's of isolated subworkspace
FROM --platform=$BUILDPLATFORM base-build-platform AS installer
WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN yarn install

# Build the project and its dependencies
COPY --from=builder /app/out/full/ .
RUN yarn turbo run build --filter=@jh0project/imgproxy-proxy...


FROM base AS prod-deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app
COPY --from=builder /app/out/json/ .
COPY --from=installer /app/.yarn/cache ./.yarn/cache
RUN yarn workspaces focus --all --production

FROM base AS runner
WORKDIR /app
RUN apk --no-cache add curl

# Run production as root, since bird need to be run as root
COPY --from=installer /app/package.json .
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=installer /app/packages packages
COPY --from=installer /app/apps apps

EXPOSE 3000
ENV PORT 3000

WORKDIR /app/apps/imgproxy-proxy
CMD ["node", "--enable-source-maps", "./dist/server.js"]