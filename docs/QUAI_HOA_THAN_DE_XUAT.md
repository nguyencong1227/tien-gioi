# Quái Hóa Thần đề xuất (Lang Hoang, Uy Vân Kinh)

> Giai đoạn 1 của issue **#1466** [75-D1] (mục 75): **chỉ tài liệu**, chưa có dòng dữ liệu nào. Dev A viết thay Dev D (Ornith đang tắt, 28/11/2026), cùng lúc với `docs/KICH_BAN_CHUONG_5_6.md` (E2 giai đoạn 1). Giai đoạn 2 (nhập `shared/src/game.ts`, `bosses.ts`, `skills-*.ts`, `books.ts`, `DROP_TABLES`, `MONSTER_REALM`, `monsterCap`) theo khung `docs/KHUNG_HOA_THAN.md` mục 4-5 (đã vào `main` ở #1471 / #1472) và checklist mục 7.
> Nguồn: chỉ bản sao `~/TT/van-kiep-tu-tien-clone` (`/content/enemies/*`, `/content/world/ho_quai/*`, `/content/items/*`; tiếng Việt, không `ten_han`). Khi nhập mỗi mẩu một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3 (`du_lieu` cho quái / vật phẩm; `cong_phap` cho sách chiêu).
> **Trạng thái: bản 1.** Mọi SỐ là điểm khởi đầu theo KHUNG (D hiệu chỉnh bằng `huntRate` / `huntFight`, mục 5 của tài liệu này); id là DỰ KIẾN.

## 1. Cách đọc bậc của nguồn (quan trọng, dễ nhầm)

Trường `canh_gioi` của quái / nhân vật trong nguồn trùng chỉ số `REALMS` của Tiên Giới (0 Phàm Nhân, 1 Luyện Khí, 2 Trúc Cơ, 3 Kim Đan, 4 Nguyên Anh, 5 Hóa Thần): bằng chứng là mô tả chữ của chính nguồn (Huyết Sát Chân Truyền `canh_gioi` 3 "Kết Đan", Huyết Ma Hộ Pháp 5 "Hóa Thần ngồi sau tông chủ", Lạc Thanh Sơn 5 "Hóa Thần đại viên mãn"). Riêng **công pháp / pháp khí** (`/content/items/cong_phap`, `phap_khi`) `canh_gioi` n ánh xạ sang `reqRealm` n + 1 theo bảng đã dùng cho mọi chiêu ở `NGUON_NOI_DUNG.md` ("Ánh xạ đã dùng cho mọi chiêu"): công pháp `canh_gioi` **4** thành chiêu `reqRealm` **5 (Hóa Thần)**; `canh_gioi` 5 thành `reqRealm` 6 (Luyện Hư, không dùng ở đợt 1).

Hệ quả: nguồn xếp **cả bầy sói từ Dã Lang (Phàm Nhân) tới Thương Nguyệt Lang (Hóa Thần)** vào cùng vùng Lang tộc, còn Tiên Giới cần **cả bản đồ ở Hóa Thần** (khu đúng bậc, `MONSTER_REALM` 5). Quy ước đề xuất: **giữ TÊN và đặc tính (hệ, chiêu, nét kể) của từng loài trong nguồn, nhưng số liệu và `MONSTER_REALM` đều lấy theo VAI ở bậc Hóa Thần của KHUNG** (mục 4.1 của `KHUNG_HOA_THAN.md`), phân tầng độ nguy hiểm bằng `minDanger` và hệ số trong vai. Truyện giữ được thứ tự "đàn nhỏ ở rìa, già làng ở sâu"; người chơi Hóa Thần không phải săn Dã Lang yếu như Phàm Nhân.

## 2. Số liệu theo vai ở Hóa Thần (trích KHUNG mục 4.1, làm điểm khởi đầu)

| Vai (mẫu Nguyên Anh) | Máu | Công | Tu vi khi hạ | Cấp |
| --- | ---: | ---: | ---: | ---: |
| Gồng lao (Hàn Lang) | 7.817 | 464 | 7.920 | 19 |
| Bắn đạn (Phong Nha) | 7.547 | 543 | 9.120 | 20 |
| Dày, đập đất (Cốt Tượng) | 31.807 | 216 | 15.480 | 20 |
| Đòn nặng + độc (Độc Tước) | 12.669 | 899 | 16.560 | 21 |
| Trùm (Thiên Hàn Vương) | 221.030 | 422 | 230.400 | 24 |

Giữ `attackCd`, `speed` (<= ~200), `radius`, `aggro` theo mẫu Nguyên Anh cùng vai (`shared/src/game.ts`: `han_lang`, `phong_nha`, `cot_tuong`, `doc_tuoc`, `thien_han_vuong`). Trong cùng vai, loài ở `minDanger` thấp nhân 0,85-0,95 máu / công, loài sâu nhân 1,05-1,15 (D chốt bằng mô hình). Trần cấp chặn đường Hóa Thần là 21 (`AMBUSH_FOE_LEVEL_CAP`).

## 3. Lang Hoang (bản đồ `lang_hoang`, chương 5; 64 quái ở `monsterCap`, trùm sinh sẵn 2)

Hệ ghi theo `he` của nguồn; `MonsterKind.element` (kiểu `Element` ở `skills.ts`, có đủ phong / hỏa / kim / thổ / âm...) đặt thì chiêu của người chơi lên quái nhân khắc x1,3 / bị khắc x0,8 (`game.ts`): D chọn đặt hay để `none` cho từng loài, nhớ đo lại `huntFight` nếu đặt. `minDanger` tăng về phía bắc CÙNG `exp` (như Hàn Vân 0,2 / 0,4 / 0,55 / 0,7 / 0,85; test `lang-hoang-quai.test.ts` canh thứ tự này); đề xuất `monsterCap` tổng **64**. **Lát A1 (PR #1573) đã khai báo sáu loài này, CHƯA sinh.**

| id dự kiến | Tên (nguồn) | Hệ | Vai | Cấp | `minDanger` | Số | Nét chiến đấu (từ chiêu nguồn) | Khoá nguồn |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| `da_lang` | Dã Lang | (không) | Gồng lao x0,85 | 19 | 0,15 | 16 | đàn đông, cắn xé đơn giản, không chiêu | `enemy.da_lang` |
| `xich_diem_lang` | Xích Diễm Lang | hỏa | Đòn nặng x0,9 | 21 | 0,60 | 12 | móng lửa (`chieu.xich_diem_trao`), vết cháy | `enemy.xich_diem_lang` |
| `hac_phong_lang` | Hắc Phong Lang | phong | Bắn đạn x0,95 | 20 | 0,30 | 12 | chạy ngược gió, phát đao gió từ xa, hú gọi bầy (`lang_hu_goi_ban`) | `enemy.hac_phong_lang` |
| `huyet_nguyet_lang` | Huyết Nguyệt Lang | hỏa + phong | Gồng lao x1,1 | 21 | 0,45 | 10 | xé nát (`lang_xe_nat`), trán có vệt trăng đỏ; mẫu nguồn là TINH ANH (Tiên Giới đã có `systems/elite.ts`: đừng nhân đôi, chỉ chọn hệ số vai cao) | `enemy.huyet_nguyet_lang` |
| `ngan_nguyet_lang` | Ngân Nguyệt Lang | phong + hỏa | Đòn nặng x1,1 | 21 | 0,85 | 8 | xé nát + **Thiên Lang Khiếu** (khống chế ngắn, `lang_vuong_hu`), đàn theo sau | `enemy.ngan_nguyet_lang` |
| `thuong_nguyet_lang` | Thương Nguyệt Lang | phong + hỏa | Dày x1,0 | 20 | 0,72 | 4 | sói già lông ngả xanh, đòn chậm, đập đất, máu rất dày; "Lang Vương ba đời đều đến xin nó một lời" | `enemy.thuong_nguyet_lang` |

**Trùm sinh sẵn (2):**

| id dự kiến | Tên | Vai / số | Bộ chiêu (mô tả; D / E soạn `bosses.ts`, mục 42) | Nguồn |
| --- | --- | --- | --- | --- |
| `thien_lang_vuong` | **Thiên Lang Vương** (trùm chương 5) | Trùm: 221.030 / 422 / 230.400 / cấp 24, hệ phong + kim | giai đoạn 1: **Xé nát** (nón), **Phệ nguyệt** (đường, gây chảy máu), **Thiên Lang Khiếu** (vòng + choáng ngắn); dưới 60 %: gọi 1-2 Ngân Nguyệt Lang (`goi_bay`, quái con không rơi đồ); dưới 35 %: **Yêu huyết tái sinh** (hồi một phần máu, đo để không thành vòng lặp bất tử) và cuồng nộ sau 5 phút | `enemy.thien_lang_vuong` + `chieu.thien_lang_phe_nguyet`, `lang_xe_nat`, `lang_vuong_hu`, `yeu_huyet_tai_sinh`, `phe_linh_trao` |
| `lang_vuong` | **Lang Vương** (Lang Lĩnh, trùm nhỏ) | Trùm nhỏ ~ 45 % trùm chương (D chốt), hệ hỏa + phong | một giai đoạn: xé nát + hú; là "thủ lĩnh Lang Lĩnh" trong lời kể, đứng trước Thiên Lang Vương | `enemy.yeu_vuong` (Lang Vương), `chieu.lang_xe_nat`, `lang_vuong_hu` |

## 4. Uy Vân Kinh (bản đồ `uy_van`, chương 6; 64 quái, trùm sinh sẵn 2)

| id dự kiến | Tên (nguồn) | Hệ | Vai | Cấp | `minDanger` | Số | Nét chiến đấu | Khoá nguồn |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| `luyen_huyet_de_tu` | Luyện Huyết Đệ Tử | hỏa | Gồng lao x0,9 | 19 | 0,15 | 16 | cận chiến người, móng nhuộm đỏ, **huyết tế** (tự hồi một ít khi trúng) | `enemy.luyen_huyet_de_tu` |
| `nga_quy` | Ngạ Quỷ | hỏa | Gồng lao x0,85 (máu thấp, đàn đông) | 19 | 0,25 | 12 | lửa xanh, **oán niệm triền thân** (giảm tốc ngắn), bám đuổi | `enemy.nga_quy` |
| `cuong_thi` | Cương Thi | thổ | Dày x0,95 | 20 | 0,40 | 10 | da cứng, **thi độc trảo** (độc), chậm | `enemy.cuong_thi` |
| `huyet_mi` | Huyết Mị | hỏa | Đòn nặng + độc x0,9 | 20 | 0,55 | 10 | **phế huyết trảo**, **huyết chú** (độc / chảy máu), bám theo mùi máu | `enemy.huyet_mi` |
| `huyet_anh` | Huyết Ảnh | hỏa | Bắn đạn x1,0 | 20 | 0,70 | 8 | **phân quang** (đạn), **huyết hải phiên đào** (vòng lớn, báo trước dài) | `enemy.huyet_anh` |
| `huyet_sat_chan_truyen` | Huyết Sát Chân Truyền | hỏa | Đòn nặng + độc x1,1 | 21 | 0,82 | 6 | hút máu, **huyết vũ phiêu linh** (mưa), **huyết ảnh đoạt mệnh** (đòn nặng, báo trước) | `enemy.huyet_sat_chan_truyen` |

| id dự kiến | Tên | Vai / số | Bộ chiêu (mô tả) | Nguồn |
| --- | --- | --- | --- | --- |
| `huyet_ma_ho_phap` | **Huyết Ma Hộ Pháp** (trùm chương 6) | Trùm: 221.030 / 422 / 230.400 / cấp 24, hệ hỏa | huyết vũ phiêu linh (mưa), huyết ảnh đoạt mệnh (vòng nặng), huyết tế (hồi bằng thứ hạ được), **linh vực** (vùng giảm tốc quanh trùm, né ra ngoài); dưới 50 %: gọi Huyết Ảnh; cuồng nộ sau 5 phút | `enemy.huyet_ma_ho_phap` + `chieu.huyet_vu_phieu_linh`, `huyet_anh_doat_menh`, `huyet_te`, `linh_vuc` |
| `huyet_hai_lao_ma` | **Huyết Hải Lão Ma** (trùm nhỏ, ma tu đổi ba thân xác) | Trùm nhỏ ~ 45 % trùm chương, hệ âm | huyết ảnh đoạt mệnh, huyết tế, thần thức trấn áp (khống chế ngắn); một giai đoạn | `enemy.huyet_hai_lao_ma` (mẫu nguồn `canh_gioi` 4, đưa về vai trùm nhỏ) |

Ghi chú truyện: **Cương Thi Tướng** (`enemy.cuong_thi_tuong`, tinh anh "tướng giữ ải chết đứng") là ứng viên cho CẢNH chặn đường, không phải loài sinh sẵn.

## 5. Vật phẩm rơi (nguyên liệu + sách chiêu) và bộ V

### 5.1. Nguyên liệu (đề xuất 8 món mới, `type: "material"`, mỗi món có ít nhất một công thức / nhiệm vụ dùng tới)

Khoá nguồn trong `/content/items/yeu_tai/*.yaml` (nguyên liệu yêu thú) và `ta_vat.yaml`; tên Tiên Giới viết lại từ nguồn (đừng dùng nguyên `Yêu Bì` / `Lang Nha` vì Tiên Giới đã có `nanh_soi` / da thú cấp thấp).

| id dự kiến | Tên | Nguồn gốc ý | Rơi từ (đề xuất) | Dùng ở |
| --- | --- | --- | --- | --- |
| `bi_lang_hoang` | Da Lang Hoang | `item.yeu_bi` (phẩm 1) | Dã Lang, Xích Diễm Lang (tỉ lệ cao) | bào V, nhiệm vụ 5.2 |
| `nanh_nguyet` | Nanh Trăng | `item.lang_nha` (phẩm 2) | Hắc Phong, Huyết Nguyệt, Ngân Nguyệt Lang | kiếm V |
| `cot_lang_vuong` | Cốt Lang Vương | `item.lang_vuong_cot` (phẩm 5) | Thiên Lang Vương, Lang Vương | kiếm V, bào V |
| `hon_tinh_thien_lang` | Hồn Tinh Thiên Lang | `item.thien_lang_hon_tinh` (phẩm 7) | Thương Nguyệt Lang, Thiên Lang Vương | phù V |
| `manh_ao_liet_duong` | Mảnh áo Liệt Dương | (cốt truyện chương 5, `KICH_BAN_CHUONG_5_6.md`) | Thiên Lang Vương 100 % | nhiệm vụ 5.3 |
| `huyet_anh_tinh` | Huyết Ảnh Tinh | `item.huyet_anh_tinh` (phẩm 6) | Huyết Ảnh, Huyết Mị | bào V, phù V |
| `manh_so_tran` | Mảnh sổ huyết trận | (cốt truyện chương 6) | Huyết Ảnh, Huyết Mị | nhiệm vụ 6.1 / 6.2 |
| `tuy_phi_cuong` | Tủy Phi Cương | `item.phi_cuong_tuy` (phẩm 6) / `item.thi_mao` | Cương Thi, Huyết Sát Chân Truyền | kiếm V, phù V |

Hai món cốt truyện (`manh_ao_liet_duong`, `manh_so_tran`): `sellPrice 0`, bị nhiệm vụ lấy đi lúc trả (không "nguyên liệu chết", `check:content`).

### 5.2. Sách chiêu Hóa Thần (`reqRealm 5`, độ hiếm >= 3 đề xuất ở KHUNG mục 5, rơi từ quái bậc 5)

Công pháp nguồn `canh_gioi` 4 (mục 1), phẩm 6 của nguồn (`/content/items/cong_phap/*`). Chỉ 6 sách ở đợt 1 để giảm khối lượng `skill-kit.test` / `skills-dps.test`. Mô tả chiêu giữ lối nói TRUNG TÍNH (đổi tên môn phái / địa danh, test `skills-kim-tho.test.ts`); mỗi chiêu một dòng `cong_phap` ở NGUON_NOI_DUNG; mỗi sách cần icon (`gen-assets.mjs` `BOOKS`) và vào `FX_CAST_SKILLS`; hình mới (zone / trap / totem / chiêu vận) cần `npm run e2e:chieu-moi -w server`.

| Chiêu dự kiến (nguồn) | Hệ | Hình đề xuất | Rơi từ | Tỉ lệ (0,6-1,2 % quái thường; trùm 100 % một sách) |
| --- | --- | --- | --- | --- |
| Thanh Minh Phong Kinh (`item.thanh_minh_phong_kinh`) | phong | chiêu vận hoặc bắn xuyên | Thương Nguyệt Lang; Thiên Lang Vương | 1,0 %; 25 % |
| Ly Hỏa Chân Lục (`item.ly_hoa_chan_luc`) | hỏa | vùng (zone) cháy | Xích Diễm Lang, Huyết Nguyệt Lang | 0,8 % |
| Kim Cương Luyện Thân (`item.kim_cuong_luyen_than`) | kim | khiên (`shield`) | Thiên Lang Vương | 20 % |
| Thôn Huyết Ma Chưởng (`item.thon_huyet_ma_chuong`) | hỏa | tấn công hút máu | Huyết Mị, Huyết Sát Chân Truyền | 1,0 % |
| Phần Thi Quyết (`item.phan_thi_quyet`) | hỏa | vùng (zone) | Cương Thi | 0,8 % |
| Huyết Lao Ma Công (`item.huyet_lao_ma_cong`, nguồn thả từ Huyết Hải Lão Ma) | thủy (theo nguồn) | lồng chụp (trap) | Huyết Hải Lão Ma; Huyết Ma Hộ Pháp | 30 %; 20 % |

Luật cần nhớ (AGENTS.md "Chiêu thức"): `book-drop-realm.test.ts` đòi mỗi sách `rarity >= 2` có nơi rơi cùng bậc hoặc hơn một bậc (ở đây quái bậc 5 nên đạt); thêm quái có rơi sách phải thêm dòng `MONSTER_REALM` (mục 7); tỉ lệ bán sách làm tăng thu nhập Linh thạch (đo bằng `can-bang`).

### 5.3. Bộ V (đồ Hóa Thần): CÙNG LÚC với quái

KHUNG mục 4.2 / comment A ở #1466: không có đồ cùng bậc thì mô hình báo "không loài nào săn được" ở Hóa Thần sơ kỳ. Số theo bảng (kiếm công 98, bào máu 1.168, phù mp 262 + tốc độ 28), đòi hỏi `reqRealm 5`:

| Món | Tên dự kiến | Rèn tại | Nguyên liệu (ví dụ, D chốt tỉ lệ) |
| --- | --- | --- | --- |
| Kiếm V | Kiếm Nanh Trăng | `tho_ren_tuyet_dao` (Đồng Lão Thiết, `KICH_BAN_CHUONG_5_6.md`) | `nanh_nguyet` x12, `cot_lang_vuong` x2, `tuy_phi_cuong` x4 + Linh thạch |
| Bào V | Bào Huyết Nguyệt | `tho_ren_tuyet_dao` | `bi_lang_hoang` x20, `huyet_anh_tinh` x6, `cot_lang_vuong` x2 + Linh thạch |
| Phù V | Phù Hồn Thiên Lang | bàn phù / thợ rèn | `hon_tinh_thien_lang` x3, `huyet_anh_tinh` x4, `tuy_phi_cuong` x4 + Linh thạch |

Công thức đi qua `RECIPES` hiện có; giá bán theo `ITEM_VALUE` (không vào `sellPrice` nếu là nguyên liệu cốt truyện). Cần icon + atlas (`npm run assets -w client`).

## 6. Vị trí trong bản đồ và ngân sách hiệu năng

- `monsterCap` đề xuất: Lang Hoang `{ da_lang: 16, xich_diem_lang: 12, hac_phong_lang: 12, huyet_nguyet_lang: 10, ngan_nguyet_lang: 8, thuong_nguyet_lang: 4, thien_lang_vuong: 1, lang_vuong: 1 }` (tổng 64, trùm 2); Uy Vân Kinh `{ luyen_huyet_de_tu: 16, nga_quy: 12, cuong_thi: 10, huyet_mi: 10, huyet_anh: 8, huyet_sat_chan_truyen: 6, huyet_ma_ho_phap: 1, huyet_hai_lao_ma: 1 }` (tổng 64, trùm 2). Hàn Vân hiện 62; trần ~70 (`perf.test.ts`), trùm <= 6 (`MAX_BOSSES_PER_MAP`).
- Sửa HAI chỗ cho khớp (như comment A ở #1466): thuộc tính `monsterCap` trong `shared/maps/<id>.json` rồi `npm run map:build -w server -- <id>`, và `monsterCap` trong `PROCEDURAL_MAPS` ở `shared/src/map.ts`; sau đó sửa ca "CHƯA có quái" ở `shared/src/lang-hoang.test.ts` / `uy-van.test.ts`.
- Chạy `npm run bench -w server` (đo byte / tick, tick < 10 ms) và `-- --crowd`; hai bản đồ cùng 64 quái không nên vượt Hàn Vân quá nhiều.

## 7. Checklist giai đoạn 2 (làm theo thứ tự; PR nhỏ, một PR một lát)

1. **Lát A (quái thường + `monsterCap`; XONG: A1 #1573 khai báo, A2 #1576 nguyên liệu + bộ V + rèn, A3 cho sinh: 62 quái ở `lang_hoang`, báo cáo `hoa-than-kinh-te.ts`):** sáu loài Lang Hoang + `MONSTER_REALM` 5 + `monsterCap` + `DROP_TABLES` nguyên liệu; `can-bang` (`huntRate` / `huntFight` Hóa Thần), `so-tay-quai`, `check:content`, TOÀN BỘ `npm test`. **Phải có bộ V ở lát này** (mục 5.3) hoặc mô hình không săn nổi.
2. **Lát B (trùm Thiên Lang Vương + Lang Vương; XONG ở nhánh `a/1466-lat-b`: bộ chiêu qua `bossViolations` + bot né hoàn hảo, rơi chắc nguyên liệu bộ V, `monsterCap` +2; "Yêu huyết tái sinh" (hồi máu) chưa có hình trong khung chiêu trùm nên để dành):** `bosses.ts` (bộ chiêu qua ba cổng `bossViolations`, bot né hoàn hảo `boss-data-dodge.test.ts`, `bossBalanceViolations`), `monsterCap`, `DROP_TABLES` trùm; `chan-duong.ts` (cảnh chặn đường Hóa Thần).
3. **Lát C (sách chiêu Lang Hoang):** 3 sách (mục 5.2), `skillViolations`, `skill-kit.test`, `skills-dps.test`, `book-drop-realm.test`, icon + atlas.
4. **Lát D, E, F:** như A, B, C cho Uy Vân Kinh.
5. **Đã có trước:** khung chiêu `SKILL_MULT_CAP` / `AMBUSH_FOE_LEVEL_CAP` tới bậc 9 (#1472); `expToNext` / `statsFor` tổng quát tới Độ Kiếp; không cần đổi công thức.
6. Ghi nguồn (`NGUON_NOI_DUNG.md` mục 3), CREDITS (icon mới), CHANGELOG, cập nhật bảng việc `COT_TRUYEN.md` mục 9 (D1).
7. Từ điển: thêm tên quái / vật phẩm mới (Thiên Lang Vương, Huyết Ma Hộ Pháp, Huyết Hải Lão Ma, Lang Vương, Thương Nguyệt Lang...) vào `shared/src/glossary.ts` + `docs/TU_DIEN_TIEN_GIOI.md` trong PR `shared/` riêng.

## 8. Câu hỏi mở (không chặn giai đoạn 2; mặc định đã chọn)

1. **Số sách chiêu đợt 1:** sáu sách (mặc định) hay đủ ~12 như các cảnh giới trước? Mỗi chiêu kéo theo `skill-kit.test`, `skills-dps.test`, icon, `FX_CAST_SKILLS`, E2E hình mới.
2. **Trùm nhỏ (Lang Vương, Huyết Hải Lão Ma):** giữ (mặc định, đủ nhịp bản đồ) hay bỏ để D1 gọn hơn?
3. **Tên vật phẩm mới** ở mục 5.1 / 5.3 chỉ là đề xuất: người dùng muốn tên khác thì sửa trước lát A.
