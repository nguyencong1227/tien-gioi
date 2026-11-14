# Phân công M6: NỘI DUNG + CÂN BẰNG (người dùng chốt 13/11/2026)

> Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục 10. Dựa trên trạng thái `main` `a3984b4` (sau M5) và số liệu `docs/CAN_BANG.md`. Mọi con số trong tài liệu này là **đề xuất của Dev A**; số cuối cùng do mô hình cân bằng (#402, #406) quyết và ghi vào `docs/CAN_BANG.md`.

## 1. Quyết định đã chốt và ràng buộc
| Điều | Quyết định |
|---|---|
| Hướng | M6 = **bản đồ thứ ba** + **quái / vật phẩm / trang bị / nhiệm vụ cho cảnh giới cao hơn** + **chỉnh `CAN_BANG.md` theo số đo thật** (mô phỏng / bot) |
| Đồ hoạ nội dung mới | **A + B** (quái, bản đồ, hiệu ứng). C **không** làm đồ hoạ |
| C | nghỉ hạn mức tới ~16/11; nhận bot / mô phỏng cân bằng / thử tải / đo hiệu năng bản đồ mới khi quay lại |
| Phát hành | **`v0.1.1` = M5 đã lên bản chạy thật** (13/11/2026 ~10:15, người dùng đồng ý, `QUYET_DINH_M3.md` mục 11; `main` lúc gắn thẻ không có code M6, `PROTOCOL_VERSION` giữ 1). Code M6 chỉ merge SAU thẻ đó. **Phát hành bản có nội dung M6 lên bản chạy thật cần người dùng đồng ý riêng** (không tự gắn thẻ / `prod.sh up`) |
| Giữ nguyên | Ràng buộc M5 (Android tầm trung ≥ 50 FPS, ngân sách CI, tài sản tự vẽ bằng mã hoặc giấy phép rõ ràng), luật luân hồi / bí cảnh / PK đã chốt, "server quyết định mọi kết quả" |
| Dùng được trên mọi thiết bị | Nội dung mới đi qua bố cục M5 (điện thoại dọc / ngang, máy tính bảng, máy tính): mục bấm ≥ 44 px, không tràn chữ |

## 2. Hiện trạng (đã đọc mã, số lấy từ `shared/` thật)
- **Cảnh giới**: `REALMS` có 10 cảnh giới nhưng nội dung dừng ở **Trúc Cơ**. Quái cao nhất ngoài hoang là Xích Mãng cấp 12 (bậc cuối Trúc Cơ); trùm bí cảnh cấp 14. Không có quái, đồ, nhiệm vụ nào cho bậc 13+.
- **Thanh tu vi** (`expToNext`): từ Kim Đan nhân ×6 mỗi cảnh giới (`REALM_EXP_MULT_AFTER`): Kim Đan sơ / trung / hậu kỳ = 26400 / 30360 / 34914, tổng **91674 = 6,0×** Trúc Cơ (15279). Hiện Luyện Khí ~53 phút, Trúc Cơ ~2 giờ 2 phút (`CAN_BANG.md`).
- **Chỉ số** (`statsFor`): bậc 10 (Trúc Cơ sơ kỳ) khí huyết 680 / công 62; bậc 13 (Kim Đan sơ kỳ) 1247 / 112; bậc 15 (Kim Đan hậu kỳ) 1736 / 153.
- **Bản đồ**: 2 (Lạc Hà Trấn 96x96; Hắc Phong Cốc 128x96, đang "tạm dùng quái hiện có", chưa có loài riêng) + bí cảnh Linh Hư. Hai bản đồ nối nhau bằng một cặp cổng (Lạc Hà <-> Hắc Phong).
- **Trang bị**: 3 bộ x 3 ô (Hôi Lang cấp mặc Luyện Khí 1, Hắc Hổ Luyện Khí 7, Xích Mãng Trúc Cơ 1); mỗi bộ cộng ~30% chỉ số gốc ở bậc đầu mặc được.
- **Nhiệm vụ**: 11 nhiệm vụ, chuỗi chính dừng ở `dinh_luyen_khi` (Luyện Khí tầng 9); **chưa có chuỗi Trúc Cơ**.
- **Kinh tế**: `CAN_BANG.md` đã cảnh báo "gần như không có chỗ tiêu Linh thạch" từ Luyện Khí hậu kỳ; trang bị chỉ rèn bằng nguyên liệu, không tốn tiền.
- **Hai điểm A thấy trong mã nhưng CHƯA đo** (đo ở #402): (a) Tụ Khí Đan cộng 5% `expMax` mỗi viên, hồi chiêu 60 giây: ở Kim Đan = 1320 tu vi / viên, mà Xích Mãng vẫn cho 900 tu vi + rơi 60% x 1-2 viên (`KILL_EXP_FREE_GAP` chỉ trừ từ bậc 17); (b) bí cảnh Linh Hư `minStep` 9 không có trần bậc.
- **Đồ hoạ**: `gen-assets.mjs` sinh atlas cho đúng 4 loài quái cũ + 4 NPC đầu; `yeu_vuong` (trùm bí cảnh), `lai_buon`, `thu_mon` đang dùng ảnh dự phòng.

## 3. Phạm vi M6
**Trong phạm vi:** cảnh giới **Kim Đan** trọn vẹn (bậc 13-15) + lấp khoảng trống **chuỗi nhiệm vụ Trúc Cơ**; bản đồ **Âm Sương Trạch**; 4 loài quái; nguyên liệu, 9 trang bị, đan cấp 2; công thức rèn có phí Linh thạch; 3 NPC; ~9 nhiệm vụ chính + nhiệm vụ lặp; đồ hoạ + hiệu ứng + giao diện cho tất cả; cân bằng lại; đo bằng bot.

**Ngoài phạm vi (đề xuất M7 hoặc hỏi người dùng):** Nguyên Anh trở lên (thanh tu vi 288000 sau khi Kim Đan là 48000, chưa có số đo nào); bí cảnh thứ hai; loại bước nhiệm vụ mới; AI quái tầm xa / kỹ năng quái; chợ / đấu giá người chơi; iOS; mọi việc phát hành.

**Lý do chỉ Kim Đan:** mỗi cảnh giới thêm vào cần cả bản đồ + quái + đồ + cân bằng + đồ hoạ; làm cho Kim Đan thật đúng (và có số đo thật) tốt hơn trải mỏng nhiều cảnh giới chưa kiểm. Nguyên Anh để M7 dựa trên số đo của M6.

## 4. Mục tiêu cân bằng (đề xuất, chốt ở #402)
| Chỉ tiêu | Mục tiêu | Cơ sở |
|---|---|---|
| Nhịp Kim Đan (solo, kể cả chuỗi nhiệm vụ) | **~5-7 giờ** cho cả cảnh giới | thanh tổng 6× Trúc Cơ; hiện cảnh giới sau lâu hơn cảnh giới trước (53 phút -> ~2 giờ) |
| Không có đường tắt | tu vi / giờ của bất kỳ bãi nào ≤ ~1,5× bãi Kim Đan "đúng bậc"; Linh thạch / giờ không lệch quá ~2× | tiêu chí đã dùng ở `CAN_BANG.md` (Thỏ / Sói) |
| Trang bị | mỗi bộ cộng ~30% chỉ số gốc ở bậc đầu mặc được (đo từ ba bộ hiện có); ba bộ tăng đều | `items.ts` |
| Trùm `hac_giao` | đội 3-4 người hạ được, không ai chết ở ca mô phỏng khó (như bí cảnh); một người không hạ nổi | mục tiêu bí cảnh `CAN_BANG.md`. **Đo bằng mã server thật (`CAN_BANG.md` mục 9): đội 3-4 đạt; "một người không hạ nổi" KHÔNG đạt** (đan hồi 7% khí huyết / giây > sát thương trùm 4-6% / giây nên một người hạ được ở mọi bậc nếu đủ đan; đội chỉ ít đan hơn ~7 lần): câu hỏi cho người dùng, `questions.md` câu 3 |
| Luân hồi | Duyên / giờ mọi mốc trong 1,3×; tăng qua kiếp ≤ ~2,0× kiếp 1 | mục tiêu cũ `THIET_KE_LUAN_HOI.md` mục 5 |
| Kinh tế | có chỗ tiêu tương xứng thu nhập (phí rèn, đan cấp 2); không dư hàng vạn Linh thạch không chỗ tiêu | cảnh báo `CAN_BANG.md` |
| Hiệu năng | tổng `monsterCap` bản đồ mới ≤ ~70 (Hắc Phong 62), tick < 10 ms, byte/tick trong ngân sách; Android tầm trung ≥ 50 FPS ở cả ba bậc chất lượng | `perf.test.ts`, `perf-budget.json` |
| Mô hình vs thật | lệch giữa mô hình và bot ≤ ~25% | công cụ của C (#410) |

## 5. Nội dung đề xuất
Tên là gợi ý (thế giới, địa danh, nhân vật phải là của Tiên Giới: không dùng tên / hình / chữ của game khác).

**Bản đồ `am_suong` "Âm Sương Trạch"** (đầm lầy sương), trạm an toàn "Vọng Sương Trạm" sát cổng nam; cặp cổng `hac_phong_bac` <-> `am_suong_nam` (chuỗi Lạc Hà <-> Hắc Phong <-> Âm Sương). ~128x112 ô, `monsterCap` tổng ≤ ~70.

| Quái | Cấp | Vai trò |
|---|---:|---|
| Sương Hồ (`suong_ho`) | 13 | nhanh, tầm phát hiện rộng, máu vừa |
| Thạch Quy (`thach_quy`) | 14 | chậm, máu rất cao, công thấp |
| Độc Thiềm (`doc_thiem`) | 15 | công cao, máu thấp: lợi nhuận cao, rủi ro cao |
| Hắc Giao (`hac_giao`) | 18 (trùm) | bãi của đội 3-4 người; rơi nguyên liệu bộ III |

Cùng cơ chế cận chiến hiện có, **không thêm AI mới**: mỗi loài khác nhau ở chỉ số (máu, công, tốc độ, tầm phát hiện, hồi chiêu).

**Vật phẩm:** 4 nguyên liệu (mỗi loài một thứ); 9 trang bị = 3 bộ (I Kim Đan sơ kỳ, II trung kỳ, III hậu kỳ độ hiếm cao nhất) x (kiếm / bào / phù); đan cấp 2 (hồi huyết / hồi linh, dùng hiệu ứng có sẵn). **Rèn có phí Linh thạch** (`RecipeDef.coin`, trường tuỳ chọn) là chỗ xả tiền, đồng thời là cơ chế mới duy nhất của M6.

**NPC (Vọng Sương Trạm):** trạm trưởng (nhiệm vụ), lái buôn (đan cấp 2), thợ rèn thứ hai (rèn bộ Kim Đan tại chỗ).

**Nhiệm vụ:** dùng đúng bốn loại bước có sẵn (kill / collect / talk / reachRealm). Chuỗi Trúc Cơ ~3 nhiệm vụ nối Lạc Hà -> Hắc Phong; chuỗi Kim Đan ~6 nhiệm vụ chính + 2-3 nhiệm vụ lặp.

**Phiên bản giao thức:** `PROTOCOL_VERSION` 1 -> 2 trong PR hợp đồng #404 (client cũ không biết bản đồ / loài quái mới). Không đổi `MIN_PROTOCOL_VERSION`; nâng nó trên bản chạy thật là quyết định lúc phát hành, ngoài M6.

## 6. Chia việc (đã tạo issue, milestone "M6: Nội dung + cân bằng")
| Mã | Việc | Ai | Issue | Phụ thuộc | Trạng thái (13/11/2026) |
|---|---|---|---|---|---|
| M6.1 | Mô hình cân bằng tới Kim Đan + đo "trước" + kiểm hai đường tắt + chốt mục tiêu | A | #402 | không | **Xong** (#416) |
| M6.2 | Hợp đồng nội dung 1 (`shared/`): quái, vật phẩm, trang bị, công thức (`coin`), rơi, giá | A (B review) | #403 | #402 | **Xong** (#425) |
| M6.3 | Hợp đồng nội dung 2 (`shared/`): bản đồ + cổng + NPC + nhiệm vụ + `PROTOCOL_VERSION` 2 | A (B review) | #404 | song song #403 | **Xong** (#426; `mang_hoan` thành việc phụ để người chơi một mình tới được Kim Đan) |
| M6.4 | Server: rèn có phí, nhiệm vụ, ba bản đồ, trùm mới, test + đột biến | A | #405 | #403, #404 | **Xong** (#427 rèn có phí, #428 trần bậc bí cảnh, #429 / #433 / #435 test ba bản đồ + rèn thật; red-team 2744/2744 sạch) |
| M6.5 | Cân bằng sau nội dung, viết lại `CAN_BANG.md` | A | #406 | #405 (+ số đo #410) | **Gần xong**: nhịp / trùm / luân hồi / tổ đội / kinh tế / trang bị / PK (#425, #436, #437, #439, #440, #442 thu nhập trước Kim Đan + test buộc `CAN_BANG.md` khớp bản sinh) và đối chiếu mô hình với MÃ SERVER THẬT (#446, `CAN_BANG.md` mục 9: thời gian hạ quái lệch <= 8 %; mục tiêu "một người không hạ nổi" Hắc Giao KHÔNG đạt, câu hỏi cho người dùng ở `questions.md`). Còn đối chiếu số đo thật của C (#410: thời gian tìm quái, mật độ quái, người chơi thật) |
| M6.6 | Đồ hoạ nội dung: quái + hoạt ảnh, biểu tượng đồ, NPC, atlas | A | #407 | #403 | **Xong** (#431) |
| M6.7 | Bản đồ thứ ba thị giác: `map-style`, chuyển cảnh, cổng, đo harness | B | #408 | bắt đầu ngay; merge sau #404 | **Xong** (`MAP_STYLES.am_suong` #414, chỉ đường nhiệm vụ qua cổng #430, nút Qua cổng không bị che #438, E2E ba bản đồ #444, ô chặn đọc ra được ở mọi bậc #447, đo `perf:mobile` + `leak:test` + ảnh năm khung #448; FPS Android tầm trung >= 50 CHƯA đo máy thật, thuộc M5.4) |
| M6.8 | Hiệu ứng quái / trùm, bảng rèn có phí, cửa hàng, nhật ký nhiệm vụ trên điện thoại | B | #409 | #403 | **Xong** (chữ hồi sinh theo trấn #424, bảng rèn hiện phí #432 / #434, nhãn nút ngữ cảnh #443, nhật ký nhiệm vụ gọn #449, hiệu ứng trùm / quái Kim Đan #450 + đo #453, kiểm bảng rèn 18 công thức và cửa hàng ở năm khung #451) |
| M6.9 | Bot + đo thật: săn Kim Đan, đội hạ trùm, bench + thử tải 3 bản đồ, soak | C (~16/11) | #410 | #405, #407 | **Một phần:** bench ba bản đồ + soak 30 phút 100 bot xong (A, `docs/LOAD_TEST.md` mục 23: 150 người trên ba bản đồ tick TB 1,5 ms; soak PASS, RSS +1,35 MB, 0 lỗi, `kiem-save` sạch, Hắc Phong 1585 / Âm Sương 790 / Lạc Hà 800 lượt qua cổng). Còn bot săn Kim Đan + đội hạ trùm (C, #474, mục 22): đang sửa số đo thật |
| M6.10 | Kiểm hồi quy: E2E chuyển cảnh liên tiếp, `kiem-save`, perf-gate / leak, tài sản | A + B + C (~16/11) | #411 | #405, #407-#409 | **A xong** (mục 1 + 2 tầng server: #454 toàn vẹn dữ liệu sau mỗi lần qua cổng, rớt mạng, hai tab, tệp lưu cũ). **B xong** (tài sản #456, xác nhận CI xanh, cổng trống cho script kiểm #455, nháp CHANGELOG #457). Còn C: `docs/LOAD_TEST.md` mục "M6", rồi đóng #411 |

**Phát hành:** KHÔNG tự phát hành. Khi #406 / #410 / #411 xong (#408 và #409 đã đóng 13/11), A báo người dùng ở `questions.md` kèm kế hoạch (`MIN_PROTOCOL_VERSION=2` để client v0.1.2 không vào nhầm, nâng 0.2.0, CHANGELOG, thẻ, `prod.sh backup` rồi `up`, APK) và chờ đồng ý.

**Thứ tự gợi ý:** A: #402 -> (#403 và #404 song song, B review) -> #407 và #405 -> #406 (lặp với số đo của C). B: #408 bắt đầu ngay rồi #409 sau #403. C: khi quay lại, #410 rồi #411.

**Quy tắc chung:** đổi `shared/` ở PR riêng và B review; thêm tính năng server thì thêm test; mọi tài sản mới sinh bằng mã (CC0) và ghi `CREDITS.md`; đo trước / sau bằng số (bench, `perf:mobile`, `npm run can-bang -w server`); mỗi PR ghi `Closes #<số>`.

## 7. Rủi ro và câu hỏi cho người dùng (không chặn, mặc định ghi sẵn)
| Câu hỏi | Mặc định A làm |
|---|---|
| Nhịp Kim Đan ~5-7 giờ có hợp không? | theo mục 4 |
| Tên bản đồ "Âm Sương Trạch" / các loài quái | theo mục 5; đổi tên rẻ trước khi #404 vào `main`, đắt sau (id nằm trong tệp lưu) |
| M6 chỉ tới Kim Đan, Nguyên Anh để M7? | đúng |
| Rèn có phí Linh thạch (cơ chế mới nhỏ) làm chỗ xả tiền? | làm |
| Quy tắc chia tu vi tổ đội (cũ, chưa trả lời) | không đổi; M6 chỉ đo lại tới Kim Đan |

**Rủi ro lớn nhất:** số liệu Kim Đan sai làm hỏng nhịp luân hồi (Duyên / giờ tính từ nhịp tu luyện). Giảm thiểu: #402 đo trước, #406 chạy lại mô phỏng luân hồi, #410 đối chiếu bằng bot thật.
