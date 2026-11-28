# Kịch bản chương 5-6 (Lang Hoang, Uy Vân Kinh)

> Giai đoạn 1 của issue **#1465** [75-E2] (mục 75, `docs/COT_TRUYEN.md` mục 5 và 6.1-6.2): **chỉ tài liệu**, chưa có dòng dữ liệu nào. Dev A viết thay Dev E (Ornith đang tắt, 28/11/2026). Giai đoạn 2 (nhập `quests*.ts`, `npcs.ts`, cửa hàng, test) làm SAU khi D1 (#1466) có quái và vật phẩm Hóa Thần trên `main`; người làm giai đoạn 2 đọc mục 1 (số thật) và mục 6 (việc phải làm) trước.
> Nguồn: chỉ bản sao `~/TT/van-kiep-tu-tien-clone` (tiếng Việt, không `ten_han`). Mọi mẩu lấy từ nguồn ghi khoá ở cột "Nguồn"; khi nhập dữ liệu mỗi mẩu một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3 (`su_kien` cho lore / encounter, `du_lieu` cho nhân vật, như PR #1566).
> **Trạng thái: bản 1, chờ A review lại sau khi D1 chốt tên quái** (các id quái / vật phẩm ở đây là DỰ KIẾN).

## 1. Ràng buộc kỹ thuật (số thật, đo từ mã ngày 28/11/2026)

Hai chương cùng ở **Hóa Thần** (cảnh giới 5), nên **dùng chung một ngân sách thưởng tu vi** (`shared/src/kim-dan-world.test.ts`: sàn 5 % thanh bậc nhận cho mỗi nhiệm vụ chính, 2 % cho mỗi việc phụ; trần 10 % tổng thanh cả cảnh giới cho chuỗi chính, 4 % cho việc phụ; thưởng MỘT lần, không `daily`):

| Cảnh giới 5 (Hóa Thần) | Sơ kỳ (tier 0) | Trung kỳ (tier 1) | Hậu kỳ (tier 2) | Tổng |
| --- | ---: | ---: | ---: | ---: |
| Thanh tu vi `expToNext(5, tier)` | 1.728.000 | 1.987.200 | 2.285.280 | 6.000.480 |
| Sàn nhiệm vụ chính (5 % thanh bậc nhận) | 86.400 | 99.360 | 114.264 | trần chuỗi chính **600.048** |
| Sàn việc phụ (2 % thanh bậc nhận) | 34.560 | 39.744 | 45.706 | trần việc phụ **240.019** |

Hệ quả (quyết định khung của kịch bản, đổi thì phải đổi trần ở test có chủ ý, kèm số đo ở `docs/CAN_BANG.md`):

1. **Tối đa SÁU nhiệm vụ chính cho CẢ HAI chương** (ba mỗi chương). "~10 bước" của `COT_TRUYEN.md` phải hiểu là ~10 **nhịp truyện** nhồi vào các **bước** (`steps`) của sáu nhiệm vụ, không phải mười nhiệm vụ. Bước chạy **TUẦN TỰ** (`server/src/systems/quests.ts`: `steps[a.step]`), nên một nhiệm vụ gồm `talk -> kill -> collect -> talk` là hợp lệ và là cách chính để kể chuyện.
2. **Tối đa NĂM việc phụ cho cả hai chương** ở mức dễ chịu (201.000 / 240.019); sáu việc chỉ khi mọi việc đúng sàn; bảy trở lên cần nâng trần việc phụ (đề xuất 4 % -> 6 % riêng Hóa Thần trở lên, chờ người dùng). Bảng "6-8 việc phụ" của `COT_TRUYEN.md` 6.1 vì vậy giảm còn **3 (Lang Hoang) + 2 (Uy Vân Kinh)**.
3. **Nhiệm vụ nối vào chuỗi Hàn Vân** (`thien_han_hoan.next`) phải tính vào bậc Hóa Thần (có bước `reachRealm {5,0}`), KHÔNG được tính vào Nguyên Anh: chuỗi chính Nguyên Anh đã 94.700 / 100.008, không còn chỗ cho một nhiệm vụ ≥ 14.400.
4. **NPC phải đứng TRONG trạm** (`data-integrity.test.ts`: `inTown`, cách nhau > 64 px, không đè ô cản): trạm có bán kính 5 ô = 160 px quanh `(2048, 3136)` ở cả hai bản đồ, nên mỗi chương tối đa ~6 NPC; **mọi nhân vật gặp "ngoài đồng" trong truyện thật ra ghé trạm** (cao nhân ngồi trên mái quán, người gánh củi nghỉ chân).
5. **Không có cơ chế "lựa chọn"** trong `QuestDef` (không `choice`, không nhánh `next`): "lựa chọn nhỏ phá / giữ trận" của `COT_TRUYEN.md` 6.2 **hoãn sang đợt 3** cùng ba lựa chọn cuối truyện (mục 8 của tài liệu đó, câu hỏi mở 3). Chương 6 kết bằng một cảnh chứng kiến, không lưu gì.
6. **Vật phẩm cốt truyện** là `material` bị nhiệm vụ lấy đi lúc trả (bước `collect`), phải rơi THẬT từ quái hợp bậc (test khả thi của nhiệm vụ) và có `sellPrice 0` nếu không muốn sinh Linh thạch. Tối đa hai món mỗi chương (mục 6).
7. **Cổng:** `lang_hoang_nam` / `lang_hoang_bac` / `uy_van_nam` đã có và LUÔN mở (`map.ts`); không khoá cổng bằng nhiệm vụ trong đợt 1. Uy Vân Kinh CHƯA có cổng bắc (đợt 2: Triều Khư).

## 2. Nhịp truyện (lớp sự thật)

| Chương | Lớp mở ra | Người chơi nghe | Điều giấu lại |
| --- | --- | --- | --- |
| 5 Lang Hoang | **dã sử (Lang tộc)** | cả lứa lang con bị bắt, máu rưới dọc đường về phía quan ải, lang mẹ lần theo mùi máu, cuối đường là cổng Liệt Dương Tông, không phải Uy Vân Kinh | ai bắt lang con; Phong chủ |
| 6 Uy Vân Kinh | **chân tướng một phần** | huyết trận khắc xong trước thú triều ba tháng, số máu tế đúng ba nghìn người, không ai mặc áo Huyết Sát; người ghi sổ đóng dấu Phong chủ | ai ra lệnh khắc trận; Tầm Thiên Hội đứng sau |

Chính sử mà người chơi đã nghe trước đó (Đại Ung / Bắc Minh) là "thú triều tràn khỏi Lang Lĩnh, Liệt Dương Tông tử chiến, Huyết Sát Tông dựng huyết trận giữ kinh đô, triều đình phong hộ quốc" (`lore.huyet_luong_chinh_su`). Cả hai chương kể **ngược lại** chính sử bằng lời của người trong cuộc.

## 3. Chương 5: Lang Hoang (trạm Tuyết Đao Quan, bản đồ `lang_hoang`)

**Quái (D1 chốt id; tên theo `COT_TRUYEN.md` 6.1):** Dã Lang, Xích Diễm Lang, Hắc Phong Lang, Huyết Nguyệt Lang, Ngân Nguyệt Lang, Thương Nguyệt Lang; trùm chương **Thiên Lang Vương** (bộ chiêu trùm do D / E, `bosses.ts`).

### 3.1. NPC trong trạm (6)

| id dự kiến | Tên | Vai | Nguồn / ghi chú |
| --- | --- | --- | --- |
| `quan_uy_tuyet_dao` | Quan úy **Ngô Cự** | giao chuỗi chính ở ải, kể chuyện lang con mất tích | nhân vật GỐC Tiên Giới (cần dòng Từ điển) |
| `lai_buon_tuyet_dao` | **Chu Bách Lượng** | lái buôn qua ải, bán / mua đồ, giao việc phụ "Phí qua ải" | nhân vật gốc (cửa hàng Hóa Thần do D / E) |
| `tho_ren_tuyet_dao` | **Đồng Lão Thiết** | thợ rèn bộ V (đồ Hóa Thần, `KHUNG_HOA_THAN.md` mục 9: phải có TRƯỚC khi mở bãi) | nhân vật gốc |
| `doan_moc_thu` | **Đoan Mộc Thu** | người xem cờ, ngồi trên mái quán ải; "ta cược ngươi thua" | `/content/npc/cao_nhan.yaml` `npc.quan_ky_chan_quan` |
| `lac_thanh_son` | **Lạc Thanh Sơn** | lão tiều phu gánh củi nghỉ chân ở trạm, "gánh thử một lần" | `/content/npc/cao_nhan.yaml` `npc.phu_son_lao_nhan` |
| `do_thap_tam_nuong` | **Đỗ Thập Tam Nương** | tán tu lém lỉnh, giao hai việc phụ | `/content/npc/thien_kieu.yaml` `npc.do_thap_tam_nuong` |

### 3.2. Chuỗi chính (3 nhiệm vụ, 88.000 tu vi mỗi nhiệm vụ, minRealm tier 0: tổng chuỗi 264.000)

| # | id dự kiến | Tên / giao | minRealm | Bước (tuần tự) | Nhịp truyện | Thưởng |
| --- | --- | --- | --- | --- | --- | --- |
| 5.1 | `lang_hoang_vong_quan` | **Vọng Lang Quan** / Thôi Tuyết Phong (`tram_truong_han`, nối từ `thien_han_hoan`) | {4,2} | `reachRealm {5,0}` | Thôi Tuyết Phong tiễn lên bắc: ải Tuyết Đao thiếu người, nghe tin lang con mất tích | 88.000 + đan hồi bậc Hóa Thần x3 (D1) |
| 5.2 | `lang_hoang_lang_con` | **Đàn lang con** / Quan úy Ngô Cự | {5,0} | `talk doan_moc_thu` -> `kill` Dã Lang x30 -> `talk lac_thanh_son` -> `collect` vật phẩm bãi sơ cấp x10 | Quan úy kể lứa lang con mất tích, lang mẹ kéo tới chân ải; Đoan Mộc Thu cược người chơi thua và hé rằng lang mẹ không đánh ải mà lần theo máu; Lạc Thanh Sơn bắt gánh thử một lần (người cậy mạnh không thấy được điều này) | 88.000 + đan hồi x3 |
| 5.3 | `lang_hoang_duong_mau` | **Đường máu** / Quan úy Ngô Cự | {5,0} | `kill` Huyết Nguyệt Lang x20 -> `kill` Thiên Lang Vương x1 -> `collect` `manh_ao_liet_duong` x1 -> trả | theo mùi máu lên Huyết Lang Động; Thiên Lang Vương chặn đường người đuổi con, không giết người ở ải; thứ nhặt từ xác là mảnh áo choàng cháy xém; kết: đường máu dẫn tới cổng **Liệt Dương Tông**, không phải Uy Vân Kinh | 88.000 + đan hồi x3 + 1 kinh quyển Hóa Thần nếu D1 có sách hợp bậc (độ hiếm theo `book-drop-realm.test.ts`) |

Tổng chuỗi 5: **264.000 / 600.048** (4,4 % tổng thanh Hóa Thần). Nhiệm vụ 6.1 là `next` của 5.3 (giao ở Uy Vân Kinh).

### 3.3. Việc phụ (3; "Việc phụ (không bắt buộc)" ở đầu `desc`, như các việc phụ đã có)

| id dự kiến | Tên / giao | minRealm | Gợi ý bước | Nguồn encounter | Thưởng tu vi |
| --- | --- | --- | --- | --- | --- |
| `lh_phi_qua_ai` | **Phí qua ải** / Chu Bách Lượng | {5,0} | kill + collect nguyên liệu bãi Lang Hoang giúp thương nhân nộp đủ phí | `ev.qa_phi_qua_ai` | 36.000 |
| `lh_hang_lau` | **Hàng lậu qua ải** / Đỗ Thập Tam Nương | {5,0} | collect hàng (nguyên liệu bãi) đưa qua ải, nói chuyện với lính ải | `ev.qa_hang_lau` | 36.000 |
| `lh_linh_ai_sach_nhieu` | **Lính ải sách nhiễu** / Quan úy Ngô Cự | {5,1} | hạ nhóm mã tặc / lính ải làm càn quanh ải (loài người, nếu D1 có; không thì quái bãi) | `ev.qa_linh_ai_sach_nhieu`, `ev.tt_tru_yeu_lang_bay` | 41.000 |

### 3.4. Lời thoại mẫu chương 5 (giọng Từ điển: "ngươi", "đạo hữu", "ta"; không "bạn")

- **Thôi Tuyết Phong** (5.1, `offer`): "Từ Vọng Lang Quan đi lên là đất Lang Hoang. Ải Tuyết Đao thiếu người từ khi lang con trong núi mất tích. Qua đó, đừng lấy kiếm làm lẽ phải."
- **Quan úy Ngô Cự** (5.2, `offer`): "Thú triều chưa nổi, nhưng lang mẹ đã kéo tới chân ải ba đêm. Chúng không đánh. Chúng đứng nhìn về phía nam, rồi đào đất."
- **Đoan Mộc Thu** (5.2, bước `talk`): "Ngươi đi nước này, ta cược ngươi thua. Sử chép thú triều tràn từ Lang Lĩnh. Ta ngồi đây ba trăm năm, chưa thấy lang nào đánh ải bao giờ."
- **Lạc Thanh Sơn** (5.2, bước `talk`): "Đường dài, gánh nặng. Ngươi gánh thử một đoạn. Gánh rồi mới biết kẻ yếu bị bắt phải đi bao xa."
- **Quan úy Ngô Cự** (5.3, `complete`): "Mảnh áo này cháy từ trong ra ngoài. Đường máu đi xuống phía đông, về cổng Liệt Dương Tông, chứ không phải Uy Vân Kinh. Cổng Vọng Kinh đã mở cho ngươi."

## 4. Chương 6: Uy Vân Kinh (trạm Uy Vân Kinh, bản đồ `uy_van`)

**Quái (D1 chốt id):** Luyện Huyết Đệ Tử, Huyết Sát Chân Truyền, Huyết Ảnh, Huyết Mị, Ngạ Quỷ, Cương Thi; trùm chương **Huyết Ma Hộ Pháp**; Huyết Hải Lão Ma là trùm sinh sẵn thứ hai (D / E).

### 4.1. NPC trong trạm (6)

| id dự kiến | Tên | Vai | Nguồn / ghi chú |
| --- | --- | --- | --- |
| `do_uy_uy_van` | Đô úy **Lỗ Trọng** | giữ cổng, giao chuỗi chính: trạm an toàn do huyết trận giữ | nhân vật gốc |
| `co_tan` | **Cố Tẫn** | lính trẻ mài đao bên đống lửa, mơ thấy mặt trời cháy; thức tỉnh ở cuối chương | `/content/npc/thien_kieu.yaml` `npc.co_tan` |
| `dao_co_do_tin` | Đạo cô **Thanh Tố** | dò tin trong kinh đô, giao việc ghép sổ trận | nhân vật gốc (tông phái `ta_phai/dac_trung.yaml`: chỉ lấy vai dò tin, không lấy tên riêng) |
| `dam_ba` | **Đàm bà** | bà bán đèn đỏ ở cổng kinh đô, kể chuyện dân quan ải thắp đèn nhớ người đã chết | nhân vật gốc; ý từ `lore.huyet_luong_chinh_su` ("đèn đỏ") |
| `phong_chu` | Phong chủ **Tạ Hoài Chu** | người ghi sổ huyết trận; chỉ xuất hiện ở nhiệm vụ 6.3 | **nhân vật gốc Tiên Giới, TÊN ĐỀ XUẤT** (theo `COT_TRUYEN.md` mục 3, 10.4: Dev E / A đặt; đổi được trước giai đoạn 2; cần dòng Từ điển) |
| `tho_ren_uy_van` | **Mặc Lão Thiết** | thợ rèn / cửa hàng bậc cao hơn (D / E) | nhân vật gốc |

### 4.2. Chuỗi chính (3 nhiệm vụ, tổng 315.000)

| # | id dự kiến | Tên / giao | minRealm | Bước (tuần tự) | Nhịp truyện | Thưởng |
| --- | --- | --- | --- | --- | --- | --- |
| 6.1 | `uy_van_vao_thanh` | **Vào thành** / Đô úy Lỗ Trọng (`next` của 5.3) | {5,1} | `talk dam_ba` -> `kill` Huyết Ảnh x25 -> `collect` `manh_so_tran` x6 -> trả | Đô úy: kinh đô an toàn nhờ huyết trận, ai cũng biết ơn Huyết Sát Tông; Đàm bà kể đèn đỏ và con số ba nghìn người chết ở Huyết Lương chi biến; nhặt mảnh sổ rơi từ Huyết Ảnh | 100.000 + đan hồi x3 |
| 6.2 | `uy_van_so_tran` | **Sổ huyết trận** / Đạo cô Thanh Tố | {5,1} | `collect` `manh_so_tran` x6 (nối tiếp, từ Huyết Mị) -> `talk co_tan` -> `kill` Huyết Sát Chân Truyền x15 -> trả | ghép mảnh sổ: trận khắc xong trước thú triều ba tháng, số máu tế đủ ba nghìn người, không ai mặc áo Huyết Sát, dấu Phong chủ; Cố Tẫn mài đao, nói "Đừng đứng đó nhìn", mơ mặt trời cháy | 100.000 + 1 kinh quyển Hóa Thần (nếu có) |
| 6.3 | `uy_van_phong_chu` | **Phong chủ** / Đô úy Lỗ Trọng | {5,2} | `talk phong_chu` -> `kill` Huyết Ma Hộ Pháp x1 -> `talk co_tan` -> trả | Phong chủ không chối ("Ta ghi sổ. Ta không bảo ai tế."); hạ Hộ Pháp giữ điện; Cố Tẫn nhìn thấy mặt trời cháy, nhớ ra mình là Liệt Dương Chân Nhân chuyển thế; **cảnh chứng kiến** (không lưu lựa chọn) | 115.000 + đan hồi x4 |

Tổng chuỗi 6: **315.000**; **cả hai chương 579.000 / 600.048 (9,65 %)**, còn dư ~21.000 cho điều chỉnh. Cuối 6.3 KHÔNG có `next` (chương 7 Triều Khư là đợt 2: cần bản đồ + cổng bắc Uy Vân Kinh trước).

### 4.3. Việc phụ (2)

| id dự kiến | Tên / giao | minRealm | Gợi ý bước | Nguồn encounter | Thưởng tu vi |
| --- | --- | --- | --- | --- | --- |
| `uv_dan_huyet_te` | **Đàn huyết tế** / Đạo cô Thanh Tố | {5,1} | phá một đàn tế nhỏ ngoài trận: kill + collect | `ev.tm_ta_tu_huyet_te` | 41.000 |
| `uv_chuong_thu_hon` | **Chuông thu hồn** / Đàm bà | {5,2} | dẹp bãi mộ có chuông thu hồn (Ngạ Quỷ / Cương Thi), mang tro đèn về | `ev.tm_tru_ma_chuong_hon` | 47.000 |

Tổng việc phụ cả hai chương: 36 + 36 + 41 + 41 + 47 = **201.000 / 240.019** (3,35 %).

### 4.4. Lời thoại mẫu chương 6

- **Đô úy Lỗ Trọng** (6.1, `offer`): "Kinh đô này bình yên là nhờ huyết trận. Ngươi vào được, ra được, không ai đụng tới. Đừng hỏi trận được dựng bằng gì, ai cũng biết ơn nó."
- **Đàm bà** (6.1, bước `talk`): "Đèn đỏ này thắp nhớ ba nghìn người ngã xuống. Kẻ nói ba nghìn, kẻ nói hơn. Ta chỉ nhớ: không đứa nào trong đó mặc áo Huyết Sát."
- **Đạo cô Thanh Tố** (6.2, `complete`): "Ghép đủ rồi. Trận khắc xong trước thú triều ba tháng, số máu tế ghi sẵn cho đúng ba nghìn người. Dấu cuối sổ là Phong chủ, mực đã đen như máu khô."
- **Cố Tẫn** (6.2, bước `talk`): "Cố Tẫn. Muốn đánh thì đánh, muốn đi thì đi. Đừng đứng đó nhìn. Đêm nào ta cũng mơ thấy mặt trời cháy, mà ta chưa từng thấy mặt trời nào như thế."
- **Phong chủ Tạ Hoài Chu** (6.3, bước `talk`): "Ta ghi sổ. Ta không bảo ai tế. Hỏi ta ai bảo, ngươi sẽ nghe một cái tên mà nghe rồi, ngươi sẽ không còn muốn hỏi nữa."
- **Cố Tẫn** (6.3, bước `talk` cuối): "Mặt trời ấy là ta. Ta đã đứng ở cổng, và không ai mặc áo Huyết Sát ở lại cùng ta."

Mọi dòng trên phải qua `npc-dialogue.test.ts` / `ngon-ngu.test.ts` khi đổi thành `dialog` NPC (25-170 ký tự, 4-5 dòng, dòng đầu là giới thiệu cố định).

## 5. Chặn đường (D / E, song song)

Cảnh chặn đường mới cho `lang_hoang` và `uy_van` (bảng `AMBUSH_SCENES` / `AMBUSH_FOES`): `ev.qa_tham_bao_vuot_bien` (thám báo vượt biên), `ev.tn_quan_ai_phuc_binh` (phục binh trên ải), `ev.tt_truy_na_huyet_lenh` (huyết lệnh truy đầu) cho Lang Hoang; `ev.tm_ta_tu_huyet_te`, `ev.tt_ta_vat_phe_tich` cho Uy Vân Kinh. Văn mẫu viết lại theo khuôn `ambush-data.ts` (bỏ chữ Hán, không tên riêng ngoài phạm vi mục 75).

## 6. Việc phải làm ở giai đoạn 2 (checklist)

1. **Từ điển:** thêm vào `shared/src/glossary.ts` + `docs/TU_DIEN_TIEN_GIOI.md` các tên mới (Ngô Cự, Chu Bách Lượng, Đồng Lão Thiết, Lỗ Trọng, Thanh Tố, Đàm bà, Mặc Lão Thiết, Tạ Hoài Chu; Cố Tẫn, Đoan Mộc Thu, Lạc Thanh Sơn, Đỗ Thập Tam Nương nếu chưa có; Liệt Dương Tông, Huyết Sát Tông, Thiên Lang Vương, Huyết Ma Hộ Pháp) trong PR `shared/` riêng (một dev khác xem).
2. **Vật phẩm cốt truyện (tối đa 2 món / chương):** `manh_ao_liet_duong` (Thiên Lang Vương rơi 100 %), `manh_so_tran` (Huyết Ảnh / Huyết Mị rơi); `material`, `sellPrice 0`, tối thiểu một nhiệm vụ dùng tới (`check:content`: "nguyên liệu chết"); cần icon (`client/scripts/gen-assets.mjs`, `npm run assets -w client`).
3. **Nâng test:** `kim-dan-world.test.ts` thêm cảnh giới 5 vào vòng kiểm sàn / trần chuỗi chính và việc phụ (`for (const realm of [2, 3, 4])` -> `[2, 3, 4, 5]`; việc phụ `[1, 2, 3, 4]` -> thêm 5); `chuoi-truyen.test.ts` bỏ `chuaCoTruyen` của `lang_hoang` / `uy_van` và điền `bossId` (`thien_lang_vuong`, `huyet_ma_ho_phap`).
4. **Test khuôn việc phụ:** `lang-hoang-sidequests.test.ts`, `uy-van-sidequests.test.ts` theo `am-suong-sidequests.test.ts` (giver là NPC có thật, bậc, bước trỏ quái / vật phẩm thu được, thưởng trong khung, đột biến >= 5).
5. **Cân bằng:** `npm run can-bang -w server` sinh lại `docs/CAN_BANG.md` (thưởng Hóa Thần), `npm run so-tay-quai -w server`, `npm run check:content`, TOÀN BỘ `npm test`.
6. **Móc truyện:** thêm dòng NGUON_NOI_DUNG cho mỗi mẩu (mục 3 của tài liệu này); cập nhật bảng việc ở `docs/COT_TRUYEN.md` mục 9 (E2).

## 7. Câu hỏi mở (không chặn giai đoạn 2; mặc định ghi sẵn)

1. **Trần việc phụ Hóa Thần:** giữ 4 % (năm việc phụ cho cả hai chương, mặc định) hay nâng lên 6 % cho Hóa Thần trở lên để có 7-8 việc phụ như `COT_TRUYEN.md`? Cần người dùng chốt trước khi giai đoạn 2 viết thêm việc.
2. **Cố Tẫn có thành đồng hành thật** (đi theo, đánh cùng) hay chỉ là NPC trong trạm? Mặc định: chỉ NPC (không có cơ chế đồng hành).
3. **Tên "Phong chủ" (Tạ Hoài Chu):** mặc định dùng tên này; người dùng muốn tự đặt thì sửa trước giai đoạn 2.
