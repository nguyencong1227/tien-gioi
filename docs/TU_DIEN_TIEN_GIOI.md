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
  Công cụ khớp **CHÍNH XÁC** — **từ** (ranh giới chữ hai bên) + **phân biệt dấu
  thanh** + **phân biệt hoa / thường**. Nên: "Trúc Cơ" đúng KHÔNG bị báo, "trúc cơ"
  viết thường thì báo, "Truc Co" thiếu dấu thì báo (vì được **liệt kê tường minh**
  trong `wrong`, KHÔNG phải do bỏ qua dấu). Dạng đủ dấu nhưng khác dấu thanh (vd
  "Móc" so với hệ "Moc") KHÔNG bị báo oan.
- **Ghi chú**: lưu ý dễ lẫn (vd "Đại Thừa" — "Thừa" KHÔNG phải "Thăng").
- Vì khớp CHÍNH XÁC (không bóc dấu) nên KHÔNG nhập nhằng: "Lối" (con đường) ≠ "Lôi"
  (hệ), "Móc" ≠ "Moc" — đây là lý do có thể thêm đủ các hệ còn lại. Hỏa / Thổ / Băng
  / Âm / Lôi **sẽ thêm các lượt sau**: mỗi hệ cần quét chữ hiển thị thật để chắc biến
  thể thiếu dấu của nó KHÔNG bám vào chữ trần hợp lệ đang có (vd wrong "Hoa" của Hỏa
  sẽ bám "Hoa" trong "Băng Hoa Loạn"). Hoa / thường của mọi hệ để Dev G chốt ở #1199.

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

> Hỏa / Thổ / Băng / Âm / Lôi chưa đưa vào — sẽ thêm các lượt sau khi quét chữ hiển
> thị thật (xem phần "Cách đọc bảng": khớp CHÍNH XÁC nên không còn nhập nhằng do bóc
> dấu, nhưng biến thể thiếu dấu vẫn phải tránh bám chữ trần hợp lệ). Kim / Phong
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
| Linh thạch | linh thạch, Linh Thạch, LINH THẠCH, Linh thach, linh thach | Chỉ chữ cái đầu "L" hoa, "thạch" thường. Viết thường hết / hoa cả hai / in hoa hết / thiếu dấu đều sai. |

### Khái niệm

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Hoàng Tuyền | Hoang Tuyen, hoang tuyen | Chết thật (mất kiếp); KHÔNG thiếu dấu ("hoang tuyen") hay dính chữ "Hoànguyền". |
| Tam Sinh Thạch | Tam Sinh Thach, tam sinh thach | Bảng mở khóa lợi ích vĩnh viễn của luân hồi. |
| chân linh | chan linh | Linh hồn đầu thai qua kiếp; viết thường, KHÔNG thiếu dấu. (Chưa thêm "Duyên": "cơ duyên" dễ báo oan — để khi có cơ chế khử nhập nhằng.) |

---

## Địa danh

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Lạc Hà Trấn | Lac Ha Tran, lac ha tran | Trấn trung tâm, bản đồ mặc định. |
| Hắc Phong Cốc | Hac Phong Coc, hac phong coc | |
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

> Khác ba bảng trên (thuật ngữ **chuẩn** cần viết ĐÚNG): đây là danh sách chữ **cấm tuyệt đối**
> trong NỘI DUNG GAME — KHÔNG có dạng viết nào hợp lệ. Máy đọc được ở `shared/src/glossary-banned.ts`
> (`BANNED_TERMS` + `bannedViolations(text)`); bảng dưới viết tay khớp, thêm chữ cấm thì thêm dòng trong
> module đó rồi cập nhật bảng này. Issue #1199.

**Phạm vi áp dụng (quan trọng — tránh dương tính giả):** CHỈ áp cho NỘI DUNG GAME (hội thoại NPC, tên
vật phẩm / chiêu / quái / NPC / trùm, mô tả, lời nhiệm vụ...). **KHÔNG** áp cho chú thích tác quyền,
`CREDITS.md`, `docs/NGUON_NOI_DUNG.md`, hay chính các tệp test (nơi nêu tên cấm để cấm / kiểm chúng —
ví dụ `no-foreign-names.test.ts` và `glossary-banned.test.ts` được loại khỏi bộ quét tên ngoại lai).
Dev F nối `bannedViolations` vào `npm run check:content` (Phần 3 #1200) chỉ quét chữ hiển thị game theo phạm vi này.

### Tên riêng của truyện / game khác (cấm)

> Thế giới Tiên Giới giữ nguyên; KHÔNG mượn nhân vật, tông phái, môn phái, tự viện, quốc gia của game /
> truyện khác làm của Tiên Giới (AGENTS.md "Asset nguồn 3"). Danh sách từ những chỗ đã xác nhận rò rỏ:
> AGENTS.md, `skills-kim-tho.test.ts` (`VKTT_PROPER`), và ví dụ người dùng trong issue #1199.

| Chữ cấm | Lý do |
|---|---|
| Thanh Vân Môn / Thanh Vân Kiếm Tông | tông phái của Vạn Kiếp Tu Tiên |
| Bắc Minh | môn phái của Vạn Kiếp Tu Tiên |
| Huyền Vũ Môn | môn phái của Vạn Kiếp Tu Tiên |
| Kim Đạo Tự | tự viện của Vạn Kiếp Tu Tiên |
| Đan Hà Cốc | cốc (địa danh tông phái) của Vạn Kiếp Tu Tiên |
| Hàn Lập | nhân vật của tiên hiệp khác (Phàm Nhân Tu Tiên) |

> CHƯA phủ hết — gặp rò rỏ mới (tên nhân vật / tông phái truyện khác) thì THÊM dòng vào `BANNED_TERMS`,
> đừng bịa danh sách rộng không có bằng chứng. Matcher KHÔNG phân biệt hoa / thường nên mọi cách viết đều bị bắt.

### Từ hiện đại lạc văn phong (cấm, nhất là trong lời thoại)

| Chữ cấm | Nên dùng thay |
|---|---|
| ok | được / vâng / phải vậy |
| level | cấp / cảnh giới |
| boss | trùm |

> Matcher khớp ranh giới từ nên KHÔNG báo oan chữ hợp lệ chứa chuỗi con (vd "ok" KHÔNG bám "book";
> "minh" riêng lẻ KHÔNG bám "Bắc Minh").

**Chữ Hán / CJK KHÔNG liệt kê ở đây:** đã bị `ngon-ngu.test.ts` (quy tắc a) chặn trên TẤT CẢ chữ hiển thị
game — nối trùng chỉ dư thừa. Bộ từ cấm này chỉ lo tên riêng Latinh + từ hiện đại.
