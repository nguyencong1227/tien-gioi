# Từ điển Tiên Giới

> Nguồn chung máy đọc được về thuật ngữ, địa danh và tên chính của Tiên Giới, làm
> chuẩn nhất quán cho mọi người viết nội dung (nhiệm vụ / NPC / hội thoại / vật
> phẩm / chiêu thức...) và cho công cụ kiểm (`npm run check:content`, do Dev F xây,
> mục 61.2). Dữ liệu gốc là hợp đồng `shared/src/glossary.ts` (`GLOSSARY` +
> `glossaryViolations`) — **bảng dưới đây sinh từ đó, viết tay khớp**; thêm thuật
> ngữ thì thêm dòng trong `glossary.ts` rồi cập nhật bảng này. Issue #1198.

## Cách đọc bảng

- **Thuật ngữ chuẩn**: cách viết ĐÚNG (đúng hoa / thường) — luôn dùng cái này.
- **Biến thể sai**: cách viết hay nhầm bị công cụ bắt (thiếu dấu, sai hoa / thường).
  Công cụ khớp **từ** (ranh giới chữ hai bên), **không phân biệt dấu thanh** (nên
  "Truc Co" thiếu dấu vẫn bị bắt) **nhưng phân biệt hoa / thường** (nên "Trúc Cơ"
  đúng KHÔNG bị báo, còn "trúc cơ" viết thường thì báo).
- **Ghi chú**: lưu ý dễ lẫn (vd "Đại Thừa" — "Thừa" KHÔNG phải "Thăng").
- Hệ (Mộc / Thủy / ...) hiện chỉ phủ biến thể **thiếu dấu**; hoa / thường của mọi
  hệ để Dev G chốt ở #1199. Hỏa / Thổ / Băng / Âm / Lôi **chưa đưa vào** vì bóc dấu
  trùng chữ khác đang có (vd "Lôi" ≡ "Lối" con đường) — cần cơ chế khử nhập nhằng
  theo pha / ngữ cảnh mới thêm được.

---

## Thuật ngữ chuẩn

### Cảnh giới (và tầng)

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Phàm Nhân | Pham Nhan, pham nhan | |
| Luyện Khí | Luyen Khi, luyen khi | |
| Trúc Cơ | Truc Co, truc co | |
| Kim Đan | Kim Dan, kim dan | |
| Nguyên Anh | Nguyen Anh, nguyen anh | |
| Hóa Thần | Hoa Than, hoa than | |
| Luyện Hư | Luyen Hu, luyen hu | |
| Hợp Thể | Hop The, hop the | |
| Đại Thừa | Dai Thua, dai thua | "Thừa" KHÔNG phải "Thăng". |
| Độ Kiếp | Do Kiep, do kiep | |

### Hệ (ngũ hành mở rộng)

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Mộc | Moc | |
| Thủy | Thuy | |
| Vô sắc | Vo sac | Hệ id `none` (không khắc / không bị khắc); KHÔNG phải chữ "vô sắc" thường. |

> Hỏa / Thổ / Băng / Âm / Lôi chưa đưa vào (xem phần "Cách đọc bảng"). Kim / Phong
> không dấu nên không có biến thể thiếu dấu.

### Phẩm cấp

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Phàm phẩm | Pham pham | |
| Linh phẩm | Linh pham | |
| Bảo phẩm | Bao pham | |
| Tiên phẩm | Tien pham | |
| Thần phẩm | Than pham | |

### Tiền tệ

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Linh thạch | linh thạch, Linh Thạch, LINH THẠCH | Chỉ chữ cái đầu "L" hoa, "thạch" thường. Viết thường hết / hoa cả hai / in hoa hết đều sai. |

### Khái niệm

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Hoàng Tuyền | Hoang Thuyen, hoang thuyen | Chết thật (mất kiếp), KHÔNG viết "Hoànguyền". |
| Tam Sinh Thạch | Tam Sinh Thach, tam sinh thach | Bảng mở khóa lợi ích vĩnh viễn của luân hồi. |
| chân linh | chan linh | Linh hồn đầu thai qua kiếp; viết thường, KHÔNG thiếu dấu. (Chưa thêm "Duyên": "cơ duyên" dễ báo oan — để khi có cơ chế khử nhập nhằng.) |

---

## Địa danh

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Lạc Hà Trấn | Lac Ha Tran, lac ha tran | Trấn trung tâm, bản đồ mặc định. |
| Hắc Phong Cốc | Hack Phong Coc, hack phong coc | |
| Âm Sương Trạch | Am Suong Trach, am suong trach | |
| Hàn Vân Lĩnh | Han Van Linh, han van linh | |

---

## Tên chính

Tên trùm (boss-level, có chữ "Vương") — hiện chỉ phủ các trùm chính; quái thường và
NPC để bổ sung sau.

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Thiên Hàn Vương | Thien Han Vuong, thien han vuong | Trùm Nguyên Anh, rơi Thiên Hàn châu. |
| Linh Hư Yêu Vương | Linh Hu Yeu Vuong, linh hu yeu vuong | Trùm bí cảnh Linh Hư. |
| Phân Thân Yêu Vương | Phan Than Yeu Vuong, phan than yeu vuong | |

---

## Quy ước đặt tên

<!-- do Dev G viết, issue #1199 — để trống -->

## Văn phong

<!-- do Dev G viết, issue #1199 — để trống -->

## Từ cấm

<!-- do Dev G viết, issue #1199 — để trống -->
