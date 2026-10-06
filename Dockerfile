FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=10000
ENV HOST=0.0.0.0

RUN chown -R node:node /app
USER node

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 CMD node -e "fetch('http://127.0.0.1:10000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node","server.js"]
