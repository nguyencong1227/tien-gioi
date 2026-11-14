# Phân công M7: CHIỀU SÂU CHIẾN ĐẤU + ĐỒ ĐẠC + NGUYÊN ANH + BẢN ĐỒ THỨ TƯ (người dùng duyệt 14/11/2026)

> Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục **17.1 / 17.4 / 18** (người dùng duyệt hướng, không cần duyệt lại). Dựa trên `main` `942b843` (sau v0.2.0) và `docs/CAN_BANG.md`. Mọi con số trong tài liệu này là **đề xuất của Dev A**; số cuối cùng do mô hình cân bằng (M7.9) quyết và ghi vào `docs/CAN_BANG.md`. Tên chiêu / quái / đồ là **gợi ý**, được đổi trước khi vào `main` (đổi tên sau khi vào tệp lưu thì đắt).

## 1. Quyết định đã chốt và ràng buộc
| Điều | Quyết định |
|---|---|
| Hướng | M7 = **chiều sâu chiến đấu** (chiêu thức học được, quái có hành vi khác nhau) + **đồ đạc** (ô trang bị mới, pháp bảo, độ hiếm) + **cảnh giới Nguyên Anh** + **bản đồ thứ tư** (phương án A: một phòng Colyseus, cổng từ bản đồ thứ ba) |
| Trước M7 | **v0.2.1** (đã được đồng ý phát hành): phím J K L U I O + bản đồ lớn / nhỏ làm lại (issue #495, #496, milestone "v0.2.1"). L U I O để TRỐNG chờ M7 |
| Nguồn ý tưởng | Game "Vạn Kiếp Tu Tiên" (bản clone chỉ đọc `~/TT/van-kiep-tu-tien-clone`). **Chỉ lấy ý tưởng và cơ chế** (mục 4); tự đặt tên, tự viết mô tả; **không chép chữ, tên, số liệu, hình, âm thanh** (AGENTS.md mục Asset + `QUYET_DINH_M3.md` mục 8.4). Có bước kiểm trùng (mục 4) |
| Ảnh AI | **SDXL base được đưa vào game** (mục 18.3), ghi nguồn từng ảnh (model, prompt, seed, ngày, ai chỉnh); không model / LoRA khác; chỉ 127.0.0.1, giới hạn RAM, tự tắt, tệp trên `/mnt/data`; không chữ Hán / chữ lạ; không bắt chước phong cách hay nhân vật của game khác. Cần sửa mục Asset của `AGENTS.md` (M7.12) |
| Người làm | **A + B** đồ hoạ / client; **C** bot / mô phỏng / thử tải / hiệu năng / cân bằng bằng số. **Phát hành M7 (v0.3.0): hỏi người dùng khi xong** |
| Giữ nguyên | "Server quyết định mọi kết quả"; luật luân hồi / bí cảnh / PK / tông môn đã chốt; ràng buộc M5-M6 (Android tầm trung ≥ 50 FPS, ngân sách CI, tick < 10 ms, byte / tick mỗi client < 520, bố cục điện thoại / máy tính, mục bấm ≥ 44 px, KHÔNG chữ Hán); chơi hoàn toàn bằng bàn phím (mục 13) |
| Hợp đồng `shared/` | PR RIÊNG, chỉ sửa `shared/`, người khác review; `PROTOCOL_VERSION` 2 -> **3** ở PR hợp đồng đầu tiên đổi giao thức; `MIN_PROTOCOL_VERSION=3` lúc phát hành (client / APK 0.2.x nhận "có bản mới") |
| Việc tay người dùng | (thử điện thoại thật, keystore, email Play, sao lưu ra ngoài) HOÃN, không chờ (mục 18.4) |

## 2. Hiện trạng (đã đọc mã, số lấy từ `main`)
- **Chiêu**: chỉ `slash` (Kiếm chém: quạt 64 px, hồi 400 ms, `mult` 1,0) và `sword` (Kiếm khí: tia 260 px, hồi 1500 ms, 8 linh lực, `mult` 1,8) trong `shared/src/game.ts` (`SKILLS`) + Đả tọa. Ai cũng có đủ. Sát thương: `rollDamage` (`systems/damage.ts`): `atk x mult x [0,9..1,1]`, bạo kích cố định 10% x 1,8. **Không có hệ, không có trạng thái (độc, đốt, choáng, làm chậm), không có công pháp học được.**
- **Quái**: `MonsterKind` (`game.ts`) có `aggro`, `attackRange`, `attackCd`, `speed`, `radius`; AI duy nhất là **cận chiến** (`systems/monsters.ts`: đuổi, đứng đánh khi `d <= attackRange + PLAYER_RADIUS`). Có `boss` (Xích Mãng, Hắc Giao, Yêu Vương bí cảnh). 10 loài thường + trùm. Không có tầm xa, lao tới, độc, tinh anh, báo trước đòn (telegraph).
- **Đồ**: 3 ô (`weapon`, `robe`, `talisman`), `EquipStats` chỉ có `atk`, `hp`, `mp`, `speed`; độ hiếm `Rarity` 0-4 có tên / màu nhưng đồ chỉ khác nhau ở id (không có dòng phụ ngẫu nhiên: túi đồ lưu `{id, count}`). 18 trang bị = 6 bộ (kiếm / bào / phù), 5 đan, 8 nguyên liệu.
- **Cảnh giới**: `REALMS` có 10, nội dung dừng ở Kim Đan (bậc 13-15). Thanh Nguyên Anh = Kim Đan x6 (`REALM_EXP_MULT_AFTER`): 288000 sơ kỳ rồi x1,1 / x1,15 (`REALM_TIER_GROWTH`). `statsFor` đã tính được bậc 16-18. `MEDITATE.secPerBar` cũng tự nhân x6.
- **Bản đồ**: 3 ngoài (Lạc Hà 96x96, Hắc Phong 128x96, Âm Sương 128x112) nối thành chuỗi một chiều (Âm Sương chưa có cổng bắc) + bí cảnh Linh Hư (trần bậc 12). Ô địa hình chỉ có 8 loại (`T`), không có tuyết / băng: bản đồ thứ tư tạo "dáng" bằng `MAP_STYLES` (bảng màu, sương, thời tiết, trang trí), không thêm loại ô.
- **Chân linh**: `Soul.unlocks.khac` đã chừa chỗ, bảng Hoàng Tuyền ghi "sắp có" (`THIET_KE_LUAN_HOI.md` mục 6). M3 hoãn "khắc chân linh" vì chưa có gì để khắc: **M7 làm.**
- **Phím**: sau v0.2.1: J chém, K Kiếm khí, L U I O bốn ô trống (chỉ hiện mờ).
- **Hiệu năng hiện có** (`docs/LOAD_TEST.md`): 150 người trên ba bản đồ tick TB 1,5 ms; 100 người săn quái 213 byte / tick mỗi client, crowd 484; ngân sách tick < 10 ms, < 520 byte / tick, crowd < 600.

## 3. Phạm vi M7
**Trong phạm vi:** (1) hệ công pháp / chiêu thức + hệ (ngũ hành) + trạng thái; (2) quái hành vi mới + tinh anh + báo trước đòn, áp lên cả quái cũ; (3) ba ô trang bị mới + chỉ số mới + pháp bảo + sách công pháp + độ hiếm; (4) khắc chân linh; (5) Nguyên Anh (bậc 16-18) + bản đồ thứ tư + quái / trùm / nhiệm vụ / bộ đồ IV; (6) đồ hoạ + hiệu ứng + giao diện cho tất cả; (7) mô phỏng + bot + bench + cân bằng; (8) ảnh AI SDXL (ảnh minh hoạ lớn); (9) **nghề chế tạo mức nhỏ** (luyện đan, chế phù) là việc CUỐI, chỉ làm nếu hết việc hơn (M7.13).

**Ngoài phạm vi (M8 hoặc hỏi người dùng):** Hoá Thần trở lên; bí cảnh thứ hai; dòng phụ ngẫu nhiên theo từng món đồ (cần túi đồ lưu thể hiện riêng từng món, đổi định dạng túi / loot / lưu); trận pháp; ngự thú; chợ / đấu giá; iOS; mọi việc phát hành ngoài mục 1.

## 4. Nguồn ý tưởng và ranh giới
**Đã đọc** (chỉ cấu trúc, không chép): bản clone tổ chức nội dung thành công pháp theo phẩm cấp và hệ ngũ hành, mỗi công pháp / pháp khí dạy một "chiêu" có kiểu, uy lực, hồi chiêu; quái có danh sách chiêu riêng và hệ; nghề chế tạo gồm luyện đan, luyện khí (bảo), chế phù, trận pháp có công thức và dụng cụ; đồ chia theo phẩm cấp 1-8. Đó là **ý tưởng chung của thể loại tu tiên**, tự viết lại theo luật Tiên Giới.

**Ý tưởng lấy (và cách Tiên Giới làm khác, của riêng mình):**
| Ý tưởng | Cách làm ở Tiên Giới |
|---|---|
| Công pháp theo hệ, dạy chiêu | **Kinh quyển** (vật phẩm sách) dạy MỘT chiêu có hệ; học bằng cách dùng sách; học thêm quyển trùng thì tăng "tầng" (tối đa 3). Chiêu gắn vào ô L U I O (chiến đấu thời gian thực, không theo lượt) |
| Hệ khắc nhau | Ngũ hành tương khắc (kim > mộc > thổ > thủy > hỏa > kim) làm hệ số sát thương x1,3 / x0,8 giữa chiêu và quái (ngũ hành là kiến thức chung, không phải của riêng game nào) |
| Quái có chiêu riêng | Mỗi loài có HÀNH VI (tầm xa, lao tới, độc, tinh anh, đòn báo trước) hiện được trên màn chơi, thay vì chỉ bảng chiêu |
| Pháp khí / pháp bảo | Ô **pháp bảo** có nội tại đặc biệt (không phải thêm ô kỹ năng) |
| Nghề Đan / Khí / Phù | Giữ "rèn" hiện có; thêm luyện đan và chế phù ở mức nhỏ (M7.13, cuối) |
| Phẩm cấp đồ | Dùng `Rarity` 0-4 đã có (phàm / linh / bảo / tiên / thần), không chép thang 8 bậc |

**Quy tắc đặt tên (bắt buộc):** tên chiêu, quái, đồ, NPC, địa danh do Dev A / B / C TỰ ĐẶT theo thế giới Tiên Giới (Lạc Hà, Hắc Phong, Âm Sương, ...); mô tả TỰ VIẾT; không dùng tên riêng, số liệu, hay câu chữ từ bản clone (kể cả tên chiêu / vật phẩm nghe quen). **Kiểm trùng:** trước khi merge PR nội dung, A chạy một lệnh kiểm chuỗi tên / mô tả mới có trùng nguyên văn (4 từ liên tiếp trở lên, hoặc cả tên) với `~/TT/van-kiep-tu-tien-clone/site/assets/content-*.json` hay không (chỉ đọc, đường dẫn đặt bằng biến môi trường, KHÔNG chạy trong CI vì máy CI không có thư mục đó; kết quả ghi vào mô tả PR). Trùng thì đổi tên. Không ảnh / âm thanh / phông của bản clone, kể cả để tham khảo trong repo.

**Kiểm trùng đợt 1 (A, 14/11, trên 5044 tên trong `content-*.json`):** 24 tên gợi ý của tài liệu này (chiêu, bản đồ, quái, trùm, tên loại đồ); 1 trùng cụm "Hồi Xuân" (đã đổi thành Dưỡng Mộc Quyết); các thuật ngữ chung của thể loại (pháp bảo, ngọc bội) giữ vì là từ vựng thường, không phải tên riêng của game nào. Mọi tên mới thêm sau này phải qua bước này.

## 5. Thiết kế chiến đấu

### 5.1 Ô chiêu và công pháp
- **Ô:** J = ô 1 Kiếm chém, K = ô 2 Kiếm khí (cố định, ai cũng có), **L U I O = ô 3-6 học được**. Ô mở theo cảnh giới (đề xuất, cân bằng kiểm): L từ Luyện Khí, U từ Trúc Cơ, I từ Kim Đan, O từ Nguyên Anh. Ô chưa mở hiện khoá + ghi cảnh giới mở.
- **Kinh quyển** (`ItemType` mới `"book"`, `ItemDef.teaches: skillId`): dùng quyển = học chiêu (quyển mất đi). Đã học rồi mà dùng quyển trùng = +1 tầng (tối đa 3: +15% sát thương và -8% hồi chiêu mỗi tầng, đề xuất). Yêu cầu cảnh giới tối thiểu ghi trên quyển. Nguồn quyển: rơi từ quái (hiếm), bán ở NPC (chiêu cơ bản, tốn Linh thạch), thưởng nhiệm vụ, rơi trùm (cao cấp).
- **Gắn ô:** `skillSlot {slot, skillId}` (client đề nghị, server kiểm đã học + ô đã mở). Mỗi chiêu một ô. Bấm L / U / I / O (hoặc nút cảm ứng) gửi `cast {slot, angle}`; server kiểm hồi chiêu, linh lực, đang ở trạng thái cho phép (không đang chết, đang đả tọa thì ngắt đả tọa như Kiếm khí hiện nay).
- **Dữ liệu riêng** (chỉ gửi cho chủ, không vào state chung): chiêu đã học + tầng, gắn ô, hồi chiêu còn lại. Lưu trong hồ sơ nhân vật (`Character.skills`), nạp qua hàm làm sạch (`sanitizeSkills`: id lạ bỏ, tầng kẹp 1-3, ô chưa mở bị gỡ).
- **Khắc chân linh:** ở Hoàng Tuyền, tốn Duyên, **giữ lại 1 / 2 / 3 công pháp qua kiếp** (nấc mở bằng `Soul.unlocks.khac`, giá là đề xuất 40 / 100 / 220 Duyên, cân bằng chốt ở M7.9). Kiếp mới bắt đầu với chiêu đã khắc (tầng giữ nguyên), vẫn phải đủ cảnh giới / mở ô mới dùng được. `Soul` chừa chỗ lưu danh sách khắc (`Soul.engraved`), nạp qua hàm làm sạch.

### 5.2 Hệ (ngũ hành) và sát thương
- `Element = "kim" | "moc" | "thuy" | "hoa" | "tho" | "none"`. Chiêu và quái có hệ (`none` = không khắc không bị khắc). `elementMult(skillEl, monsterEl)`: khắc **x1,3**, bị khắc **x0,8**, còn lại x1. Một hàm duy nhất trong `shared/`, client hiển thị đúng số server tính.
- Chiêu cơ bản Kiếm chém / Kiếm khí là `none`. Đòn của quái lên người chơi KHÔNG tính hệ ở M7 (không nhân hệ số, tránh nổ số), chỉ trạng thái.
- Bạo kích hiện cố định 10% x 1,8: trang bị mới thêm `crit` (cộng điểm bạo kích, tối đa 40%).

### 5.3 Chiêu mẫu đợt 1 (gợi ý, 12 chiêu: 2 mỗi hệ + 2 vô hệ; B / A đặt tên cuối)
| Chiêu (gợi ý) | Hệ | Kiểu | Ý |
|---|---|---|---|
| Phá Quang Tiễn | kim | tia xuyên | tia dài, xuyên quái, sát thương cao, hồi chiêu dài |
| Trảm Phong Bộ | kim | lao tới | lao 160 px chém mọi thứ trên đường (cũng để thoát vây) |
| Thanh Mộc Bạo | mộc | vòng quanh mình | vòng nhỏ, đẩy lùi nhẹ |
| Dưỡng Mộc Quyết | mộc | tự hồi | hồi 25% khí huyết trong 4 giây, tốn linh lực nhiều |
| Hàn Tuyền Tiễn | thủy | tia xa | tia mảnh, làm chậm 35% trong 3 giây |
| Lưu Vân Hộ | thủy | hộ thể | khiên hấp thụ sát thương bằng 20% khí huyết tối đa trong 5 giây |
| Liệt Diễm Ấn | hỏa | vòng quanh mình | vòng, đốt: sát thương theo giây trong 3 giây |
| Hoả Long Quyết | hỏa | quạt xa | quạt rộng, đốt, tiêu linh lực nhiều |
| Địa Chấn Thuật | thổ | vùng tại chỗ | vòng dưới chân, làm choáng quái thường 0,8 giây (trùm miễn) |
| Kiên Nham Giáp | thổ | hộ thể | giảm 30% sát thương nhận trong 4 giây |
| Ngự Phong Bộ | none | tăng tốc | +40% tốc độ chạy 5 giây |
| Tụ Khí Quyết | none | hồi linh lực | hồi 30% linh lực trong 4 giây, hồi chiêu dài |

Đợt 1 chỉ cần ĐỦ để đo cân bằng và dựng giao diện; đợt 2 (cùng M7) thêm chiêu cao cấp cho Kim Đan / Nguyên Anh. Mỗi chiêu: `cooldown`, `mp`, `range`, `shape` (`cone` / `line` / `nova` / `dash` / `ground` / `self`), `mult`, `element`, `effects[]`, `reqRealm / reqTier`, `fx` (kiểu hiệu ứng client). Dữ liệu thuần ở `shared/src/skills.ts`.

### 5.4 Trạng thái
Sáu trạng thái: `burn` (đốt: sát thương theo giây), `poison` (độc: sát thương theo giây nhỏ + giảm hồi máu), `slow`, `stun` (choáng ngắn, trùm miễn, tối đa 1,2 giây, không lặp liền nhau trên cùng mục tiêu: miễn choáng 3 giây sau khi hết), `shield` (khiên), `haste` (tăng tốc). Quy tắc: cùng loại thì LÀM MỚI chứ không cộng dồn; mỗi mục tiêu tối đa 4 trạng thái; hết hạn theo thời gian server. Dữ liệu trạng thái là của `PlayerCtrl` / `MonsterCtrl` (riêng của server); người chơi chủ nhận danh sách qua tin nhắn (ghi định kỳ, không mỗi tick); quái chỉ có MỘT byte công khai `Monster.fx` (mặt nạ bit các trạng thái đang có, đổi hiếm) để client đổi màu / biểu tượng. Trạng thái trong **PK thách đấu**: choáng bị gỡ, các thứ khác dùng như thường (đề xuất, hỏi người dùng nếu muốn khác).

## 6. Quái hành vi mới
`MonsterKind.behavior`: `melee` (hiện có, mặc định), `ranged` (đứng xa bắn), `charger` (đứng báo trước rồi lao thẳng), `poisoner` (đòn gây độc), cùng cờ `elite` ở lúc sinh. Thêm `MonsterKind.element`.

- **Báo trước đòn (telegraph)**: mọi đòn mạnh của quái (lao tới, đập đất của trùm) có thời gian gồng (`windupMs`, 600-1200 ms) và gửi `fx {kind: "warn", shape, x, y, r | angle, ms}` bằng `sendNear` cho người trong vùng nhìn; người chơi tránh được bằng cách di chuyển ra khỏi vùng khi hết `ms`. Server là nơi tính trúng (vị trí người chơi lúc đòn đáp), không tin client.
- **Quái tầm xa**: đạn KHÔNG là thực thể trong state. Server giữ danh sách đạn riêng (`World.bolts`, tối đa `MAX_BOLTS`), mỗi đạn có điểm đi, hướng, tốc độ, hạn bay; mỗi tick server di chuyển đạn và kiểm trúng người chơi; client chỉ nhận MỘT `fx {kind: "bolt", ...}` lúc bắn (`sendNear`) và tự vẽ đạn bay theo tốc độ / hướng. Đạn dừng ở ô chặn. (Tiết kiệm băng thông: không patch state mỗi tick.)
- **Tinh anh (`elite`)**: mỗi lần quái thường sinh có xác suất hiếm (đề xuất 4%) thành tinh anh: khí huyết x2,5, công x1,5, tên có tiền tố, viền / sao trên đầu, rơi đồ tốt hơn (độ hiếm +1, xác suất rơi quyển cao), tu vi x2. `Monster.elite` (uint8) là trường công khai đặt MỘT lần lúc sinh. Tối đa số tinh anh đồng thời theo bản đồ (đề xuất 3).
- **Áp lên cả quái cũ** (để dùng ở cả bản đồ cũ lẫn mới; số cuối do M7.9): Hôi Lang = `charger`; Hắc Hổ = `charger` + chảy máu nhẹ (dùng `poison`); Sương Hồ = `ranged`, Độc Thiềm = `poisoner` + `ranged`, Thạch Quy giữ cận chiến chậm (đập đất báo trước); Linh Thố giữ nguyên (quái hiền); Xích Mãng = đập đuôi báo trước; Hắc Giao = đập đất vòng + lao. Mỗi loài giữ `level` / `exp` hiện tại ở bước đầu rồi M7.9 hiệu chỉnh.
- **Hiệu năng**: không vòng lặp lồng nhau người chơi x quái (dùng lưới không gian có sẵn); đạn tối đa `MAX_BOLTS` (đề xuất 64 mỗi phòng), tin `fx` chỉ `sendNear`; `perf.test.ts` thêm kịch bản "đông quái tầm xa + chiêu" (M7.10).

## 7. Đồ đạc
- **Ba ô mới** (`EquipSlot` thêm): `boots` (Hài: tốc độ, né), `jade` (Ngọc bội: khí huyết / linh lực), `treasure` (Pháp bảo, mở từ Kim Đan). Ba ô mới là **trường riêng của chủ** (không công khai: không ảnh hưởng ngoại hình, tiết kiệm băng thông); ba ô cũ giữ công khai.
- **Chỉ số mới** (`EquipStats`): `crit` (điểm bạo kích, %), `cdr` (giảm hồi chiêu, % tối đa 30), `guard` (giảm sát thương nhận, % tối đa 40). Mọi trần ở `shared/` để cân bằng kiểm được.
- **Pháp bảo** (`ItemDef.equip.treasure`): MỘT nội tại đặc biệt từ danh sách nhỏ (đề xuất 6): khiên tự dựng mỗi 10 giây; hạ quái hồi 3% linh lực; +15% sát thương cho một hệ; hồi 1% khí huyết / giây khi đứng yên; ... Thực thi ở server (`systems/treasure.ts`), có test.
- **Bộ Nguyên Anh (IV)**: 3 bậc (sơ / trung / hậu kỳ) x các ô (kiếm / bào / phù + hài + ngọc bội), độ hiếm 2-4; **rèn có phí** như bộ Kim Đan. Đồ rơi từ quái / trùm / tinh anh theo bảng rơi có trọng số độ hiếm.
- **Độ hiếm**: `Rarity` đã có; M7 chỉ đảm bảo nó THỰC SỰ phân biệt (số chỉ số, nguồn rơi, giá) và hiện đúng màu / viền trên mọi bảng. Dòng phụ ngẫu nhiên từng món: ngoài phạm vi (mục 3).
- **Nghề (M7.13, cuối, tuỳ)**: thêm hai "bàn chế" ở NPC: luyện đan (đan cấp 3, đan tăng cường chiêu có thời hạn) và chế phù (phù chú dùng một lần: tăng sát thương một hệ / giảm hồi chiêu trong 60 giây); dùng đúng cơ chế công thức + phí Linh thạch hiện có, không có "độ thành thạo nghề" ở M7.

## 8. Nguyên Anh và bản đồ thứ tư
- **Nguyên Anh** (bậc 16-18, `realm` 4): `REALMS` đã có tên và 3 kỳ; thanh tu vi tự tính (288000 sơ kỳ). M7 thêm nội dung: quái cấp 16-18, trùm cấp 21, bộ đồ IV, đan cấp 3, nhiệm vụ nối Kim Đan sang Nguyên Anh (dùng bốn loại bước hiện có: kill / collect / talk / reachRealm), đột phá Kim Đan -> Nguyên Anh có tỉ lệ riêng (`breakthroughChance`, cân bằng chốt ở M7.9).
- **Bản đồ thứ tư** (gợi ý **"Hàn Vân Lĩnh"**, `han_van`, 128x128 ô; trạm an toàn "Hàn Vân Trạm" sát cổng nam): một phòng Colyseus như ba bản đồ ngoài. Cần **cổng bắc mới ở Âm Sương** (`am_suong_bac` <-> `han_van_nam`): đổi `MapDef` của Âm Sương (đường đất tới rìa bắc; hạt giống chọn bằng quét như `am_suong` đã làm, kiểm liên thông / sức chứa quái) và bản đồ Âm Sương đổi sinh ô thì tệp lưu giữ vị trí bị ảnh hưởng: **KHÔNG đổi seed của bản đồ có sẵn**; thêm cổng bằng cách chọn vị trí trên đường đất đã có, hoặc, nếu phải đổi địa hình, ghi rõ trong PR + kiểm `kiem-save` (không nhân vật nào đứng trong ô thành chặn). Dạng bản đồ "băng nguyên" làm bằng `MAP_STYLES.han_van` (màu lạnh, sương, hạt tuyết) và trang trí, KHÔNG thêm loại ô.
- **Quái (gợi ý):** Hàn Lang (thủy, `charger`, cấp 16), Phong Nha (kim, `ranged`, cấp 17), Cốt Tượng (thổ, đập đất báo trước, cấp 17), Độc Tước (mộc, `poisoner` + `ranged`, cấp 18) và **trùm "Thiên Hàn Vương"** (thủy, đập đất + lao + vòng lạnh, bãi của đội 3-4 người, cấp 21). Tổng `monsterCap` ≤ ~70 (như Hắc Phong 62, Âm Sương 62).
- **NPC / nhiệm vụ:** 3 NPC ở Hàn Vân Trạm (trạm trưởng, lái buôn đan cấp 3 + quyển Nguyên Anh, thợ rèn bộ IV); chuỗi nhiệm vụ chính ~6 + lặp 2-3.
- **Bí cảnh Linh Hư**: trần bậc 12 (từ M6) giữ nguyên; bí cảnh thứ hai ngoài phạm vi.

## 9. Đồ hoạ (A + B)
- **Chia:** A sinh bằng mã (`client/scripts/gen-assets.mjs`, CC0 tự vẽ) sprite quái mới + tinh anh + trùm, biểu tượng đồ / quyển / ô trang bị, atlas; **B** làm hiệu ứng (FX từng chiêu, báo trước đòn, đạn, biểu tượng trạng thái, rung / làm mờ), thanh chiêu 6 ô, bảng Công pháp, bảng nhân vật 6 ô, bản đồ thứ tư (`MAP_STYLES.han_van`, chuyển cảnh, bản đồ nhỏ / lớn đã làm ở v0.2.1).
- **Giao diện:** thanh chiêu = 6 ô J K L U I O (mở / khoá / trống mờ / hồi chiêu quét), bố cục điện thoại: nút chiêu cảm ứng chỉ cho chiêu ĐÃ gắn (giữ giao diện gọn mục 15), bảng **Công pháp** (học, gắn ô, khắc chân linh; dùng được bằng bàn phím: mũi tên + Enter), mô tả chiêu có hệ + số thật server tính.
- **Ảnh AI (M7.12):** SDXL base (mục 18.3): minh hoạ lớn (nền đăng nhập, ảnh tải, ảnh mở đầu bản đồ thứ tư), KHÔNG làm sprite / icon (SDXL không giữ nét pixel nhỏ). Mỗi ảnh ghi nguồn trong `docs/art/nguon/<tên>.json` + `CREDITS.md`; WebP sạch siêu dữ liệu ≤ 150 KB mỗi ảnh, tổng ≤ 300 KB; `check:credits` và `check-perf-budget` mở rộng bắt ảnh thiếu nguồn / quá nặng TRƯỚC khi có ảnh nào vào `client/public/` (kế hoạch `docs/KE_HOACH_DO_HOA_AI.md` mục 9). `AGENTS.md` mục Asset sửa theo mục 18.3 (PR riêng, B review).

## 10. Mục tiêu cân bằng và hiệu năng (đề xuất, chốt ở M7.9)
| Chỉ tiêu | Mục tiêu | Cơ sở |
|---|---|---|
| Sức mạnh chiêu | người chơi dùng chiêu và hệ khắc đúng đạt **1,3-1,6x** sát thương / giây so với chỉ chém + Kiếm khí; không chiêu nào đạt > 2x | tránh một chiêu "tốt nhất" bỏ mọi thứ khác |
| Kinh tế linh lực | duy trì được ≥ 60% thời gian dùng chiêu bằng hồi linh lực + đan; hết linh lực vẫn chém được | Kiếm chém không tốn linh lực |
| Nhịp Nguyên Anh | cả cảnh giới **~6-9 giờ** (solo, kể cả nhiệm vụ), không bãi nào > ~1,5x bãi đúng bậc; Linh thạch / giờ không lệch quá ~2x | tiêu chí M6 (`CAN_BANG.md` mục 10) |
| Trùm Thiên Hàn Vương | đội 3-4 người hạ được, không ai chết ở ca mô phỏng khó; một người vẫn khó hơn rõ rệt (có chiêu / đan thì được, không bị khoá cứng) | `CAN_BANG.md` mục 9 |
| Quái mới | thời gian hạ một con ở cấp đúng bậc 6-15 giây (có chiêu); tinh anh ~3-4x | đo bằng thợ săn trong `World` thật |
| Hiệu năng | tick < 10 ms ở 150 người trên 4 bản đồ; byte / tick mỗi client < 520 (săn), crowd < 600; đạn / trạng thái không thêm trường state nào đổi mỗi tick; Android tầm trung ≥ 50 FPS | `perf.test.ts`, `perf-budget.json` |
| Mô hình vs thật | lệch giữa mô hình và bot ≤ ~25% | công cụ của C |
| Luân hồi | Duyên / giờ không lệch quá 1,3x giữa các mốc; khắc chân linh không làm kiếp 2 vượt ~2,0x kiếp 1 | `THIET_KE_LUAN_HOI.md` mục 5 |

## 11. Chia việc
Mã M7.x; issue được tạo theo bảng (số issue ghi ở cột Issue sau khi tạo). `Phụ thuộc` là thứ tự MERGE, việc không phụ thuộc làm song song.

| Mã | Việc | Ai | Phụ thuộc |
|---|---|---|---|
| M7.0 | Kế hoạch này + issue + kiểm trùng | A | — |
| M7.1 | **Hợp đồng 1 (`shared/`)**: `skills.ts` (`SkillDef`, `Element`, `elementMult`, `StatusDef`), `ItemDef.teaches` + `ItemType` "book", tin `skillSlot` / `cast` / `skills`, `MonsterKind.behavior / element / elite`, `Character.skills` + `sanitizeSkills`, `Soul.engraved`, `PROTOCOL_VERSION` 3 | A (B review) | v0.2.1 không cần; có thể bắt đầu ngay |
| M7.2 | Server chiến đấu: `systems/skills.ts` (học, ô, cast, hình, linh lực, hồi chiêu, hệ), `systems/status.ts`, khắc chân linh (`soulBuy` thêm mục), test + đột biến + red-team, bench | A | M7.1 |
| M7.3 | Server quái hành vi: ranged / charger / poisoner / tinh anh + báo trước đòn + đạn (`World.bolts`), áp lên quái cũ; hiệu năng | A | M7.1 |
| M7.4 | **Hợp đồng 2 (`shared/`)** + server: ba ô trang bị mới, chỉ số mới, pháp bảo, sách + công thức + bảng rơi cho ba bản đồ cũ, chiêu đợt 1 (12) | A (B review) | M7.1 |
| M7.5 | **Nguyên Anh + bản đồ thứ tư**: hợp đồng (`shared/`: `han_van`, cổng bắc Âm Sương, quái, NPC, nhiệm vụ, bộ IV, đan cấp 3, chiêu đợt 2) rồi server (qua cổng Âm Sương - Hàn Vân, test ba -> bốn, `kiem-save`) | A (B review) | M7.2-M7.4 (nội dung dùng chiêu / hành vi) |
| M7.6 | Client chiến đấu: thanh chiêu 6 ô, bảng Công pháp (học / gắn ô / khắc), nút cảm ứng, bàn phím | B | M7.1; M7.2 để chạy thật |
| M7.7 | Hiệu ứng: FX từng chiêu, báo trước đòn, đạn, trạng thái, sprite quái / đồ mới (A sinh sprite bằng mã, B hiệu ứng) | A + B | M7.1 |
| M7.8 | Client đồ đạc + bản đồ thứ tư: bảng nhân vật 6 ô, pháp bảo, viền độ hiếm, tooltip chỉ số mới, `MAP_STYLES.han_van`, chuyển cảnh, bản đồ nhỏ / lớn cho bản đồ thứ tư | B | M7.4, M7.5 |
| M7.9 | Mô phỏng + cân bằng: mở rộng `server/src/balance/` (chiêu, hệ, trạng thái, hành vi quái, Nguyên Anh), chốt số, viết `CAN_BANG.md` | C (A review) | M7.1 (hợp đồng); chốt số sau M7.2-M7.5 |
| M7.10 | Bot dùng chiêu / tránh báo trước, đo bằng thợ săn trong `World`, bench + soak bốn bản đồ, `perf.test.ts` thêm kịch bản chiêu + quái tầm xa, `LOAD_TEST.md` | C | M7.2, M7.3 |
| M7.11 | Hồi quy: E2E chiến đấu (cast, hồi chiêu, trạng thái), E2E qua cổng ba -> bốn, `kiem-save`, perf-gate / leak | A + B + C | M7.2-M7.8 |
| M7.12 | Ảnh AI SDXL: sửa `AGENTS.md` mục Asset (PR riêng, B review) + kiểm tự động (`check-credits`, `check-perf-budget`) + ảnh đầu tiên (nền đăng nhập) + ảnh bản đồ thứ tư | B (+ C lô ảnh, A review) | #497 (ComfyUI G1-G2) |
| M7.13 | Nghề mức nhỏ (luyện đan, chế phù) — chỉ nếu hết việc hơn | A + B | M7.4 |
| M7.14 | Phát hành v0.3.0 (hỏi người dùng khi xong): `MIN_PROTOCOL_VERSION=3`, CHANGELOG, thẻ, `prod.sh backup` rồi `up` | A | tất cả |

**Issue (milestone "M7: Chiều sâu chiến đấu + Nguyên Anh"):** M7.1 #502, M7.2 #503, M7.3 #504, M7.4 #505, M7.5 #506, M7.6 #507, M7.7 #508, M7.8 #509, M7.9 #510, M7.10 #511, M7.11 #512, M7.12 #513, M7.13 #514, M7.14 #515. Trước M7: v0.2.1 = #495 (phím), #496 (bản đồ lớn / nhỏ; bước 1 là PR #498); ComfyUI G1-G2 = #497 (PR #499).

**Thứ tự gợi ý:** v0.2.1 (B: #495 phím rồi #496 bản đồ bước 2-3; A: #498 xong; C: ComfyUI #497 và hỗ trợ E2E) -> A: M7.1 (PR hợp đồng) song song B bắt đầu thiết kế giao diện 6 ô (chưa cần server) và C bắt đầu mô hình chiêu trong `balance/` -> A: M7.2 và M7.3 (server), M7.4 (hợp đồng 2) -> M7.6-M7.8 (client) -> M7.5 (nội dung Nguyên Anh) -> M7.9-M7.11 (cân bằng / đo / hồi quy) -> M7.12 xen kẽ -> M7.14.

**Quy tắc chung:** đổi `shared/` ở PR riêng, B review; thêm tính năng server thì thêm test (đột biến cho luật quan trọng); mọi tài sản mới sinh bằng mã (CC0) hoặc ảnh AI theo mục 18.3, ghi `CREDITS.md`; đo trước / sau bằng số (bench, `perf:mobile`, `npm run can-bang -w server`); mỗi PR ghi `Closes #<số>` / `Refs #<số>`; mỗi PR nội dung kèm kết quả kiểm trùng (mục 4).

## 12. Rủi ro và câu hỏi cho người dùng (không chặn; mặc định ghi sẵn)
| Câu hỏi / rủi ro | Mặc định A làm |
|---|---|
| Ô L U I O mở theo cảnh giới (Luyện Khí / Trúc Cơ / Kim Đan / Nguyên Anh) hay mở hết từ đầu? | mở theo cảnh giới |
| Khắc chân linh giữ tối đa mấy công pháp, giá bao nhiêu Duyên? | 1 / 2 / 3 công pháp, giá 40 / 100 / 220 (M7.9 chỉnh) |
| Trạng thái trong PK thách đấu | choáng bị gỡ, còn lại như thường |
| Dòng phụ ngẫu nhiên từng món đồ (cần đổi định dạng túi) | KHÔNG làm ở M7 |
| Tên bản đồ thứ tư "Hàn Vân Lĩnh" / các loài quái | theo mục 8; đổi tên rẻ trước khi PR hợp đồng vào `main`, đắt sau |
| Nghề chế tạo | chỉ M7.13, sau cùng |
| **Rủi ro lớn nhất:** (1) nổ cân bằng (chiêu x hệ x trang bị x trạng thái): giảm bằng mô hình M7.9 trước khi chốt số, mỗi chiêu có trần sức mạnh; (2) hiệu năng (đạn / trạng thái / báo trước đòn): đạn không là state, tin `fx` chỉ `sendNear`, bench từng bước; (3) PROTOCOL 3: client / APK 0.2.x bị từ chối lúc phát hành, nhận thông báo "có bản mới" (như 0.1.x -> 0.2.0); (4) giao diện điện thoại chật: nút chiêu chỉ cho chiêu đã gắn; (5) sao chép từ nguồn tham khảo: quy tắc đặt tên + kiểm trùng mục 4; (6) khối lượng nội dung bản đồ thứ tư: đo thời gian từng bước, M7.13 là việc đầu tiên bị cắt | |
