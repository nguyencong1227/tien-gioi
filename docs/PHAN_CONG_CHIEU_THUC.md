# Phân công + thiết kế: THÊM NHIỀU CHIÊU THỨC (người dùng yêu cầu 17/11/2026)

> Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục **51** ("cần có thêm nhiều chiêu thức hơn, hiện mới có vài chiêu"). **Đợt 1: >= 30 chiêu mới (tổng >= 48); đợt 2: tổng >= 80.** Chạy SONG SONG với M9 (`docs/PHAN_CONG_M9.md`). Mọi con số là **ĐỀ XUẤT của Dev A**; D chốt bằng mô phỏng (mục 9), người dùng đổi được ở mục 11. Phát hành đợt 1 ở bản kế tiếp (người dùng đã đồng ý các bản kiểu này khi CI xanh; nếu đi cùng M9 thì hỏi khi M9 xong).

## 1. Hiện trạng (đã đọc mã, `main` sau v0.4.1)
- **18 chiêu** ở `SKILLS_M7` (`shared/src/skills.ts`): 6 `cone`, 4 `self`, 3 `line`, 2 `fan`, 2 `ground`, 1 `dash`; hệ: Thổ 4, Băng 4, Kim 3, Phong 3, Hỏa 2, Thủy 1, Mộc 1 (CHƯA có Lôi / Âm / vô sắc). Theo cảnh giới (`reqRealm`): Luyện Khí 8, Trúc Cơ 4, **Kim Đan 0 (khoảng trống)**, Nguyên Anh 6. Có 4 ô chiêu L U I O (mở theo cảnh giới), tầng 1-3 (sách trùng), khắc chân linh (`ENGRAVE_MAX` 3).
- **Bộ thực thi** (`server/src/systems/cast.ts`): MỌI hình tính NGAY trong tick dùng chiêu (`shapeHits`), không có vật thể tồn tại lâu: không đạn của người chơi, không vùng / bẫy / hào quang, không kéo / đẩy, không chiêu vận. Trạng thái (`STATUSES`, `status.ts`): đốt, độc, chảy máu, tê cóng, vỡ giáp, choáng, hộ thể, tăng tốc, hồi phục, phù (`amp_<hệ>`, `cdr_phu`), hộ đạo.
- **Kinh quyển, hiếm, giá, biểu tượng quyển được DỰNG TỰ ĐỘNG từ dữ liệu chiêu** (`shared/src/books.ts`: `SKILL_BOOK_ITEMS`, `SHOP_BOOK_IDS`): thêm một `SkillDef` là có quyển. Nguồn quyển: cửa hàng (chiêu độ hiếm <= 1), rơi quái / trùm (`DROP_TABLES`), cửa hàng tông môn (`SECT_SHOP`), nhiệm vụ.
- **Nguồn nội dung** (`~/TT/van-kiep-tu-tien-clone`, đọc bằng `content-ClG6Ha-i.json`, KHÔNG dùng bản zh): **143 công pháp có `chieu`** (`ten`, `phi` tiêu hao, `hoi` hồi, `uy` uy lực, `dang`: `cong` 86 / `khong_che` 27 / `thu` 19 / `hoi_phuc` 11; `scope`: `spread` 27 (đánh lan), `allies` 6, `all` 5; `effects`: bleed 21, poison 21, mark 11 (+ `markTriggers`: ĐÁNH DẤU rồi kích), sunder 11, burn 10, regen 9, haste 6, chill 5, empower 3, decay 3; `nap` 30 = vận khí N lượt; `dot` 23; `devour`, `ma_hoa`, `lenh`). Hệ: Mộc 23, Thổ 23, Kim 22, Hỏa 20, Thủy 15, vô sắc 13, Âm 8, Lôi 7, Phong 7, Băng 7. Cảnh giới nguồn 0-3 = 108 mục (Luyện Khí -> Nguyên Anh), 4-5 = 35 mục (cao hơn Nguyên Anh, chưa dùng). **Đã dùng 12** (`docs/NGUON_NOI_DUNG.md` mục 3, nguyên văn tên + mô tả, số chỉnh): còn ~96 mục khả dụng cho cảnh giới hiện tại => **đủ cho 80**.

## 2. Nguyên tắc (không thương lượng)
1. **Server quyết định mọi kết quả**; client chỉ gửi ô + hướng (+ ô đã chọn); thêm tin chỉ khi bắt buộc, kiểm kiểu / hữu hạn / hồi chiêu / linh lực như `cast`.
2. **Hiệu năng theo ngân sách**: tick < 10 ms (100 người + 8 trùm), byte / tick mỗi client < 520; vật thể tồn tại lâu KHÔNG nằm trong state: server giữ danh sách riêng có TRẦN, client nhận MỘT `fx` lúc dựng rồi tự vẽ (như đạn quái `World.bolts`); mức hiệu ứng "Thấp" của client giảm hạt (mục 21 QUYET_DINH_M3).
3. **PK thách đấu giữ đơn giản và cân đối**: đợt 1 chiêu BỀN (đạn / vùng / bẫy / hào quang / tượng) chỉ tác dụng lên QUÁI; chiêu tức thời (`chain`, `displace`) và đạn trúng đối thủ qua `duelHit` (không hệ khắc, không trạng thái ngoài tê cóng) như `castAtOpponent` hiện có. Choáng vẫn bị gỡ trong PK.
4. **Dữ liệu một chỗ**: kinh quyển / giá / hiếm dựng từ `SkillDef`; thêm chiêu = thêm dữ liệu + dòng nguồn (`NGUON_NOI_DUNG.md` mục 3) + test, không sửa mã chung.
5. **Nội dung**: tên + mô tả NGUYÊN VĂN từ nguồn (mục 19-20), số chỉnh cho cân bằng; không chữ Hán; không lấy nhân vật / tông phái. Chiêu GỐC của Tiên Giới (như 6 chiêu Nguyên Anh của D) vẫn được.

## 3. Hợp đồng `shared/` mới (A làm, PR RIÊNG chỉ sửa `shared/`, B hoặc C review; mọi trường mới TUỲ CHỌN nên 18 chiêu cũ không đổi)
**Hình mới** (`SkillShape` thêm; trường riêng mỗi hình):
| Hình | Ý nghĩa | Trường | Trần đề xuất |
|---|---|---|---|
| `chain` | SÉT LAN: trúng mục tiêu gần nhất trong `range` (trong `arc` nếu có), rồi nảy sang quái gần nhất CHƯA trúng trong `reach` | `bounces` (0-4), `reach` (px nhảy), `falloff` (hệ số mỗi lần nảy, mặc định 0,85) | <= 4 lần nảy, reach <= 220 |
| `bolt` | ĐẠN BAY nhiều viên (xuyên / nảy): bay thẳng theo `speed`, dừng ở ô chặn / hết tầm | `count` (1-5, toả `arc`), `speed` (px/s), `pierce` (0-3 xuyên thêm), `bounce` (0-2: gặp quái thì nảy sang quái gần nhất trong 160 px) | <= 5 viên, speed 300-700, tầm <= 560 |
| `zone` | VÙNG DUY TRÌ: đặt như `ground`, tồn tại `durationMs`, mỗi `tickMs` gây sát thương `mult` + gắn trạng thái cho quái bên trong | `durationMs` (<= 8000), `tickMs` (>= 400) | <= 3 vùng / người |
| `trap` | BẪY: đặt như `ground`; sau `armMs` thì CHỜ, quái bước vào bán kính thì nổ MỘT lần (`mult`, trạng thái, `displace`); hết `durationMs` thì biến mất | `armMs` (>= 400), `durationMs` (<= 20000) | <= 3 bẫy / người |
| `aura` | HÀO QUANG quanh thân: trong `durationMs` mỗi `tickMs` đánh / hiệu ứng quái trong `range` (bám theo người) | `durationMs` (<= 12000), `tickMs` (>= 500) | 1 hào quang / người |
| `totem` | TRIỆU HỒI NGẮN (tượng / thú ảo đứng yên): tồn tại `durationMs`, mỗi `tickMs` đánh quái gần nhất trong `range`; thu hút quái nhắm (`taunt`, tuỳ chọn) | `durationMs` (<= 8000), `tickMs` (>= 800), `taunt?` | <= 2 / người |
**Trường dùng cho MỌI hình có sát thương**: `windupMs` (CHIÊU VẬN: vận khí 300-2500 ms rồi mới đáp; tiêu hao + hồi chiêu tính LÚC BẮT ĐẦU, choáng / chết / hồn lìa xác huỷ chiêu, người đang vận chậm 50% và không dùng chiêu khác; client hiện thanh vận); `displace` (`{ dir: "pull" | "push", px }`: KÉO / ĐẨY quái trúng, qua `moveWithCollision`, trùm miễn, tinh anh nửa quãng); `combo` (`{ needs: StatusId, mult?: 1,4, consume?: true, apply?: SkillEffect }`: đánh vào quái ĐANG mang trạng thái `needs` thì nhân sát thương, gắn thêm hiệu ứng, và gỡ trạng thái nếu `consume`: Tê cóng -> Vỡ giáp, Lôi Ấn -> nổ); `ally` (`{ range }`: trạng thái CÓ LỢI của chiêu (hộ thể / tăng tốc / hồi phục) cũng lên đồng đội CÙNG ĐỘI trong tầm, cho `scope: allies` / `hoi_phuc` của nguồn); `grade` (phẩm 0-3, mục 6).
**Trạng thái mới** (thêm CUỐI `STATUSES`, thứ tự cũ không đổi): `empower` (bản thân: sát thương MỌI chiêu x(1 + ratio), tối đa +50%, 8 s), `weaken` ("suy": quái gây ít sát thương hơn ratio, tối đa 40%, 8 s, trùm nửa), `mark_<hệ>` x9 (DẤU hệ: kind `mark`, có hại, 8 s, KHÔNG sát thương; chiêu `combo` cùng hệ kích). `root` (trói chân) để đợt 2 nếu cần.
**Luật kiểm** `skillViolations(defs)` (như `bossViolations`): id / tên / mô tả hợp lệ (không chữ Hán), mọi trường đúng hình và trong trần, chiêu `mult > 0` có hiệu ứng client, mỗi hệ / hình có `fx` hợp lệ, tổng `mult` x số lần trúng tối đa (cả `tick` / `bounce` / `count`) trong khung theo cảnh giới (không chiêu nào áp đảo, mục 9), `reqRealm` trong thang (0-4), tên quyển duy nhất. **Chia tệp dữ liệu theo nhóm để PR của D / E / G không xung đột**: `shared/src/skills-kim-tho.ts`, `skills-moc-thuy.ts`, `skills-hoa.ts`, `skills-khac.ts` (Phong / Lôi / Băng / Âm / vô sắc); `LEARNABLE_SKILLS` = `SKILLS_M7` + các tệp trên (`SKILL_BY_ID`, `books.ts`, hồ sơ cũ dùng `LEARNABLE_SKILLS`).
**Hiệu ứng client** (`SKILL_FX_IDS` mở thêm ID CHUNG, không một ID mỗi chiêu; màu theo hệ): `bolt`, `chain`, `zone`, `trap`, `aura`, `totem`, `pull`, `push`, `windup`; tin `fx`: `pbolt` (bắn đạn), `chain` (đường nảy), `zone` / `trap` / `totem` / `aura` (dựng, kèm `ms`, `r`), `windup` (thanh vận).

## 3b. Điều chỉnh hợp đồng sau review của B (#1045; CT1 #1046 làm đúng theo đây)
1. **Trạng thái CÓ HẠI công khai trên quái:** `Monster.fx` (`uint8`, `schema.ts`) đã dùng 6 / 8 bit. **Thêm bit 64 = `weaken`** (cập nhật chú thích `STATUS_BIT`) và **`Monster.mark` (`uint8`: 0 = không dấu, 1-9 = hệ của DẤU mới nhất; chỉ tốn byte khi đổi)** thay vì 9 bit `mark_<hệ>`. Máy chủ vẫn giữ nhiều dấu trong `status`; client chỉ vẽ một dấu (đủ biết combo nào kích được). `root` (đợt 2) dùng bit 128.
2. **Chiêu vận không làm client trôi:** mô hình hoá thành TRẠNG THÁI `windup` (`kind: "slow"`, `ratio` 0,5, `ms` = `windupMs`, chỉ chủ nhận như buff) để `moveSpeedMul` dự đoán đúng miễn phí; **`windup` KHÔNG tính vào `MAX_STATUSES` (= 4) và không bao giờ bị từ chối**. Test "client đoán == máy chủ trong lúc vận" kiểu `check-status-speed`. Client cũ không biết `windup` nên đoán sai tốc độ trong lúc vận: **CHẤP NHẬN** (chỉ giật nhẹ trong <= 2,5 giây; client cũ vẫn chơi được); `PROTOCOL_VERSION` tăng 1 ở PR CT1 (số kế tiếp sau chặn đường #1072) để client mới biết hiển thị chiêu vận.
3. **Vật thể bền có `id` + sự kiện KẾT THÚC:** tin dựng mang `id` (số nguyên tăng dần theo phòng); thêm tin `fxEnd { id, why: "pop" | "gone" }` qua `sendNear` (bẫy nổ, chủ rời / chết / qua cổng, hào quang bị thay, vùng thứ 4 đẩy vùng cũ nhất). Ghi rõ: người đi VÀO vùng nhìn sau khi vật thể đã dựng KHÔNG thấy nó (`fx` là sự kiện một lần; sát thương vẫn tính) và nối lại mạng thì hình mất: chấp nhận (vật thể ngắn, của riêng chủ); F không coi là lỗi.
4. **`pbolt` / `chain` mang đủ hình học:** `pbolt` theo TỪNG ĐOẠN (`x, y, angle, speed, ms` với `ms` = thời gian bay tới chỗ dừng do máy chủ tính, gồm ô chặn / trúng); mỗi lần nảy máy chủ gửi `pbolt` mới từ điểm nảy; `chain` mang danh sách điểm theo thứ tự (<= 5 điểm nguyên). Client KHÔNG tự mô phỏng. Phần trúng đã có `dmg`.
5. **`SkillDef.style?`** (tuỳ chọn; `skillViolations` kiểm tập giá trị ~12: kiếm / đao / quyền / chưởng / chỉ / ấn / quyết / phù / trận / thân pháp / hộ thể / khác; thiếu thì B suy theo `shape`): D / E / G điền lúc nhập (họ đọc tên nguồn nên chính xác hơn). B vẽ atlas nhỏ = phong cách x màu hệ x khung phẩm.
6. **Luyện chiêu:** `MASTERY_NEED` nằm ở `shared/` (sổ chiêu vẽ thanh tiến độ không chép số); nhịp gửi `mastery`: khi mở sổ, khi lên tầng, tối đa 1 lần / 30 giây (client tự cộng giữa hai lần chỉ để hiện).
7. **Ngân sách hạt phía client:** trần vật thể bền vẽ cùng lúc do B đặt (`gfx/fx/budget.ts`; mức Thấp = vòng tĩnh không hạt; quá trần bỏ cái cũ nhất); hợp đồng KHÔNG hứa máy chủ dựng nhiều hơn trần vẽ: client chỉ vẽ phần trong vùng nhìn và theo trần (3 vùng + 3 bẫy + 2 tượng + 1 hào quang = 9 / người).
8. **Tách CT11:** **CT11a** (không phụ thuộc bộ thực thi): sổ chiêu 48-80 (lọc hệ / phẩm / cảnh giới, tìm, phẩm + tầng + luyện, biểu tượng theo `style`) bằng `sampleSkills()` của CT1; **CT11b**: vẽ từng hình mới, mỗi PR thực thi của A (CT2 / CT3 / CT4) kèm đúng `fx` của nó và B review phần vẽ cùng PR (điểm 3-4 chốt MỘT lần ở CT1 để mỗi PR không tự thêm kiểu `fx` riêng). Thứ tự B: M9.8 (#1027) -> CT11a -> CT1 vào main -> CT11b.

## 3c. CT1 tách đôi (A, 17/11 chiều): CT1a làm TRƯỚC để D / E / G chạy được ngay
- **CT1a (#1046, PR RIÊNG chỉ `shared/` + test)**: khung DỮ LIỆU, không đụng bộ thực thi / hình mới. `skill-kit.ts` (`TURN_MS`, `skillEffect(status, SỐ_LƯỢT, ratio, chance)`, `SKILL_STYLES`, `SKILL_GRADES`), `SkillDef.style?` + `grade?`, bốn tệp nhóm `skills-kim-tho.ts` / `skills-moc-thuy.ts` / `skills-hoa.ts` / `skills-khac.ts` (mảng RỖNG, D / E / G thêm chiêu vào), `LEARNABLE_SKILLS` (= 18 `SKILLS_M7` + bốn nhóm; tên `LEARNABLE_SKILLS` vì `SKILLS` đã là bảng ô 1 ở `game.ts`) là nguồn của `SKILL_BY_ID` / kinh quyển / `sanitizeSkillBook`, `skillViolations()` (khung sát thương `SKILL_MULT_CAP`, trường theo hình, hiệu ứng trong trần của trạng thái, không chữ Hán, trùng tên / quyển, phẩm khớp độ hiếm), `sampleSkills(n)` (chiêu mẫu cho sổ chiêu của B). `credits.test.ts` nay bắt MỖI chiêu của `LEARNABLE_SKILLS` phải có dòng ở `NGUON_NOI_DUNG.md` hoặc nằm trong `ORIGINAL_SKILL_IDS`. **D / E / G làm chiêu bằng hình + trạng thái HIỆN CÓ ngay sau khi CT1a vào main.**
- **CT1b (issue mới)**: phần còn lại của hợp đồng mục 3 + 3b: hình `chain` / `bolt` / `zone` / `trap` / `aura` / `totem`, `windupMs`, `displace`, `combo`, `ally`, trạng thái mới (`empower` / `weaken` / `mark_*` / `windup`), `Monster.mark` + bit 64, `id` + `fxEnd`, `pbolt` từng đoạn, tầng theo phẩm + `SkillBook.mastery` + `MASTERY_NEED`, `PROTOCOL_VERSION` kế tiếp. PR riêng sau CT1a.

## 4. Bộ thực thi (A; từng PR có test, đột biến, `perf` trước / sau)
- **C2 chiêu TỨC THỜI**: `chain`, `combo`, `displace`, trạng thái mới (`status.ts`, `status-rules.ts`), `ally` (đội `Hub.parties`), `castAtOpponent` mở rộng cho `chain`. Rẻ nhất, mở khoá nhiều chiêu Lôi / Kim / Hỏa nhất.
- **C3 ĐẠN**: `World.pbolts` (trần `MAX_PLAYER_BOLTS` = 128 toàn phòng, 16 / người), mỗi tick di chuyển + kiểm trúng quái bằng LƯỚI không gian của quái (dựng MỘT lần mỗi tick CHỈ khi có vật thể bền: tránh người x quái), dừng ở ô chặn, xuyên / nảy, trúng đối thủ PK qua `duelHit`.
  - **Đã làm (CT3 #1048, `systems/pbolt.ts`) — đổi có chủ ý so với bản nháp "mỗi tick di chuyển + lưới":** đường bay được QUY HOẠCH MỘT LẦN lúc bắn bằng hàm thuần `planBolt` (các đoạn thẳng + danh sách lần trúng có thời điểm), nên `fx pbolt` mang ĐÚNG `ms` tới chỗ dừng thật (ô chặn / trúng / hết tầm) như mục 3b điểm 4, client không mô phỏng gì, và máy chủ không duyệt đạn x quái mỗi tick (chỉ một lần quét quái gần mỗi lần bắn; mỗi tick chỉ cắt các việc hẹn giờ đã tới hạn). Sát thương áp ĐÚNG LÚC đạn chạm, qua cùng `strikeMonster` với chiêu tức thời (hệ khắc, combo, hiệu ứng, kéo / đẩy). Luật: xuyên dùng trước rồi mới nảy; mỗi mục tiêu trúng tối đa một lần trên cả đường bay; quãng bay chung cho mọi đoạn; vị trí quái chụp LÚC BẮN (quái chết trước khi đạn tới thì bỏ lượt); chủ chết / rời phòng / hồn lìa xác / Hoàng Tuyền thì đạn tan. Hệ quả cho dữ liệu D / E / G: chiêu `bolt` không trúng quái trong cùng tick bắn (kể cả `bolt` quãng 0); bộ kiểm `skill-kit.test.ts` (CT12) cần ca riêng cho `bolt` (đợi đồng hồ phòng, không `shapeHits`).
- **C4 VẬT THỂ BỀN**: `World.zones` / `traps` / `totems` / `auras` (trần theo người + toàn phòng, mục 3), cùng lưới; mỗi vật thể có `nextAt` (không quét mỗi tick); dọn khi chủ chết / rời phòng / qua cổng / sang bí cảnh; KHÔNG tồn tại qua khu an toàn (không đánh người trong trấn); gửi MỘT `fx` lúc dựng.
- **C5 CHIÊU VẬN + LUYỆN CHIÊU + PHẨM**: `windupMs` (trạng thái `c.windup`, huỷ khi choáng / chết / hồn lìa xác / thách đấu bắt đầu), luyện chiêu và phẩm (mục 6), `SkillsMsg` thêm `grade` / `mastery` tuỳ chọn.
- Giữ `Math.random` ngoài luồng tick của bench (sát thương cố định hoặc `rollDamage` như cũ), bench mốc, `perf.test.ts` thêm ca "100 người dùng chiêu bền liên tục".

## 5. Giao thức
Chỉ THÊM (`PROTOCOL_VERSION` KHÔNG tăng): `fx` mới (client cũ bỏ qua: chỉ không vẽ, sát thương vẫn đúng); `cast` giữ nguyên `{slot, angle}`. Chiêu vận không cần tin thêm (đáp đòn tự động sau `windupMs`; muốn huỷ sớm: không có trong đợt 1).

## 6. Phẩm cấp + luyện chiêu
- **Phẩm** `grade` 0-3 = **Hoàng / Huyền / Địa / Thiên** (nguồn `pham_cap` 1-7: 1-2 Hoàng, 3-4 Huyền, 5-6 Địa, 7 Thiên; ánh xạ ghi ở `NGUON_NOI_DUNG.md` mục 3). Phẩm quyết định TẦNG TỐI ĐA (3 / 4 / 5 / 6) và hiện trên sổ chiêu + quyển; độ hiếm quyển (`rarity`) vẫn là màu đồ.
- **Tầng** (thay `SKILL_MAX_LEVEL` = 3 cố định): hệ số sát thương `[1, 1,15, 1,30, 1,40, 1,50, 1,60]`, hồi chiêu `[1, 0,92, 0,84, 0,80, 0,76, 0,72]` (tầng 1-3 GIỮ NGUYÊN số hiện có).
- **Nguồn tầng**: (a) quyển trùng (như nay, tới tầng tối đa của phẩm); (b) **LUYỆN**: mỗi lần dùng chiêu TRÚNG ít nhất một mục tiêu cộng 1 điểm luyện (tối đa 60 điểm / phút / người để không cày bù nhìn); đủ `MASTERY_NEED = [60, 150, 300, 600]` điểm thì lên tầng kế, NHƯNG luyện chỉ đưa tới (tầng tối đa - 1): tầng cuối chỉ bằng quyển trùng (quyển hiếm có giá trị). Lưu `SkillBook.mastery` (tuỳ chọn khi đọc, `sanitizeSkillBook` kẹp). Khắc chân linh GIỮ tầng 1 như nay (luyện lại ở kiếp mới).
- Nguồn có lợi cho người mới: tầng 1-2 của chiêu Hoàng phẩm đạt nhanh bằng luyện (khoảng 20-40 phút chơi); Thiên phẩm là mục tiêu dài hạn.

## 7. Nguồn sách chiêu
Mọi chiêu mới có quyển (tự dựng). Cách ra (dữ liệu, D / E / G ghi trong PR chiêu): **cửa hàng NPC** chỉ chiêu Hoàng phẩm Luyện Khí / Trúc Cơ (hiếm <= 1); **rơi quái** `DROP_TABLES` theo hệ quái (quái hệ nào rơi quyển hệ đó) tỉ lệ nhỏ; **trùm rơi chiêu hiếm** (Địa / Thiên) từ trùm thế giới (M9.4) và trùm bí cảnh; **cửa hàng tông** (`SECT_SHOP`: E thêm, theo cấp tông); **nhiệm vụ** (thưởng quyển); **nghề Phù / Trận** (đợt 2: chế "phù chiêu" dùng một lần). Khắc chân linh được (M7).

## 8. Chuyển nội dung từ nguồn (D / E / G dùng nguyên bảng này; ghi MỖI chiêu một dòng ở `NGUON_NOI_DUNG.md` mục 3 như 12 chiêu cũ)
| Nguồn | Tiên Giới (đề xuất; D chốt bằng mô phỏng) |
|---|---|
| `ten`, `mo_ta` | NGUYÊN VĂN (`name`, `bookName` nếu nguồn có, `desc`) |
| `canh_gioi` n | `reqRealm = n + 1` (nguồn 0-3 -> Luyện Khí..Nguyên Anh; >= 4 bỏ); mỗi cảnh giới 1-2 `reqTier` |
| `pham_cap` | `grade` (mục 6) và `rarity` (1-2 -> 0-1; 3-4 -> 1-2; 5-6 -> 3; 7 -> 4) |
| `he` | `element` (nguồn `vo_sac` -> `none`; hệ đôi lấy hệ đầu hoặc hệ hợp với `effects`) |
| `uy` | `mult = uy x 2` (như 12 chiêu cũ; chiêu nhiều lần trúng chia theo số lần) |
| `hoi` (lượt) | `cooldown = 3000 + 2000 x hoi` ms (chiêu `hoi = 0` theo tên: 2500-3500) |
| `phi` | `mpPct = 0,06` (phi 1) ... `0,35` (phi 29), tăng chậm dần, trần 0,5 |
| `dang` | `cong` -> hình sát thương (bảng dưới); `khong_che` -> `mult` thấp + `chill` / `sunder` / `displace` / `weaken` / choáng ngắn; `thu` -> `self` hộ thể / `aura`; `hoi_phuc` -> `self` hồi phục + `ally` |
| `scope: spread` | hình lan: `nova` / `cone` rộng / `fan` / `zone` / `chain` |
| `effects[].kind` | bleed -> `bleed`; poison -> `poison`; burn -> `burn`; chill -> `chill`; sunder -> `sunder`; regen -> `regen`; haste -> `haste`; `empower` -> `empower`; `decay` -> `weaken`; `mark` -> `mark_<hệ>` + `combo` cho `markTriggers`; `turns` x 1500 ms (`TURN_MS`) |
| `nap` | `windupMs = nap x 400` ms (tối đa 2500) |
Hình theo TÊN gọi: Kiếm -> `cone` / `line` / `bolt` (Kiếm khí); Đao -> `cone` rộng; Quyền / Chưởng / Trảo -> `cone` ngắn / `ground`; Chỉ -> `line` / `bolt`; Ấn -> `ground` / `trap`; Quyết -> `nova` / `aura` / `self`; Phù -> `zone` / `trap`; Trận -> `zone` / `totem`; Thân pháp -> `dash` / `self` tăng tốc; Hộ thể -> `self` / `aura`. Theo HỆ: Lôi -> `chain`; Băng -> `zone` / `bolt` tê cóng; Hỏa -> `zone` / `ground` bỏng; Mộc -> `trap` độc / `aura` hồi phục; Kim -> `bolt` nhiều viên / `line` xuyên; Thổ -> `trap` / `ground` đẩy / hộ thể; Thủy -> kéo / hồi phục; Phong -> `dash` / đẩy; Âm -> `weaken` / `totem`.

## 9. Cân bằng và kiểm thử (bắt buộc)
- **Khung sát thương**: mỗi cảnh giới có khung DPS lý thuyết tối đa của MỘT chiêu (`skillViolations` kiểm); không chiêu nào áp đảo, mỗi vai (sát thương / khống chế / thủ / hồi) có chiêu ngang giá. D viết mô phỏng `npm run can-bang -w server` (mục chiêu: DPS theo cảnh giới / hệ / hình, bảng vào `docs/CAN_BANG.md`) và chỉnh số trước khi mở PR chiêu.
- **Bộ kiểm DỮ LIỆU tự động (F)**: `server/src/systems/skill-kit.test.ts` chạy MỖI chiêu trong `LEARNABLE_SKILLS`: dùng được ở đúng cảnh giới, tiêu hao đúng, hồi chiêu đúng, trúng đúng hình (trong / ngoài vùng), trạng thái gắn đúng, nhắm theo mục 29, không dùng được khi choáng / chết / thiếu linh lực, tầng + luyện. PR dữ liệu mới của D / E / G TỰ ĐƯỢC phủ (khỏi viết test lại) + đột biến nhóm.
- **Đo thật (C)**: bot PK / săn quái đo DPS thật của từng chiêu so với bảng mô phỏng (lệch > 25% = issue `dev-d`).
- **Hiệu năng (A)**: `perf.test` ca chiêu bền; bench mốc; số liệu trước / sau trong PR.

## 10. Chia việc (mỗi dòng một issue; nhãn `dev-x` + `chieu`; milestone "Chiêu thức (mục 51)")
Số issue: CT1 #1046, CT2 #1047, CT3 #1048, CT4 #1049, CT5 #1050, CT6 #1051, CT7 #1052, CT8 #1053, CT9 #1054, CT10 #1055, CT11 #1056, CT12 #1057, CT13 #1058, CT14 #1059.

| # | Việc | Ai | Phụ thuộc | Tiêu chí xong |
|---|---|---|---|---|
| CT1 | **Hợp đồng `shared/`**: hình / trường / trạng thái mới, `skillViolations`, chia tệp dữ liệu, `LEARNABLE_SKILLS`, tầng theo phẩm, `SkillBook.mastery`, `sampleSkills()`; PR RIÊNG, B hoặc C review | A | - | 18 chiêu cũ không đổi; test + đột biến |
| CT2 | **Thực thi 1**: `chain`, `combo`, `displace`, `ally`, trạng thái `empower` / `weaken` / `mark_*` | A | CT1 | `cast.test` + PK; perf; đột biến |
| CT3 | **Thực thi 2**: đạn (`bolt`) + lưới quái | A | CT1 | trần, xuyên / nảy, ô chặn, PK; perf |
| CT4 | **Thực thi 3**: `zone`, `trap`, `aura`, `totem` | A | CT3 (lưới) | trần, dọn khi chủ rời, khu an toàn; perf 100 người |
| CT5 | **Chiêu vận + luyện chiêu + phẩm** | A | CT1 | huỷ khi choáng; luyện không cày; hồ sơ cũ đọc được |
| CT6 | **Chiêu đợt 1a: Kim + Thổ** (8-10 chiêu, bắt đầu bằng hình HIỆN CÓ + Kim Đan còn trống) | D | CT1 (chỉ cần khung / luật kiểm) | mỗi chiêu: dữ liệu, dòng nguồn, rơi / cửa hàng; test; `can-bang` |
| CT7 | **Chiêu đợt 1a: Mộc + Thủy** (8-10) | E | CT1 | như CT6 |
| CT8 | **Chiêu đợt 1a: Hỏa + vô sắc (+ Phong / Lôi / Băng / Âm nếu G chạy)** (8-10) | G (nếu dừng: D / E) | CT1 | như CT6 |
| CT9 | **Chiêu đợt 1b: dùng dạng mới** (sau CT2-CT4: Lôi chain, Kim đạn, Băng / Hỏa vùng, Mộc / Thổ bẫy, tượng Âm...) | D / E / G (PR 5-8 chiêu) | CT2-CT4 | như CT6 |
| CT10 | **Mô phỏng cân bằng chiêu** (`can-bang`: DPS / hệ / cảnh giới / hình, khung cho `skillViolations`) | D | CT1 | `CAN_BANG.md` sinh lại; khung được A duyệt |
| CT11 | **Giao diện + hiệu ứng**: vẽ `bolt` / `chain` / `zone` / `trap` / `aura` / `totem` / `pull` / `push` / `windup` (màu theo hệ, mức Thấp giảm hạt), sổ chiêu cho 48-80 chiêu (lọc theo hệ / phẩm, tìm), hiện phẩm + tầng + luyện, biểu tượng chiêu (hình nguồn khi hợp, mục 20, hoặc ảnh AI mục 46) | B | CT1 (fx ids); CT2-CT4 để thử | script Chrome 5 khung; ngân sách hạt |
| CT12 | **Bộ kiểm dữ liệu chiêu** `skill-kit.test.ts` + fuzz `cast` (kiểu sai, ô, hướng, tần suất) + đột biến | F (H nếu chạy) | CT1 | mỗi chiêu mới tự được phủ |
| CT13 | **Bot PK / săn quái đo DPS thật** | C | CT2 | báo cáo lệch so với mô phỏng |
| CT14 | **Nghiệm thu + phát hành đợt 1** (CHANGELOG, `HUONG_DAN_NGUOI_CHOI.md`, hỏi người dùng nếu đi cùng M9) | A (+ B, C) | tất cả | người dùng / quy trình mục 35 |

**Thứ tự:** CT1 trước hết (một PR nhỏ) -> D / E / G (CT6-CT8) làm NGAY chiêu bằng hình HIỆN CÓ trong lúc A làm CT2-CT5 -> CT9 sau khi dạng mới có -> CT14. Mục tiêu đợt 1 (>= 30 chiêu) KHÔNG chờ hết dạng mới: ~20 chiêu đầu dùng hình hiện có + trạng thái mới.

## 11. Rủi ro và câu hỏi cho người dùng (KHÔNG chặn; A đã chọn mặc định)
| Rủi ro | Cách giảm |
|---|---|
| Chiêu mới làm lệch cân bằng (một chiêu áp đảo, PK méo) | Khung DPS bắt buộc trong `skillViolations`; PK chỉ nhận chiêu tức thời; `can-bang` + bot C đo |
| Vật thể bền làm tick vọt / băng thông phình | Trần theo người + phòng, lưới không gian MỘT lần mỗi tick, `fx` MỘT lần lúc dựng, ca `perf` 100 người, mức hiệu ứng Thấp |
| Luyện chiêu thành cày vô hạn | Trần 60 điểm / phút, chỉ tính khi TRÚNG, tầng cuối chỉ bằng quyển trùng |
| Hồ sơ / chiêu đã khắc cũ hỏng | Mọi trường mới tuỳ chọn khi đọc, `sanitizeSkillBook` kẹp, chiêu cũ giữ id + số |
| Danh sách chiêu dài làm sổ chiêu khó dùng (4 ô, 80 chiêu) | B làm lọc / tìm / so sánh; ô vẫn 4 (mở theo cảnh giới) |
| PR dữ liệu xung đột | Chia tệp theo nhóm; mỗi PR 5-8 chiêu |
1. Ô chiêu vẫn **4** (L U I O) dù có 80 chiêu: đủ vì người chơi chọn bộ chiêu hợp lối chơi (mặc định); thêm ô ở cảnh giới cao hơn nếu bạn muốn. 2. PK: chiêu bền chỉ đánh quái (mặc định); muốn đánh cả đối thủ PK thì hỏi lại sau khi cân bằng xong. 3. Luyện chiêu bằng dùng + quyển trùng như mục 6 (có hợp ý "theo cơ chế Vạn Kiếp Tu Tiên"? nguồn không có luyện chiêu theo lượt dùng ở dữ liệu `content`, A tự đề xuất). 4. Bản phát hành: đợt 1 ra cùng bản kế tiếp (v0.4.2 / M9?), hay đợi M9?
