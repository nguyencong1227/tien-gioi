# Phân công M8: TÔNG MÔN CÓ CHIỀU SÂU (người dùng chốt 16/11/2026)

> Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục **39** (cùng mục 27 / 38 về kho tông môn). Thiết kế chi tiết: **`docs/THIET_KE_TONG_MON.md` mục 12** (đọc trước khi nhận việc). Dựa trên `main` sau v0.3.1 (`v0.3.1` đã lên bản chạy thật 16/11/2026). Mọi con số trong tài liệu này và trong thiết kế là **đề xuất của Dev A**; D chốt lại bằng mô phỏng (mục 5), người dùng đổi được ở các câu hỏi mục 7.

## 1. Quyết định đã chốt và ràng buộc
| Điều | Quyết định |
|---|---|
| Hướng | M8 = **tông môn có chiều sâu**: **cống hiến** (điểm cá nhân), **cửa hàng tông**, **cấp tông** (điểm tông), **buff tông**, **nhiệm vụ tông hằng ngày** |
| Ngoài phạm vi | **Chiến tranh tông môn** (để sau, hỏi người dùng). Bảng xếp hạng tông môn: cũng chưa làm (mục 7, câu 6) |
| Thứ tự | Làm SAU v0.3.1; **không chặn / không bị chặn** bởi việc của v0.3.2 (cân bằng #805, nghề nhỏ #815) và việc phụ của D |
| Nguồn nội dung | Mục 19-20: thuật ngữ cống hiến / công tích / bảo khố / Tàng Kinh Các của Vạn Kiếp Tu Tiên (chỉ khái niệm và tên gọi chung); tên cấp, mặt hàng, nhiệm vụ do D soạn; mỗi mục lấy nguyên văn ghi `docs/NGUON_NOI_DUNG.md` mục 3. KHÔNG lấy tông phái / nhân vật của game đó |
| Giữ nguyên | "Server quyết định mọi kết quả"; thành viên là LINH HỒN (sống qua kiếp); ưu tiên **mất hơn nhân đôi**; ngân sách hiệu năng (tick < 10 ms, byte / tick mỗi client < 520, bench 0,0%); mục bấm >= 44 px, không chữ Hán, chơi được bằng bàn phím; `PROTOCOL_VERSION` KHÔNG tăng (chỉ THÊM tin / trường tùy chọn) |
| Phát hành | **Hỏi người dùng khi xong** (không tự phát hành M8) |

## 2. Hiện trạng (đã đọc mã)
- Tông môn đã có: lập / mời / chức vụ / chat `/s` / thông báo / kho Linh thạch / kho đồ (40 ô, hạn mức Đệ tử) / giao diện tab "Kho đồ"; đã chết thì không góp được (mục 38). Mã: `shared/src/sect.ts`, `server/src/sect-store.ts`, `sect-service.ts`, `systems/sect.ts`, client `sect-vault.ts` + `ui.ts`.
- **Chưa có** cống hiến / cấp / buff / nhiệm vụ / cửa hàng tông. Chưa có đường nào để "tiêu" thứ gì ở tông ngoài rút kho.
- Quy mô thật: **1 tông môn, 2 thành viên** (bản chạy thật 16/11/2026). Thiết kế phải với tới được bằng ít người, không bắt buộc đông.
- Điểm gắn đã đọc: `gainExp` (tu vi, đã có `testExpMult` nhân sau cùng), `rollDrops` ở `shared/src/items.ts` + `dropLoot` (chủ đồ nhận), `regen` ở `systems/progression.ts`, `payReward` ở `systems/dungeon.ts`, bộ máy nhiệm vụ `systems/quests.ts` (`bump`, `QuestStep`), `dayKey` ở `shared/src/quests.ts`.

## 3. Phạm vi
**Trong:** mục 12 của thiết kế: ba con số (cống hiến / công tích / điểm tông), cấp tông 5 bậc kéo theo chỗ thành viên + Trưởng lão + ô kho, buff trực tuyến (tu vi / rơi đồ / hồi phục), 3 nhiệm vụ tông mỗi ngày (theo bậc người nhận), cửa hàng đổi cống hiến, nguồn kiếm (nhiệm vụ, góp kho, bí cảnh cùng đồng môn), chống lạm dụng bằng trần theo ngày + chờ sang ngày + mất cống hiến khi rời tông.
**Ngoài:** chiến tranh / đấu giữa các tông môn, bảng xếp hạng, đất / nhà riêng của tông môn, tự chuyển quyền Tông chủ, nhiều tông môn một người, xin gia nhập từ ngoài.

## 4. Chia việc (mỗi dòng một issue; số issue ghi ở GitHub, nhãn `dev-x` + `m8`)
| # | Việc | Ai | Phụ thuộc | Tiêu chí xong |
|---|---|---|---|---|
| M8.1 | **Hợp đồng `shared/`**: hằng số, `SECT_LEVELS`, hàm thuần (`sectLevelOf`, `sectBuffOf`, `sectCanEarn`, `sectQuestSlots`...), kiểu `SectHallView`, tin `sectQuestAccept` / `sectQuestTurnIn` / `sectShopBuy` / `sectHall`, mã từ chối mới, `rollDrops(..., chanceMult)`, KHUNG `SECT_QUESTS` / `SECT_SHOP` (vài mục mẫu); test + đột biến; PR RIÊNG chỉ sửa `shared/` | A | thiết kế được duyệt | B và C review; `npm test` + typecheck + lint + prettier sạch |
| M8.2 | **Lưu trữ + dịch vụ**: trường mới trong `Sect` / `SectMemberRecord` (`contrib`, `merit`, `today`, `points`), `sanitizeSect` + `assertWritableSect`, ô kho 80 (đệm bản cũ), `SectService.award` / mua / lên cấp, bộ kiểm chung `store-contract` (file + PostgreSQL), đổi `vaultBusy` -> `busy` | A | M8.1 | bất biến thiết kế 12.2 giữ; đột biến đỏ; bản ghi cũ đọc được |
| M8.3 | **Nguồn kiếm + buff**: góp kho -> cống hiến, hook bí cảnh, `PlayerCtrl.sectBuff` + ba điểm gắn (`gainExp`, `rollDrops`, `regen`), cấp / buff cập nhật khi vào / lên cấp / rời | A | M8.2 | mỗi nguồn có trần; buff đúng thứ tự; bench 0,0% |
| M8.4 | **Nhiệm vụ tông hằng ngày** (nhận / trả qua bảng, dùng lại bộ máy nhiệm vụ) | A | M8.2, nội dung M8.7 | chống làm lại qua đầu thai / nhảy tông |
| M8.5 | **Cửa hàng tông** (mua trọn vẹn hoặc không gì cả, hạn mức ngày, khoá theo cấp) | A | M8.2, nội dung M8.7 | thứ tự trừ -> cộng -> lưu chỉ MẤT, không nhân đôi |
| M8.6 | **Giao diện**: tab "Nội vụ" (cấp tông + thanh điểm, cống hiến / công tích của mình, 3 nhiệm vụ hôm nay, cửa hàng, buff, dòng "ngày mai mới kiếm được"), danh sách thành viên hiện công tích, hộp xác nhận rời tông (kèm số cống hiến sẽ mất), toast từ chối bằng chữ; kho 80 ô (ô khoá vẽ mờ) | B | M8.1 (dùng dữ liệu giả trước), ghép M8.3-M8.5 | ảnh 5 khung nhìn, script Chrome thật, bàn phím + cảm ứng |
| M8.7 | **Nội dung + mô phỏng**: `SECT_QUESTS` (>= 12 mẫu x 4 bậc), `SECT_SHOP` (5 nhóm hàng, giá, cấp mở; kinh quyển + đồ hiếm), tên 5 cấp, lời thoại / mô tả; mở rộng `npm run can-bang -w server` (mục tông môn), `docs/CAN_BANG.md`; ghi nguồn `NGUON_NOI_DUNG.md` | D | M8.1 (khung), bắt đầu phần mô phỏng ngân sách ngay từ thiết kế | các bất biến giá / trần mục 12.6 + 12.11 qua test dữ liệu; A review, B / C xem phần `shared/` |
| M8.8 | **Kiểm kinh tế đồng thời (fuzz, đột biến)**: mục 12.11 (1)-(2) như `sect-crash.test.ts` / K5 | D | M8.2-M8.5 | tổng cống hiến mỗi linh hồn mỗi ngày <= trần; không nhân đôi qua sập; đột biến đỏ |
| M8.9 | **Công cụ**: `kiem-save` kiểm bất biến 12.2, bot kiếm / chi cống hiến (đua nhiều bot, nhảy tông, rớt mạng), thử tải N tông môn, đo bench, `LOAD_TEST.md` | C | M8.2 trở đi | `kiem-save` sạch trên dữ liệu thật; không rò rỉ; bench 0,0% |
| M8.10 | **Nghiệm thu tổng hợp**: E2E hai tab (lập -> mời -> sang ngày -> nhiệm vụ -> lên cấp -> buff -> mua -> rời), ảnh, CHANGELOG, hỏi người dùng phát hành | A (+ B, C) | tất cả | người dùng đồng ý phát hành |

**Thứ tự:** M8.1 trước hết (một PR nhỏ, hợp đồng) -> M8.2 -> (M8.3, M8.4, M8.5 máy chủ; M8.6 giao diện bằng dữ liệu giả; M8.7 nội dung; M8.9 công cụ) song song -> M8.8 -> M8.10. D có thể làm ngay phần mô phỏng ngân sách của M8.7 (chỉ đọc `ITEM_VALUE`, `CAN_BANG.md`) trước khi có hợp đồng.

## 5. Kiểm thử và cân bằng (bắt buộc, giống kho đồ)
- Mọi tính năng server mới có test; thao tác thu / chi mới có **đột biến** (đổi hành vi, test phải ĐỎ rồi khôi phục).
- **Chống sinh tiền / nhân đôi:** fuzz kinh tế có seed (M8.8); mục tiêu "mỗi linh hồn kiếm <= `SECT_EARN_DAY_CAP` cống hiến mỗi ngày trên MỌI tông môn gộp lại" là bất biến phải kiểm.
- **Cân bằng (D mô phỏng):** nhịp lên cấp theo số người tích cực, giá trị hàng mua được mỗi ngày so thu nhập từng bậc (`CAN_BANG.md`), buff không đổi nhịp lên bậc quá 5%, không vòng Linh thạch -> cống hiến -> hàng -> bán lại có lời.
- Hiệu năng: không việc mỗi tick; `perf.test.ts` + `npm run bench -w server` giữ mốc (0,0%); nếu đụng vòng tick thì dán bảng trước / sau vào PR.
- Mỗi PR: chạy TOÀN BỘ `npm test` + `npm run typecheck` + `npm run lint` + `npx prettier --check .` (Definition of Done ở `docs/PHAN_CONG.md`).

## 6. Rủi ro
| Rủi ro | Cách giảm |
|---|---|
| Cống hiến thành đường sinh tiền (góp - rút vòng, nhảy tông, đầu thai giữa ngày) | Mọi nguồn qua MỘT hàm `award`; trần theo ngày; chờ sang ngày mới kiếm; mất khi rời tông; fuzz M8.8 |
| Đổi `Sect` làm hỏng tông môn đang chạy | Trường mới đều TÙY CHỌN khi đọc; cấp 1 giữ đúng giới hạn hiện có; kho 40 ô đệm lên 80; `kiem-save` trên dữ liệu thật trước khi phát hành |
| Buff làm lệch cân bằng | Trần cứng cho từng loại; D mô phỏng; ngân sách tu vi <= +5% |
| Quy mô nhỏ (1 tông / 2 người) làm cấp cao thành "không bao giờ tới" | Bảng cấp tính theo ít người (mục 12.4); D kiểm số ngày lên cấp ở 1 / 2 / 3 / 5 / 10 người |
| Đụng nhiều chỗ chung (`gainExp`, `rollDrops`, `payReward`) | Mỗi điểm gắn một chỗ, có test đột biến; `rollDrops` mặc định `chanceMult = 1` nên bench không đổi |
| Giao diện quá tải trên điện thoại (bảng Tông môn đã có nhiều tab) | B ra ảnh 5 khung nhìn; tab "Nội vụ" tách riêng, danh sách cuộn |

## 7. Câu hỏi cho người dùng (KHÔNG chặn; A đã chọn mặc định, đổi được; chi tiết `THIET_KE_TONG_MON.md` mục 12.13)
1. Rời / bị mời ra tông MẤT cống hiến + công tích (mặc định). 2. Thành viên mới / Tông chủ mới lập chờ sang ngày mới kiếm được cống hiến (mặc định). 3. Trần 140 cống hiến / ngày; neo 1 cống hiến = 5 Linh thạch (D chỉnh). 4. Buff tối đa +5% tu vi / +5% rơi / +15% hồi. 5. Kinh quyển `rarity` cao ở cấp 4-5 có hay không (mặc định có, 1 quyển / ngày). 6. Bảng xếp hạng tông môn: hỏi khi M8 xong. 7. Chiến tranh tông môn: để sau.
