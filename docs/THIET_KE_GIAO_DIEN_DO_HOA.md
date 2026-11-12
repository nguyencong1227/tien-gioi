# Thiết kế M5: giao diện đa thiết bị và đồ hoạ

> Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục 8 (12/11/2026). Người viết: Dev A. Người review: B, C.
> Phạm vi: **client** (Phaser 3.90 + Vite, HUD là DOM). Không đổi giao thức server, không thêm dữ liệu đồng bộ.

## 1. Mục tiêu và ràng buộc

1. **Đa thiết bị:** điện thoại dọc / ngang, máy tính bảng, máy tính 1080p-4K; trình duyệt lẫn app Android (Capacitor). HUD / bảng / hộp thoại tự thích ứng; chữ và hình sắc nét trên màn hình mật độ cao (DPR); vùng an toàn (tai thỏ, thanh điều hướng); cảm ứng song song bàn phím + chuột; không có thanh cuộn ngoài ý muốn.
2. **Đồ hoạ và hiệu ứng bằng Phaser:** hiệu ứng chiêu thức bằng hạt, số sát thương bay, rung màn hình nhẹ, hoạt ảnh nhân vật / quái, hiệu ứng đột phá cảnh giới / luân hồi / cổng / bí cảnh, trang trí bản đồ, chuyển cảnh mượt, phong cách tu tiên thống nhất.
3. **Hiệu năng là ràng buộc CỨNG:** Android tầm trung ≥ 50 FPS ở chỗ đông người; cài đặt chất lượng **Thấp / Vừa / Cao** (mặc định **Tự động**); tôn trọng "giảm chuyển động"; **không tăng băng thông mạng**.
4. **Tài sản:** chỉ vẽ bằng mã (Phaser Graphics, hạt, shader, `gen-assets.mjs`) hoặc có giấy phép rõ ràng cho phép dùng thương mại (CC0...), ghi vào `CREDITS.md`. Không lấy gì từ game khác (kể cả bản clone Vạn Kiếp Tu Tiên).
5. **Không phá vỡ:** E2E và bot hiện có vẫn xanh; bench hằng đêm (`server/src/perf/bench-baseline.json`) byte / tick giữ nguyên; bản chạy thật chỉ cập nhật theo quy trình phát hành.

## 2. Hiện trạng (đã đo / đọc mã, 12/11/2026)

| Mặt | Hiện có | Hệ quả cho M5 |
|---|---|---|
| Khởi tạo Phaser (`client/src/main.ts`) | `Phaser.AUTO`, `scale: { mode: RESIZE, width: innerWidth, height: innerHeight }`, `render.batchSize 8192`, `activePointers: 3` | Kích thước canvas tính bằng **CSS px, không nhân DPR**: mờ trên màn hình DPR 2-3 |
| Camera (`WorldScene.fitZoom`) | `zoom = max(clamp(min(w,h)/640, 0.75, 1.3), w/1900, h/1100)` | Ràng buộc `w/zoom ≤ 1900`, `h/zoom ≤ 1100` do **bán kính vùng nhìn của server `VIEW_ENTER = 1100` px** (`server/src/systems/interest.ts`): KHÔNG được phá khi đổi zoom / DPR |
| HUD | DOM (`ui.ts` 4270 dòng, `style.css` ~5000 dòng, 11 `@media`, đa số `(pointer: coarse), (max-width: 640px)` và một `orientation: landscape` + `max-height: 540px`) | Quy tắc đáp ứng rải rác; chưa có hệ thống thống nhất |
| Cảm ứng | `joystick.ts` (nửa trái màn hình); chạm vào bản đồ để chém | Chưa có cụm nút kỹ năng đủ lớn, chưa phân biệt máy lai |
| Đồ hoạ | Atlas pixel-art `client/public/assets/atlas.png` + tileset 8 ô 32×32, sinh bằng `client/scripts/gen-assets.mjs` (168 KB cả thư mục); texture phụ vẽ bằng `Graphics.generateTexture` (`textures.ts`); tilemap 1 lớp | Cơ sở tốt (đã "tự vẽ bằng mã"); thiếu lớp trang trí, ánh sáng, hạt |
| Hiệu ứng | ~6 chỗ dùng tween / hạt trong `WorldScene`; `tg_low_fx` tắt aura / vòng sáng / chữ nhấp nháy; `tg_hide_names` | Không có ngân sách hạt, không có mức chất lượng |
| Hiệu năng đo được | `docs/HIEU_NANG_DI_DONG.md`: 390×844, CPU 4×, 30 người: 60 FPS, heap 20-35 MB | Mới đo cảnh nhẹ; chưa có hiệu ứng / DPR / màn hình lớn |
| Phông chữ | Noto Serif nạp từ **Google Fonts** (`client/index.html`) | Gửi yêu cầu ra ngoài (lộ IP cho Google), hỏng khi ngoại tuyến / APK: **tự lưu cục bộ** (mục 11) |
| Giảm chuyển động | `prefers-reduced-motion` ở CSS + cài đặt (#277) | Phải nối vào lớp hiệu ứng Phaser, không chỉ CSS |

## 3. Kiến trúc tổng thể

Ba lớp, mỗi lớp một thư mục, **client không import ngược** (lõi không biết UI cụ thể):

```
client/src/gfx/
  display.ts      lõi hiển thị: kích thước logic, DPR, vùng an toàn, phân loại thiết bị, sự kiện đổi (A)
  quality.ts      hồ sơ chất lượng Thấp/Vừa/Cao + Tự động + bộ điều tốc + lớp phủ ?perf=1 (A)
  fx/             lớp hiệu ứng: FxBudget (ngân sách), pool, recipes (A: lõi; B: công thức)
  anim/           hoạt ảnh nhân vật / quái (B)
  map-style.ts    kiểu bản đồ theo mapId: màu môi trường, trang trí, thời tiết (C; A cấp khung)
```

Luồng dữ liệu một chiều: `display.ts` và `quality.ts` phát **sự kiện thay đổi**; HUD (CSS), camera, `fx/`, `map-style` chỉ ĐỌC và đăng ký lắng nghe. Không ai ghi ngược vào hai mô-đun này trừ màn hình cài đặt (qua `setQuality`).

### 3.1 Hợp đồng giữa các phần (B và C code song song dựa vào đây; A giữ đúng chữ ký)

```ts
// gfx/display.ts
export type FormFactor = "phone" | "tablet" | "desktop";
export type Orient = "portrait" | "landscape";
export interface DisplayInfo {
  cssW: number; cssH: number;          // kích thước khung nhìn logic (CSS px), ĐÃ trừ bàn phím ảo nếu visualViewport báo
  dpr: number;                         // devicePixelRatio thật
  renderScale: number;                 // hệ số nhân thực dùng cho canvas (<= dpr, theo hồ sơ chất lượng)
  form: FormFactor; orient: Orient;
  touch: boolean;                      // đang dùng cảm ứng (đổi theo lần nhập gần nhất trên máy lai)
  safe: { t: number; r: number; b: number; l: number }; // px, từ env(safe-area-inset-*)
}
export function getDisplay(): DisplayInfo;
export function onDisplayChange(cb: (d: DisplayInfo) => void): () => void; // trả hàm huỷ đăng ký

// gfx/quality.ts
export type Tier = "low" | "mid" | "high";
export interface QualityProfile {
  tier: Tier;
  renderScaleMax: number;              // trần hệ số nhân DPR
  maxPixels: number;                   // trần tổng điểm ảnh canvas (cssW*cssH*renderScale^2)
  particleBudget: number;              // số hạt sống tối đa toàn cảnh
  emitterBudget: number;               // số emitter hoạt động tối đa
  damageNumbers: number;               // số chữ bay tối đa cùng lúc
  ambient: boolean; fog: boolean; weather: "off" | "light" | "full";
  blobShadows: boolean; vignette: boolean; bloom: boolean;
  farAnimHz: number;                   // tần số cập nhật hoạt ảnh thực thể ở xa
  nameLabelRadius: number;             // px, ngoài bán kính này ẩn tên
  shake: boolean;                      // đã tính "giảm chuyển động"
  targetFps: 30 | 60;
}
export function getQuality(): QualityProfile;
export function setQualityMode(m: "auto" | Tier): void;   // lưu localStorage `tg_quality`
export function onQualityChange(cb: (p: QualityProfile) => void): () => void;
export function reducedMotion(): boolean;                  // OS + cài đặt

// gfx/fx (A: lõi; B: công thức)
export function playFx(recipeId: string, x: number, y: number, opts?: FxOpts): void; // toạ độ THẾ GIỚI
export interface FxOpts { priority?: 0 | 1 | 2; angle?: number; scale?: number; tint?: number; target?: Phaser.GameObjects.GameObject }
```

**Thuộc tính trên `<html>`** (do `display.ts` cập nhật mỗi lần đổi; CSS của B dùng chúng thay cho `@media` rải rác): `data-form="phone|tablet|desktop"`, `data-orient="portrait|landscape"`, `data-input="touch|mouse"`, `data-quality="low|mid|high"`, `data-reduce-motion="1|0"`; biến CSS `--safe-t/r/b/l` (px), `--vw`, `--vh` (**CHIỀU RỘNG / CHIỀU CAO khung nhìn tính bằng px**, ví dụ `--vh: 844px`; dùng `var(--vh)` thay cho `100vh`, KHÔNG nhân 100; theo chiều cao THẬT nên bàn phím ảo làm tấm co lại; tránh lỗi `100vh` trên di động), `--ui-scale`.

## 4. Bố cục đáp ứng (B làm, C kiểm)

### 4.1 Phân loại thiết bị (theo kích thước khung nhìn và hướng, KHÔNG theo User-Agent)
| `form` | Điều kiện (CSS px; `s` = cạnh ngắn) | Ví dụ |
|---|---|---|
| `phone` | `s < 600` (kể cả cửa sổ trình duyệt hẹp trên máy tính) | 360×640, 390×844, 412×915, 844×390 |
| `tablet` | `s ≥ 600` và con trỏ CHÍNH là cảm ứng (`pointer: coarse`) | iPad / máy tính bảng Android: 768×1024, 1024×768 |
| `desktop` | `s ≥ 600` và con trỏ chính là chuột (`pointer: fine`) | 1280×720, 1920×1080, 2560×1440, laptop cảm ứng có chuột |

Cài trong `client/src/gfx/display.ts` (`classifyForm`, có test ma trận).

**Chiều cao ổn định (bàn phím ảo):** `form` và `orient` được tính theo chiều cao ỔN ĐỊNH, không theo chiều cao thật: trên cảm ứng, nếu bề rộng không đổi mà chiều cao chỉ giảm (bàn phím ảo mở: 360×640 -> 360×340) thì giữ chiều cao lớn nhất đã thấy ở bề rộng này; bề rộng đổi (xoay máy, đổi cỡ cửa sổ) thì đặt lại. Nhờ đó tấm toàn màn hình không biến thành ngăn kéo cạnh phải lúc người chơi đang gõ chữ, và máy tính bảng 768×1024 + bàn phím không thành `phone`. `cssH` và `--vh` vẫn là chiều cao thật (tấm co theo chỗ còn lại). Trên máy tính (chuột) đổi chiều cao cửa sổ là thật nên theo sát. `(pointer: coarse)` đổi mà không có `resize` (máy lai gắn / tháo bàn phím) cũng được nghe.

`data-input` theo **lần nhập gần nhất** (`pointerdown` với `pointerType`): máy lai (laptop cảm ứng) tự đổi, gợi ý phím và nút ảo theo đó.

### 4.2 Quy tắc bắt buộc
1. **Mục tiêu chạm ≥ 44×44 CSS px** (nút kỹ năng ≥ 56, khoảng cách ≥ 8). Kiểm tự động (C, mục 12).
2. **Chữ:** **chữ nội dung** (bảng, hộp thoại, chat, nhiệm vụ) ≥ 14 px trên `phone`; **nhãn số liệu HUD** dày đặc (thanh khí huyết / linh lực, tên nút, bảng đội) ≥ 12 px kèm tương phản AA (HUD hiện dùng 11 px: đặt 14 px cho mọi chữ HUD sẽ làm HUD tràn); tiêu đề dùng `clamp()`; tương phản AA (đã có từ #277); cỡ chữ người chơi chỉnh được (Nhỏ/Vừa/Lớn) qua `--ui-scale`.
   - **Đã làm (#326):** `style.css` / `sheet.css` không ghi cỡ chữ px cứng mà dùng `font-size: var(--fs-N)` (N = cỡ gốc 9..22 px; 224 chỗ), biến định nghĩa MỘT nơi ở `client/src/text-scale.css`: mặc định (HUD, máy tính) đúng N px, KHÔNG co giãn; điện thoại: nhãn HUD 9 / 10 / 11 px nâng lên 12 px; chữ NỘI DUNG (`.modal-box`, `#chat`, `.limbo-overlay`) co giãn theo `--ui-scale` và trên điện thoại `max(14px, N x --ui-scale)` (chữ nội dung >= 14 px kể cả khi chọn Nhỏ). `client/src/ui-scale.ts` (`parseUiScale`, `modeOfScale`, `initUiScale`, test) chỉ NỐI ô Cài đặt -> Cỡ chữ (Nhỏ 0,9 / Vừa 1 / Lớn 1,15) với `setUiScale` của `gfx/display.ts`: display.ts là MỘT nguồn sự thật (khoá `tg_ui_scale` lưu SỐ, đọc lúc khởi tạo, và GHI LẠI `--ui-scale` lên `<html>` mỗi lần kích thước / hướng máy đổi); `initUiScale()` gọi SAU `initDisplay()` ở `main.ts`, không tự ghi `--ui-scale` hay bộ nhớ. (Bản đầu của #326 tự lưu chuỗi `small` / `large` và tự ghi `--ui-scale`: chọn Lớn rồi xoay máy thì display.ts ghi đè về 1; đã sửa, `check-text-size` có ca đổi kích thước sau khi chọn.) Biến chứa `var()` thay giá trị ở phần tử KHAI BÁO nên phải khai lại cả danh sách ở từng vùng (không thể chỉ đổi `--ui-scale` ở con). Cỡ chữ mới: dùng `var(--fs-N)` với N đã có (thêm N mới vào cả bốn danh sách trong `text-scale.css`). **Cổng kiểm:** `client/scripts/check-text-size.mjs` đo `font-size` TÍNH RA của mọi chữ đang hiện trong 7 bảng + HUD ở 390x844, 360x640, 844x390 x ba cỡ chữ (103 khẳng định) + máy tính (cỡ gốc giữ ở Vừa, Lớn 12 -> 13,8 px, HUD không đổi) + lưu / nạp lại. Giới hạn đã biết: tên ô đan dược nhanh (`#quick-N-name`) ở 12 px bị cắt "Hồi H..." (ô rộng 48 px; đủ phân biệt bằng biểu tượng + chữ đầu, tên đầy đủ ở `title` / `aria-label`); bảng Nhiệm vụ / Tổ đội của cột HUD trái tính là HUD (12 px), chưa là chữ nội dung 14 px.
3. **Không thanh cuộn ngoài ý muốn:** `html, body { overscroll-behavior: none; overflow: hidden }`, chiều cao dùng `--vh` / `100dvh`, chỉ cuộn BÊN TRONG bảng; kiểm `scrollWidth ≤ innerWidth` và `scrollHeight ≤ innerHeight` ở mọi khung nhìn.
4. **Vùng an toàn:** mọi phần tử neo mép dùng `--safe-*`; app Android cấu hình `StatusBar` / `SystemBars` đúng phiên bản Capacitor đã cài (xem `docs/APP_ANDROID.md`).
5. **Bảng thành tấm:** `phone` = tấm toàn màn hình (dọc: kéo từ dưới lên; ngang: kéo từ cạnh phải) với nút đóng ở vùng với tay; `tablet` / `desktop` = cửa sổ nổi như hiện nay. Mỗi bảng dùng MỘT thành phần tấm chung (không sao chép CSS từng bảng).
   - **Tông môn (`#sect-modal`, #326):** tấm KHÔNG tự cuộn (`overflow: hidden`), từng view `.sect-view` cuộn bên trong (`flex: 1 1 auto; min-height: 0`): hộp xác nhận lồng `.sect-action-confirm` (`position: absolute; inset: 0` trong tấm) phải phủ KÍN tấm, mà nếu tấm tự cuộn thì hộp nằm ở đầu nội dung và có thể trôi ra ngoài màn hình khi đang cuộn. Kiểm: `snap-sheet.mjs` (`INNER_SCROLL`: tấm `overflow-y: hidden` và vừa nội dung; hộp xác nhận phủ kín tấm, nằm trên cùng, hai nút >= 44 px trên điện thoại), 2 đột biến đỏ; `e2e:tong-mon` PASS.
   - **HUD gọn (#326):** cột HUD trái (HUD + Tổ đội + Nhiệm vụ) cao 318-323 px = **82-90 %** chiều cao ở điện thoại ngang (844x390 / 667x375 / 640x360) và 74 % ở điện thoại dọc thấp (360x640). Bảng **Nhiệm vụ thu gọn mặc định** ở điện thoại NGANG và điện thoại dọc THẤP (< 700 px; `gfx/hud-compact.ts`: `isCompactHud`, `trackerOpen`), chỉ còn tiêu đề + số nhiệm vụ `Nhiệm vụ (n) ▸`; tiêu đề là `button` (`#qt-toggle`, `aria-expanded`, >= 44 px trên cảm ứng, vẫn bắt chạm khi thân bảng trong suốt) bấm để mở / thu, lựa chọn được nhớ ở `tg_qt_open` và THẮNG mặc định (kể cả khi xoay máy); chưa chọn thì xoay máy tự đổi theo độ gọn (`onDisplayChange`). Tablet / máy tính / điện thoại dọc cao: mở mặc định. Đo (`check-hud.mjs`): ngang 844x390 cột HUD **262 px = 67 %** (trước 83 %), 667x375 70 %, 640x360 73 %, 932x430 61 %, 360x640 64 % (trước 74 %). **Nút HUD >= 44x44 (#326, kiểm kê bằng `snap-touch.mjs`):** trước đây điện thoại NGANG 4 nút nhãn 34x32 + âm thanh / cài đặt 38x32 (luật `@media (orientation: landscape) and (max-height: 540px)` ghi đè min 44 px của `(pointer: coarse)`); điện thoại DỌC âm thanh / cài đặt 38x44 (`.hud-btn.icon-only { min-width: 38px }` thắng `.hud-btn`) và ô chat `#chat-input` cao 33 px. Sửa không cần đổi DOM: (1) ngang: `.hud-btn` 44x44, `.hud-btns` rộng 144 px = lưới 3 cột x 2 hàng (3 x 44 + 2 x 6) thay cho 3 hàng x 32 px, và `.hud-foot` thành LƯỚI 2 cột (cột trái xếp chồng "Đạo hữu" + Linh thạch, cột phải lưới nút; xếp ngang cần 222 px > 194 px lòng HUD nên nút tràn ra viền): HUD cao 192 px (trước 202), cột HUD trái 252 px = 65 % ở 844x390 (trước 262 px = 67 %), 667x375 67 %, 640x360 70 %, 932x430 59 %; (2) dọc: `.hud-btn.icon-only` 44 px, `#chat-input` `min-height: 44px` (chỉ `(pointer: coarse)`). Khoảng cách giữa nút HUD 4 px (dọc) / 6 px (ngang), CHƯA đạt mức >= 8 px của điều 1 (8 px làm HUD ngang cao thêm ~20 px): ghi nhận, chỉ nút kỹ năng + nút ngữ cảnh đạt >= 8. Kiểm: `snap-touch.mjs` mục 2a: kiểm kê MỌI nút / ô nhập / liên kết đang hiện (cảm ứng) >= 44x44 (0 nhỏ hơn), nút HUD nằm trọn trong vùng nội dung của bảng HUD, khoảng cách >= 4 px; `check-hud.mjs` giữ trần chiều cao cột HUD (<= 72 %). 3 đột biến đỏ (luật cũ của main: 2; bỏ `icon-only` 44: 2; chân HUD xếp ngang: `check-hud` 3). **Nhãn gợi ý bảng Nhiệm vụ:** "Chạm vào một nhiệm vụ để chỉ đường" (`#qt-hint`) chuyển RA NGOÀI nút thu gọn / mở (nằm trong nút thì người chơi tưởng bấm tiêu đề là chỉ đường), chỉ hiện khi bảng mở và có nhiệm vụ (nit của A ở #386). Nit còn lại: người mới ở điện thoại ngang không thấy dòng hướng dẫn khi chưa có nhiệm vụ (bảng thu gọn mặc định): chưa làm, cần quyết định thiết kế (mở sẵn khi chưa có nhiệm vụ làm bảng tự thu lại ngay khi nhận nhiệm vụ đầu tiên).
   - **Lưu ý khi đo chạm bằng CDP:** Chrome "điều chỉnh chạm" (touch adjustment) kéo chạm trong vài chục px quanh phần tử bấm được về phần tử đó, nên điểm chạm sát một nút thật sự thuộc nút dù `elementFromPoint` báo vùng joystick: `snap-touch` chọn điểm cách mọi nút >= 22 px.
   - **Thẻ (`.sheet.sheet-card`, #326):** hộp thoại có nút hành động riêng (kết quả Bí cảnh `#dungeon-end-modal`, kết quả Quyết đấu `#duel-end-modal`, Chỉ dẫn người mới `#newbie-guide-modal`, Phiên bản cũ `#outdated-modal`) dùng biến thể của tấm chung: cửa sổ nổi giữa màn hình Ở MỌI DẠNG MÁY (kể cả điện thoại: KHÔNG toàn màn hình, nút Đóng không ghim góc dưới phải), tự cuộn khi dài, bề rộng `--sheet-w` (440 / 360 / 520 / 440 px); viền / nền / `z-index` riêng của từng thẻ giữ ở CSS thẻ (selector `.sheet.<tên>` để thắng `.sheet` nạp sau). `sheet.css` chỉ cho điện thoại toàn màn hình với `.sheet:not(.sheet-card)`. Trước đây bốn thẻ tự lặp position / top / left / transform / width / max-height, và trên điện thoại ba thẻ đầu rơi vào luật `.modal-box:not(.sheet)` thành toàn màn hình nội dung dồn lên đầu. Kiểm: `snap-sheet.mjs` (mỗi thẻ x 5 khung nhìn: không lớp chắn, căn giữa, bề rộng <= min(94 % khung, `--sheet-w`), nút >= 44x44, kéo xuống đáy vẫn với tới nút, nút không bị ghim ra ngoài thẻ), 2 đột biến đỏ. Ảnh WebP (`sheet-<thẻ>-<khung>.webp`, nhẹ hơn PNG ~3 lần).
   - **Hộp thoại NPC (`#dialog-modal`, dock đáy, #326):** không phải tấm toàn màn hình mà là DOCK ở đáy (thế giới còn thấy phía trên), nhưng theo cùng quy tắc: (1) chữ thuộc nhóm NỘI DUNG của `text-scale.css` (`:is(.modal-box, #dialog-modal, ...)`: sàn 14 px trên điện thoại + theo `--ui-scale`; nhãn phụ của lựa chọn `<small>` ghi `var(--fs-11)` vì `smaller` mặc định co theo cha); (2) `max-height: 100dvh - 24 px - vùng an toàn` + `overflow: hidden`, tiêu đề + nút đóng (`.dlg-head`) đứng yên, chữ + lựa chọn nằm trong `.dlg-scroll` (cuộn được; con `flex: none` để KHÔNG bị ép chồng lên nhau); trước đây NPC nhiều lựa chọn trên điện thoại ngang cao 483 px / khung 390 px nên TIÊU ĐỀ VÀ NÚT ĐÓNG TRÔI RA NGOÀI màn hình; (3) điện thoại ngang (`orientation: landscape` + `max-height: 540px`): rộng `min(96vw, 720px)`, chữ bên trái + lựa chọn bên phải (hai cột) thay vì xếp chồng; (4) lựa chọn kích hoạt bằng `click`, KHÔNG `pointerdown` (ngón vuốt cuộn danh sách không được chọn nhầm). Kiểm: `snap-sheet.mjs` (mỗi khung x tin "điển hình" 3 lựa chọn + ca xấu 12 lựa chọn: không lớp chắn, nằm gọn màn hình, chừa lề >= 12 px, nút đóng >= 44x44, lựa chọn >= 44 px, chữ / lựa chọn không chồng nhau, kéo xuống đáy vẫn với tới lựa chọn cuối + nút đóng đứng yên, 2 cột ở điện thoại ngang, vuốt thật không chọn nhầm + chạm thật chọn được), `check-text-size.mjs` (hộp thoại x 3 cỡ chữ x 3 khung điện thoại + tỉ lệ ở máy tính), 3 đột biến đỏ. Ảnh WebP `sheet-dialog-{dien-hinh,nhieu}-<khung>.webp`.
6. **Điều khiển cảm ứng:** joystick trái (đã có); cụm phải: Chém, 3 kỹ năng, Nhặt / Nói chuyện (theo ngữ cảnh), ô đan dược nhanh; chống cử chỉ trình duyệt (`touch-action: none` trên canvas, chặn phóng to hai ngón / chạm đúp); đa chạm đúng (joystick + nút cùng lúc, `activePointers ≥ 3`).
   - **Vùng joystick không bị HUD nuốt chạm (#326):** joystick nổi chiếm nửa trái x 65 % chiều cao phía dưới (`#joyzone`, z-index 3) nhưng cột HUD trái (z-index 10) từng phủ lên: đo bằng lưới 16 px, 22-60 % điểm trong vùng bị thân bảng HUD / Nhiệm vụ / thanh nhanh che (chạm vào đó không bắt đầu được joystick, cả điện thoại dọc lẫn ngang). Nay ở `html[data-input="touch"]` (trừ kiểu D-pad, không có vùng joystick) thân các bảng `#hud-col-left > *` và `#quickbar` có `pointer-events: none`, chỉ `button` và `.qt-item` (chạm để chỉ đường) bắt chạm. Quy ước cho bảng HUD mới ở vùng trái-dưới: thân là chữ thì trong suốt với chạm, chỉ nút bắt chạm. Chạm vào thân bảng ở phần trên vùng nhìn rơi xuống canvas (chạm người chơi khác vẫn mở trình đơn tổ đội). Kiểm: `snap-touch.mjs` (điểm lưới trong vùng joystick bị phần tử KHÔNG tương tác che = 0; chạm thật vào thân `#quest-tracker` trong vùng vẫn khởi động joystick; nút `btn-bag` / `btn-char` / `btn-quest` vẫn bắt chạm), 2 đột biến CSS đỏ.
7. **Bàn phím + chuột** giữ nguyên và ngang quyền (không bỏ phím tắt hiện có).
8. **Hướng:** app Android `sensorLandscape`; web hỗ trợ dọc (HUD thu gọn) và ngang.

### 4.3 Chiến lược di chuyển từ `@media` cũ
Quy tắc MỚI viết theo thuộc tính (`html[data-form="phone"] ...`). Mỗi bảng được di chuyển trong CÙNG PR sửa bảng đó (xoá `@media` cũ tương ứng); không refactor hàng loạt một lần. B giữ bảng đếm "bảng đã chuyển / còn lại" trong mô tả issue.

## 5. Scale Manager và DPR (A làm: lõi)

**Vấn đề:** canvas hiện bằng CSS px nên mờ trên màn hình mật độ cao. **Mục tiêu:** `canvas.width = cssW × renderScale`, hiển thị CSS vẫn `cssW`, toạ độ nhập đúng, camera đúng.

**ĐÃ CHỐT bằng spike + đo trong Chrome thật (Phaser 3.90, DPR 1 / 2 / 3, #324):** `Scale.RESIZE` giữ canvas = CSS px ở mọi DPR (mờ); `RESIZE + zoom` KHÔNG có tác dụng (zoom bị bỏ qua); **`Scale.NONE` + `width/height = css x rs` + `zoom = 1/rs` + (khi đổi kích thước) `scale.resize()` và `setZoom()`** cho DPR 2: canvas 780×1688 hiển thị 390×844, `displayScale` = 2, toạ độ chạm sai số 0. Cài trong `client/src/gfx/scale.ts` (`computeRenderScale`, `canvasSizeFor`, `fitZoom`, `attachScale`).
- `scale: { mode: NONE hoặc RESIZE, ... }` tự quản kích thước: `game.scale.resize(cssW * rs, cssH * rs)` rồi đặt kích thước hiển thị của canvas bằng CSS (`zoom = 1/rs` hoặc `canvas.style.width/height`), do `display.ts` điều khiển trên `ResizeObserver` của `#game` và `visualViewport` (bàn phím ảo), có chống rung (debounce ~100 ms, bỏ qua thay đổi < 2 px). (**Chốt: `NONE`**; `attachScale` cập nhật theo `onDisplayChange` + `onQualityChange`, hoãn tới cuối tác vụ để không đổi kích thước giữa một bước vòng lặp.) Đổi DPR mà kích thước CSS không đổi (kéo sang màn hình khác) được nghe qua `matchMedia("(resolution: Xdppx)")`; giả lập CDP không phát sự kiện này, nên E2E đổi DPR kèm lệch 1 px bề rộng; `pointerdown` cũng đọc lại DPR (đường dự phòng).
- `renderScale = clamp(dpr, 1, profile.renderScaleMax)` rồi hạ thêm nếu `cssW*cssH*rs² > profile.maxPixels` (trần điểm ảnh, bảng mục 6.2). **`renderScale` có thể < 1** (sàn 0,5): `Thấp` có `maxPixels` 1,0 M nên màn 1920×1080 (2,07 M điểm ảnh ở `renderScale` 1) bị ép xuống ~0,69; chấp nhận được vì máy tính mặc định `Cao`, và người chơi chọn `Thấp` là chọn đánh đổi độ nét lấy hiệu năng.
- **Camera:** `fitZoom` giữ nguyên LUẬT theo đơn vị logic (CSS px) rồi nhân `renderScale` vào `camera.zoom`; **ràng buộc StateView (`w/zoom ≤ 1900`, `h/zoom ≤ 1100`, tính theo CSS px / zoom logic) phải được test** (đột biến đỏ nếu bỏ).
- **Pixel-art:** sprite hiện là pixel-art; zoom không nguyên làm nhấp nháy cạnh. Quyết định (xác nhận bằng ảnh chụp): giữ lọc `NEAREST` + `roundPixels`, hoặc bắt `camera.zoom * renderScale` về bội số của 0,25. A chọn theo ảnh chụp thật và ghi lý do.
- **Tiết kiệm pin (~30 FPS):** `fps.limit = 30` của Phaser ra **~21 FPS** trên màn 60 Hz (đo thật: khung 16,67 ms × 2 = 33,33 ms rơi ngay dưới ngưỡng `1000/30`, nên cứ ba khung mới vẽ một lần); **ngưỡng 31 ra đúng 30,0 FPS** (đo: 60 / 31 → 30,0 / 32 → 30,0). Đổi được LÚC CHẠY (dừng → đặt `fpsLimit` / `hasFpsLimit` / `_limitRate` → chạy lại; trường nội bộ của Phaser 3.90, E2E `e2e:dpr` đo 59,6 → 30,0 → 60,4 FPS và giữ lại khi nâng Phaser; thiếu trường thì giữ nguyên). Bộ điều tốc nghỉ khi bật tiết kiệm pin (khung 33 ms là chủ ý). Tạm dừng khi ẩn (đã có qua nhịp tim #293).
- **Test:** E2E `chạm toạ độ X,Y -> toạ độ thế giới đúng` ở DPR 1 / 2 / 3 (chỗ dễ vỡ nhất khi đổi tỉ lệ), `canvas.width == round(cssW*rs)`, không rò listener khi đổi kích thước 50 lần.

## 6. Hệ thống chất lượng đồ hoạ (A làm: lõi)

### 6.1 Chế độ
`Tự động` (mặc định) / `Thấp` / `Vừa` / `Cao`, lưu `localStorage["tg_quality"]`. Di cư cài đặt cũ: `tg_low_fx=1` -> `Thấp` nếu người chơi chưa chọn. Thêm: `Giảm chuyển động` (theo OS, ghi đè được), `Tiết kiệm pin (30 FPS)`, `Hiện tên người chơi` (thay `tg_hide_names`).

### 6.2 Bảng hồ sơ (số BAN ĐẦU; C đo rồi A chỉnh, kết quả ghi vào `docs/HIEU_NANG_DI_DONG.md`)
| Trường | Thấp | Vừa | Cao |
|---|---|---|---|
| `renderScaleMax` | 1,0 | 1,5 | 2,0 |
| `maxPixels` (điểm ảnh canvas) | 1,0 M | 2,2 M | 4,2 M |
| `particleBudget` / `emitterBudget` | 60 / 4 | 220 / 10 | 520 / 24 |
| `damageNumbers` | 8 | 16 | 28 |
| `ambient` (ánh sáng môi trường, vignette) | tắt | bật | bật |
| `fog` / `weather` | tắt / `off` | 4 mảng / `light` | 8 mảng / `full` |
| `blobShadows` | tắt | bật | bật |
| `bloom` (hậu xử lý, chỉ WebGL, không trên Android) | tắt | tắt | bật (máy tính) |
| `farAnimHz` | 8 | 15 | 30 |
| `nameLabelRadius` | 260 | 420 | 640 |
| `targetFps` | 30 nếu `Tiết kiệm pin`, còn lại 60 | 60 | 60 |

"Giảm chuyển động" luôn: tắt rung màn hình, tắt chớp toàn màn hình, giảm hạt 70 %, thay chuyển cảnh trượt bằng mờ dần (tránh chớp > 3 lần / giây, WCAG 2.3.1).

### 6.3 Chọn tự động và bộ điều tốc
1. **Khởi đầu:** điểm thô từ `hardwareConcurrency`, `deviceMemory`, `maxTouchPoints`, DPR, chuỗi GPU (`WEBGL_debug_renderer_info`) và `form`; điện thoại mặc định `Vừa` nếu `deviceMemory ≥ 4` và ≥ 6 lõi, ngược lại `Thấp`; máy tính `Cao`.
2. **Bộ điều tốc (chạy khi `Tự động`):** đo thời gian khung (trung bình trượt) mỗi cửa sổ 5 giây trong lúc **có hoạt động** (không đo khi ẩn / đang tải). p95 > 22 ms (dưới ~45 FPS) hai cửa sổ liền -> **hạ một bậc**; p95 < 19 ms suốt 30 giây và chưa chạm trần của thiết bị -> **nâng một bậc**. Trễ (hysteresis): tối đa 1 lần đổi / 20 giây, tối đa 3 lần hạ / phiên, không nâng sau khi vừa hạ vì tải đỉnh. Người chơi chọn tay thì TẮT bộ điều tốc. **Ngưỡng "tốt" 19 ms (không phải 14):** p95 của khoảng cách khung ở đúng 60 FPS luôn ≥ 16,7 ms (vsync) nên ngưỡng 14 ms không bao giờ đạt trên màn 60 Hz và bộ điều tốc chỉ biết hạ (B đo thật ở #338); vùng chết 19-22 ms giữ độ trễ.
3. **Lớp phủ gỡ lỗi `?perf=1`:** FPS, p95, bậc / chế độ chất lượng và số lần hạ bậc, khung nhìn / DPR / `renderScale`, heap JS, hạt sống / emitter / hiệu ứng bị bỏ (`gfx/perf-overlay.ts`); số draw call và bộ nhớ texture CHƯA hiện trên lớp phủ (harness C đo trong CI). Dùng cho đo thật trên điện thoại: kịch bản và mẫu báo cáo ở `docs/KIEM_THU_GIAO_DIEN_M5.md` (M5.4).

## 7. Lớp hiệu ứng (`gfx/fx`)

### 7.1 Nguyên tắc (ràng buộc cứng)
1. **Phía client, theo sự kiện đã có.** Tin `fx` / `dmg` / thay đổi state hiện có đã mang đủ thông tin; công thức hiệu ứng ánh xạ `loại sự kiện -> recipe`. **Không thêm tin nhắn hay trường đồng bộ.**
2. **Công thức theo dữ liệu** (`gfx/fx/recipes.ts`): `{ id, particles[], flash?, shake?, light?, sound?, cost }`, thêm hiệu ứng = thêm dữ liệu, không thêm nhánh `if` trong `WorldScene`.
3. **Ngân sách tập trung (`FxBudget`):** mỗi `playFx` xin ngân sách; vượt `particleBudget` / `emitterBudget` thì bỏ hiệu ứng ưu tiên thấp (`priority 0` = môi trường, `1` = người khác, `2` = người chơi này và sự kiện quan trọng như đột phá). Ưu tiên của chính mình KHÔNG bao giờ bị bỏ trừ khi vượt gấp đôi trần.
4. **Không cấp phát trong vòng nóng:** emitter và chữ bay dùng **pool**; `maxAliveParticles` đặt theo hồ sơ; một **atlas hạt** duy nhất (đốm mềm, tia, vòng, khói, cánh hoa, hồn lửa) với hoà trộn cộng (`ADD`) để gộp lệnh vẽ.
5. **Chữ bay bằng `BitmapText`** (một texture phông bit-map sinh bằng mã) thay vì `Text` canvas (mỗi `Text` là một texture, đắt trên di động); tối đa `damageNumbers`. **Phông bit-map sinh bằng mã phải có đủ ký tự dùng thật**: chữ số, `+`, `-`, `!`, và các chữ có dấu của nhãn hiện tại (`floatText` in "Bạo! 123": cần `B`, `ạ`, `o`, `!`), hoặc đổi nhãn chí mạng thành kiểu không chữ (cỡ + màu + biểu tượng). B chọn khi làm #329; C kiểm tài sản (#331) biết để đối chiếu.
6. **Không chặn nhập liệu, không phụ thuộc thời gian thực của server:** hiệu ứng chỉ là hình ảnh; đóng cảnh (`shutdown`) phải giải phóng sạch (kiểm rò rỉ, mục 12).
7. Tôn trọng `shake`, `reducedMotion()`, `onQualityChange` (đổi bậc giữa chừng không giật: hiệu ứng đang chạy xong tự nhiên, hiệu ứng MỚI theo hồ sơ mới).

### 7.1b Lõi đã có (#325) và cách dùng
- **Tệp:** `client/src/gfx/fx/` — `budget.ts` (`FxBudget`), `float-set.ts` (`FloatSet`: pool chữ bay), `recipes.ts` (kiểu + sổ công thức + `validateRecipe`), `atlas.ts` (atlas hạt 6 khung + phông bit-map `fx-font`), `glyphs.ts` (`FX_CHARS`, `missingGlyphs`), `fx.ts` (`createFxSystem`). `WorldScene` giữ một `FxSystem` (`this.fx`), `update()` gọi `fx.update(now)`, `shutdown` gọi `fx.destroy()`.
- **Dùng:** `fx.play(recipeId, x, y, { priority })` trả `false` nếu bị bỏ (hết ngân sách); `fx.floatNumber(text, x, y, { color, size, priority })`. Thêm hiệu ứng = `registerRecipe({...})` (dữ liệu, không thêm nhánh `if`); công thức sai (khung hạt lạ, tuổi thọ <= 0...) bị `validateRecipe` từ chối lúc đăng ký. Công thức gốc: `hit-spark`, `ambient-glimmer`; B thêm công thức riêng ở #329.
- **Ngân sách:** hạt + emitter theo hồ sơ chất lượng (`particleBudget` / `emitterBudget`: Thấp 4 emitter, Vừa 10, Cao 24); ưu tiên 0 chỉ tới 60 % trần, 1 tới 100 %, 2 tới gấp đôi; ngân sách được trả lại khi hạt hết tuổi thọ (không cần gọi tay). Giảm chuyển động nhân số hạt 0,3 và tắt rung / chớp (chỉ ưu tiên 2 mới được rung / chớp, và chỉ khi hồ sơ cho).
- **Chữ bay:** `BitmapText` từ pool, tối đa `damageNumbers` (Thấp 8 / Vừa 16 / Cao 28 ở bản đầu); đầy thì chữ của mình (ưu tiên 2) thay chữ cũ nhất, còn lại bị bỏ. Bay 800 ms (giảm chuyển động: 300 ms, trôi 8 px). Phông có 207 glyph (số, dấu câu, đủ chữ cái tiếng Việt hoa / thường): ~2,2 MB texture (≈ 5 % ngân sách 48 MB của bậc Thấp). **Thêm nhãn mới thì kiểm `missingGlyphs(nhãn)`** (test giữ).
- **Lưu ý khi viết công thức (review #345):** (1) truyền `opts.angle` thì lõi luôn ghi nón ±20° quanh hướng đó và ĐÈ `particles.angle` của công thức; công thức cần toả rộng (vòng nổ, cột sáng) thì KHÔNG truyền `angle`, đặt `particles.angle` trong dữ liệu (cần nón khác thì thêm `spread` vào `FxOpts`, đừng sửa công thức khác). (2) `emitterBudget` đếm số lần phát ĐANG SỐNG theo thời gian, không phải số đối tượng emitter của Phaser (mỗi công thức một emitter, tạo lười, sống cả phiên; emitter rảnh gần như không tốn khung): số trên lớp phủ `?perf=1` là số đếm của ngân sách. (3) Số sát thương CỦA MÌNH lên quái hiện chỉ ưu tiên 1 vì `DmgMsg` không có người đánh; #329 suy "của mình" từ quái đang bị mình khoá / vừa bị mình đánh, không đổi giao thức. (4) `main.ts` chờ phông tối đa 1,5 s: hết khi #331 tự lưu phông cục bộ.
- **Kiểm thử:** `fx-core.test.ts` (22 test thuần) + `npm run e2e:fx -w server` (Chrome thật: hạt sống THẬT của Phaser <= ngân sách ở 3 bậc, ưu tiên, giảm chuyển động, trần chữ bay + tái dùng pool, `floatText` thật in "Bạo! 77", `destroy` giải phóng sạch, 0 lỗi console). Cửa sổ `window.__fx` chỉ có khi mở `?debug`.

### 7.2 Danh mục hiệu ứng (đợt 1 bắt buộc; B làm công thức, A cấp lõi)
| Nhóm | Hiệu ứng |
|---|---|
| Chiến đấu | vệt chém + tia lửa khi trúng; số sát thương bay (thường / chí mạng lớn hơn, màu khác; hồi máu màu xanh); rung nhẹ khi trúng đòn mạnh (≥ 15 % khí huyết tối đa hoặc chí mạng; tắt khi giảm chuyển động); máu / quái gục tan thành điểm sáng |
| Công pháp | mỗi công pháp một công thức (kiếm khí, hỏa, băng...) bằng hạt + tia, ưu tiên 2 cho của mình |
| Tu luyện | hào quang thiền định (có từ trước, đưa vào ngân sách); **đột phá cảnh giới** (vòng nổ, cột sáng, chớp nhẹ toàn màn hình, tắt khi giảm chuyển động); lên cấp |
| Luân hồi | Hoàng Tuyền (vignette tím đen, hồn lửa xanh trôi), Tam Sinh Thạch (phát sáng), đầu thai (mờ trắng + cánh hoa), Mạnh Bà |
| Thế giới | cổng truyền tống xoáy; vào / ra bí cảnh; rơi đồ lấp lánh theo độ hiếm; nhặt đồ |
| Chuyển cảnh | mờ / mống mắt 300-500 ms khi qua cổng và vào bí cảnh; bỏ qua được; giảm chuyển động -> mờ dần |

### 7.2b Công thức đã làm (B, #329)
- **Cách thêm:** mảng dữ liệu theo nhóm ở `gfx/fx/recipes-<nhóm>.ts` (chỉ kiểu, KHÔNG import `registerRecipe` để khỏi vòng import), `recipes.ts` đăng ký mảng đó. Logic chọn công thức từ sự kiện nằm ở hàm thuần cạnh đó (`combat-fx.ts`), `WorldScene` chỉ gọi; không thêm nhánh `if` theo loại hiệu ứng.
- **Chiến đấu (đợt 1):** `hit-spark` (thường), `hit-crit`, `hit-heavy` (chí mạng hoặc >= 15 % khí huyết tối đa của mục tiêu; rung nhẹ 0,004 / 110 ms), `hurt-self` / `hurt-heavy` (mình bị đánh; ưu tiên 2), `heal-glow` (khí huyết của mình tăng một bước >= 10 % tối đa: đan dược...; hồi tự nhiên từng số nguyên không qua ngưỡng), `mon-vanish` (quái biến khỏi state khi đang hiện trong khung camera). Chữ bay: thường trắng, chí mạng "Bạo!" vàng cỡ 20, đánh người chơi đỏ, hồi máu "+N" xanh; dồn đòn lên CÙNG một mục tiêu thì xếp hàng lệch lên (`FloatLanes`: cửa sổ 450 ms, 4 hàng x 12 px, mỗi mục tiêu một bộ đếm) để chữ không đè nhau.
- **"Của mình" không cần đổi giao thức:** `DmgMsg` không có người đánh, nên đòn là của mình khi mình vừa ra đòn trong 450 ms và chỗ trúng nằm trong tầm đòn + 80 px (`isMyHit`). Suy sai chỉ khiến hạt được ưu tiên 2 / rung nhẹ, không ảnh hưởng kết quả. Rung chỉ khi ưu tiên 2 (lõi), nên người khác chí mạng gần mình KHÔNG làm màn mình rung.
- **Kiểm:** `combat-fx.test.ts` (thuần) + `node client/scripts/check-combat-fx.mjs [--shot ảnh.webp]` (Chrome thật, chế độ mock; hạt sống THẬT, rung, chữ bay, hồi máu, quái tan, cảnh đông 120 đòn: đỉnh 270 hạt <= trần 520).
- **Tu luyện (đợt 2):** `recipes-cultivation.ts` + `cultivation-fx.ts` (thuần: `planLevelUp`, `planBreakFail`, `nextMoteAt`). `levelup-ring` + `levelup-glow` (lên cấp), `breakthrough-ring` (3 vòng nổ vàng ~110 px) + `breakthrough-pillar` (cột sáng bay thẳng + chớp nhẹ 260 ms), `breakfail-smoke` (khói tím), `meditate-mote` (đốm sáng trôi lên, phát lại mỗi ~600 ms cho từng người đang đả tọa; ưu tiên 0 cho người khác, 1 cho mình, nên đông người đả tọa tự bị bỏ bớt). Một công thức = một emitter nên vòng sóng (`ring`, tốc độ 0, phình ra) và tia sáng là hai công thức riêng, kế hoạch ghép lại. Chớp chỉ khi của mình (ưu tiên 2) và hồ sơ cho. `fxLevelUp` / `fxBreakFail` cũ (vòng tween `Arc`) đã thay bằng `fx.play`. Kiểm: `cultivation-fx.test.ts` + `node client/scripts/check-cultivation-fx.mjs [--shot ảnh.webp]` (hạt sống thật, chớp, **và điểm ảnh thật so với ảnh nền**).
- **Thế giới (đợt 3):** `recipes-world.ts` + `world-fx.ts` (thuần: `planLootDrop`, `planLootPickup`, `lootGlints`, `portalSwirlPoints`, `nextDueAt`). Rơi đồ theo độ hiếm: `loot-drop-low` (thường / lục, 5 hạt), `loot-drop-mid` (lam / tím, 9), `loot-drop-high` (cam, 16 + vòng sáng); MÀU truyền bằng `opts.tint` = `RARITY_COLORS[độ hiếm]` nên mỗi bậc chỉ khác số hạt. Nổ khi món đồ MỚI xuất hiện trong khung (không nổ cho đồ có sẵn lúc vào phòng / đổi bản đồ: `lootFxFrom`). `loot-glint` lấp lánh định kỳ chỉ cho đồ từ lam trở lên (ưu tiên 0). `loot-pickup` (ưu tiên 2) chỉ khi mình vừa gửi `pickup` đúng món đó (`lastPickup`, 1,2 s): đồ biến mất vì lý do khác không nổ. `portal-swirl`: mỗi cổng trong khung phát đốm tím từ hai điểm đối xứng quay quanh cổng (chu kỳ 2,4 s, ~420 ms một lần, ưu tiên 0, bỏ khi `isLowFx`) nên thành vệt xoáy. Chưa có đồ độ hiếm 3-4 trong `items.ts` nên test Chrome dùng bậc 0 và 2. Kiểm: `world-fx.test.ts` + `node client/scripts/check-world-fx.mjs [--shot ảnh.webp]` (hạt sống, nhặt đúng / sai id, **điểm ảnh thật so với nền tĩnh có đối chứng nhiễu**).
- **Công pháp (đợt 4a):** `recipes-skill.ts` + `skill-fx.ts` (thuần: `planSwordBeam`, `planSlashEdges`). `sword-qi` (tia nhỏ rải dọc đường kiếm khí, truyền `opts.angle` = hướng bay), `sword-tip` (nổ nhỏ có vòng ở mũi), `slash-edge` (tia lửa ở hai đầu cung chém). Chỉ THÊM hạt cho `fxSword` / `fxSlash` (ảnh `swordbeam` và cung `Graphics` giữ nguyên); màu = màu vũ khí qua `opts.tint`; điểm phát có trễ theo thời gian bay của ảnh (`QI_TRAVEL_MS` = 220 ms, `time.delayedCall`) nên hạt đi cùng kiếm khí; của mình ưu tiên 2, người khác 1; đòn của yêu thú (vòng nhỏ) không thêm hạt. Chi phí cố định (tối đa 5 điểm qi x 6 + mũi 8 = 32 hạt dù tầm xa) và THEO HỒ SƠ: mỗi điểm là một emitter sống ~0,4 s nên `qiPointsFor(emitterBudget)` = `floor(budget / 3)` kẹp 1..5 (Thấp 4 -> 1 qi + mũi; Vừa 10 -> 3; Cao 24 -> 5) và `slashEdgesFor` (Thấp: một đầu cung), để một đòn của mình (ưu tiên 2, được vượt trần gấp đôi) không nuốt hết ngân sách của người khác ở bậc Thấp. Hiện chỉ có hai công pháp (chém, kiếm khí); hỏa / băng thêm khi `shared/` có công pháp mới. Kiểm: `skill-fx.test.ts` + `node client/scripts/check-skill-fx.mjs [--shot ảnh.webp]` (hạt sống thật theo THỜI GIAN TRÒ CHƠI, điểm ảnh khi ảnh kiếm khí đã tan nên chỉ còn hạt).
- **Chuyển cảnh (đợt 5, đóng #329):** `gfx/scene-transition.ts` (thuần: `IRIS_MS` 400, `FADE_MS` 300, `transitionMs(fadeOnly)`, `waitOrSkip`) + CSS `.transition-overlay` + `ui.showTransition / hideTransition / transitionHold` (dùng trong luồng `travelTo` của `main.ts`, cũng là đường vào / ra bí cảnh). MỐNG MẮT: nền `radial-gradient` đen với lỗ tròn quanh tâm màn hình, bán kính `--iris-r` (`@property`, `<length-percentage>`) chuyển từ `150vmax` về `0` trong 0,4 s; tên bản đồ hiện khi gần khép. Giảm chuyển động (`html[data-reduce-motion="1"]`, `body.reduced-motion`, `prefers-reduced-motion` + `body:not(.motion-ok)`): KHÔNG mống mắt, nền đặc, chỉ mờ dần 0,3 s (ghi đè quy tắc toàn cục 0,01 ms, vì mờ là chuyển động dịu). BỎ QUA ĐƯỢC: bấm chuột / chạm vào lớp hoặc gõ phím thì phần chờ khép (`ui.transitionHold`, thay `setTimeout(350)` cũ) xong sớm; việc vào phòng mới không bị trì hoãn thêm. **Sửa lỗi có sẵn:** bản cũ thêm lớp `active` trong `requestAnimationFrame` ngay sau khi bỏ `hidden` (display: none) nên trình duyệt không có kiểu "trước khi đổi" và màn đổi TỨC THÌ chứ không mờ; nay `void overlay.offsetWidth` ép reflow trước khi thêm lớp. Kiểm: `scene-transition.test.ts` + `node client/scripts/check-transition.mjs` (Chrome thật: đóng băng chuyển động bằng Web Animations ở 300 ms rồi đọc ĐIỂM ẢNH: góc đen, gần tâm còn thấy cảnh; khép hẳn đen toàn bộ; giảm chuyển động bán trong suốt ở nửa chừng; bỏ qua bằng chuột / phím < 250 ms).
- **Luân hồi (đợt 4b): CSS thuần, không qua `gfx/fx`.** Màn Hoàng Tuyền (`.limbo-overlay`, nền 96 % đục + blur) và đầu thai (`.reborn-overlay`, nền đen) là lớp DOM phủ kín canvas nên hạt canvas bị che. `.limbo-fx` (anh em của overlay, z-index 10001, `pointer-events: none`, chỉ hiện khi `body.in-limbo`): vignette tím đen `inset box-shadow` + 10 hồn lửa xanh trôi lên (`limbo-wisp`; biến CSS `--x --s --d --delay --sway` theo `:nth-child`, KHÔNG dùng `style=` inline). Tam Sinh Thạch: `.stone-item` toả sáng tím nhịp thở (`stone-glow`) chỉ khi `body.in-limbo`. Đầu thai: `.reborn-bloom` (vầng sáng mờ trắng nở ra sau chữ) + 12 cánh hoa (`petal-fall`, chạy khi `.active`). Tiết kiệm: ẩn hẳn khi không ở Hoàng Tuyền (0 hoạt ảnh), điện thoại <= 640 px bớt (6 hồn lửa / 7 cánh hoa), bậc Thấp (`body.low-fx`) 4 hồn lửa / 4 cánh hoa và không nhấp nháy Tam Sinh Thạch, giảm chuyển động (`html[data-reduce-motion="1"]`, `body.reduced-motion`, `prefers-reduced-motion` + `body:not(.motion-ok)`) thì đứng yên mờ. Lưu ý: quy tắc toàn cục `body.reduced-motion *` ép 0,01 ms / 1 vòng nên `getAnimations()` bằng 0 dù quy tắc riêng bị gỡ; kiểm đo `animation-name` tính toán. Kiểm: `node client/scripts/check-limbo-fx.mjs [--shot tiền-tố]` (Chrome thật, `document.getAnimations`, kiểu tính toán, nút Đầu thai không bị che bằng `elementFromPoint`).

## 8. Hoạt ảnh nhân vật và quái (B làm)
- **Tạo bằng mã**, tiếp tục `client/scripts/gen-assets.mjs` (tất định, không tệp ngoài): khung hình `đứng` (2-4), `đi` (4 hướng x 4), `đánh` (3), `bị đánh` (1-2), `gục` (4). Biến thể quái bằng màu (`tint` / bảng màu) thay vì thêm khung hình để atlas không phình (trần **2048×2048**, tổng bộ nhớ texture theo mục 10).
- **Máy trạng thái phía client** suy từ dữ liệu đã có (vận tốc từ `px,py`, tin đánh, `hp`, `dead`); không cần đồng bộ thêm. Người ở xa cập nhật theo `farAnimHz`.
- Tween nhẹ (co giãn khi đánh, nhấp nhô khi đi) và bóng đổ dạng đốm (`blobShadows`) bật theo hồ sơ.
- **Tween nhẹ (M5.2 #328 phần 2b đợt 3, đóng #328):** `gfx/anim/tween.ts` (thuần: `spriteTween`, `walkBob`, `sinceStart`, `footPlant`, `tweenEnabled`) + `WorldScene.stepTween` mỗi khung. KHÔNG dùng `scene.tweens` (mỗi thực thể một tween là rác, khó tắt): tính từ đồng hồ cảnh rồi đặt `y` / `scale` của sprite. **Nhấp nhô khi đi:** sprite nảy 0 .. -1,5 px, hai nhịp mỗi 360 ms, lệch pha riêng từng thực thể (cả đám không nảy đồng bộ). **Đánh:** giãn ngang +12 % / nén dọc -8 %, đỉnh ở giữa 180 ms (người: từ `slashUntil - 220`; quái: từ `attackUntil - 250`). **Bị đánh:** nén dọc -12 % / ngang +10 % trong 140 ms, ưu tiên hơn đánh, hơn đi (người: từ `hurtFrom`, nên đòn bị hoãn của #346 cũng hoãn tween; quái: từ `hurtUntil - 167`). Chân đứng yên khi co giãn (`footPlant`: sprite gốc ở giữa khung nên bù `h/2 * (1 - sy)`). **Tắt** khi giảm chuyển động, bậc Thấp, hoặc thực thể cách mình >= `FAR_ANIM_DIST` (420 px), khi gục / đứng yên; lúc tắt trả sprite về `y` / tỉ lệ gốc đúng MỘT lần (cờ `tweenActive`) rồi không ghi gì nữa; quái biến khỏi state cũng được trả về gốc trước khi phát hoạt ảnh gục. Không đổi giao thức, không thêm dữ liệu đồng bộ. **Đo thật** (`client/scripts/check-tween.mjs`, từng khung hình bằng rAF + `scene.time.now`): đi y -13,50 .. -12,00, đánh scaleX tới 1,119 / scaleY 0,921 với đáy sprite 8,000 .. 8,000 (chân đứng yên), bị đánh scaleY 0,880, quái cũng vậy; Thấp / giảm chuyển động / xa: sprite đứng đúng gốc từng khung; đổi bậc giữa lúc đang đi về đúng gốc; 6 đột biến (bỏ bù chân, bỏ kiểm giảm chuyển động / ở xa / bậc Thấp, không trả về gốc) đều đỏ.
- **Đã làm (M5.2 #328 phần 2b, `gfx/anim/entity-lod.ts` + `WorldScene`):** (1) `farAnimHz`: người chơi khác / quái cách mình >= `FAR_ANIM_DIST` (420 px) chỉ cập nhật TRẠNG THÁI hoạt ảnh theo nhịp của hồ sơ (Thấp 8, Vừa 15, Cao 30 Hz; vị trí vẫn nội suy mỗi khung; số rác coi là gần); gần thì mỗi khung. (2) Bóng đốm (`blobShadows`): một ảnh dùng chung (`blob-shadow`, 64x28 vẽ bằng mã, 7 KB) dưới chân MỌI thực thể, tắt ở bậc Thấp; vẽ DƯỚI sprite nên đặt thấp hơn tâm sprite (người chơi y +9, quái `0,95 x bán kính`) để lộ ra dưới chân; cùng texture nên 8 thực thể thêm 0 draw call. (3) Nhãn tên người chơi theo `nameLabelRadius` của hồ sơ (Thấp 260 / Vừa 420 / Cao 640; trước cố định 450). Kiểm: `entity-lod.test.ts` + `node client/scripts/check-lod.mjs [--shot ảnh.webp]` (Chrome thật: đếm số lần `updatePlayerAnim` / `updateMonsterAnim` theo THỜI GIAN TRÒ CHƠI, bóng theo bậc, độ sáng dưới chân khi bật / tắt bóng, bán kính nhãn, draw call). Còn lại của 2b: tween nhấp nhô / co giãn, hai nit (giảm chuyển động vẫn phát 4 khung gục; bị đánh ngắt khung Chém).
- **Hai nit của A ở #346 (M5.2 #328 phần 2b đợt 2):** (1) bị đánh GIỮA đòn đánh không cắt khung Chém: `markPlayerHurt(c, now, slashUntil)` đặt `hurtFrom` = hết đòn (chờ tối đa `HURT_MAX_DEFER_MS` 400 ms), `playerAnimState` chỉ trả `hurt` từ `hurtFrom` nên chuỗi là slash -> hurt -> idle (phản hồi tức thì vẫn ở chữ bay / hạt / rung); (2) giảm chuyển động: gục KHÔNG phát 4 khung đổ xuống, `updatePlayerAnim` dừng hoạt ảnh và `setFrame("<bộ>-die-3")` (khung xác nằm lại), hồi sinh thì phát lại bình thường. Kiểm: `player-anim.test.ts` + `node client/scripts/check-anim.mjs` (chuỗi trạng thái theo từng khung hình, khung hình đã thấy khi gục). Còn lại của 2b: tween nhấp nhô / co giãn.

## 9. Trang trí bản đồ (C làm; A cấp khung `map-style.ts`)
- **Lớp:** (1) tilemap hiện có; (2) **lớp trang trí tất định theo seed bản đồ** (cỏ cao, hoa, đá, nấm, bụi cây): đóng băng vào MỘT `RenderTexture` hoặc lớp tilemap thứ hai cho từng vùng, KHÔNG tạo hàng nghìn sprite; (3) ánh sáng môi trường = một sprite phủ gradient (vignette) + màu môi trường theo bản đồ; (4) sương: 4-8 mảng mềm trôi chậm (`Vừa` / `Cao`); (5) thời tiết hạt (mưa phùn / cánh hoa / tro) chỉ `weather != off`.
- **Kiểu theo bản đồ** (`map-style.ts`, khoá `mapId`, dữ liệu thuần): bảng màu, mật độ trang trí, thời tiết, màu sương, nhạc môi trường. Lạc Hà: ấm, hoa đào; Hắc Phong: tối, gió, tro; bí cảnh: lam ngọc huyền ảo; Hoàng Tuyền: tím đen.
- **Nước:** lấp lánh bằng một TileSprite cuộn (một draw call), không đổi từng ô.
- Không đổi dữ liệu bản đồ của server (`shared/src/map.ts`); trang trí là thuần thị giác, sinh từ `seed` + `mapId` đã có để mọi người thấy giống nhau mà không đồng bộ gì.

### 9.1 Khung đã có (#332 bước 1) và cách thêm nội dung
- **`client/src/gfx/map-style.ts`**: `MAP_STYLES` (khoá `MapDef.id`): `ambient` / `vignette` / `fog` (màu + độ đậm + tốc độ trôi), `weather` (`petals` / `ash` / `spirit` + hạt/giây ở bậc `full`, `light` một nửa), `water` (màu lấp lánh + tốc độ cuộn), `decor.density` (xác suất mỗi ô phù hợp, theo 5 loại `tuft` / `flower` / `pebble` / `mushroom` / `bush`) và `decor.palette` (2 màu mỗi loại cho 2 biến thể). `styleOf(id)` trả kiểu mặc định cho id lạ. `validateStyle` giữ giới hạn (phủ môi trường <= 0,4, vignette <= 0,8, tổng mật độ <= 0,5, hạt thời tiết <= 40/giây); test chạy cho mọi kiểu và nhắc khi thêm bản đồ mà quên kiểu (Hoàng Tuyền chưa là bản đồ nên chưa có mục).
- **`client/src/gfx/map-decor.ts`**: `buildDecorGrid(map, style)` trả `Int8Array` (`-1` = trống, còn lại là khung của tileset trang trí = loại * 2 + biến thể), dùng cho MỘT lớp tilemap thứ hai (không sprite rời, không RenderTexture: bản đồ 96x96 mà RenderTexture đủ nét thì tới 37 MB, vượt ngân sách bậc Thấp). **Tất định và độc lập thứ tự**: mỗi ô quyết định chỉ từ băm số nguyên của `seed ^ hash(mapId)` + toạ độ + ô lân cận (không `Math.random`, test dò mã nguồn), nên `decorAtTile` từng ô khớp lưới dựng một lần. Mỗi ô tối đa một trang trí; nền theo danh sách trắng (cỏ, đất, cát); nấm chỉ cạnh cây, bụi chỉ cạnh cây / nước; hoa mọc THÀNH ĐÁM (nhiễu mượt); trống quanh cổng, hang trùm, lòng trấn. Số đo (Lạc Hà / Hắc Phong / Linh Hư): 780 / 833 / 264 ô có trang trí, dựng 3-12 ms một lần mỗi lần vào bản đồ.
- **Lớp trang trí đã vẽ (#332 bước 2a):** `client/src/gfx/decor-tileset.ts` vẽ tileset 320x32 (10 khung, 40 KB, một texture mỗi kiểu; `decorFrameRects` thuần, tô theo `decor.palette`); `WorldScene.buildMapVisuals` dựng lớp tilemap thứ hai (`decorLayer`, depth -9, giữa ô nền -10 và thực thể) từ `buildDecorGrid`, huỷ và dựng lại khi đổi bản đồ. Ảnh trước / sau: `docs/screenshots/map-decor-tat.webp` / `map-decor-bat.webp`. **Đo thật** bằng `npm run build && npm run e2e:map -w server` (Chrome + server thật): Lạc Hà 780 ô; phiên mới ra đúng cùng lưới (tất định); bật lớp đổi ~27 000 điểm ảnh trên canvas (đối chứng: hai ảnh cùng trạng thái khác < 500); draw call mỗi khung KHÔNG tăng (2,1 -> 2,1: Phaser gộp hai tileset vào cùng lô); dựng lại bản đồ 20 lần không rò đối tượng / texture; 0 lỗi console. Bài học #348: kiểm cái người chơi THẤY (điểm ảnh), không chỉ cái có trong cảnh.
- **Ánh sáng môi trường + vignette đã vẽ (#332 bước 2b):** `client/src/gfx/map-light.ts`: hai ảnh phủ `scrollFactor 0` (ảnh trắng 4x4 nhuộm `ambient.color` + gradient 128x128 tối dần ra mép nhuộm `vignette.color`), texture 64 KB dùng chung mọi bản đồ; `planLight` (thuần) giao kiểu bản đồ với cờ `ambient` / `vignette` của hồ sơ chất lượng (bậc Thấp: không có cả hai), `vignetteAlphaAt` (45 % bán kính đầu sạch, rồi smoothstep), `lightRect` (che đủ khung nhìn theo `displayWidth` / `displayHeight` của camera nên đúng cả khi thu phóng / DPR). `WorldScene.applyLight` gọi lúc dựng bản đồ và khi `onQualityChange`; `layoutLight` đặt lại kích thước khi camera đổi cỡ / thu phóng. Ảnh: `docs/screenshots/map-light-thap.webp` (không ánh sáng) / `map-light-cao.webp`. **Đo thật** (`e2e:map` Ca 5): bốn góc tối còn 0,77-0,87 so với bậc Thấp, giữa màn hình đổi 4,6 % (vùng chơi sạch), đối chứng hai ảnh cùng bậc khác < 5 %, draw call +0; đột biến (không đặt kích thước ảnh phủ; bậc Thấp vẫn hiện vignette) đều đỏ. Các script điểm ảnh của B (`check-combat-fx` / `-cultivation-fx` / `-world-fx`) và `snap-touch` vẫn đạt với lớp ánh sáng bật.
- **Thời tiết bằng hạt (#332 bước 2c):** lõi `fx` có thêm **vùng phát** `FxParticles.zone` (hình chữ nhật căn giữa điểm phát, mỗi hạt ở một điểm ngẫu nhiên; `opts.area` của `fx.play` ghi đè theo khung nhìn; `gfx/fx/zone.ts` thuần, test không cần Phaser). Ba công thức dữ liệu `weather-petals` / `weather-ash` / `weather-spirit` (`recipes-weather.ts`, ưu tiên 0: tới 60 % trần, bị bỏ trước mọi hiệu ứng khác). `gfx/map-weather.ts` (thuần): `weatherRate` (bậc Thấp `off`, giảm chuyển động: 0; `light` = một nửa), `weatherIntervalMs` (nhịp = số hạt / tốc độ, nên một thời tiết chỉ chiếm 2-4 emitter), `planWeather` (phủ khung nhìn `cameras.main.worldView` x 1,1), `weatherEnabledByUrl`. `WorldScene.emitWeather` mỗi khung. **Mặc định TẮT khi `?debug`** (trừ `?weather=1`; `?weather=0|off` luôn tắt): các script đo hạt sống / điểm ảnh của B và A chạy ở `?debug=1` cần cảnh không có hạt môi trường; e2e bật / tắt lúc chạy bằng `scene.weatherPaused`. **Đo thật** (`e2e:map` Ca 6): bậc Cao ~19 hạt sống / 2 emitter (trần ưu tiên 0 = 14), hạt được vẽ (800-1700 điểm ảnh khác ảnh không thời tiết, đối chứng 0-56), bậc Thấp và giảm chuyển động: 0 hạt; đột biến (thời tiết bỏ qua giảm chuyển động) đỏ cả ở test thuần lẫn e2e.
- **Sương trôi (#332 bước 2d):** `client/src/gfx/map-fog.ts`: 4-8 mảng (bậc Vừa / Cao theo `fogPatches`; bậc Thấp không có) là ảnh scrollFactor 0 dùng chung texture radial 128x128 (64 KB), nhuộm `fog.color`, độ đậm `fog.alpha`, depth giữa thực thể / hạt và ánh sáng (+150). Hàm thuần: `planFog`, `fogPatchLayout` (tất định theo `map.def.seed`, mỗi mảng một cột ngang + lệch dọc / cỡ / tốc độ riêng), `advanceU` (trôi theo `fog.speed`, ra hết mép phải thì quay lại mép trái), `fogRect` (vị trí theo tỉ lệ khung nhìn nên đúng cả khi thu phóng / DPR). Giảm chuyển động: sương CÒN nhưng đứng yên. `WorldScene.applyFog` lúc dựng bản đồ và khi `onQualityChange`; `stepFog` mỗi khung. Ảnh: `docs/screenshots/map-fog-tat.webp` / `map-fog-bat.webp`. **Đo thật** (`e2e:map` Ca 7): bậc Cao 8 mảng, Vừa 4, Thấp 0; 8/8 mảng trôi sau 2,5 s (đồng hồ trò chơi); sương làm sáng cảnh ~4,2 % (đối chứng 0,00 %); giảm chuyển động 0 mảng dời; dựng lại 20 lần không rò; đột biến (sương không trôi; bỏ qua giảm chuyển động) đều đỏ. Ở `?debug` sương vẫn hiện nhưng ĐỨNG YÊN (trừ `?fog=1`; e2e bật trôi bằng `scene.fogPaused = false`), như thời tiết mặc định tắt: các script đo điểm ảnh cần cảnh tĩnh để ảnh đối chứng không nhiễu.
- **Mặt nước lấp lánh (#332 bước 2e, đóng #332):** `client/src/gfx/map-water.ts`. Thiết kế gốc nói "một TileSprite cuộn", nhưng TileSprite phủ cả bản đồ thì phải cắt theo ô nước (mặt nạ hình học vẽ hàng nghìn ô: đắt hơn nhiều), nên làm rẻ hơn: MỘT lớp tilemap chỉ gồm các ô nước (`waterLayer`, depth -8; Lạc Hà 517 ô), tileset là canvas 128x32 (4 biến thể x 32 px, 16 KB) có 3 đốm sáng mỗi ô, vẽ lại 4 lần/giây (`WATER_STEP_MS` 250) với đốm TRÔI theo `style.water.speed` và nhấp nháy độ đục (đỉnh = `style.water.alpha` x 3,2); mỗi ô chọn biến thể theo băm (`waterGrid`: seed ^ hash(mapId) + toạ độ) nên không thành hoa văn lặp. Hàm thuần: `waterGrid`, `shimmerSpots` (đốm trong ô, trôi cuốn vòng 32 px), `shimmerPhaseKey`. **Bậc Thấp và giảm chuyển động: một khung TĨNH** (không vẽ lại). Ở `?debug` đốm đứng yên (trừ `?water=1`; e2e bật bằng `scene.waterPaused = false`). Ảnh: `docs/screenshots/map-water-tat.webp` / `map-water-bat.webp`. **Đo thật** (`e2e:map` Ca 8): lớp gồm ĐÚNG các ô nước; bật lớp đổi ~2800 điểm ảnh TRONG ô nước (đối chứng 0-67; chỉ đếm điểm ảnh nằm trong ô nước vì quái đi lại trong khung làm ảnh đổi ở chỗ khác); texture đổi theo thời gian ở bậc Cao, đứng yên ở Thấp / giảm chuyển động; draw call 2,1 -> 2,1 (+0,0); đột biến (không vẽ lại đốm; lưới nước gồm cả ô cát) đều đỏ.
- **Chuẩn chung cho hiệu ứng môi trường chuyển động (thời tiết / sương / nước):** `ambientEnabledByUrl(search, name)`: bật, trừ khi đang `?debug` (cần `?<tên>=1`), để các script đo điểm ảnh có cảnh tĩnh và ảnh đối chứng không nhiễu.

## 10. Ngân sách hiệu năng (cứng; số ban đầu, C đo và chốt trong `client/perf-budget.json`)

**Thiết bị tham chiếu** "Android tầm trung" = Chrome / WebView, ~4 GB RAM, GPU lớp Adreno 6xx / Mali-G5x-G6x. Máy này không có thiết bị thật: **đại diện đo được** = Chrome headless + `Emulation.setCPUThrottlingRate` 4× và 6× (như `docs/HIEU_NANG_DI_DONG.md`) kèm đo trên điện thoại thật của người dùng bằng `?perf=1` (M5.4). Số FPS trong CI là CHỈ SỐ PHỤ; cổng cứng trong CI dựa vào đại lượng tất định:

| Đại lượng | Thấp | Vừa | Cao | Đo ở đâu |
|---|---|---|---|---|
| Thời gian JS mỗi khung p95 (CPU 4×, cảnh đông) | ≤ 9 ms | ≤ 11 ms | ≤ 13 ms | harness C |
| Draw call mỗi khung (cảnh đông, 50 thực thể + hiệu ứng) | ≤ 60 | ≤ 100 | ≤ 160 | `renderer` của Phaser / lớp phủ |
| Hạt sống đỉnh | ≤ 60 | ≤ 220 | ≤ 520 | `FxBudget` |
| Bộ nhớ texture (tổng w×h×4) | ≤ 48 MB | ≤ 80 MB | ≤ 128 MB | tính từ danh sách texture |
| JS heap sau 20 lần đổi bản đồ | tăng ≤ 10 % | | | rò rỉ |
| Gói JS chính (gzip) | ≤ 520 KB (hiện 448 KB) | | | `vite build` |
| Atlas + tileset | ≤ 1 MB (hiện 168 KB) | | | cây tệp |
| Băng thông mạng (byte / tick, 100 người) | **không đổi** (so mốc `bench-baseline.json`) | | | `npm run bench -w server` |

Mục tiêu "≥ 50 FPS" được chứng minh bằng: (a) các số trên đạt ở CPU 4× (CI), (b) đo thật trên điện thoại tầm trung của người dùng (M5.4), ghi số đo vào `docs/HIEU_NANG_DI_DONG.md`. Một hiệu ứng / tài sản làm vượt ngân sách thì **không được merge**, không "để tối ưu sau".

## 11. Tài sản và giấy phép (C làm công cụ; mọi người tuân thủ)
1. Mọi tài sản mới: sinh bằng mã (`gen-assets.mjs`, hạt / texture tự vẽ) hoặc CC0 / giấy phép cho phép dùng thương mại **ghi vào `CREDITS.md`** (nguồn URL, tác giả, giấy phép, ngày lấy, băm SHA-256); `npm run check:credits` đỏ nếu một tệp trong `client/public/` không có mặt trong bảng.
2. **Phông chữ:** tự lưu `Noto Serif` (giấy phép OFL) trong `client/public/fonts/` (chỉ tập con tiếng Việt + Latin, `woff2`), bỏ Google Fonts (privacy, ngoại tuyến, APK). Ghi vào `CREDITS.md`; cập nhật `privacy.html` nếu cần.
3. Cấm: tài sản / chữ / tên / âm thanh của game khác (kể cả bản clone Vạn Kiếp Tu Tiên), tài sản không rõ giấy phép, sinh bằng công cụ mà điều khoản không cho dùng thương mại.

## 12. Kiểm thử và công cụ đo (C làm, A review)
1. **Ma trận khung nhìn** (ảnh chụp trước / sau, `npm run chup-viewport`): 360×640, 390×844, 412×915 (điện thoại dọc); 844×390, 915×412 (điện thoại ngang); 768×1024, 1024×768 (tablet); 1280×720, 1920×1080, 2560×1440 (máy tính), DPR 1 / 2 / 3 ở mẫu đại diện. Dùng chế độ giả lập có sẵn (`?dungeon=mock`, `?duel=mock`, `?sect=mock`...) để có đủ màn hình. So điểm ảnh với ảnh chuẩn (ngưỡng), ảnh mới lưu cạnh để người duyệt xem trước / sau. **Giả lập con trỏ chính cho đúng** (cảm ứng cho phone / tablet, chuột cho desktop) vì `display.ts` phân loại `tablet` bằng `(pointer: coarse)`; trong Chrome headless, bật giả lập cảm ứng xong không tắt lại được trong cùng phiên nên chạy các khung DESKTOP TRƯỚC (`client/scripts/snap-sheet.mjs` của B đã làm vậy).
2. **Khẳng định bố cục tự động** ở mỗi khung nhìn: không tràn ngang / dọc; mọi phần tử tương tác trên cảm ứng ≥ 44×44; không phần tử HUD nào nằm ngoài vùng an toàn; các vùng HUD chính (`#hud`, `#hud-col-left`, `#chat`, `#minimap-wrap`, cụm nút ảo) không chồng nhau (hộp bao).
3. **Harness hiệu năng** (mở rộng `client/scripts/measure-mobile-perf.mjs`): kịch bản {một mình, đông 50 bot, đang đánh với hiệu ứng, bí cảnh} x {Thấp, Vừa, Cao} x {CPU 1×, 4×, 6×}; xuất JSON; so với `perf-budget.json`. Chạy trong `bench.yml` hằng đêm + thủ công; PR chỉ chạy phần tĩnh (kích cỡ gói, bộ nhớ texture suy ra từ atlas) để không cạn phút Actions.
4. **Rò rỉ:** vào / ra bản đồ và bí cảnh 20 lần, đo số texture, số `GameObject`, listener, heap.
5. **DPR / nhập liệu:** E2E toạ độ chạm đúng ở DPR 1 / 2 / 3 (mục 5).
6. Mỗi tính năng có **đột biến đỏ**. `npm run e2e*` và bot hiện có phải vẫn xanh.

## 13. Giai đoạn và chia việc

| Giai đoạn | Nội dung | Ai | Phụ thuộc |
|---|---|---|---|
| **M5.1 Nền** | `display.ts` (thuộc tính `<html>`, vùng an toàn, phân loại), PR đầu rất nhỏ để B bắt đầu | A | (không) |
| | `quality.ts` + màn hình cài đặt + bộ điều tốc + `?perf=1` | A | display |
| | Spike DPR + `renderScale` + sửa `fitZoom` | A | display, quality |
| | Hệ thống bố cục đáp ứng: tấm chung, chuyển bảng, chữ, vùng an toàn | B | display (hợp đồng mục 3.1) |
| | Điều khiển cảm ứng: cụm nút + chống cử chỉ + đa chạm | B | display |
| | Harness đo + ma trận ảnh + khẳng định bố cục + `perf-budget.json` | C | (song song) |
| | Phông tự lưu + công cụ tài sản / giấy phép | C | (song song) |
| **M5.2 Hiệu ứng** | Lõi `fx` (`FxBudget`, pool, atlas hạt, `BitmapText`) | A | quality |
| | Công thức hiệu ứng (mục 7.2) + chuyển cảnh | B | lõi `fx` |
| | Hoạt ảnh nhân vật / quái (tạo bằng mã, máy trạng thái) | B | (độc lập ban đầu) |
| **M5.3 Bản đồ** | `map-style.ts` + lớp trang trí + sương + thời tiết + nước | C | quality, lõi `fx` |
| **M5.4 Hoàn thiện** | đo thật trên điện thoại, chỉnh bảng hồ sơ, ghi số đo, phát hành | A + C + người dùng | tất cả |

### 13.1 Trạng thái (cập nhật 12/11/2026, main `e08dc2f`)
| Mốc | Xong | Còn lại |
|---|---|---|
| **M5.1 Nền** | display, quality, DPR + `renderScale` (A); tấm chung `.sheet` + Túi / Nhân vật / Cài đặt / Bản đồ / Sổ nhiệm vụ / Cửa hàng / Lò rèn / Tông môn + 4 thẻ `.sheet-card` (kết quả Bí cảnh / Quyết đấu, Chỉ dẫn người mới, Phiên bản cũ), điều khiển cảm ứng (joystick, D-pad, khoá mục tiêu) (B); HUD gọn (bảng Nhiệm vụ thu gọn mặc định ở điện thoại ngang / dọc thấp, `hud-compact.ts`), cỡ chữ theo hồ sơ (`text-scale.css`, `--ui-scale` Nhỏ / Vừa / Lớn, sàn 14 px nội dung / 12 px HUD trên điện thoại, cổng `check-text-size`) (B); harness đo: ảnh mốc 49 tấm, `perf-budget.json`, `check:budget` trong CI, `leak:test`, `perf:mobile` (C) | **#326** phần cuối: kéo để đóng tấm, đưa nút HUD ngang lên 44 px (B; dialog dock đáy NPC đã xong, xem 4.2); **#330** phần chạy hằng đêm trong `bench.yml` + **#331** phông tự lưu (C) |
| **M5.2 Hiệu ứng** | Lõi `fx` (#325, sửa UV chữ bay #348, thêm vùng phát `zone`); công thức chiến đấu / tu luyện / thế giới / công pháp / luân hồi (CSS) + chuyển cảnh mống mắt (#329 ĐÓNG); hoạt ảnh người / quái bằng mã, `farAnimHz`, bóng đốm, nhãn theo hồ sơ, hai nit đợt 2 (#328 2b đợt 1-2) | (không; #328 đóng sau PR tween, còn đo `?perf=1` trên điện thoại thật ở M5.4) |
| **M5.3 Bản đồ** | **#332 ĐÓNG** (làm hết bởi A, không phải C): kiểu theo bản đồ, lớp trang trí tất định, ánh sáng + vignette, thời tiết bằng hạt, sương trôi, mặt nước lấp lánh; `e2e:map` (8 ca, điểm ảnh thật), `e2e:chuyen-canh` (luồng qua cổng thật, PR #364) | (không) |
| **M5.4 Hoàn thiện** | kịch bản + mẫu báo cáo đo trên điện thoại thật: `docs/KIEM_THU_GIAO_DIEN_M5.md` (A) | đo `?perf=1` trên điện thoại thật (C + người dùng), chỉnh bảng hồ sơ, ghi số đo vào `docs/HIEU_NANG_DI_DONG.md`, thẻ phiên bản + cập nhật bản thật CHỈ khi người dùng đồng ý |

Quy ước: mỗi PR nhỏ, một việc; mô tả PR dán số đo trước / sau (FPS nếu có, p95, draw call, bộ nhớ texture) và ảnh chụp khi đổi hình; PR đụng `client/src/gfx/` hoặc `style.css` chạy `npm run build` + E2E liên quan; `npx prettier --check .`, `typecheck`, `lint`, `npm test` xanh.

## 14. Rủi ro và quyết định đã chọn (người dùng đổi nếu muốn)
| Rủi ro | Cách giữ |
|---|---|
| DPR trong Phaser 3.90 không có tuỳ chọn gốc; sai là toạ độ chạm lệch | Spike + E2E toạ độ ở DPR 1 / 2 / 3 là điều kiện merge của A |
| Phá ràng buộc StateView khi đổi zoom (thấy thiếu thực thể ở mép) | Test bất biến `w/zoom ≤ 1900`, `h/zoom ≤ 1100` với đột biến đỏ |
| Hạt / hiệu ứng làm tụt FPS ở chỗ đông | `FxBudget` cứng + ưu tiên + bộ điều tốc + ngân sách CI |
| WebView Android hết bộ nhớ khi texture lớn | Trần `maxPixels`, trần atlas 2048², ngân sách bộ nhớ texture, kiểm rò rỉ |
| Pixel-art nhấp nháy khi zoom không nguyên | Chọn lọc `NEAREST` / bội số zoom theo ảnh chụp (mục 5) |
| Nhiều người cùng sửa `style.css` / `ui.ts` (4000+ dòng) -> xung đột | Chuyển từng bảng trong PR của chính bảng; ai đụng cùng bảng phối hợp qua issue |
| Mặc định chất lượng sai trên máy lạ | `Tự động` có bộ điều tốc hạ bậc; người chơi luôn chọn tay được |
| Đo FPS thật không có thiết bị | Cổng CI bằng đại lượng tất định; đo thật ở M5.4 với điện thoại người dùng, lớp phủ `?perf=1` |

**Quyết định mặc định của A:** chất lượng `Tự động`; không dùng hậu xử lý (bloom) trên Android; giữ DOM cho HUD (không chuyển HUD sang Phaser: giữ ARIA, phím tắt, bàn phím ảo, và 4000+ dòng đã có); tài sản chỉ tự vẽ bằng mã (không tải tài sản ngoài trong M5 trừ khi người dùng đồng ý riêng).
