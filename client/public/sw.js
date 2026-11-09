/* global self, caches, fetch, URL */
// Service Worker cho Tiên Giới (chỉ đăng ký ở bản build production).
// Cache asset tĩnh (ảnh, icon, bundle JS/CSS, HTML gốc); tuyệt đối không can thiệp kết nối WebSocket hay API phòng chơi.
const CACHE_NAME = "tien-gioi-static-v1";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/assets/tileset.png",
  "/assets/atlas.png",
  "/assets/atlas.json",
  "/assets/items/hoi_huyet_dan.png",
  "/assets/items/hoi_linh_dan.png",
  "/assets/items/tu_khi_dan.png",
  "/assets/items/long_tho.png",
  "/assets/items/nanh_soi.png",
  "/assets/items/da_ho.png",
  "/assets/items/vay_mang.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
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
  if (pathname.startsWith("/assets/") || pathname.startsWith("/icons/")) return true;
  return /\.(?:js|css|png|svg|webp|json|webmanifest|woff2?)$/i.test(pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Chỉ xử lý HTTP(S) cùng origin; không bao giờ đụng tới WebSocket, matchmaking Colyseus hay /health
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (req.headers.get("upgrade") === "websocket") return;
  if (url.pathname.startsWith("/matchmake") || url.pathname === "/health") return;

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

  // Tài nguyên tĩnh: trả ngay từ cache nếu có, đồng thời làm mới ngầm từ mạng (stale-while-revalidate)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      }),
    ),
  );
});
