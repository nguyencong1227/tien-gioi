# Nguồn nội dung, hình ảnh và âm thanh lấy từ bên ngoài

> Tài liệu này ghi MỌI thứ trong repo mà không do dự án Tiên Giới tự làm ra (ngoài các tài sản CC0 / CC-BY đã ghi ở `CREDITS.md`). Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục **19, 20** (14/11/2026). Kế hoạch dùng: `docs/PHAN_CONG_M7.md` mục 4.

## 1. Vạn Kiếp Tu Tiên

**Nguồn:** trò chơi "Vạn Kiếp Tu Tiên", tác giả **Hải Quân · Bắc Team** (theo `NOTES.md` của bản sao lưu trên máy, ngày sao lưu 06-08/11/2026: `~/TT/van-kiep-tu-tien-clone`, chỉ đọc, không nằm trong repo).

**Sự cho phép:** người phát triển Vạn Kiếp Tu Tiên **đã cho phép dùng nội dung, hình ảnh và âm thanh**, theo xác nhận của người dùng ngày **14/11/2026** (`QUYET_DINH_M3.md` mục 19 và 20). Minh chứng sự cho phép do người dùng giữ, không nằm trong repo. Bản sao lưu ghi "không có LICENSE, mặc định bảo lưu mọi quyền", nên mọi việc dùng ở đây dựa vào sự cho phép nói trên và KHÔNG mở rộng ra ngoài nó.

**Phạm vi được phép (theo mục 19, 20):**
- Nội dung chữ và dữ liệu (tên, mô tả, chỉ số làm điểm khởi đầu) của công pháp / kinh văn / chiêu thức, vật phẩm, trang bị, pháp bảo, nguyên liệu, nghề, cảnh giới, sự kiện: dùng **nguyên văn**, chỉnh số cho cân bằng của Tiên Giới.
- Hình ảnh và âm thanh: dùng **khi phù hợp** (hợp phong cách và kích thước, không còn chữ Hán trên hình, giữ ngân sách hiệu năng, chỉ lấy từ bản sao lưu trên máy, không tải thêm từ Internet).

**Không thuộc phạm vi:** nhân vật, cốt truyện, quốc gia, tông phái riêng của game đó làm nhân vật / địa danh của Tiên Giới (thế giới của Tiên Giới giữ nguyên); mã nguồn (không có công khai); bản tiếng Trung (`content-zh-*.json`, vi phạm quy tắc không chữ Hán).

**Lời ghi công trong game** (màn Giới thiệu / Cài đặt; B làm ở M7): "Một phần nội dung, hình ảnh và âm thanh trong Tiên Giới lấy từ Vạn Kiếp Tu Tiên (tác giả Hải Quân · Bắc Team), dùng với sự cho phép của tác giả."

## 2. Cách ghi bảng nguồn

Mỗi PR có nội dung / hình / âm lấy từ nguồn thêm dòng vào bảng dưới (đúng một dòng cho mỗi tệp hình / âm; dữ liệu ghi theo cụm). Cột:
- **Loại:** `hinh_anh` / `am_thanh` / `du_lieu` / `cong_phap` / `trang_bi`.
- **Nguồn:** đường dẫn trong bản sao lưu (hình / âm: `site/img/...`, `site/audio/...`; dữ liệu: khoá trong `site/assets/content-ClG6Ha-i.json`, ví dụ `/content/items/cong_phap/he_hoa.yaml` + `id`).
- **Trong repo:** tệp / mục tương ứng (ví dụ `client/public/assets/...`, `shared/src/skills.ts` id `...`).
- **Ngày**, **PR:** ngày thêm và số PR tương ứng.
- **Đã duyệt chữ Hán:** BẮT BUỘC cho mọi tệp hình ảnh. Giá trị: `KHONG_CHU` (ảnh không chứa chữ), `DA_XOA_CHU_HAN` (đã xóa/sửa chữ Hán thành chữ Việt), hoặc `KHONG_AP_DUNG` (với âm thanh/dữ liệu).
- **Đã chỉnh gì:** cắt / đổi cỡ / đổi màu / xoá chữ Hán / nén; với dữ liệu: các số đã đổi (sát thương, hồi chiêu, giá, tỉ lệ rơi) và lý do (số liệu mô phỏng ở `CAN_BANG.md`).
- Thang phẩm cấp: nguồn có phẩm cấp 1-8, Tiên Giới có `Rarity` 0-4: bảng ánh xạ ghi ở mục 3 khi có bản đầu tiên.

## 3. Bảng nguồn

| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| _(chưa có tệp nào được lấy vào repo; bảng này được điền cùng PR nội dung đầu tiên)_ | | | | | | |

## 4. Kiểm tự động (làm cùng PR đầu tiên có hình / âm từ nguồn)

- `client/src/credits.test.ts` / `check-credits`: mỗi hình / âm lấy từ nguồn phải có dòng trong bảng mục 3 và `CREDITS.md`; số tệp khớp thật.
- Kiểm CJK (`no-cjk`): mở rộng sang ảnh (đọc chữ trên ảnh bằng bước duyệt bằng mắt có ghi lại ở cột "Đã duyệt chữ Hán", hoặc loại ảnh có chữ), kiểm CJK trong CI vẫn xanh.
- `check-perf-budget`: mỗi gói theo ngân sách mục 21 của `QUYET_DINH_M3.md` (xem `docs/PHAN_CONG_M7.md` mục 1, M7.15).
