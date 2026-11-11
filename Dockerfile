# Stage 1: Build client và chuẩn bị ứng dụng
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package definitions để tận dụng Docker layer cache
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Cài đặt toàn bộ dependencies (bao gồm devDependencies để build client)
RUN npm ci

# Copy toàn bộ mã nguồn
COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY client/ ./client/
COPY server/ ./server/

# Build client thành static bundle trong client/dist
RUN npm run build


# Stage 2: Production runtime image
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=2567
ENV DATA_DIR=/app/data/players

# Tạo thư mục dữ liệu nhân vật và phân quyền sở hữu cho user node
RUN mkdir -p /app/data/players && chown -R node:node /app

# Copy các file cần thiết từ builder
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/tsconfig.base.json ./
COPY --chown=node:node --from=builder /app/shared ./shared
COPY --chown=node:node --from=builder /app/server ./server
COPY --chown=node:node --from=builder /app/client/dist ./client/dist

# Chạy với user node (non-root) để đảm bảo an toàn bảo mật
USER node

EXPOSE 2567

VOLUME ["/app/data/players"]

# Healthcheck kiểm tra /health bằng Node.js built-in fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 2567) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Chạy node TRỰC TIẾP (không qua `npm start`): npm KHÔNG chuyển SIGTERM cho tiến trình con, nên `docker stop` giết npm ngay (mã 143, 6 ms)
# và server (tiến trình cháu) bị giết mà KHÔNG chạy được lưu nhân vật khi tắt: mất tới 30 giây tiến trình của mọi người mỗi lần cập nhật
# bản chạy thật (CI "Chạy thử ảnh" bắt được: đả tọa rồi docker stop, tu vi trên đĩa vẫn 0). `node --import tsx` là một tiến trình duy nhất
# nên Colyseus nhận SIGTERM, lưu rồi thoát mã 0. Cần cwd = server/ để tsx đọc `server/tsconfig.json` (decorator của schema).
WORKDIR /app/server
CMD ["node", "--import", "tsx", "src/index.ts"]
