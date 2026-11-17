# Nghiệm thu M9 — Xã hội (bảng xếp hạng, thành tựu + danh hiệu, trùm thế giới)

> Báo cáo nghiệm thu (issue #1034, M9.15) do Dev A viết ngày 18/11/2026, từ kết quả đã có trên `main`. Quyết định gốc: `QUYET_DINH_M3.md` mục 50 (M9 = Xã hội), mục 54 (v0.5.0 đồng ý phát hành khi xong + CI xanh). Thiết kế: `docs/PHAN_CONG_M9.md`. Hướng dẫn người chơi: `docs/HUONG_DAN_NGUOI_CHOI.md` mục "Xã hội".

## 1. Kết luận ngắn
- **Phần mã (máy chủ + giao diện) XONG và đã trên `main`.** Bảng "Xã hội" đã BẬT mặc định ở client (`?social=0` tắt khẩn).
- **Phần NỘI DUNG chưa đủ để người chơi thấy trọn vẹn:** (a) lịch trùm thế giới còn RỖNG (E, M9.10 #1029) nên tab Sự kiện báo "chưa có sự kiện" và chưa có trùm nào xuất hiện; (b) nội dung thành tựu chỉ mới 4 mẫu trên `main` cho tới khi PR #1146 (54 thành tựu + 32 danh hiệu) vào.
- **Việc cần quyết trước khi cắt v0.5.0:** xem mục 6.

## 2. Đã làm (PR đã merge)
| Việc | PR |
|---|---|
| M9.1 hợp đồng `shared/` (kiểu, bộ đếm, luật kiểm, hàm mẫu) | #1036, #1079 (`ChatOut.titleId`) |
| M9.2 kho + bộ đếm: `SoulStore.all`, `PlayerStore.listProfiles`, thống kê PK theo linh hồn + sổ chống đổi thắng | #1037, #1038 |
| M9.3 dịch vụ bảng xếp hạng (làm mới 5 phút ngoài tick, loại tài khoản thử nghiệm, giới hạn tần suất `boardsGet`) | #1041, #1073 |
| M9.4 trùm thế giới theo giờ: sổ ở `Hub`, báo trước 10 / 5 / 1 phút, sinh trùm, điểm theo LINH HỒN, thưởng một lần mỗi linh hồn (ghi sổ đã nhận TRƯỚC khi trao), nối lại nhận lại trạng thái, phòng đích tạo sẵn | #1132 |
| M9.5 thành tựu + danh hiệu theo linh hồn (`ACHIEVEMENTS=on`, mặc định TẮT), chat mang danh hiệu | #1043, #1086 |
| Bộ đếm nghề + tông môn (`craft:<trạm>`, `sect_level`) | #1144 |
| M9.6-M9.8 giao diện: bảng Xã hội (xếp hạng / thành tựu / sự kiện), banner trùm, sổ thành tựu, đeo danh hiệu, danh hiệu trong chat | #1035, #1039, #1044, #1075, #1090, #1127, #1133, #1135 |
| Bật mặc định bảng Xã hội | #1137 |
| E2E thật + ảnh nghiệm thu | #1145 |

## 3. Bằng chứng kiểm
- **Toàn bộ `npm test`** trên nhánh làm việc của A: 394 tệp / 7319 ca xanh (chạy 18/11/2026 trước khi mở #1146); CI 3/3 xanh ở từng PR. Mọi PR M9 mới có test + đột biến (commit mã thật TRƯỚC khi đột biến) ghi trong mô tả PR.
- **Trùm thế giới (M9.4):** 25 ca đơn vị + 4 ca phòng Colyseus thật (`WorldRoom.world-boss.test.ts`: không lịch / có lịch, báo trước, sinh trùm, bảng đóng góp, hạ trùm -> thưởng + `ended`, nối lại sau rớt mạng, `ensureWorldBossRooms`). Review độc lập (skill `code-review`) tìm 6 điểm, đã sửa kèm test + đột biến. Hiệu năng: 100 người đánh trùm mỗi tick = tick trung bình 0,053 ms; `npm run bench -w server` 100 người 183 byte/tick (đúng mốc).
- **E2E thật qua giao diện (B, `npm run e2e:xa-hoi -w server`, ~1,5-2 phút, chạy tay):** server Colyseus thật + hai tab Chrome: báo trước 1 phút -> banner -> hai người đóng góp (71,4 % / 28,6 %) -> hạ trùm: banner kết quả + toast + thưởng chia theo tỉ lệ (A +123 > B +26, tổng <= 150) -> thành tựu "Hạ Xích Mãng" (chấm Mới) -> đeo "Thợ Săn Trùm" (máy chủ ghi `Player.title`, người khác thấy trên đầu nhân vật) -> BXH Tu vi có hạng -> tab Sự kiện. 0 lỗi console, đột biến đỏ đúng bước. Ảnh: `docs/screenshots/m9-*.webp` (10 ảnh).
- **Cổng giao diện:** cỡ chữ >= 14 px, kéo đóng, tấm chung, "bấm vào bảng không chém" (8 khung nhìn) cho bảng Xã hội + banner trùm (`check-text-size`, `check-sheet-swipe`, `check-social-shell`).
- **Máy chủ không tin client:** `boardsGet` / `worldBossGet` / `achievementsGet` / `titleSet` đăng ký bằng `this.on` có giới hạn tần suất; danh hiệu chỉ đeo được khi đã mở; thành tựu / thưởng / bộ đếm chỉ do máy chủ ghi, MỘT cổng `trackSocial`.

## 4. Còn thiếu / việc chưa xong
| Mục | Trạng thái | Ai |
|---|---|---|
| M9.9 nội dung thành tựu + danh hiệu (>= 40) | PR #1146 chờ LGTM + CI (A viết vì D không còn chạy) | A |
| M9.10 nội dung trùm thế giới: LỊCH `WORLD_BOSS_SCHEDULE` (hiện RỖNG), bảng thưởng chốt bằng mô phỏng (`can-bang`: số người hạ trong 30 phút ở 5 / 20 / 50 người) | CHƯA ai làm | E (G hỗ trợ) |
| M9.11 rà ngôn ngữ (thông báo, tên, mô tả) | PR #964 của G còn hai yêu cầu sửa mở | G |
| M9.12 / M9.13 kiểm thử đối kháng, thành tựu / PK | chưa có PR | F / H |
| M9.14 công cụ + thử tải trùm thế giới (100 người) | chưa có PR | C |
| Điểm HỖ TRỢ (hồi / khiên quy ra đóng góp, trần 30 %) | sổ đã có `credit(..., "support")` nhưng chưa nối; người chỉ hồi máu không đủ ngưỡng nhận thưởng | A (#1023 còn mở) |

## 5. Phát hiện / rủi ro đã biết (không chặn)
- Banner kết quả và toast cùng in câu thưởng (trùng) — B ghi nhận, chưa sửa.
- Tab Sự kiện chỉ đọc lịch từ `shared/`, nên trống cho tới khi E nhập lịch (và máy chủ bật `WORLD_BOSS_SCHEDULE`).
- **Cấp bù khi bật `ACHIEVEMENTS=on`:** người chơi cũ nhận các thành tựu ĐÃ đạt (và Duyên) ở lần vào đầu tiên; với #1146 cỡ 60-100 Duyên một lần cho người đã tới Nguyên Anh / nhiều kiếp. Tổng Duyên của toàn bộ thành tựu 121 (trần 200); muốn hạ thì giảm cột `duyen` ở `shared/src/social.ts`.
- `applySectBuff` chạy cho mọi thành viên trực tuyến khi tông lên cấp (tông 30 người = 30 lượt `SoulStore.update` mỗi lần đổi cấp): hiếm, chấp nhận.
- Thành tựu cho trùm tính cho người ĐÓNG GÓP hạ trùm (cùng cơ chế tính nhiệm vụ), không chỉ người ra đòn cuối.

## 6. Cờ phát hành và câu hỏi cho người dùng
**Cờ máy chủ (`.env.production`)**
| Cờ | Mặc định | Cho v0.5.0 |
|---|---|---|
| `ACHIEVEMENTS` | tắt | **`on`** (sau khi #1146 vào) |
| `LEADERBOARD` | bật | giữ |
| `WORLD_BOSS` | bật (chỉ chạy khi có lịch) | giữ; lịch rỗng thì không có gì xảy ra |
| `AMBUSH` | tắt | giữ TẮT (chặn đường chưa đủ dữ liệu / mô phỏng, mục 53-54) |

**Câu hỏi (A đề xuất, người dùng chốt):**
1. Cắt v0.5.0 **ngay khi #1146 vào** (bảng Xã hội + 54 thành tựu + BXH, tab Sự kiện trống), hay **đợi lịch trùm thế giới (E, M9.10)** để có sự kiện thật? A nghiêng về cắt ngay: xếp hạng và thành tựu đã dùng được, tab Sự kiện trống không gây hại; lịch trùm vào bản sau (không cần đổi mã, chỉ dữ liệu + cờ).
2. Cấp bù Duyên cho người chơi cũ như trên là chấp nhận được, hay muốn hạ / bỏ phần Duyên của thành tựu cấp bù?
