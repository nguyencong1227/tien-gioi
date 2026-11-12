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
3. **Không thanh cuộn ngoài ý muốn:** `html, body { overscroll-behavior: none; overflow: hidden }`, chiều cao dùng `--vh` / `100dvh`, chỉ cuộn BÊN TRONG bảng; kiểm `scrollWidth ≤ innerWidth` và `scrollHeight ≤ innerHeight` ở mọi khung nhìn.
4. **Vùng an toàn:** mọi phần tử neo mép dùng `--safe-*`; app Android cấu hình `StatusBar` / `SystemBars` đúng phiên bản Capacitor đã cài (xem `docs/APP_ANDROID.md`).
5. **Bảng thành tấm:** `phone` = tấm toàn màn hình (dọc: kéo từ dưới lên; ngang: kéo từ cạnh phải) với nút đóng ở vùng với tay; `tablet` / `desktop` = cửa sổ nổi như hiện nay. Mỗi bảng dùng MỘT thành phần tấm chung (không sao chép CSS từng bảng).
6. **Điều khiển cảm ứng:** joystick trái (đã có); cụm phải: Chém, 3 kỹ năng, Nhặt / Nói chuyện (theo ngữ cảnh), ô đan dược nhanh; chống cử chỉ trình duyệt (`touch-action: none` trên canvas, chặn phóng to hai ngón / chạm đúp); đa chạm đúng (joystick + nút cùng lúc, `activePointers ≥ 3`).
7. **Bàn phím + chuột** giữ nguyên và ngang quyền (không bỏ phím tắt hiện có).
8. **Hướng:** app Android `sensorLandscape`; web hỗ trợ dọc (HUD thu gọn) và ngang.

### 4.3 Chiến lược di chuyển từ `@media` cũ
Quy tắc MỚI viết theo thuộc tính (`html[data-form="phone"] ...`). Mỗi bảng được di chuyển trong CÙNG PR sửa bảng đó (xoá `@media` cũ tương ứng); không refactor hàng loạt một lần. B giữ bảng đếm "bảng đã chuyển / còn lại" trong mô tả issue.

## 5. Scale Manager và DPR (A làm: lõi)

**Vấn đề:** canvas hiện bằng CSS px nên mờ trên màn hình mật độ cao. **Mục tiêu:** `canvas.width = cssW × renderScale`, hiển thị CSS vẫn `cssW`, toạ độ nhập đúng, camera đúng.

**Hướng đề xuất** (A thử bằng Chrome headless và ghi số đo trước khi chốt; PR đầu của A là "spike + đo"):
- `scale: { mode: NONE hoặc RESIZE, ... }` tự quản kích thước: `game.scale.resize(cssW * rs, cssH * rs)` rồi đặt kích thước hiển thị của canvas bằng CSS (`zoom = 1/rs` hoặc `canvas.style.width/height`), do `display.ts` điều khiển trên `ResizeObserver` của `#game` và `visualViewport` (bàn phím ảo), có chống rung (debounce ~100 ms, bỏ qua thay đổi < 2 px).
- `renderScale = clamp(dpr, 1, profile.renderScaleMax)` rồi hạ thêm nếu `cssW*cssH*rs² > profile.maxPixels` (trần điểm ảnh, bảng mục 6.2). **`renderScale` có thể < 1** (sàn 0,5): `Thấp` có `maxPixels` 1,0 M nên màn 1920×1080 (2,07 M điểm ảnh ở `renderScale` 1) bị ép xuống ~0,69; chấp nhận được vì máy tính mặc định `Cao`, và người chơi chọn `Thấp` là chọn đánh đổi độ nét lấy hiệu năng.
- **Camera:** `fitZoom` giữ nguyên LUẬT theo đơn vị logic (CSS px) rồi nhân `renderScale` vào `camera.zoom`; **ràng buộc StateView (`w/zoom ≤ 1900`, `h/zoom ≤ 1100`, tính theo CSS px / zoom logic) phải được test** (đột biến đỏ nếu bỏ).
- **Pixel-art:** sprite hiện là pixel-art; zoom không nguyên làm nhấp nháy cạnh. Quyết định (xác nhận bằng ảnh chụp): giữ lọc `NEAREST` + `roundPixels`, hoặc bắt `camera.zoom * renderScale` về bội số của 0,25. A chọn theo ảnh chụp thật và ghi lý do.
- **Tiết kiệm pin:** tuỳ chọn 30 FPS (`game.loop.targetFps`), tự bật khi `Battery Status` báo yếu nếu khả dụng; tạm dừng khi ẩn (đã có qua nhịp tim #293).
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
2. **Bộ điều tốc (chạy khi `Tự động`):** đo thời gian khung (trung bình trượt) mỗi cửa sổ 5 giây trong lúc **có hoạt động** (không đo khi ẩn / đang tải). p95 > 22 ms (dưới ~45 FPS) hai cửa sổ liền -> **hạ một bậc**; p95 < 14 ms suốt 30 giây và chưa chạm trần của thiết bị -> **nâng một bậc**. Trễ (hysteresis): tối đa 1 lần đổi / 20 giây, tối đa 3 lần hạ / phiên, không nâng sau khi vừa hạ vì tải đỉnh. Người chơi chọn tay thì TẮT bộ điều tốc.
3. **Lớp phủ gỡ lỗi `?perf=1`:** FPS, p95, số draw call, hạt sống, bộ nhớ texture, heap JS, bậc hiện tại; dùng cho đo thật trên điện thoại (nối với `docs/KIEM_THU_MAY_THAT.md`).

## 7. Lớp hiệu ứng (`gfx/fx`)

### 7.1 Nguyên tắc (ràng buộc cứng)
1. **Phía client, theo sự kiện đã có.** Tin `fx` / `dmg` / thay đổi state hiện có đã mang đủ thông tin; công thức hiệu ứng ánh xạ `loại sự kiện -> recipe`. **Không thêm tin nhắn hay trường đồng bộ.**
2. **Công thức theo dữ liệu** (`gfx/fx/recipes.ts`): `{ id, particles[], flash?, shake?, light?, sound?, cost }`, thêm hiệu ứng = thêm dữ liệu, không thêm nhánh `if` trong `WorldScene`.
3. **Ngân sách tập trung (`FxBudget`):** mỗi `playFx` xin ngân sách; vượt `particleBudget` / `emitterBudget` thì bỏ hiệu ứng ưu tiên thấp (`priority 0` = môi trường, `1` = người khác, `2` = người chơi này và sự kiện quan trọng như đột phá). Ưu tiên của chính mình KHÔNG bao giờ bị bỏ trừ khi vượt gấp đôi trần.
4. **Không cấp phát trong vòng nóng:** emitter và chữ bay dùng **pool**; `maxAliveParticles` đặt theo hồ sơ; một **atlas hạt** duy nhất (đốm mềm, tia, vòng, khói, cánh hoa, hồn lửa) với hoà trộn cộng (`ADD`) để gộp lệnh vẽ.
5. **Chữ bay bằng `BitmapText`** (một texture phông bit-map sinh bằng mã) thay vì `Text` canvas (mỗi `Text` là một texture, đắt trên di động); tối đa `damageNumbers`. **Phông bit-map sinh bằng mã phải có đủ ký tự dùng thật**: chữ số, `+`, `-`, `!`, và các chữ có dấu của nhãn hiện tại (`floatText` in "Bạo! 123": cần `B`, `ạ`, `o`, `!`), hoặc đổi nhãn chí mạng thành kiểu không chữ (cỡ + màu + biểu tượng). B chọn khi làm #329; C kiểm tài sản (#331) biết để đối chiếu.
6. **Không chặn nhập liệu, không phụ thuộc thời gian thực của server:** hiệu ứng chỉ là hình ảnh; đóng cảnh (`shutdown`) phải giải phóng sạch (kiểm rò rỉ, mục 12).
7. Tôn trọng `shake`, `reducedMotion()`, `onQualityChange` (đổi bậc giữa chừng không giật: hiệu ứng đang chạy xong tự nhiên, hiệu ứng MỚI theo hồ sơ mới).

### 7.2 Danh mục hiệu ứng (đợt 1 bắt buộc; B làm công thức, A cấp lõi)
| Nhóm | Hiệu ứng |
|---|---|
| Chiến đấu | vệt chém + tia lửa khi trúng; số sát thương bay (thường / chí mạng lớn hơn, màu khác; hồi máu màu xanh); rung nhẹ khi trúng đòn mạnh (≥ 15 % khí huyết tối đa hoặc chí mạng; tắt khi giảm chuyển động); máu / quái gục tan thành điểm sáng |
| Công pháp | mỗi công pháp một công thức (kiếm khí, hỏa, băng...) bằng hạt + tia, ưu tiên 2 cho của mình |
| Tu luyện | hào quang thiền định (có từ trước, đưa vào ngân sách); **đột phá cảnh giới** (vòng nổ, cột sáng, chớp nhẹ toàn màn hình, tắt khi giảm chuyển động); lên cấp |
| Luân hồi | Hoàng Tuyền (vignette tím đen, hồn lửa xanh trôi), Tam Sinh Thạch (phát sáng), đầu thai (mờ trắng + cánh hoa), Mạnh Bà |
| Thế giới | cổng truyền tống xoáy; vào / ra bí cảnh; rơi đồ lấp lánh theo độ hiếm; nhặt đồ |
| Chuyển cảnh | mờ / mống mắt 300-500 ms khi qua cổng và vào bí cảnh; bỏ qua được; giảm chuyển động -> mờ dần |

## 8. Hoạt ảnh nhân vật và quái (B làm)
- **Tạo bằng mã**, tiếp tục `client/scripts/gen-assets.mjs` (tất định, không tệp ngoài): khung hình `đứng` (2-4), `đi` (4 hướng x 4), `đánh` (3), `bị đánh` (1-2), `gục` (4). Biến thể quái bằng màu (`tint` / bảng màu) thay vì thêm khung hình để atlas không phình (trần **2048×2048**, tổng bộ nhớ texture theo mục 10).
- **Máy trạng thái phía client** suy từ dữ liệu đã có (vận tốc từ `px,py`, tin đánh, `hp`, `dead`); không cần đồng bộ thêm. Người ở xa cập nhật theo `farAnimHz`.
- Tween nhẹ (co giãn khi đánh, nhấp nhô khi đi) và bóng đổ dạng đốm (`blobShadows`) bật theo hồ sơ.

## 9. Trang trí bản đồ (C làm; A cấp khung `map-style.ts`)
- **Lớp:** (1) tilemap hiện có; (2) **lớp trang trí tất định theo seed bản đồ** (cỏ cao, hoa, đá, nấm, bụi cây): đóng băng vào MỘT `RenderTexture` hoặc lớp tilemap thứ hai cho từng vùng, KHÔNG tạo hàng nghìn sprite; (3) ánh sáng môi trường = một sprite phủ gradient (vignette) + màu môi trường theo bản đồ; (4) sương: 4-8 mảng mềm trôi chậm (`Vừa` / `Cao`); (5) thời tiết hạt (mưa phùn / cánh hoa / tro) chỉ `weather != off`.
- **Kiểu theo bản đồ** (`map-style.ts`, khoá `mapId`, dữ liệu thuần): bảng màu, mật độ trang trí, thời tiết, màu sương, nhạc môi trường. Lạc Hà: ấm, hoa đào; Hắc Phong: tối, gió, tro; bí cảnh: lam ngọc huyền ảo; Hoàng Tuyền: tím đen.
- **Nước:** lấp lánh bằng một TileSprite cuộn (một draw call), không đổi từng ô.
- Không đổi dữ liệu bản đồ của server (`shared/src/map.ts`); trang trí là thuần thị giác, sinh từ `seed` + `mapId` đã có để mọi người thấy giống nhau mà không đồng bộ gì.

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
