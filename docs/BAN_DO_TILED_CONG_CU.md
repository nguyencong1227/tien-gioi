# Hướng dẫn công cụ dòng lệnh Bản đồ Tiled (S4)

> Tài liệu hướng dẫn sử dụng bộ công cụ dòng lệnh cho bản đồ Tiled theo thiết kế `docs/THIET_KE_BAN_DO_TILED.md` (Issue #1207, mục 62 giai đoạn 2).
> Dành cho Nhà phát triển, Trợ lý AI (Agent không dùng giao diện đồ hoạ Tiled), và Người thiết kế bản đồ.

---

## 1. Tổng quan bộ công cụ

Quy trình quản lý bản đồ của Tiên Giới tuân thủ nguyên tắc **"Một nguồn - Tách lớp logic khỏi lớp hình"**:
1. **Tệp soạn thảo** (`shared/maps/<id>.json`): Chứa đầy đủ các lớp (`logic`, `ground`, `decor`, `over`) và `objects`, mở được bằng phần mềm Tiled (Windows/Linux/macOS).
2. **Bản chạy Logic** (`shared/maps/<id>.logic.json`): Chỉ chứa lớp `logic` + `objects`, phục vụ server và hàm `getMap(id)` đồng bộ ở client.
3. **Bản chạy Hình ảnh** (`client/public/packs/map-<id>/visual.json`): Chứa các lớp `ground`, `decor`, `over` và tileset nhúng đùn mép (extruded), phục vụ client tải theo nhu cầu qua cơ chế Pack.

Bộ công cụ cung cấp 3 lệnh chính:
- `npm run map:check -w server`: Kiểm tra toàn diện tính toàn vẹn, tính liên thông, cổng kết nối và các lớp hình.
- `npm run map:build -w server`: Tự động sinh các lớp hình bo góc từ ma trận logic bằng Wang blob 47 ô.
- `npm run map:show -w server`: Trực quan hoá bản đồ dạng ASCII ra terminal hoặc xuất ảnh PNG xem trước.

---

## 2. Lệnh `map:check`: Kiểm tra tính toàn vẹn bản đồ

Kiểm tra cú pháp JSON, luật cấu trúc Tiled, cấm cờ lật ở lớp logic, kiểm tra kích thước và GID hợp lệ ở các lớp hình, kiểm tra liên thông đường đi cho người chơi và cổng hai chiều giữa các bản đồ.

### Cách dùng:
```bash
# Kiểm tra toàn bộ mọi bản đồ trong shared/maps/
npm run map:check -w server

# Chỉ kiểm tra một bản đồ cụ thể
npm run map:check -w server -- lac_ha
npm run map:check -w server -- am_suong
```

### Các nội dung được kiểm tra:
1. **Cấu trúc Tiled (`tiledViolations`)**: `schema == 1`, `orientation == "orthogonal"`, kích thước hợp lệ, `tilewidth == tileheight == 16`.
2. **Lớp Logic (`logic`)**: Mỗi ô phải là số nguyên thuộc `firstgid..firstgid + 7` (tương ứng enum `T`), tuyệt đối không chứa cờ lật (flip flags).
3. **Lớp Đối tượng (`objects`)**: Đúng 1 điểm `town`, tối đa 1 điểm `lair`, các điểm `portal` có toạ độ và bán kính hợp lệ.
4. **Lớp Hình (`ground`, `decor`, `over`)**: Kích thước khớp bản đồ, GID phải thuộc tileset đã khai báo, cho phép cờ lật để xoay/lật gạch.
5. **Liên thông người chơi (`reachabilityViolations`)**: Người chơi từ tâm trấn đi bộ tới được mọi cổng và hang (không bị cô lập bởi núi/nước/cây).
6. **Cổng hai chiều (`portalLinkViolations`)**: Đi qua cổng A sang bản đồ đích thì cổng đích phải trỏ ngược lại đúng cổng A; không có cổng mồ côi hay trùng ID.
7. **Tính nhất quán**: Tệp soạn `<id>.json` và bản chạy `<id>.logic.json` phải khớp nhau 100% về lớp logic và đối tượng.

---

## 3. Lệnh `map:build`: Sinh lớp hình tự động (Wang blob 47 ô)

Người hoặc Agent chỉ cần vẽ/sửa lớp `logic` (loại ô `T`) và các đối tượng `objects`. Công cụ sẽ tự động tính toán mặt nạ 8 hướng (đã chuẩn hoá `canonicalMask` chống rách mép) và áp dụng bảng Wang blob 47 ô để bo góc mềm mại cho đất, nước, cát, sàn trấn, đồng thời bố trí thân cây ở lớp `decor` và tán cây che đầu ở lớp `over`.

### Cách dùng:
```bash
# Sinh và cập nhật toàn bộ bản đồ
npm run map:build -w server

# Chỉ sinh cho một bản đồ
npm run map:build -w server -- lac_ha

# Kiểm tra tính đồng bộ (CI / pre-commit, không ghi đè đĩa, thoát 1 nếu lệch)
npm run map:build -w server -- --check
```

### Tính chất:
- **Tất định (Idempotent):** Chạy nhiều lần luôn ra kết quả giống hệt từng byte.
- **Bảo toàn lớp logic & objects:** Không ghi đè hay làm thay đổi dữ liệu logic gameplay.
- **Tương thích Tiled thủ công:** Nếu người dùng mở Tiled thêm các lớp trang trí tuỳ chỉnh khác ngoài `ground`/`decor`/`over`, công cụ giữ nguyên các lớp đó.
- **Đùn mép (Extruded tileset):** Tileset nhúng cấu hình `margin: 1`, `spacing: 2` loại bỏ triệt để hiện tượng rách viền (texture bleeding) khi camera phóng to/thu nhỏ trên WebGL.

---

## 4. Lệnh `map:show`: Trực quan hoá bản đồ

Dành cho AI Agent và lập trình viên kiểm tra trực quan bố cục bản đồ mà không cần mở phần mềm đồ hoạ.

### Cách dùng:
```bash
# Xem toàn bộ bản đồ dạng ASCII trên terminal
npm run map:show -w server -- lac_ha

# Xem một vùng cụ thể (cắt khung: x, y, rộng, cao)
npm run map:show -w server -- lac_ha --area 40,40,24,16

# Xuất ảnh PNG xem trước (phối màu theo bảng màu Tu Tiên chuẩn)
npm run map:show -w server -- lac_ha --png docs/art/preview-lac_ha.png
npm run map:show -w server -- lac_ha --area 36,36,30,30 --png docs/art/preview-tran.png
```

### Bảng ký hiệu ASCII:
| Ký hiệu | Loại ô | Ghi chú |
|---|---|---|
| `.` | Cỏ (`Grass`) | Nền cỏ xanh |
| `"` | Cỏ cao (`TallGrass`) | Bụi cỏ rậm |
| `,` | Đất (`Dirt`) | Đường mòn, bãi đất |
| `~` | Nước (`Water`) | Sông, hồ, ao (chặn đường) |
| `T` | Cây (`Tree`) | Thân cây chặn đường, tán phủ lớp over |
| `^` | Đá (`Rock`) | Núi đá, tảng đá (chặn đường) |
| `#` | Sàn trấn (`Stone`) | Gạch lát khu an toàn trong trấn |
| `:` | Cát (`Sand`) | Bờ cát ven nước, bãi cát |
| `[T]` | Trấn (`town`) | Tâm khu an toàn Lạc Hà Trấn |
| `[P]` | Cổng (`portal`) | Vị trí cổng dịch chuyển sang bản đồ khác |
| `[L]` | Hang (`lair`) | Hang trùm / bí cảnh |

---

## 5. Quy trình làm việc chuẩn cho Agent / Người sửa bản đồ

1. **Chỉnh sửa bản đồ:**
   - Mở tệp `shared/maps/<id>.json` trong Tiled hoặc sửa trực tiếp lớp `logic` / `objects`.
2. **Sinh lớp hình bo góc:**
   ```bash
   npm run map:build -w server -- <id>
   ```
3. **Cập nhật manifest gói client:**
   ```bash
   node client/scripts/build-packs.mjs
   ```
4. **Kiểm tra tính toàn vẹn và liên thông:**
   ```bash
   npm run map:check -w server -- <id>
   ```
5. **Xem trước kết quả:**
   ```bash
   npm run map:show -w server -- <id> --area 40,40,25,20
   ```
6. **Chạy kiểm thử toàn diện:**
   ```bash
   npm test
   npm run typecheck
   ```
