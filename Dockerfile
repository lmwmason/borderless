FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8080 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.release/migrate.cjs ./.release/migrate.cjs
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 8080
CMD ["sh", "-c", "node .release/migrate.cjs && unset DIRECT_DATABASE_URL DATABASE_URL && exec node server.js"]
