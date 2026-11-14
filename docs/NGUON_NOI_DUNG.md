# Nguồn nội dung, hình ảnh và âm thanh lấy từ bên ngoài

> Tài liệu này ghi MỌI thứ trong repo mà không do dự án Tiên Giới tự làm ra (ngoài các tài sản CC0 / CC-BY đã ghi ở `CREDITS.md`). Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục **19, 20** (14/11/2026). Kế hoạch dùng: `docs/PHAN_CONG_M7.md` mục 4.

## 1. Vạn Kiếp Tu Tiên

**Nguồn:** trò chơi "Vạn Kiếp Tu Tiên", tác giả **Hải Quân · Bắc Team** (theo `NOTES.md` của bản sao lưu trên máy, ngày sao lưu 06-08/11/2026: `~/TT/van-kiep-tu-tien-clone`, chỉ đọc, không nằm trong repo).

**Sự cho phép:** người phát triển Vạn Kiếp Tu Tiên **đã cho phép dùng nội dung, hình ảnh và âm thanh**, theo xác nhận của người dùng ngày **14/11/2026** (`QUYET_DINH_M3.md` mục 19 và 20). Minh chứng sự cho phép do người dùng giữ, không nằm trong repo. **Cần ghi (người dùng bổ sung, không dán nội dung riêng tư):** HÌNH THỨC xác nhận (tin nhắn / thư / kênh nào), NGÀY nhận, người xác nhận là ai; và **giữ bản gốc cùng gói phát hành** (nếu bản phát hành lên Google Play bị khiếu nại sở hữu trí tuệ thì cần chứng minh được). Dev A nhắc người dùng ở `questions.md`; mẫu điền ở mục 2b dưới.

### 2b. Mẫu điền (người dùng)
- Hình thức xác nhận: _(chưa điền)_
- Ngày nhận: _(chưa điền)_
- Người xác nhận: _(chưa điền)_
- Nơi giữ bản gốc: _(chưa điền)_ Bản sao lưu ghi "không có LICENSE, mặc định bảo lưu mọi quyền", nên mọi việc dùng ở đây dựa vào sự cho phép nói trên và KHÔNG mở rộng ra ngoài nó.

**Phạm vi được phép (theo mục 19, 20):**
- Nội dung chữ và dữ liệu (tên, mô tả, chỉ số làm điểm khởi đầu) của công pháp / kinh văn / chiêu thức, vật phẩm, trang bị, pháp bảo, nguyên liệu, nghề, cảnh giới, sự kiện: dùng **nguyên văn**, chỉnh số cho cân bằng của Tiên Giới.
- Hình ảnh và âm thanh: dùng **khi phù hợp** (hợp phong cách và kích thước, không còn chữ Hán trên hình, giữ ngân sách hiệu năng, chỉ lấy từ bản sao lưu trên máy, không tải thêm từ Internet).

**Không thuộc phạm vi:** nhân vật, cốt truyện, quốc gia, tông phái riêng của game đó làm nhân vật / địa danh của Tiên Giới (thế giới của Tiên Giới giữ nguyên); mã nguồn (không có công khai); bản tiếng Trung (`content-zh-*.json`, vi phạm quy tắc không chữ Hán).

**Lời ghi công trong game** (màn Giới thiệu / Cài đặt; B làm ở M7): "Một phần nội dung, hình ảnh và âm thanh trong Tiên Giới lấy từ Vạn Kiếp Tu Tiên (tác giả Hải Quân · Bắc Team), dùng với sự cho phép của tác giả."

## 2. Cách ghi bảng nguồn

Mỗi PR có nội dung / hình / âm lấy từ nguồn thêm dòng vào bảng dưới (đúng một dòng cho mỗi tệp hình / âm; dữ liệu ghi theo cụm). Cột:
- **Loại:** một trong các giá trị chuẩn: `hinh_anh | am_thanh | du_lieu | cong_phap | trang_bi | phap_bao | nguyen_lieu | nghe | su_kien`.
- **Nguồn:** đường dẫn trong bản sao lưu (hình / âm: `site/img/...`, `site/audio/...`; dữ liệu: khoá trong `site/assets/content-ClG6Ha-i.json`, ví dụ `/content/items/cong_phap/he_hoa.yaml` + `id`).
- **Trong repo:** tệp / mục tương ứng (ví dụ `client/public/assets/...`, `shared/src/skills.ts` id `...`).
  - **Quy ước vị trí tệp hình ảnh / âm thanh:** Mọi tệp tài sản hình ảnh hoặc âm thanh lấy từ Vạn Kiếp Tu Tiên bắt buộc phải nằm dưới thư mục có đoạn đường dẫn `vktt/` (ví dụ `client/public/assets/vktt/...`, `client/public/audio/vktt/...`). Đoạn `vktt` có thể nằm ở bất kỳ cấp nào trong đường dẫn để linh hoạt theo bố cục gói tải (M7.15). Bộ kiểm tra tự động sẽ quét toàn bộ tệp dưới `client/public/**/vktt/**` và yêu cầu từng tệp phải có đúng một dòng tương ứng trong bảng mục 3.
- **Ngày**, **PR**, **Đã chỉnh gì:** cắt / đổi cỡ / đổi màu / xoá chữ Hán / nén; với dữ liệu: các số đã đổi (sát thương, hồi chiêu, giá, tỉ lệ rơi) và lý do (số liệu mô phỏng ở `CAN_BANG.md`).
- **Đã duyệt chữ Hán:** chốt chặn kiểm soát chữ Hán / CJK trên tài sản:
  - Với tệp `hinh_anh`: CHỈ chấp nhận một trong hai giá trị `KHONG_CHU` (ảnh không chứa chữ nào) hoặc `DA_XOA_CHU_HAN` (ảnh gốc có chữ Hán đã được biên tập / xoá sạch hoàn toàn). Không chấp nhận các giá trị khác (`OK`, `DA_DUYET`, `KHONG_CO_CHU`, `KHONG_AP_DUNG` đều không hợp lệ).
  - Với `am_thanh` và các loại dữ liệu (`du_lieu`, `cong_phap`, `trang_bi`, `phap_bao`, `nguyen_lieu`, `nghe`, `su_kien`): ghi `KHONG_AP_DUNG`.
- Thang phẩm cấp: nguồn có phẩm cấp 1-8, Tiên Giới có `Rarity` 0-4: bảng ánh xạ ghi ở mục 3 khi có bản đầu tiên.

## 3. Bảng nguồn

| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| _(chưa có tệp nào được lấy vào repo; bảng này được điền cùng PR nội dung đầu tiên)_ | | | | | | |

## 4. Kiểm tự động (làm cùng PR đầu tiên có hình / âm từ nguồn)

- `client/src/credits.test.ts` / `check-credits`:
  - Mỗi hình ảnh / âm thanh (`hinh_anh`, `am_thanh`) lấy từ nguồn phải có dòng trong bảng mục 3, có tệp thật trên đĩa, tệp phải nằm dưới đường dẫn chứa `vktt/`, và phải được khai báo trong `CREDITS.md`.
  - Kiểm tra 2 chiều: Mọi tệp thật trong repo nằm dưới `client/public/**/vktt/**` bắt buộc phải có dòng trong bảng mục 3 (chống bỏ sót tệp lấy từ nguồn mà không khai báo).
  - Mọi dòng trong `CREDITS.md` có ghi chú lấy từ "Vạn Kiếp" bắt buộc phải có dòng tương ứng trong bảng mục 3.
  - Các dòng dữ liệu (`cong_phap`, `trang_bi`, `du_lieu`... trong code) không yêu cầu có trong `CREDITS.md` và không kiểm tra file tĩnh trên đĩa.
  - Cột `Đã duyệt chữ Hán` được kiểm tra chặt chẽ theo quy tắc ở mục 2.
- Kiểm CJK (`no-cjk`): kiểm tra CJK trong CI vẫn xanh; quét nội dung text/XML của tệp SVG từ nguồn để đảm bảo không lọt ký tự CJK.
- `check-perf-budget`: mỗi gói theo ngân sách mục 21 của `QUYET_DINH_M3.md` (xem `docs/PHAN_CONG_M7.md` mục 1, M7.15).
