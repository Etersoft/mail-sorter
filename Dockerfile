# Запуск: docker run --rm -v $PWD/config.json:/app/config.json mail-sorter
# (параметры командной строки mail-sorter можно передать после имени образа)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY config.default.json ./
COPY src ./src
USER node
ENTRYPOINT ["node", "src/runCli.js"]
