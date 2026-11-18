# Nghiệm thu đợt chiêu thức 1 (mục 51)

> Báo cáo tình trạng (issue #1059, CT14) do Dev A viết ngày 18/11/2026 từ những gì đã trên `main` và các PR đang chờ. Quyết định gốc: `QUYET_DINH_M3.md` mục 51 (đợt 1: tổng >= 48 chiêu, phủ ngũ hành + vô sắc, mọi cảnh giới Luyện Khí -> Nguyên Anh, dạng mới), mục 54 (v0.5.0 đồng ý phát hành khi xong + CI xanh; phần chưa xong để bản sau). Thiết kế: `docs/PHAN_CONG_CHIEU_THUC.md`.

## 0. Cập nhật 18/11/2026 ~08:30 (sau v0.5.0; các mục 1-6 bên dưới là bản chụp lúc 30-37 chiêu)
- **Chỉ tiêu mục 51 đã ĐẠT về lượng: `main` có 48 chiêu học được** (đếm bằng `LEARNABLE_SKILLS`; v0.5.0 đang chạy thật có 30). Thêm so với v0.5.0: CT7 7 chiêu Mộc / Thủy (#1162, E), CT8 lát 1 sáu chiêu Hỏa / Băng / Âm / Lôi / Phong (#1163), CT8 lát 2 năm chiêu Nguyên Anh (#1168). Phân bố hệ: Thổ 8, Kim 7, Mộc 7, Hỏa 6, Băng 5, Phong 5, Lôi 4, Thủy 3, Âm 3. Cảnh giới: đủ Luyện Khí -> Nguyên Anh.
- **Cơ chế mục 51 nay đều có DỮ LIỆU THẬT dùng:** hình mới (bẫy / đạn bay / vùng / sét lan / tượng / chiêu vận, CT9 lát 1), cặp DẤU + KÍCH (`mark_loi` + `combo`: Thiên La Lôi Cấm + Chưởng Tâm Lôi Bạo, #1168) và `ally` (Bách Thú Khiếu Phong, #1168) kèm test hành vi `skills-ct8-lat2.test.ts` (5 đột biến đều đỏ); `displace` (kéo / đẩy) sắp có chiêu đầu tiên ở #1173.
- **Khoảng trống phủ hệ: VÔ SẮC.** Mục 51 đòi "phủ ngũ hành + vô sắc" nhưng 48 chiêu vừa nêu có **0** chiêu `element: "none"`. **PR #1173 (CT8 lát 3)** thêm 5 chiêu vô sắc (Luyện Khí -> Nguyên Anh) => 53 chiêu; sau khi #1173 vào là phủ đủ.
- **Phát hành:** các chiêu mới CHƯA lên bản thật (mục 54 chỉ cho v0.5.0). Câu hỏi v0.5.1 đã ở `questions.md` (A nghiêng về chờ #1173 rồi phát hành MỘT lần); mặc định KHÔNG phát hành tới khi người dùng đồng ý. Kinh tế: Hắc Hổ giữ 22,24 Linh thạch / con (hai sách Trúc Cơ mới rơi từ trùm Xích Mãng để `balance/dungeon.test.ts` không đỏ), thu nhập các bậc cao hơn nhích nhẹ vì quyển bán được (số chính xác ở `docs/CAN_BANG.md`; câu hỏi kinh tế sách chiêu vẫn mở ở `questions.md`).
- **Việc còn lại cho CT14 (#1059):** (1) #1173 vào main; (2) người dùng chốt phát hành v0.5.1; (3) chạy lại `e2e:chieu-moi` + bench trên bản cắt; (4) B làm kịch bản e2e client cho dấu + combo + `ally` (đã báo ở comment #1168; hiện mới có test đơn vị phía client).

## 1. Kết luận ngắn
- **Engine + giao diện của đợt chiêu XONG và đã trên `main`:** hình mới (sét lan, đạn bay nhiều viên, vùng, bẫy, hào quang, tượng), chiêu vận, kéo / đẩy, combo + dấu hệ, tự tăng sát thương, "suy yếu", đồng đội, phẩm cấp + tầng 1-6 + luyện chiêu. Mọi thứ nằm sau dữ liệu: chiêu nào khai trường mới thì dùng được.
- **Nội dung chưa đủ chỉ tiêu >= 48:** `main` có **30** chiêu (đếm bằng `LEARNABLE_SKILLS`, 18/11 sau #1148: Kim 7, Thổ 8, Băng 4, Hỏa 3, Phong 3, Mộc 2, Thủy 1, Lôi 1, Âm 1); cộng #1139 (7 chiêu Mộc / Thủy) là **37** (xem mục 3). Thiếu ~11 chiêu so với 48, chủ yếu Kim / Thổ lát 2 và CT9 lát sau (D), Hỏa / vô sắc / Phong / Lôi / Băng / Âm (G, CT8), Mộc / Thủy (E).
- **Theo mục 54, phần chưa xong để bản sau:** v0.5.0 cắt với **30-37 chiêu** (gồm 6 chiêu dạng mới đầu tiên, đã trên `main`), không giữ chờ đủ 48.

## 2. Đã làm (PR đã merge)
| Việc | PR |
|---|---|
| Phân công + thiết kế (mục 51) | #1045 |
| CT1a khung dữ liệu; CT1b hình mới + trạng thái (PROTOCOL 6); CT1b-3 tầng theo phẩm + luyện chiêu | #1077, #1084, #1103 |
| CT2 sét lan, combo, Cường Lực, dấu hệ, suy yếu, kéo / đẩy, đồng đội | #1098, #1101 |
| CT3 đạn bay của người chơi (bolt) | #1108, #1121 |
| CT4 vật thể bền (zone / trap / aura / totem) | #1118 |
| CT5 luyện chiêu + chiêu vận (`windupMs`) | #1112, #1130, #1134 |
| CT11 giao diện: sổ chiêu lọc / tìm / xếp (48-80 chiêu), biểu tượng theo phong cách x hệ x phẩm, số liệu hình mới, sét lan + vụ nổ dấu, đạn bay, chiêu vận, vật thể bền, chấm tầng, thanh luyện | #1081, #1082, #1089, #1111, #1113, #1114, #1116, #1117, #1120 |
| CT12 bộ kiểm dữ liệu: MỌI chiêu qua `cast` thật | #1100 (mở rộng cho chiêu tác dụng trễ ở #1148) |
| Test chiêu mới qua máy chủ Colyseus thật | #1122 |
| Nội dung: 6 chiêu Kim + Thổ (CT6 lát 1) | #1142 |
| CT9 lát 1: 6 chiêu GỐC, mỗi chiêu một hình mới (bẫy, đạn bay, vùng, sét lan, tượng, chiêu vận) + mở rộng bộ kiểm cho chiêu tác dụng trễ | #1148 |

## 3. Đang chờ (PR mở)
| Mục | PR | Trạng thái |
|---|---|---|
| CT10: DPS THẬT của mọi chiêu (đo bằng máy chủ) + khung theo vai; chỉnh 5 chiêu yếu | #1149 | chờ LGTM (xếp chồng #1148) |
| CT7: 7 chiêu Mộc + Thủy | #1139 (E) | DIRTY, cần sửa 2 chỗ + ghép main |
| CT6 lát 2 (Kim + Thổ), CT8 (Hỏa + vô sắc + Phong / Lôi / Băng / Âm) | E / G | đang làm, chưa có PR |
Số chiêu: **30** (main, gồm 6 chiêu CT9 lát 1 của #1148 đã merge 18/11) + 7 (#1139) = **37**.

## 4. Chất lượng
- **Bộ kiểm tự động cho MỌI chiêu mới (D / E / G không phải viết test):** `skillViolations` (khung `SKILL_MULT_CAP`), `skill-kit.test.ts` (tốn linh lực, hồi chiêu, fx, trúng đúng hình, trạng thái, tầng + luyện, thiếu linh lực; chiêu trễ chạy thế giới tới khi đáp), `books.test.ts` (nguồn sách, độ hiếm), `skills-dps.test.ts` (#1149: DPS thật trong khung 1,10-1,60 lần chỉ chém), `credits.test.ts` (nguồn Vạn Kiếp / chiêu gốc).
- **Cân bằng (CT10):** bảng DPS thật ở `docs/CAN_BANG.md` mục "DPS thật của mọi chiêu học được" (sau #1149). Phát hiện: công thức chuyển nguồn làm chiêu hồi 5 giây yếu (~1,1 lần chỉ chém); đã chỉnh 5 chiêu, quy trình cho E / G ghi ở `PHAN_CONG_CHIEU_THUC.md` mục 9.
- **Kinh tế:** mỗi đợt kinh quyển rơi làm thu nhập Linh thạch tới hết Kim Đan nhích (+1,5-4 % mỗi 6 chiêu vì sách bán được): cộng dồn CT6 + CT9 lát 1 là +5,6 % so với mốc mục 30 (33.023 -> 34.866). Tỉ lệ rơi đã hạ xuống 0,6-1,2 % quái để gần mốc; nếu thêm ~20 chiêu nữa thì có thể lên +15 %: cần người dùng quyết có chặn không (hạ giá sách ở `books.ts`, một chỗ).
- **Hiệu năng:** bench sau M9 + chiêu (18/11): 100 người 190 byte/tick (mốc 183), crowd 485 (mốc 474), tick 1,16 ms: trong ngân sách. Vật thể bền có trần theo người (4) và theo phòng (60).

## 5. Việc chưa xong / rủi ro
- **Chỉ tiêu 48 chiêu chưa đạt** (30 trên `main`, 37 nếu #1139 vào). Còn CT6 lát 2, CT8, CT9 các lát dùng nguồn Vạn Kiếp.
- `taunt` của tượng chưa nối vào AI quái (#1119): chiêu Hồn Phiên Tượng chưa khai `taunt`, nên không ảnh hưởng.
- CT13 bot đo DPS thật ngoài mô phỏng (C): chưa làm (C không còn chạy); CT10 bằng mô phỏng máy chủ thật thay phần lớn.
- Quái dùng "lang" không phải trùm khi đo; trùm miễn một số trạng thái (choáng) nên chiêu khống chế giá trị thấp hơn ở trùm.
- Giao diện: các hình mới CHƯA từng hiện ở bản thật (chưa chiêu nào dùng trước #1148). B ĐÃ chạy THẬT sáu chiêu mới bằng `npm run e2e:chieu-moi -w server` (#1156: máy chủ thật + Chrome + phím thật L U I O): cả sáu vẽ và tắt đúng (bẫy chưa kích hoạt -> kích hoạt -> nổ `fxEnd pop`, đạn ba viên, vùng 4 s + tượng 6 s tự tắt, sét lan vẽ đủ đoạn, chiêu vận vòng tụ khí tiến dần rồi đòn đáp), không phát hiện lỗi hình ở client; A chạy lại 2 / 2 lần xanh. Còn chưa kiểm bằng mắt: ảnh chụp thật từng hình ở bản chạy thật sau khi phát hành.

## 6. Câu hỏi cho người dùng
1. Cắt v0.5.0 với **30-37 chiêu** (không chờ đủ 48), phần còn lại vào v0.5.x? A nghiêng về cắt: mục 54 đã đồng ý, và 6 chiêu dạng mới là phần người chơi cảm nhận rõ nhất.
2. Kinh tế sách chiêu: chấp nhận thu nhập Linh thạch nhích (+5,6 % hiện tại, có thể +15 % khi đủ 48 chiêu), hay muốn A hạ giá bán sách chiêu cao cấp để thu nhập đứng yên (một thay đổi ở `books.ts`)?
