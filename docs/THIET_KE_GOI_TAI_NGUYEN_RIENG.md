# Thiết kế: gói tài nguyên KHÔNG được phân phối lại, chỉ để trên máy chủ (QUYET_DINH_M3 mục 63)

> Người dùng đồng ý 22/11/2026 ~00:25. Cho các gói miễn phí đẹp nhưng cấm phân phối lại (Cainos Pixel Art Top Down Basic, Tiny Swords, Cute Fantasy RPG bản free, Sunnyside bản free...): **không bao giờ vào repo GitHub**, chỉ nằm trên máy chủ; bản chạy thật gắn chỉ đọc; thiếu gói thì client tự dùng hình thay thế để CI vẫn xanh. Chia việc: **G** kiểm giấy phép + danh sách gói; **A** cơ chế gắn / phục vụ gói (tài liệu này); **B** chọn hình + client dùng gói / hình thay thế (`docs/HUONG_DO_HOA_MOI.md`). Làm SAU giai đoạn 1 Ninja Adventure (#1196 đã có tài liệu + ảnh mẫu, #1197 G tải gói về `/mnt/data`).

## 1. Ràng buộc (từ mục 63 và AGENTS.md)
- Tệp gốc VÀ tệp đã chỉnh / ghép / đổi màu (atlas) của các gói này KHÔNG vào git (cả `client/public/`, `docs/art/`, test fixture). Repo công khai không chứa gì vi phạm.
- Lưu ở `/mnt/data/assets-private/` (máy chủ), có `SOURCES.md` (nguồn, giấy phép, ngày tải) và nằm trong bộ sao lưu (mục 7).
- Bản chạy thật: thư mục đã đóng `/mnt/data/assets-private/dist/` gắn vào container CHỈ ĐỌC; server phục vụ ở đường dẫn riêng, CHỈ gói đã đóng, KHÔNG liệt kê thư mục.
- CI / máy khác không có gói: client dùng hình thay thế (Ninja Adventure CC0 hoặc vẽ bằng code); không lỗi, không cảnh báo console.
- Gói itch.io cần "Name your price": người dùng tự tải; agent KHÔNG tự tải. Gói nào cấm thương mại hoặc điều khoản không rõ thì KHÔNG dùng (G quyết, `docs/GIAY_PHEP_TAI_NGUYEN_RIENG.md`).
- Đi qua các lớp bảo vệ sẵn có (`frameGuardMiddleware`, `originGuardMiddleware`, CSP), KHÔNG mở cổng hay đường vào riêng (AGENTS.md mục chống dùng ké).

## 2. Hai thư mục trên máy chủ
```
/mnt/data/assets-private/
  SOURCES.md              # mỗi gói một mục: tên, link trang chính thức, giấy phép (trích), ngày tải, sha256 tệp zip gốc
  src/<gói>/...           # tệp gốc đã giải nén (KHÔNG phục vụ, KHÔNG gắn vào container)
  work/...                # tệp đang ghép / chỉnh (KHÔNG phục vụ)
  dist/                   # CHỈ thư mục này được phục vụ và gắn vào container
    manifest.json         # danh mục gói + tệp (mục 3)
    <gói>/<tệp>           # hình đã đóng: atlas .png / .webp, JSON khung nếu cần
```
`dist/` chỉ chứa thứ client thật sự tải (atlas đã ghép, không phải sheet gốc nếu giấy phép cho phép tránh được): giảm bề mặt "phân phối lại" xuống mức tối thiểu (xem rủi ro 9.1).

## 3. Hợp đồng `shared/src/private-pack.ts` (PR `shared/` RIÊNG #1262, B hoặc C review; đã chỉnh theo review B ở #1259)
```ts
export const PRIVATE_PACK_URL_PREFIX = "/assets-private/";
export const PRIVATE_PACK_MANIFEST_URL = "/assets-private/manifest.json";
export interface PrivatePackFile { path: string; bytes: number; sha256: string }  // GIỐNG HỆT PackFile của client (client/src/gfx/packs.ts)
export interface PrivatePack { id: string; title: string; url?: string; license?: string; files: PrivatePackFile[] }
export interface PrivatePackManifest { packs: PrivatePack[] }                     // dạng gốc { packs } như PackManifest: KHÔNG có `version` song song
export const PRIVATE_PACK_EMPTY_MANIFEST: Readonly<PrivatePackManifest>           // { packs: [] } đóng băng: thứ máy chủ trả 200 khi tắt
export function privatePackViolations(m: unknown): string[]    // rỗng = hợp lệ
export function isSafePrivatePackPath(p: unknown): p is string
export function isSafePrivatePackUrl(u: unknown): u is string  // chỉ https:, có tên miền, <= 200, không khoảng trắng / HTML / user:pass
export function privatePackUrl(packId, path, sha256?): string  // gắn ?v=<12 hex đầu sha256>, CÙNG độ dài với /packs/
export function privatePackVersionMatches(v, sha256): boolean
```
Luật `privatePackViolations` (thuần, test từng nhánh): chỉ nhận ĐÚNG các trường của hợp đồng (trường lạ, kể cả `version` cũ, là lỗi); `packs` mảng <= 32; `id` khớp `^[a-z0-9][a-z0-9_-]{0,39}$`, duy nhất; `title` 2-80 ký tự không điều khiển, không khoảng trắng đầu / cuối; `url` (tuỳ chọn) chỉ `https:`; `license` (tuỳ chọn) 1-80 ký tự; `path` an toàn (mỗi đoạn bắt đầu chữ / số, không `..` / `.` / tuyệt đối / `\` / NUL / tệp ẩn, <= 120 ký tự, đuôi trong danh sách trắng `png webp jpg jpeg json ogg`) và duy nhất trong gói (không phân biệt hoa thường); `bytes` nguyên 1..4 MiB; `sha256` 64 hex thường; tổng <= 2000 tệp.
**Vì sao dùng LẠI dạng của client (B, review #1259):** client đã có bộ nạp gói `gfx/packs.ts` (M7.15): `ensurePack` bất đồng bộ, KHÔNG BAO GIỜ ném lỗi, idempotent, hết giờ vẫn tải tiếp rồi `onReady` dựng lại hình, thử lại tối đa 3 lần, hạn chờ khớp `perf-budget.json`, và đã coi 'manifest rỗng / thiếu / máy chủ trả `index.html`' là KHÔNG có gói. Gói riêng đi qua đúng máy này (chỉ khác tiền tố URL `/assets-private/`), không dựng bộ nạp thứ hai.

## 4. Máy chủ (A)
Biến môi trường **`ASSETS_PRIVATE_DIR`** (rỗng = TẮT, mặc định; không thư mục / manifest hỏng cũng = tắt, KHÔNG sập). Mô-đun `server/src/private-packs.ts` (thuần + test), nối ở `index.ts` SAU `originGuardMiddleware` và TRƯỚC `express.static`:
1. **Lúc khởi động** (một lần): đọc `<DIR>/manifest.json`, kiểm bằng `privatePackViolations`, rồi `stat` từng tệp: tệp thiếu / lệch `bytes` bị LOẠI khỏi bảng phục vụ (in `[CẢNH BÁO]` kèm tên, không sập). Dựng bảng `Map<"gói/đường dẫn", { abs, mime, sha256 }>` từ các tệp đã liệt kê, **đường dẫn tuyệt đối do máy chủ tự nối từ manifest, KHÔNG BAO GIỜ từ yêu cầu**: không có đường nào đi từ chuỗi người dùng tới hệ thống tệp (không cần lọc `..` làm lớp chính; vẫn lọc làm lớp phụ).
2. `GET /assets-private/manifest.json`: trả bản manifest ĐÃ LỌC (chỉ tệp còn phục vụ được; giữ `url` / `license`); `Cache-Control: no-cache`. **Khi TẮT / manifest hỏng vẫn trả 200 `{"packs":[]}`** (không 404 đỏ ở DevTools mỗi lần vào game; B, review #1259); các tệp riêng lẻ khi tắt vẫn 404 sạch (client không bao giờ xin vì manifest không liệt kê).
3. `GET|HEAD /assets-private/<gói>/<đường dẫn>`: tra bảng; không có thì **404** (kể cả tệp có trên đĩa nhưng không trong manifest, thư mục, `..`, `%2e%2e`, `\`, byte NUL, phương thức khác 405). Phản hồi: `Content-Type` theo danh sách trắng, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `ETag` = sha256; có `?v=` đúng hash (12 hex đầu, như `/packs/`) thì `Cache-Control: public, max-age=31536000, immutable`, không thì `no-cache`. Không `Content-Disposition`, không liệt kê thư mục, không `Accept-Ranges` dư.
4. `/health` KHÔNG tiết lộ số gói (tránh dò). Dòng log lúc khởi động: `Gói tài nguyên riêng: N gói / M tệp (ASSETS_PRIVATE_DIR)` hoặc `tắt`; `docs/TRIEN_KHAI.md` thêm dòng biến môi trường.
5. Kiểm sha256 toàn bộ KHÔNG làm lúc khởi động (tốn I/O trên ổ chậm); thay bằng công cụ `npm run assets-private:check -w server` (tính lại sha256 so với manifest, thoát khác 0 nếu lệch) và `assets-private:manifest` (sinh manifest từ `dist/`): chạy tay / trong quy trình đóng gói của B.
6. Giới hạn: tệp > `PRIVATE_PACK_FILE_MAX_BYTES` bị loại; bảng tối đa 2000 tệp; đọc tệp bằng `res.sendFile` với đường dẫn tuyệt đối đã kiểm (`dotfiles: "deny"`, không `index`).

## 5. Docker / triển khai (A viết trong REPO; người dùng áp ở `~/TT/tien-gioi-prod/`)
- `docker-compose.yml` (repo, bản mẫu): thêm
  ```yaml
  environment: [ASSETS_PRIVATE_DIR=/assets-private]
  volumes: ["${ASSETS_PRIVATE_DIST:-/mnt/data/assets-private/dist}:/assets-private:ro"]
  ```
  Thư mục chủ không có thì Docker tạo thư mục rỗng: manifest thiếu = TẮT, bản chạy thật vẫn chạy bằng hình thay thế. `deploy/docker-compose.prod.yml` cùng chỉnh. A KHÔNG đụng `~/TT/tien-gioi-prod/` (của người dùng): `docs/TRIEN_KHAI.md` ghi đúng dòng cần thêm.
- Máy dev của các dev (cùng máy chủ): đặt `ASSETS_PRIVATE_DIR=/mnt/data/assets-private/dist` vào `.env.local`; Vite dev proxy `/assets-private` về cổng server của dev (B thêm vào `client/vite.config.ts`).
- Bản đóng gói client (`client/dist`) KHÔNG chứa gói; CI build vẫn xanh vì client chỉ GỌI `/assets-private/manifest.json` lúc chạy.

## 6. Client (B) và hình thay thế (đã chỉnh theo review B ở #1259, sau khi đối chiếu `client/src/gfx/packs.ts`, `client/public/sw.js`)
- **Dùng LẠI `gfx/packs.ts`:** gói riêng là một NGUỒN thứ hai của `PackDef` (tiền tố URL `/assets-private/`, `PackFile` y hệt) đi qua `ensurePack` / `onReady` / thử lại sẵn có. Manifest đọc song song với việc đăng nhập (không cộng vào thời gian chờ vào game); `fetch` có hạn 3 giây; JSON sai / `privatePackViolations` không rỗng => KHÔNG có gói, KHÔNG `console.error` (chỉ `console.debug`), không toast. Không cần xử lý riêng cho `index.html` do Vite trả khi chạy một mình: `packs.ts` đã coi là không gói.
- **Khoá texture -> tệp do B giữ ở `client/src/gfx/private-art.ts`** (bảng CÔNG KHAI trong repo, `khoá -> { pack, path, frameWidth, frameHeight }`; là dữ liệu của Tiên Giới, không phải tệp có bản quyền nên vào git được), KHÔNG nhét khoá vào manifest. Test canh 'mọi khoá có hình thay thế CÙNG lưới ô / cùng ngữ nghĩa' (`HUONG_DO_HOA_MOI.md` mục 10: ô 16 px phóng x2 = `TILE` 32, autotile 47 ô, một ảnh tileset gộp, đùn mép 1 px). Tệp thiếu / tải lỗi cho RIÊNG khoá đó thì khoá đó lùi về hình thay thế.
- **Tránh nháy hình:** gói riêng của bản đồ HIỆN TẠI (nền / cây / nhà) đi qua đúng hook chờ gói bản đồ ở màn chuyển cảnh (8 giây) và `onReady` dựng lại đúng MỘT lần nếu về muộn; chỉ thứ phụ (trang trí hiếm, âm thanh) tải lúc rảnh.
- **Service Worker (`client/public/sw.js`):** `isStaticAsset` khớp theo phần mở rộng nên `/assets-private/*` đi network-first và được lưu khi 200 (404 không lưu: tốt). `isHashedImmutableAsset` mở rộng cho `/assets-private/` với `?v=` **12 hex** (khớp hợp đồng), TRỪ `manifest.json` (luôn network-first). `PRECACHE_URLS` KHÔNG được chứa `/assets-private/` (B thêm test canh).
- **Ghi công:** màn Ghi công hiện `title` + `url` (chỉ `https:`, bằng `textContent` + `rel="noopener"`) + `license` của MỖI gói đang dùng (G cung cấp chuỗi); `CREDITS.md` chỉ ghi tên gói + link + 'tệp không nằm trong repo' (KHÔNG hash của tệp vắng mặt khỏi repo).
- **Bản native / APK:** `packs.ts` coi bản native có sẵn `client/dist` (trả `cached`); gói riêng KHÔNG ĐƯỢC nhét vào APK (đó chính là phân phối lại). URL gói riêng dựng từ ĐỊA CHỈ MÁY CHỦ trò chơi (không phải đường dẫn tương đối trong vỏ native) và `Origin` của vỏ native phải qua `originGuardMiddleware`.
- **Test:** hai nhánh đều chạy ở `npm test` mặc định KHÔNG cần tệp thật: dùng `PacksEnv` giả với một manifest mẫu (1 gói, 1 tệp) và một manifest 404 / `index.html` / sai dạng. Ca với tệp thật (`it.skipIf(!ASSETS_PRIVATE_DIR)`) chỉ để bộ chơi thử AI (mục 60) trên máy chủ. Chốt chặn 'không tệp ảnh nào dưới `assets-private/` trong `git ls-files` / `client/dist`' đã có ở phía máy chủ (`private-packs.test.ts`).

## 7. Sao lưu
`/mnt/data/assets-private/` (cả `src/`, `work/`, `dist/`, `SOURCES.md`) vào bộ sao lưu của máy chủ. Bộ sao lưu hiện tại (`deploy/prod.sh backup`) chỉ lưu PostgreSQL; việc thêm thư mục này là của người dùng / C (`docs/TRIEN_KHAI.md` ghi lệnh `rsync -a` / `tar` gợi ý). KHÔNG lấy gói riêng vào ảnh Docker.

## 8. Thứ tự làm và phân công
| Bước | Việc | Ai | PR |
|---|---|---|---|
| 0 | GĐ1 Ninja Adventure xong (hình thay thế có sẵn) | G (#1197), B | có |
| 1 | `docs/GIAY_PHEP_TAI_NGUYEN_RIENG.md` + danh sách gói nên dùng | G | docs |
| 2 | `shared/src/private-pack.ts` (hợp đồng, mục 3) | A | `shared/` riêng, B / C review |
| 3 | (PR #1265, đã xong) `server/src/private-packs.ts` + nối `index.ts` + test + `docker-compose.yml` + `TRIEN_KHAI.md` + công cụ `assets-private:check` / `:manifest` | A | server |
| 4 | Client: gói riêng như nguồn thứ hai của `gfx/packs.ts` (bảng `private-art.ts`, lùi từng khoá, hook bản đồ hiện tại, Service Worker 12 hex, Vite proxy `/assets-private`, ghi công `title` + `url` + `license`, test hai nhánh) | B | client |
| 5 | Người dùng tải gói (itch.io), chép vào `src/`, đóng `dist/` bằng công cụ + gắn vào container | người dùng / B | - |

## 9. Rủi ro và câu hỏi (không chặn; A chọn mặc định an toàn)
1. **"Cấm phân phối lại" và client web:** người chơi tải được hình ĐÃ GHÉP qua trình duyệt như mọi game web. Hầu hết gói free cho dùng trong game phát hành (kể cả web) nhưng cấm bán / chia sẻ TỆP NGUỒN; G phải trích đúng điều khoản từng gói (mục 1 của G) và chỉ cho vào danh sách khi điều khoản cho phép đóng gói vào game. Giảm thiểu kỹ thuật (không phải bảo vệ tuyệt đối): chỉ phục vụ atlas đã ghép, không sheet gốc; không liệt kê thư mục; `?v=` theo hash; `Origin` lạ bị 403 (`originGuardMiddleware`); chống nhúng `frame-ancestors 'self'`.
2. **Quy tắc Asset trong `AGENTS.md`** (B, review #1259) từng ghi 'có BA nguồn được phép; ngoài ba nguồn này thì KHÔNG dùng': gói riêng là nguồn THỨ TƯ nên PR này sửa quy tắc (mục Asset, nguồn 4) và `check:credits` / `docs/RA_SOAT_TAI_SAN.md` KHÔNG được đòi băm cho tệp vắng mặt khỏi repo.
3. **Bản dev ngoài máy chủ** (máy người khác clone repo) không thấy gói: có chủ ý (hình thay thế).
4. **Câu hỏi cho người dùng (mặc định A đã chọn):** (a) có cần kiểm `Referer` chống hotlink ảnh (mặc định KHÔNG: `<img>` / WebGL không luôn gửi `Origin`, dễ chặn nhầm người chơi); (b) có đóng gói thêm bản `.webp` nhẹ cho di động (mặc định có nếu G / B thấy nặng).

## 10. Tiêu chí xong
- `ASSETS_PRIVATE_DIR` rỗng: server y hệt hôm nay (không route, không log lỗi); client chạy 100% bằng hình thay thế, `npm test` + CI xanh không cần gói.
- Có gói: client dùng hình gói; xoá một tệp khỏi `dist/` thì chỉ khoá đó lùi về hình thay thế; không có đường nào đọc tệp ngoài manifest (test traversal, symlink, NUL, mã hoá kép).
- Không tệp nào của gói (gốc / ghép) xuất hiện trong `git ls-files` hay `client/dist` (một test canh: quét kho tìm đuôi ảnh nằm dưới `assets-private/`).
