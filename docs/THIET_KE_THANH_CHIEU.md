# Thiết kế thanh chiêu và bảng Công pháp (M7.6, #507)

> Người viết: Dev B (client). Cần A duyệt trước khi code (đề xuất ở `docs/PHAN_CONG_M7.md` mục 9: "khay Chiêu / cung tròn TRƯỚC khi code"). Đã đo bố cục HUD hiện tại ở 5 khung nhìn (mock `?duel=mock&debug=1`; ảnh ở `docs/screenshots/thanh-chieu-hien-trang-*.png`; ở khung "máy tính" ô chiêu không hiện vì Chrome không đầu báo con trỏ không chính xác, xem mục 1). Số của máy chủ lấy từ `shared/src/skills.ts` (`SkillDef`, `SkillsMsg`, `StatusMsg`, `skillReqMet`, `skillMpCost`, `skillCooldownMs`, `SLOT_UNLOCK_REALM`); client KHÔNG đoán trước kết quả `cast`.

## 1. Hiện trạng (đo)
- Thanh hành động gồm J **Chém** (nút lớn), K **Kiếm khí**, Z **Đả tọa**, V **Đột phá**, T **Mục tiêu**, hai ô đan dược 1 / 2. Bốn ô chiêu thức L U I O (`#skill-slots`, `index.html`) đã có chỗ trong DOM nhưng MỜ và chỉ hiện ở máy tính (`pointer: fine`, rộng > 640 px); cảm ứng ẩn hẳn (v0.2.1, #495).
- Điện thoại / máy tính bảng: cụm nút 156 x 156 px sát góc dưới phải (360x640: góc (190, 470); 390x844: (220, 674); 844x390: (674, 220); 768x1024: (598, 854)); **Mục tiêu** 58 x 58 nằm ngay trên cụm (360x640: (288, 402)); đan dược nằm bên trái cụm; **nửa màn hình bên trái dành cho joystick nổi** (không đặt nút ở đó); khung chat gập ở trên phải (360x640: y 185-255), hàng nút menu phía trên.
- Ràng buộc chung: mục bấm >= 44 px (cảm ứng), chữ >= 12 px, không tràn ở 360x640, không che nhân vật, bảng chiêu mở / đóng và chọn được HOÀN TOÀN bằng bàn phím (mũi tên + Enter), giữ giao diện gọn (`docs/THIET_KE_GIAO_DIEN_GON.md`).

## 2. Trạng thái một ô chiêu (dùng chung máy tính + cảm ứng)
Mỗi ô nhận từ `SkillsMsg` (`slots`, `learned`, `cd`, `cdMax`), `Player` (`realm`, `tier`, `mp`, `maxMp`) và `StatusTracker` (`stunned`). Thứ tự ưu tiên khi nhiều trạng thái cùng đúng (cao nhất thắng):

| # | Trạng thái | Điều kiện | Hiển thị | Bấm / phím |
|---|---|---|---|---|
| 1 | Khoá | `realm < SLOT_UNLOCK_REALM[ô]` | ổ khoá + chú thích "Mở ở <cảnh giới>" (ô 2 Luyện Khí, ô 3 Trúc Cơ, ô 4 Kim Đan, ô 5 Nguyên Anh; `realmLabel`) | mở bảng Công pháp ở dòng giải thích |
| 2 | Trống | mở nhưng chưa gắn | viền nét đứt, mờ, số ô + phím | mở bảng Công pháp |
| 3 | Thiếu cảnh giới | gắn rồi nhưng `!skillReqMet(def, realm, tier)` (chiêu khắc chân linh sang kiếp mới) | chiêu mờ + ổ khoá nhỏ + "Cần đạt <cảnh giới>" (`realmLabel(reqRealm, reqTier)`) | KHÔNG gửi `cast`; toast "Cần đạt ..." |
| 4 | Choáng | `StatusTracker.stunned` | cả thanh phủ xám + biểu tượng choáng | không gửi |
| 5 | Hồi chiêu | `cd > 0` (đếm lùi theo đồng hồ client từ lần nhận `skills`) | quét theo hình quạt (`cd / cdMax`) + số giây (làm tròn lên) | không gửi (server cũng im lặng) |
| 6 | Thiếu linh lực | `mp < skillMpCost(def, maxMp)` | tối + viền xanh nhạt, số linh lực cần | rung nhẹ + toast "Linh lực không đủ", KHÔNG gửi |
| 7 | Sẵn sàng | còn lại | sáng, icon + chấm tầng (1-3) + nhãn phím | gửi `cast {slot, angle}` |

- **Không đoán trước kết quả:** client không tự trừ linh lực / đặt hồi chiêu; chỉ chặn gửi những ca chắc chắn bị từ chối (3-6) để tiết kiệm tin (giới hạn 10/s). Phản hồi tức thì là hiệu ứng "nhấn" + `fx cast` do máy chủ gửi về (M7.7, `#508`). Nếu `skills` gửi về cho thấy `cd` mới thì vòng quét bắt đầu từ đó.
- **Hướng đánh:** dùng đúng `WorldScene.aim(range)` của Kiếm khí: mục tiêu đang khoá nếu còn trong tầm, không thì quái gần nhất trong tầm, không có thì hướng đang nhìn (máy tính có chuột: hướng tới con trỏ nếu con trỏ đang ở trong canvas; xin A xác nhận).
- **Biểu tượng:** CHƯA có hình từ nguồn (M7.8 / #509): tạm vẽ bằng mã theo hệ (`element`: màu) + hình (`shape`: cone / line / fan / nova / ground / dash / self) bằng SVG nhỏ, không chữ Hán; khi có ảnh `vktt/` thì thay một chỗ, ô vẫn đúng.
- **A11y:** mỗi ô là `<button>` có `aria-label` đầy đủ ("Ô chiêu thức 2: Hoả Vân Kiếm, tầng 2, sẵn sàng, phím L" / "... hồi chiêu 3 giây" / "... cần đạt Trúc Cơ"), `aria-disabled` cho ô không dùng được, `role="group"` cho thanh; cập nhật `aria-live="polite"` KHÔNG mỗi khung (chỉ khi đổi trạng thái).

## 3. Máy tính (rộng > 640 px, con trỏ chính xác)
- Giữ vị trí `#skill-slots` (hàng ngang ngay trên cụm nút, mép phải), nâng ô lên **52 x 52** (nay 44), khe 8 px, nhãn phím L U I O ở trên ô (`keycap`, đã có), tên chiêu viết tắt dưới ô ở chế độ rộng. Không thêm hàng thứ hai: ngoài thanh chỉ còn bảng Công pháp.
- Nút mở bảng Công pháp: thêm vào hàng nút HUD góc phải (cạnh Nhân vật / Túi / Nhiệm vụ / Tông môn) và phím mới `panel.skills` mặc định **Shift+K** (K vẫn là Kiếm khí; Shift+Tab / Shift+M đã dùng dạng này nên không cần cơ chế mới), đổi được ở màn Phím tắt.

## 4. Bảng Công pháp (`#skills-modal`)
- Danh sách chiêu đã học (một dòng mỗi chiêu): biểu tượng, tên, `Tầng n/3` (chấm), thẻ hệ (Kim / Mộc / Thuỷ / Hoả / Thổ), và dòng số THẬT: **sát thương** `x(mult * skillDamageMult(tầng))` lần công, **linh lực** `skillMpCost(def, maxMp)` (và % `mpPct`), **hồi chiêu** `skillCooldownMs(def, tầng, 0)` giây, **hình / tầm** (cone / line / fan..., `range`), **trạng thái gây ra** (tên + giây + xác suất từ `effects`), **cần cảnh giới**; kèm `desc` (mô tả nguồn) và tên kinh quyển (`bookName`).
- Hành động (một hàng nút cho dòng đang chọn): **Gắn ô 2 / 3 / 4 / 5** (ô khoá: nút mờ ghi "Mở ở ..."), **Gỡ khỏi ô**. Gắn gửi `skillSlot {slot, skillId}`; từ chối thì máy chủ gửi lại `skills` (sổ đúng) và toast.
- **Bàn phím** (dùng lại `panel-nav.ts`, #463): mở = Shift+K, `Esc` đóng; mũi tên LÊN / XUỐNG chọn chiêu; TRÁI / PHẢI chọn ô đích (2-5, bỏ qua ô khoá); `Enter` gắn; `Delete` / `Backspace` gỡ; `Tab` vẫn theo thứ tự đọc. Khung nhận focus nhưng không vẽ vòng (giống màn Hoàng Tuyền); mục tiêu focus có vòng rõ.
- **Cảm ứng:** chạm dòng để chọn, chạm "Gắn ô N" để gắn; mọi mục >= 44 px; ở điện thoại dọc bảng là tờ đáy kéo xuống để đóng (cùng mẫu các tờ khác, #389), danh sách cuộn.
- Trống (chưa học chiêu nào): câu hướng dẫn ngắn "Đọc kinh quyển trong Túi đồ để học chiêu" (Enter trên nút "Mở Túi đồ").
- **Chưa làm ở bước này:** khắc chân linh ở Hoàng Tuyền (M7.2c, cần `UNLOCKS` / `soulBuy` ở máy chủ): chừa một mục "Khắc vào chân linh" ẩn, mở khi có hợp đồng.
- **Dùng quyển từ túi:** `useItem` đã có; client chỉ cần hiện toast (máy chủ đã gửi `toast` học / lên tầng) và cập nhật bảng khi nhận `skills`.

## 5. Điện thoại / máy tính bảng: ba phương án đã cân
Chỉ hiện chiêu ĐÃ GẮN (giữ gọn, mục 15); ô khoá / trống không có nút ngoài bảng Công pháp. Số chiêu gắn tối đa 4, nhưng ở Luyện Khí chỉ 1 (ô 2), Trúc Cơ 2: **phần lớn thời gian chơi chỉ có 1-2 nút**, nên bố cục phải đẹp ở 1-2 nút và còn chịu được 4.

| Phương án | Mô tả | Đo / đánh giá |
|---|---|---|
| **A. Cụm chiêu thích nghi** (đề xuất) | Luôn hiện, không phải bấm mở. 1-2 chiêu: một hàng nút 56 px ngay bên TRÁI nút Mục tiêu. 3-4 chiêu: khối 2 x 2 nút 56 px nằm ngay TRÊN hàng Mục tiêu. | Vừa 360x640: khối 2x2 rộng 120, cao 120 -> x 160-280, y 274-394, nằm giữa khung chat (hết y 255) và Mục tiêu (từ y 402), ở nửa phải. Ngang 844x390: khối đặt bên trái cụm (x ~546-666, y ~210-330), trên ô đan dược (từ y 330), không đụng hàng menu. Một chạm là dùng. |
| B. Khay "Chiêu" | Một nút "Chiêu" cạnh Mục tiêu; chạm mở khay (2x2 hoặc hàng ngang), chạm chiêu để dùng rồi đóng. | Gọn nhất khi không đánh, nhưng mỗi lần dùng chiêu tốn thêm một chạm: chậm trong giao tranh. Giữ làm phương án DỰ PHÒNG nếu A quá chật ở khung nhỏ nhất. |
| C. Cung tròn quanh Chém | Nút chiêu xếp cung quanh nút Chém (bán kính ~110). | Bị loại: cụm nút đã chiếm chỗ quanh Chém (Kiếm khí bên trái, Đả tọa / Đột phá phía trên, Mục tiêu và đan dược lân cận); cung chồng lên các nút này, và đẩy sang nửa trái là vùng joystick. |

- **Cách chọn cuối (trước khi mở PR code):** B dựng cả A và B sau cờ `?skillui=cum|khay` ở chế độ giả lập (`?skills=mock`, dữ liệu từ `SkillsMsg` mẫu 1 / 2 / 4 chiêu), chụp 5 khung (360x640, 390x844, 844x390, 768x1024 và máy tính 1280x720) ở các trạng thái mục 2, A chọn bằng ảnh. Mặc định A; cờ chỉ để thử và bỏ khi chốt.
- Nút chiêu cảm ứng: 56 x 56 px (>= 44), khe 8 px, nhãn tên viết tắt <= 7 ký tự (hoặc chỉ biểu tượng + chấm tầng, tên nằm ở `aria-label`), quét hồi chiêu và số giây >= 14 px; chạm bằng `pointerdown` như các nút kỹ năng khác (không `click`, để không trễ trong giao tranh).
- Tablet dọc 768x1024: cùng bố cục A, kích thước nút 56 px (không phóng to).

## 6. Dữ liệu giả để làm giao diện trước (`?skills=mock`)
`createMockDungeonRoom` đã có `emit(type, msg)` (PR #533): gửi `skills` mẫu (0 / 1 / 2 / 4 chiêu, có hồi chiêu đang chạy, ô khoá) và `status` choáng để chụp đủ trạng thái; `cast` trong mock chỉ ghi log và tự đặt hồi chiêu giả (để thấy vòng quét). Không đụng máy chủ.

## 7. Kiểm (khi code)
- Thuần: hàm `slotView(slot, skillsMsg, me, statusTracker, now)` trả đúng 1 trong 7 trạng thái (bảng mục 2, test từng điều kiện + thứ tự ưu tiên + đột biến); `skillReqMet` lấy từ `shared`, KHÔNG viết lại.
- Script CDP thật (như `check-map-zoom`, `check-status-speed`): bấm phím L U I O và chạm nút -> đúng số tin `cast`; ô hồi chiêu / thiếu linh lực / choáng / khoá KHÔNG gửi; bảng Công pháp dùng được bằng bàn phím trọn vẹn (mở, chọn, gắn, gỡ, đóng); ảnh 5 khung nhìn x 7 trạng thái; không tràn chữ; leak-test (mở / đóng bảng 20 lần không tăng bộ nhớ bất thường).
- Đột biến (commit trước mỗi lần): bỏ kiểm `skillReqMet`, bỏ chặn khi choáng, bỏ chặn hồi chiêu, bỏ chặn linh lực, hướng đánh không dùng `aim`, bỏ `aria-disabled`.
- Cập nhật `docs/THIET_KE_BAN_PHIM.md` (phím `panel.skills`, điều hướng bảng) và `CHANGELOG.md`.

## 8. Câu hỏi cho A
1. Hướng đánh bằng chuột ở máy tính: theo con trỏ (như nhiều game hành động) hay theo `aim` (khoá / quái gần / hướng nhìn) như Kiếm khí hiện nay? B nghiêng về con trỏ khi có chuột trong canvas, `aim` ở mọi trường hợp khác.
2. Chấp nhận phương án A (cụm chiêu thích nghi, luôn hiện) làm mặc định, B / khay làm dự phòng?
3. `Shift+K` cho bảng Công pháp: có phím nào A đã định dùng ở M7 (Nguyên Anh, nghề) mà đụng không?
4. Bảng Công pháp có hiện cả chiêu CHƯA học (mờ, kèm tên kinh quyển và nơi lấy) để người chơi biết có gì để săn, hay chỉ chiêu đã học? B nghiêng về chỉ đã học ở bước này (chưa có nơi bán / rơi kinh quyển: M7.4).

## 9. Tiến độ làm (cập nhật khi mở PR)
- **Bước 1 (PR `b/thanh-chieu`):** `skill-bar.ts` (`SkillTracker`, `slotView` bảy trạng thái, chữ, `aimMode`, dữ liệu giả), `skill-icon.ts` (biểu tượng vẽ bằng mã), `skill-bar-dom.ts` (vẽ DOM, chỉ ghi khi đổi), nối vào `WorldScene` (nhận `skills`, `castSlot`, hướng đánh theo con trỏ), `?skills=mock&n=&realm=`, `client/scripts/check-skill-bar.mjs` (CDP thật). Thanh MÁY TÍNH: ô vuông bo góc 58 px (to hơn đề xuất 52 px: tên viết tắt <= 10 ký tự ở cỡ chữ 9 px cần chỗ; ô tròn cắt chữ ở góc).
- **Trả lời của A (#536):** chuột theo con trỏ (dash theo hướng di chuyển, ground chỉ lấy hướng); phương án A (cụm thích nghi) mặc định, B dự phòng; `Shift+K` không đụng; bảng chỉ hiện chiêu ĐÃ học, chừa chỗ khắc chân linh.
- **Còn lại:** cụm chiêu cảm ứng (phương án A, `?skillui=cum|khay` + ảnh 5 khung), bảng Công pháp (`#skills-modal`, `panel.skills` = Shift+K, bàn phím trọn vẹn), bộ chọn khắc chân linh ở Hoàng Tuyền (bỏ khối 'Sắp có' ở `ui.ts`), E2E bàn phím + leak-test.
- **Ảnh bước 1 (máy tính 1280x720, `?skills=mock`):** `docs/screenshots/thanh-chieu-b1-n4-hoi-chieu.png` (ô L, U đang hồi chiêu, I, O sẵn sàng), `-n4-choang.png` (choáng), `-n4-thieu-linh-luc.png`, `-n2-khoa.png` (Trúc Cơ: ô I, O khoá), `-n0-trong.png` (chưa gắn chiêu).
- **Bước 2 (PR `b/thanh-chieu-cam-ung`, xếp chồng lên bước 1): cụm chiêu CẢM ỨNG.** Chỉ chiêu ĐÃ GẮN có nút (ô khoá / trống `display: none` ở cảm ứng), nút 56 px, khe 8, biểu tượng 28 px + chấm tầng, không tên / nhãn phím (tên ở `aria-label` / `title`). **Lệch đề xuất mục 5:** 1-2 chiêu KHÔNG đặt thành hàng bên trái nút Mục tiêu: đo (`check-skill-touch.mjs`, ép hiện cả ba nút ngữ cảnh) thấy ở điện thoại dọc nút chiêu thứ hai chồng lên nút Nói chuyện / Cổng (cột nút ngữ cảnh nằm ngay đó, cách mép phải 168 px). Mọi số chiêu dùng MỘT khối dính mép phải, ngay TRÊN nút Mục tiêu, rộng tối đa 2 nút, ô 2 ở góc dưới-phải (sát nút Mục tiêu), xếp sang trái rồi lên hàng trên (`flex-flow: row-reverse wrap-reverse`): 1 chiêu = một nút, 2 = một hàng, 3-4 = khối 2 x 2. Hai ngoại lệ có đo: **điện thoại NGANG** (trên nút Mục tiêu là hàng nút menu + bản đồ nhỏ) khối nằm bên trái cột nút ngữ cảnh và trên thanh đan dược (x ~476-596, y ~200-320 ở 844x390, ngay phía phải vùng joystick); **D-pad + dọc** (cột nút ngữ cảnh xếp ngay trên nút Mục tiêu, thanh đan dược sang trái nó) khối lùi sang trái cột đó và trên thanh đan dược. CSS chọn bố cục bằng `html[data-input="touch"]` + `data-form` / `data-orient` / `data-touch-scheme`, và `#skill-slots[data-filled]` (số chiêu đã gắn, do `SkillBarDom.renderGroup` ghi) để khối biết có mấy nút. Chưa làm cờ `?skillui=cum|khay` (A đã chọn A làm mặc định, B / khay là dự phòng nên không dựng): nếu A muốn xem khay thì làm sau.
- **Ảnh bước 2:** `docs/screenshots/thanh-chieu-b2-360x640-n4.png` (khối 2 x 2, joystick), `-360x640-n1.png` (một chiêu), `-844x390-n4.png` (điện thoại ngang), `-360x640-n4-dpad.png` (D-pad dọc).
- **Còn lại:** bảng Công pháp (`#skills-modal`, `panel.skills` = Shift+K, bàn phím trọn vẹn), bộ chọn khắc chân linh ở Hoàng Tuyền (cần #537 vào main), E2E bàn phím + leak-test.
- **Bước 3 (PR `b/bang-cong-phap`, xếp trên bước 2): bảng Công pháp.** `client/src/skills-panel.ts` (mô hình thuần, có test): chỉ chiêu ĐÃ học theo thứ tự bảng, mỗi hàng có tầng, hệ, kiểu đánh, số THẬT cùng hàm với máy chủ (`skillDamageMult`, `skillMpCost` theo linh lực tối đa, `skillCooldownMs`; tầm theo ô), hiệu ứng gắn kèm (tên + giây + cường độ + xác suất), "Cần đạt ..." khi chưa đủ cảnh giới, mô tả + tên kinh quyển, hàng nút Ô 2 / 3 / 4 / 5 + Gỡ. `ui.ts` vẽ (`#skills-modal`, nút HUD `btn-skills`, phím `panel.skills` = Shift+K, A đã duyệt ở #536), `WorldScene` gửi `skillSlot {slot, skillId}` (`""` = gỡ) và dựng lại mô hình mỗi khi nhận `skills` / mở bảng / cảnh giới hoặc linh lực tối đa đổi lúc đang mở; client KHÔNG đoán trước kết quả (máy chủ trả `skills` đúng, hoặc toast khi từ chối). Bàn phím: mũi tên đi theo hình học giữa các nút (không cần mã riêng), Enter gắn, Delete / Backspace gỡ; ô chưa mở `aria-disabled` nhưng vẫn focus được. Máy chủ giả `?skills=mock` xử lý `skillSlot` bằng đúng `assignSlot` của shared (`mockAssign`). Script CDP `client/scripts/check-skills-panel.mjs`. Ảnh `docs/screenshots/cong-phap-{1280x720,360x640}.png`.
- **Leak-test (đã làm):** `client/scripts/leak-test.mjs` mỗi chu kỳ mở bảng Công pháp và nhận sổ chiêu MỚI (đổi ô gắn + hồi chiêu): 20 chu kỳ, textures 93 -> 93, GameObjects 39 -> 39, heap +0,86 % (ngân sách 10 %); lưu ý phép đo chỉ thấy tài nguyên Phaser + heap, KHÔNG thấy nút DOM / listener `window` rò nhỏ (kiểm bằng đọc mã: `skillRowEl` chỉ gắn listener lên phần tử con của hàng, bị `replaceChildren` dọn mỗi lần vẽ). `e2e:ban-phim` thật PASS 100 % với Shift+K.
- **Chưa làm:** màu hệ ở mục khắc chân linh (#544) làm ở PR nối tiếp; E2E thật CÓ chiêu (A nhận làm ở `server/scripts/e2e.ts`).
