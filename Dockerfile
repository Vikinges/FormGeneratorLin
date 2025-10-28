# Многоэтапная сборка для оптимизации размера образа
FROM node:18-alpine AS builder

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm ci --only=production

# Собираем клиентскую часть
COPY client ./client
WORKDIR /app/client
RUN npm ci && npm run build

# Финальный образ
FROM node:18-alpine

WORKDIR /app

# Копируем зависимости
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./public

# Копируем серверные файлы
COPY server.js ./
COPY pdf-generator.js ./
COPY package.json ./

# Создаем директории для работы
RUN mkdir -p uploads generated

# Устанавливаем переменные окружения
ENV PORT=3000
ENV NODE_ENV=production

# Открываем порт
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запускаем приложение
CMD ["node", "server.js"]

