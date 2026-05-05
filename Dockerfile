FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm install --workspaces
COPY . .
RUN npm run build --workspace=client
RUN npm run build --workspace=server

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./public
COPY --from=builder /app/server/package*.json ./server/
RUN cd server && npm install --production
ENV NODE_ENV=production
ENV PORT=3000
ENV PUBLIC_DIR=/app/public
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
