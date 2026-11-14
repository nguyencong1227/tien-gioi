/* global self, caches, fetch, URL */
// Service Worker cho Tiên Giới (chỉ đăng ký ở bản build production).
// Khi chạy `npm run build`, `client/scripts/stamp-sw.mjs` sẽ tự động đóng dấu mã băm phiên bản
// vào `CACHE_NAME` và quét thư mục `dist/` để điền danh sách `PRECACHE_URLS`.
const CACHE_NAME = "tien-gioi-static-v1";

const PRECACHE_URLS = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => {
        // Lần đầu mở ứng dụng: kích hoạt ngay để sẵn sàng ngoại tuyến
        if (!self.registration.active) {
          return self.skipWaiting();
        }
      }),
  );
});

// Lắng nghe yêu cầu cập nhật an toàn từ client (khi người chơi không trong trận / bí cảnh)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Kiểm tra xem URL có phải tài nguyên tĩnh được phép cache hay không. */
function isStaticAsset(pathname) {
  if (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/packs/")
  )
    return true;
  return /\.(?:js|css|png|svg|webp|json|webmanifest|woff2?|ogg|mp3)$/i.test(pathname);
}

/**
 * Kiểm tra xem tài nguyên có gắn hash nội dung bất biến hay không:
 * - Bundle JS/CSS của Vite (/assets/*-[hash].js/css)
 * - Tệp trong gói tải (/packs/**) có gắn băm tham số query ?v=<12 ký tự hex> (M7.15, #516).
 *   Lưu ý: /packs/manifest.json KHÔNG bao giờ có hash và phải ưu tiên mạng (network-first).
 */
function isHashedImmutableAsset(url) {
  if (/^\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?)$/i.test(url.pathname)) return true;
  if (
    url.pathname.startsWith("/packs/") &&
    url.pathname !== "/packs/manifest.json" &&
    /^[0-9a-f]{12}$/i.test(url.searchParams.get("v") || "")
  ) {
    return true;
  }
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Chỉ xử lý HTTP(S) cùng origin; không bao giờ đụng tới WebSocket, matchmaking Colyseus hay /health
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (req.headers.get("upgrade") === "websocket") return;
  // Tuyệt đối không can thiệp vào WebSocket, matchmaking, /health hay API tài khoản /api/*
  if (
    url.pathname.startsWith("/matchmake") ||
    url.pathname === "/health" ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Điều hướng trang (HTML): ưu tiên mạng để luôn nhận bản build mới nhất, mất mạng thì dùng bản đã lưu
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put("/index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/"))),
    );
    return;
  }

  if (!isStaticAsset(url.pathname)) return;

  // Bundle hoặc gói có gắn hash: ưu tiên cache (cache-first) vì đổi nội dung là đổi băm / tên file
  if (isHashedImmutableAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              cache.put(req, res.clone());
            }
            return res;
          });
        }),
      ),
    );
    return;
  }

  // Tài nguyên tĩnh không gắn hash (atlas.png, atlas.json, tileset.png, icon...):
  // ưu tiên mạng (network-first) để luôn đồng bộ với JS mới ngay lần mở đầu tiên sau deploy,
  // chỉ dùng cache khi ngoại tuyến hoặc lỗi mạng.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cache.match(req)),
    ),
  );
});
