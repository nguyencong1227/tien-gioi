# Bộ chơi thử bằng AI (AI Playtest)

> QUYET_DINH_M3 **mục 60.1** (người dùng đồng ý 21/11). Issue **#1194**.
> Dev F dựng; Dev H bổ sung kịch bản; Dev A review (ghép main); Dev B review khung nhìn + giao diện.

Bộ chạy **lái Chrome thật qua CDP**, chơi các kịch bản bằng **bàn phím thật** (phím `isTrusted`),
chụp ảnh nhiều khung màn hình, ghi số đo (FPS, vị trí nhân vật theo thời gian, lỗi console / mạng),
tự phát hiện một số lỗi "nhìn mới thấy" (trôi sau nhả phím, khung đóng băng, bảng không đóng), rồi ra
một tệp **`manifest.json`** — hợp đồng máy đọc cho bước **AI chấm ảnh** (mục 60.2, do Claude điều phối
trên máy chủ đọc manifest + ảnh để chấm; F KHÔNG làm bước chấm đó).

**Mục tiêu:** bắt lỗi TRƯỚC người dùng — túi đồ chọn sai món, phím trôi, chiêu bay lệch, trùm kẹt cây,
giao diện che màn chơi, chữ tràn, nút trùng, màn hình kẹt… **Không sửa mã trò chơi**: lỗi tìm ra thì mở
issue `dev-a` / `dev-b` kèm cách tái hiện (đây là công cụ KIỂM THỬ, không phải chỗ vá bug).

---

## 1. Cài đặt & chạy

### Yêu cầu
- **Phải build client trước** — server thử phục vụ bản build này:
  ```bash
  npm run build -w client
  ```
  (nếu thiếu `client/dist`, harness ném lỗi rõ: "client/dist chưa có…".)
- `google-chrome` có sẵn trong PATH (harness tự khởi động headless, không cần mở tay).
- Node 22 (`~/.local/node/bin`); nếu `npm` không có trong PATH thì
  `export PATH=~/.local/node/bin:$PATH`.

### Lệnh
```bash
npm run ai-playtest -w server            # mặc định: ra tmp/ai-playtest/<ngày>-<sha>/
npm run ai-playtest -w server -- --only enter-game,panel-inv        # chỉ chạy một số bước
npm run ai-playtest -w server -- --viewports 412x915,1366x768       # chỉ chạy một số khung
npm run ai-playtest -w server -- --out <dir>                        # thư mục kết quả tuỳ ý
npm run ai-playtest -w server -- --png                             # ảnh PNG thay JPEG q85
npm run ai-playtest -w server -- --ambush                          # bật AMBUSH (chặn đường) cho bước gặp chặn đường
```

| Tham số | Ý nghĩa |
|---|---|
| `--only <id,id,...>` | Chỉ chạy các bước có `id` này (danh sách `id` ở mục 3). |
| `--viewports <w x h,...>` | Chỉ chạy các khung này (danh sách ở mục 4). |
| `--out <dir>` | Thư mục kết quả (mặc định `tmp/ai-playtest/<ngày>-<sha ngắn>/`, đã bỏ qua git). |
| `--png` | Ảnh chụp PNG thay JPEG q85 (mặc định JPEG để nhẹ cho bước AI đọc). |
| `--ambush` | Dựng server thử với `AMBUSH=on` (cho bước gặp chặn đường, mục 52). |

### Tài nguyên & dọn dẹp
- **MỘT Chrome** tại một thời điểm (nhiều tab, mỗi tab = một viewport / một đạo hiệu thử).
- Server thử là tiến trình Colyseus **thật** dựng từ cây mã hiện tại (`src/index.ts`, KHÔNG
  `NODE_ENV=production`, `DATA_DIR` tạm, cổng ngẫu nhiên — **KHÔNG bao giờ 2567**, KHÔNG cổng dev của dev khác).
- Tổng thời gian cả bộ ≤ ~15 phút (mỗi bước ~vài giây; `--only` để chạy nhanh).
- Mọi tiến trình + thư mục tạm được dọn trong `finally` kể cả khi lỗi (kill theo nhóm tiến trình Chrome;
  **không** `pkill -f` theo tên). Không để cổng nào chiếm sau khi xong.

---

## 2. Kết quả đầu ra

```
<out>/
  manifest.json                      <- hợp đồng (mục 4); validateManifest chạy thật trước khi ghi
  shots/<step>-<viewport>.jpg        ảnh chụp (JPEG q85 mặc định; --png → PNG)
```

- Thư mục mặc định `tmp/ai-playtest/<ngày>-<sha>/` đã thêm vào `.gitignore` — **KHÔNG commit ảnh**.
- `manifest.json` luôn đi kèm SHA ngắn của `main` (`commit`) để biết server thử được dựng từ mã nào.
- `validateManifest` chạy ngay trước khi ghi: manifest sai hợp đồng sẽ **ném** (không để manifest hỏng lọt ra).

---

## 3. Kịch bản (steps)

Mỗi bước là một `StepDef`: đăng nhập một đạo hiệu thử, chạy một chuỗi hành động bằng phím thật, lấy mẫu
số đo trong lúc chạy, chụp ảnh, tự phát hiện finding. Hiện có **nhóm vào game / di chuyển / bảng** (mục
60.1 nhóm 1, 2, 3); các nhóm còn lại (đánh quái, cổng, trùm,…) bổ sung sau (Dev F lõi + nhóm 1-3; Dev H phần còn lại).

| `id` | `scenario` | Mô tả | Khung mặc định |
|---|---|---|---|
| `enter-game` | `enter` | Vào game: đăng nhập + HUD + canvas Phaser sẵn sàng | 412x915, 1366x768 |
| `move-hold-w` | `move` | Giữ W 2s rồi nhả, kiểm pred có trôi sau nhả phím không | 412x915, 1366x768 |
| `panel-inv` | `panels` | Mở túi đồ (B), chụp, Esc đóng, kiểm bảng đóng thật | 360x640, 915x412, 1366x768 |
| `panel-char` | `panels` | Mở nhân vật (C), chụp, Esc đóng, kiểm bảng đóng thật | 360x640, 915x412, 1366x768 |
| `panel-quest` | `panels` | Mở sổ nhiệm vụ (N), chụp, Esc đóng, kiểm bảng đóng thật | 360x640, 915x412, 1366x768 |
| `panel-sect` | `panels` | Mở tông môn (G), chụp, Esc đóng, kiểm bảng đóng thật | 360x640, 915x412, 1366x768 |
| `panel-map` | `panels` | Mở bản đồ (M), chụp, Esc đóng, kiểm bảng đóng thật | 360x640, 915x412, 1366x768 |
| `panel-settings` | `panels` | Mở cài đặt (E), chụp, Esc đóng, kiểm bảng đóng thật | 360x640, 915x412, 1366x768 |

**Nhóm kịch bản mục 60.1 (chưa đầy đủ):** (1) vào game; (2) di chuyển WASD lâu + đổi hướng nhanh;
(3) mở / đóng MỌI bảng (túi, nhân vật, nhiệm vụ, tông môn, bản đồ M, phím tắt, cài đặt) + kiểm Esc / nút
đóng đều đóng được; (4) đánh quái (J K L U I O); (5) đi qua cổng 4 bản đồ; (6) đánh 1 trùm (chụp vùng
cảnh báo); cộng: chết → Hoàng Tuyền → đầu thai; tông môn (góp / rút); gặp chặn đường (cờ `--ambush`);
bảng Xã hội. **Khuyến nghị thêm một lượt cảm ứng giả lập** (`input: "touch"`) cho các bước bảng/HUD.

---

## 4. Khung màn hình (viewports)

Mặc định 6 khung (`DEFAULT_VIEWPORTS`, mục 60.1): 3 dọc, 1 cỡ người dùng nằm, 2 desktop.

| `id` | Kích thước |
|---|---|
| `360x640` | dọc nhỏ |
| `412x915` | dọc |
| `915x412` | nằm cỡ người dùng |
| `550x900` | dọc lớn |
| `1366x768` | desktop |
| `1920x1080` | desktop lớn |

Không phải MỌI bước × MỌI khung: mỗi bước khai khung nào chạy khung đó (bảng / HUD đủ 6 khung; di chuyển
2-3 khung). `deviceScaleFactor` cố định = 1 để so ảnh các lần chạy nhất quán (Dev B: DPR nên = 1).

---

## 5. Hợp đồng `manifest.json` (cho bước AI chấm ảnh — mục 60.2)

> **Đây là hợp đồng MÁY ĐỌC giữa bộ chạy (F dựng) và AI-image-coordinator (mục 60.2).**
> **ĐỪNG ĐỔI TÊN TRƯỜNG sau khi merge** — coordinator phụ thuộc chính xác vào các khoá này. Thêm trường
> thì THÊM (optional), đừng đổi tên / đổi kiểu trường cũ. Kiểu TS + hàm kiểm ở
> `server/scripts/ai-playtest/manifest.ts` (`MANIFEST_SCHEMA`, `validateManifest`).

`MANIFEST_SCHEMA = "tien-gioi/ai-playtest/v1"`. Khi đổi hợp đồng KHÔNG tương thích ngược, tăng số này.

```jsonc
{
  "schema": "tien-gioi/ai-playtest/v1",
  "commit": "<sha ngắn của main mà server thử dựng từ>",
  "startedAt": "<ISO>",
  "finishedAt": "<ISO>",
  "server": { "port": 36123, "ambush": true },
  "steps": [
    {
      "id": "panel-inv",
      "scenario": "panels",
      "title": "Mở túi đồ (B), chụp, Esc đóng, kiểm đóng thật",
      "viewport": "360x640",
      "input": "keyboard",
      "shots": ["shots/panel-inv-360x640.jpg"],
      "ok": true,
      "metrics": { "fps": { "min": 52, "avg": 58 }, "player": [ { "t": 0, "x": 100, "y": 200 } ] },
      "consoleErrors": [],
      "networkErrors": [],
      "findings": []
    }
  ],
  "summary": { "steps": 1, "failed": 0, "consoleErrors": 0, "findings": 0 }
}
```

### Các trường (không đổi tên)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `schema` | string | Phải đúng `MANIFEST_SCHEMA`. |
| `commit` | string | SHA ≥ 7 ký tự của `main`. |
| `startedAt` / `finishedAt` | string | ISO date. |
| `server.port` | number | Cổng server thử (KHÔNG phải 2567). |
| `server.ambush` | boolean | Có bật cờ chặn đường cho bước gặp chặn đường không. |
| `steps[]` | object[] | Mỗi bước một đối tượng (dưới). |
| `summary` | object | **CỘT TRÙNG** — đếm phải khớp thật (xem dưới). |

### `steps[]` — một bước

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | id ngắn ổn định của bước (vd `panel-inv`). |
| `scenario` | string | Nhóm kịch bản (`enter` / `move` / `panels` / `dialogs` / `combat` / `travel` / `boss`). |
| `title` | string | Tiêu đề tiếng Việt. |
| `viewport` | string | Nhãn khung (thuộc `DEFAULT_VIEWPORTS`). |
| `input` | string | `keyboard` (mặc định) hoặc `touch` (lượt cảm ứng giả lập). |
| `shots[]` | string[] | Đường dẫn tương đối (so với `--out`) tới ảnh chụp. |
| `ok` | boolean | Bước có đạt các khẳng định của nó không (không finding, không lỗi I/O). |
| `metrics.fps.min` / `metrics.fps.avg` | number | FPS min / trung bình (từ `requestAnimationFrame`). |
| `metrics.player[]` | object[] | Mẫu vị trí nhân vật `{ t, x, y }` (t = ms từ đầu bước; từ client prediction `predX/predY`). |
| `consoleErrors[]` | string[] | Lỗi console / exception ghi trong bước. |
| `networkErrors[]` | string[] | Lỗi mạng (failed fetch / WebSocket close bất thường). |
| `findings[]` | object[] | Kết luận tự động (dưới). |

### `findings[]` — kết luận tự động

| `kind` | Ý nghĩa |
|---|---|
| `stall` | Khung đóng băng: FPS rAF bất thường cao (≥ 900 → `1000/dt` với dt ~0). |
| `drift` | Pred trôi > 1,5 px trong 300 ms sau khi nhả MỌI phím hướng. |
| `stuck` | Nhân vật đứng im khi đáng lẽ phải chuyển (khung hành động không tạo chuyển động). |
| `closed-fail` | Bảng vẫn còn thấy thật sau lệnh đóng (Esc / phím). |
| `timeout` | Bước lỗi / hết thời gian chờ. |

Mỗi finding có `detail` (chuỗi mô tả: số đo, ngưỡng, nhãn bước).

### `summary` — CỘT TRÙNG (validateManifest bắt)

`summary.steps` === số bước thật; `summary.failed` === số bước `ok:false`; `summary.consoleErrors` ===
tổng consoleErrors; `summary.findings` === tổng findings. **Đếm sai là lỗi hợp đồng** (coordinator tin
summary) — `validateManifest` ném. Test `manifest.test.ts` có ca cho từng trường đếm sai.

---

## 6. Cách thêm một kịch bản

Thêm một phần tử vào mảng `STEPS` trong `server/scripts/ai-playtest/play.ts`:

```ts
{
  id: "combat-jkl",          // id ngắn ổn định (dùng trong manifest + tên ảnh)
  scenario: "combat",        // nhóm (để coordinator / người đọc nhóm được)
  title: "Đánh quái bằng J K L",
  input: "keyboard",
  viewports: ["412x915", "1366x768"],   // khung mặc định của bước
  action: async (tab) => {
    const findings = [];
    await tab.press(KEY.j);              // phím thật qua CDP (phím mới thì thêm vào OBJECT KEY)
    await tab.waitFrames(3);             // đợi Phaser vẽ khung
    // …lấy mẫu / chụp / phát hiện finding…
    return findings;                     // Finding[] (drift / stall / closed-fail / stuck / timeout)
  },
}
```

- `action(tab)` chạy trong lúc `sampleMetrics` lấy mẫu FPS + vị trí; trả về các finding tự phát hiện.
- `tab` (`PlayTab`) cung cấp: `press` / `hold` (phím thật), `waitFor` (chờ theo điều kiện, KHÔNG
  `sleep` cố định), `waitFrames(n)` (đợi Phaser vẽ n khung), `ev(expr)` (Runtime.evaluate), `shot(...)`.
- **Số đo + finding:** FPS từ rAF (`INJECT_FPS` → `window.__ptFps`); vị trí từ `window.__scene.predX/predY`
  (client prediction). Bộ phát hiện finding là các hàm **thuần** trong `detect.ts`
  (`driftFinding` / `stallFinding` / `closedFailFinding` / `ioErrorsBlockOk`) — tách khỏi I/O để test đột biến.
- Mỗi bước mới có finding-detector thì **viết test + đột biến chứng minh** (mục 7) trước khi mở PR.

---

## 7. Đột biến chứng minh (Dev F bắt buộc)

Mỗi detector / validator PHẢI có test chứng minh nó **đỏ khi mã sai** (commit mã thật TRƯỚC, mutate
KHÔNG commit rồi `git checkout --` khôi phục). Đã chứng minh cho #1194:

| Bộ | Đột biến | Ca đỏ | Bắt được |
|---|---|---|---|
| `driftFinding` (`detect.ts`) | `dist > threshold` → `> threshold*10` | 2 | bỏ sót trôi |
| `stallFinding` (`detect.ts`) | `fpsMin >= threshold` → `> threshold` | 1 | lỗi biên `>=`/`>` |
| `closedFailFinding` (`detect.ts`) | `if (stillOpen)` → `if (!stillOpen)` | 2 | đảo điều kiện |
| `ioErrorsBlockOk` (`detect.ts`) | `> 0` → `> 1` | 3 | bỏ sót 1 lỗi |
| `validateManifest` (`manifest.ts`) | bỏ kiểm `summary.steps !== steps.length` | 1 | summary đếm sai |

Bốn đột biến **bắt buộc** của mục 60.1 (gieo lỗi thật rồi chạy harness) — drift / stall / closed-fail /
console-error — được chứng minh gián tiếp qua các detector thuần trên (mỗi detector là "răng" bắt đúng
lỗi đó); chạy thật trên Chrome để xác nhận đầu cuối để lại cho lượt bổ sung kịch bản đầy đủ.

---

## 8. Dương tính giả F giữ (mục 60.3)

Danh sách các báo động **không phải lỗi thật** mà bộ chạy có thể phát ra, ghi lại để bước AI chấm ảnh
không tính là lỗi:

- **FPS min = 0** khi bước quá ngắn / chưa kịp chạy rAF → `metrics.fps.min` kẹp về 0 ("không đo được",
  KHÔNG phải stall); `stallFinding` chỉ báo khi `fpsMin >= 900`.
- **`console WARN` "onMessage() not registered"** lúc vào phòng (colyseus.js) — đã gom vào
  `consoleErrors` như lỗi同步 thật (KHÔNG bỏ như e2e thường lệ); nếu sau này xác định là tiếng ồn thì tách
  ra khỏi `ioErrorsBlockOk`.
- **Camera lệch ~3,9 s đầu** khi vào game (B xác nhận) → bước `enter-game` `waitFrames(3)` đợi camera ổn
  trước khi chụp; ảnh những bước sau KHÔNG bị lệch.
- **`data-input` ở seed:** `Page.addScriptToEvaluateOnNewDocument` chạy khi `documentElement` còn null
  → KHÔNG đụng DOM tại thời điểm gieo; client tự đặt `data-input="mouse"` trong headless (khớp e2e-ban-phim).
