# Thiết kế: chơi hoàn toàn bằng bàn phím (máy tính)

Nguồn: `~/TT/orchestra/QUYET_DINH_M3.md` mục 13 (người dùng, 13/11/2026: "thao tác trên bàn phím chưa hợp lý, phải dùng cả chuột"). Issue theo dõi: **#463**. Mục tiêu: trên máy tính chơi được TOÀN BỘ chỉ bằng bàn phím, chuột là tuỳ chọn. Không đổi hành vi cảm ứng, không đổi giao thức server.

## 1. Bảng phím mặc định

Một nguồn duy nhất: `client/src/keybinds.ts` (`ACTIONS`). HUD, dòng gợi ý đầu màn hình và (sau này) màn "Phím tắt" đều đọc từ đây.

| Hành động | Phím (chính trước) | Ghi chú |
|---|---|---|
| Di chuyển | W A S D, mũi tên | CỐ ĐỊNH, không đổi được |
| Kiếm chém | J, Space | giữ phím thì chém liên tục; chưa có mục tiêu thì tự khoá con gần nhất. Cụm J K L U I O: xem mục 3 (QUYET_DINH_M3 mục 17.1) |
| Chọn mục tiêu / mục tiêu kế | Tab, T | gần nhất, bấm tiếp đi xa dần rồi vòng lại; chỉ còn một con thì bấm nữa là nhả |
| Mục tiêu trước | Shift+Tab | đi ngược xa -> gần |
| Bỏ chọn mục tiêu | Esc | chỉ khi không còn bảng / hộp thoại nào để đóng |
| Kiếm khí | K, 3 | tự khoá con gần nhất nếu chưa có mục tiêu |
| Ô chiêu thức 2 / 3 / 4 / 5 | L / U / I / O | CHƯA có chiêu (M7 mới lấp): hiện mờ ở HUD máy tính, bấm chỉ báo "ô còn trống", không gửi gì lên máy chủ |
| Đả tọa | Z, 4 | bật / tắt |
| Đột phá | V | V = "vượt" cảnh giới; xa cụm WASD nên khó bấm nhầm |
| Đan dược ô 1 / 2 | 1 / 2 | giữ nguyên như v0.1.2 (xem mục 3) |
| Nhặt / nói chuyện / qua cổng | F | |
| Nhận lời mời / đồng ý | Y | lời mời tổ đội, bí cảnh, thách đấu, tông môn; xác nhận rời / đầu hàng (xem 4c) |
| Từ chối lời mời / huỷ xác nhận | X | Esc chỉ TẠM ẨN hộp lời mời (không gửi từ chối) |
| Menu đồng đạo gần nhất (mời đội / thách đấu / mời tông môn) | P | người chơi đang thấy trên màn hình; Esc rồi P lại thì sang người xa hơn (xem 4d) |
| Rời bí cảnh / đầu hàng quyết đấu | R | chỉ MỞ hộp xác nhận; Y xác nhận, X huỷ |
| Túi đồ / Nhân vật / Sổ nhiệm vụ / Tông môn / Bản đồ lớn / Cài đặt | B / C / N (Q) / G / M / E | bấm lại để đóng |
| Công pháp (gắn / gỡ chiêu vào ô 2-5, M7.6) | Shift+K | bấm lại hoặc Esc để đóng. Mũi tên đi giữa các ô và các hàng chiêu (hình học, `panel-nav.ts`), Enter gắn chiêu vào ô đang focus, Delete / Backspace gỡ chiêu khỏi ô đang giữ; ô chưa mở vẫn focus được (nghe lý do), bấm chỉ báo "Mở ở ...", không gửi gì |
| Chat | Enter mở, Enter gửi, Esc thoát | đang gõ chữ thì mọi phím khác không điều khiển nhân vật |
| Bật / tắt âm thanh | 0 | |
| Ẩn / hiện toàn bộ giao diện (màn chơi sạch) | H | chạy cả khi bảng đang mở; xem `THIET_KE_GIAO_DIEN_GON.md` mục 6 |
| Đóng bảng trên cùng | Esc | một lần một tầng (xác nhận con -> menu / hộp thoại -> bảng chính) |

Phím được ghi theo `KeyboardEvent.code` (vị trí vật lý): bật bộ gõ tiếng Việt vẫn chạy (khi đó `key` có thể là "Process"). Nhãn hiện ở HUD / gợi ý là tên phím theo QWERTY.

## 2. Luật dùng chung

- **Phím thuộc về bảng khi bảng đang mở.** Hành động của THẾ GIỚI (chém, kỹ năng, đan, mục tiêu, tương tác, mở chat; cờ `world` trong `ACTIONS`) không chạy khi có bảng / hộp thoại / menu mở (`ui.isKeyboardCaptured()`), để Space / Enter / Tab thuộc về bảng. Mở / đóng bảng và bật / tắt âm thanh vẫn chạy.
- **Phím đã bị nút xử lý (`preventDefault`) thì thế giới bỏ qua**, như Phaser trước đây: nút HUD đang giữ focus thì Enter / Space kích hoạt nút, không chém.
- **Đang gõ chữ** (ô chat, ô nhập trong bảng): mọi phím hành động bị bỏ qua.
- **Ctrl / Alt / Meta đi kèm = phím tắt của trình duyệt**, bỏ qua. Giữ Shift mà không có phím `Shift+...` tương ứng thì coi như phím thường (vừa chạy vừa mở túi).
- Chỉ đánh thường (J / Cách) và Kiếm khí lặp khi giữ phím; mở / đóng bảng không lặp (khỏi nhấp nháy).
- Nhãn phím trên nút (`<kbd class="keycap">`) chỉ hiện ở máy tính (`pointer: fine` và rộng > 640 px); cảm ứng ẩn hẳn. Nút Mục tiêu vốn chỉ hiện trên cảm ứng.

## 3. Quyết định đáng chú ý

- **Đan dược giữ 1 / 2; 3 / 4 là phím phụ của Kiếm khí / Đả tọa** (từ v0.2.1; phím chính là K / Z). Người đã quen 1 / 2 để uống đan lúc nguy cấp; đổi sang kỹ năng thì bấm nhầm Kiếm khí / đả tọa đúng lúc cần hồi máu là nguy hiểm. Đổi lại cần một dòng trong `ACTIONS` (và test).
- **L / U / I / O dùng chiêu thật (M7.6, #507):** bấm một phím chỉ gửi `cast {slot, angle}` khi ô SẴN SÀNG (`client/src/skill-bar.ts`, `slotView`); ô chưa mở / còn trống / thiếu cảnh giới / thiếu linh lực thì báo lý do bằng một dòng thông báo và KHÔNG gửi gì, ô đang hồi chiêu hoặc đang choáng thì im lặng (vòng quét và ô xám đã nói thay). Là hành động của thế giới nên bị chặn khi bảng đang mở, không lặp khi giữ phím. Tên hành động ở màn Phím tắt là "Ô chiêu thức N" (chiêu nào đang gắn ở ô thì xem ở HUD / bảng Công pháp). Hướng đánh: xem `aimMode`.
- **Cụm J K L U I O cho chiến đấu** (người dùng yêu cầu, QUYET_DINH_M3 mục 17.1; v0.2.1): tay phải ở cụm này, tay trái giữ WASD. J = chém (Cách vẫn là phím phụ), K = Kiếm khí, L / U / I / O = ô chiêu thức 2-5. Lịch sử: v0.1.3 đặt J = Sổ nhiệm vụ và chém chỉ còn Cách; nay J lại là chém và Sổ nhiệm vụ chuyển sang N (Q vẫn mở).
- **Phím bị cụm J K L U I O chiếm được dời:** Túi I -> B, Sổ nhiệm vụ J -> N, Đả tọa L -> Z. Ba hành động còn lại mất phím cũ mà người dùng không chỉ định phím mới, B chọn: **Đột phá B -> V** (V = "vượt"; xa WASD nên khó bấm nhầm một thao tác có thể thất bại), **Cài đặt O -> E**, **Bật / tắt âm thanh N -> 0**. Cả ba đổi được ở màn "Phím tắt". Sau thay đổi này mọi chữ cái trên bàn phím đều đã có hành động (chỉ còn phím số 5-9 và F1-F12 trống): thêm hành động mới thì chọn phím số hoặc phím chữ có `Shift+`.
- **Người đã tự đổi phím được giữ nguyên:** kho lưu chỉ chứa phần KHÁC mặc định nên đổi mặc định tới ngay người chưa tự đổi; `sanitizeKeymap` cấp phím cho các hành động đã tự đổi TRƯỚC, rồi mới cấp mặc định (trừ phím đã bị chiếm), nên mặc định mới không bao giờ lấy mất phím người chơi đã chọn (hành động bị lấy phím mặc định có thể chỉ còn phím phụ, hoặc hết phím và phải đặt lại ở màn "Phím tắt"). Trước đây hành động đứng trước trong `ACTIONS` luôn thắng.
- **Esc bỏ chọn mục tiêu** đi qua chuỗi Esc có sẵn (`processEscapeKey`, bước cuối), nên không bao giờ đóng bảng và bỏ chọn cùng lúc.
- **Tab**: ngoài bảng, Tab là chọn mục tiêu (trình duyệt không đổi focus); trong bảng Tab vẫn là focus trap có sẵn.

## 4. Đổi phím

`keybinds.ts` đã có sẵn lưu / đọc (`localStorage` khoá `tg_keymap`, chỉ lưu phần KHÁC mặc định), `rebind(hành động, phím)` (gán phím đang của hành động khác thì hoán đổi, không bao giờ để hành động nào mất sạch phím, không có phím trùng, từ chối phím cố định WASD / mũi tên / Esc) và `onKeymapChange` (HUD vẽ lại nhãn). Giao diện đổi phím là màn "Phím tắt" (bước 3a, xem 4a).

## 4a. Màn "Phím tắt" (bước 3a)

- **Mở:** Cài đặt (E) -> "Xem và đổi phím tắt" (mũi tên + Enter), hoặc nút "Xem tất cả phím tắt" ở bảng chỉ dẫn người mới (lần đầu vào game, cờ đã xem lưu ở `tg_newbie_guide_dismissed`). Ẩn dòng mở trong Cài đặt khi đang dùng cảm ứng (`html[data-input="touch"]`). Màn mở CHỒNG lên bảng đang mở (Esc đóng riêng màn này, trả focus về nút đã mở nó).
- **Danh sách** vẽ từ `ACTIONS` (`keysScreenModel`, thuần): nhóm Chiến đấu / Tương tác / Bảng và cửa sổ / Khác; mỗi dòng "tên, các phím (phím chính trước), nút Đổi phím"; dòng đã đổi khỏi mặc định có viền vàng; dưới là các **phím cố định** (`FIXED_KEYS`: WASD / mũi tên, Esc, Enter / Cách, 1-9 chọn dòng hội thoại, Tab / Shift+Tab trong bảng) và nút "Khôi phục phím mặc định" (`resetKeymap`).
- **Đổi phím chỉ bằng bàn phím:** Enter trên "Đổi phím" -> nút thành "Bấm phím mới..." và dòng trạng thái (`aria-live`) báo đang chờ -> bấm phím muốn gán (`captureOutcome`, thuần): Esc huỷ (CHỈ huỷ việc đổi, màn vẫn mở), W A S D / mũi tên bị từ chối kèm lời giải thích và vẫn chờ, chỉ bấm Shift / Ctrl... hoặc giữ phím lặp (Enter vừa bấm để bắt đầu) thì bỏ qua, Ctrl / Alt / Meta đi kèm không tính. Shift chỉ được giữ cho Tab (`Shift+Tab`); phím khác kèm Shift là phím thường (khỏi gán nhầm "Shift+R" chỉ chạy khi đang giữ Shift).
- **Phím mới trở thành phím CHÍNH, phím cũ giữ làm phím phụ** (tối đa 3 phím mỗi hành động, `sanitizeKeymap`). Lấy phím DUY NHẤT của hành động khác thì hai hành động đổi chỗ (lời nhắn nói rõ: `"Đan dược ô 1" đổi sang 4.`); lấy phím phụ của hành động khác thì hành động kia chỉ mất phím đó.
- **Bắt phím ở pha CAPTURE của `window`** (`onKeyCaptureKeydown` trong `ui.ts`, `preventDefault` + `stopImmediatePropagation`): chạy TRƯỚC Esc đóng bảng, phím hành động của thế giới và Phaser, nên phím bấm để gán không làm gì khác. Đóng màn hoặc bấm lại nút đang chờ thì thôi chờ.
- **Chữ hướng dẫn không lệch phím thật khi đổi phím:** `keybinds-dom.ts` điền nhãn cho nút HUD (thêm nhặt / nói chuyện / qua cổng / minimap), và mọi phần tử có `data-key-action="<id hành động>"` (bảng chỉ dẫn người mới, dòng tắt âm trong Cài đặt) bằng phím chính; chữ "Nhặt (F)" / "Nói chuyện (F)" / "Qua cổng (F)" và lời chào đầu game đọc `primaryKeyLabel`. Còn tĩnh: tên phím ở `aria-label` của nút đóng từng bảng ("Đóng túi đồ (Phím I hoặc Esc)").
- **Thanh trượt không còn bẫy mũi tên:** Trái / Phải chỉnh giá trị, Lên / Xuống vẫn chuyển focus (`ownsArrowKeys(el, dir)`); trước đó đứng ở thanh âm lượng đầu Cài đặt thì chỉ còn Tab để đi tiếp. Ô chọn (select) và ô chữ vẫn giữ cả bốn mũi tên (Tab là lối thoát).

## 4b. Điều hướng trong bảng và hộp thoại (bước 2)

- **Mũi tên chuyển focus sang phần tử lân cận THEO HÌNH HỌC** (`client/src/panel-nav.ts`, `pickNeighbor` thuần + test): một mẫu duy nhất phủ túi (lưới), cửa hàng / lò rèn (thẻ có hàng nút), hội thoại (dãy lựa chọn), tông môn, nhiệm vụ, cài đặt, không viết riêng từng bảng. Ưu tiên phần tử cùng hàng / cột gần nhất; ở mép bảng thì đứng yên (KHÔNG vòng lại; lối thoát là Esc). Chưa có focus trong bảng thì mũi tên đầu tiên vào phần tử đầu. Ô nhập chữ, thanh trượt, select giữ mũi tên của chính nó.
- **Bảng / hộp thoại mở thì nhân vật đứng yên:** mũi tên dành cho điều hướng bảng, WASD không làm gì, nhân vật đứng yên (`ui.isKeyboardCaptured()`); đóng bảng (Esc) là đi lại được. Chỉ chặn BÀN PHÍM: cần điều khiển ảo của cảm ứng giữ nguyên hành vi cũ (đang kéo thì vẫn đi, `move-input.ts` + test; review của A ở #468).
- **Enter / Cách kích hoạt phần tử đang focus.** Nút `<button>` chỉ nhận `click` khi bấm phím, nên các nút trước đây chỉ nghe `pointerdown` (tháo / mặc trang bị, nút +/- cửa hàng, đuổi khỏi đội) nay đi qua `onPress` (chuột / chạm vẫn `pointerdown` như cũ, bàn phím Enter / Cách).
- **Vẽ lại bảng không làm rơi focus** (`withFocusKept`): bảng nhân vật, lò rèn, cửa hàng (mua / bán), sổ nhiệm vụ, tông môn vẽ lại cả danh sách khi dữ liệu đổi; focus được trả về đúng phần tử (theo `data-nav`, không có thì theo thứ tự).
- **Túi đồ:** focus vào ô = chọn ô (hiện chi tiết như rê chuột), Enter = dùng / mặc (như nhấp đúp); mũi tên Xuống từ nút đóng vào lưới, tới nút Dùng / Mặc / Vứt như mọi nút khác.
- **Hộp thoại NPC:** F mở, focus ở THÂN hộp (không ở nút đóng nên Enter không đóng hộp); Enter / Cách tua nhanh chữ đang hiện dần; **phím số 1-9 chọn dòng lựa chọn** (nhãn số hiện trước mỗi dòng, chỉ máy tính); mũi tên Xuống / Lên vào dòng đầu rồi đi giữa các dòng, Enter chọn. Esc đóng.
- **Tab / Space chỉ khoá quái ĐANG THẤY trên màn hình** (khung camera), không phải cả tầm khoá 520 px (góp ý của A ở #465); nút Mục tiêu cảm ứng giữ nguyên.

## 4c. Lời mời, xác nhận rời / đầu hàng, tấm kết quả (bước 3b-1)

- **Vấn đề:** hộp lời mời (tổ đội, bí cảnh, thách đấu, tông môn) và hộp xác nhận rời bí cảnh / đầu hàng KHÔNG nằm trong `modalStack` (không chặn điều khiển) và Tab là chọn mục tiêu, nên không có cách nào tới nút "Nhận" / "Từ chối" nếu không dùng chuột.
- **Hai phím chung Y / X** (`prompt.yes` / `prompt.no`, `client/src/prompts.ts`, hàm chọn thuần + test): bấm nút đầu tiên ĐANG HIỆN theo thứ tự ưu tiên: xác nhận rời bí cảnh / đầu hàng (người chơi vừa tự mở, đang chờ) -> lời mời thách đấu (20 giây) -> bí cảnh (60) -> tổ đội -> tông môn. `ui.answerPrompt` gọi `click()` của nút nên đi đúng đường của chuột / chạm (`bindTap`: dọn đồng hồ, gửi tin, chuyển sang lời mời kế). Hiện chip phím (`.btn-key`, chỉ máy tính) trên các nút: "Nhận Y", "Từ chối X". Y / X chạy cả khi bảng đang mở (hộp lời mời không chặn điều khiển); không có hộp nào thì không làm gì.
- **R** (`exit.fight`, hành động của thế giới nên bị chặn khi bảng mở) chỉ MỞ hộp xác nhận ("Rời bí cảnh" hoặc "Đầu hàng", cái nào đang hiện); phải bấm Y mới rời / đầu hàng thật, X hoặc Esc huỷ. Hộp xác nhận của TÔNG MÔN (giải tán / trục xuất / nhường) cố ý KHÔNG nhận Y: việc huỷ hoại nằm trong bảng tông môn, đi bằng mũi tên + Enter, Esc = huỷ.
- **Esc với lời mời giữ nguyên** (chỉ tạm ẩn hộp, không gửi từ chối); từ chối thật là X.
- **Tấm kết quả bí cảnh / quyết đấu** vốn chỉ bật / tắt thuộc tính `hidden` ở nhiều chỗ: `watchModalHidden` (`MutationObserver`) đưa tấm vào / ra `modalStack` và đưa focus vào nút của tấm. Nhờ đó Space / mũi tên không còn chém / đi phía sau tấm, Enter bấm được nút, Esc đóng như cũ (đứng trước `closeTopModal` trong chuỗi Esc).
- **Còn lại của bước 3b:** menu người chơi khác (mời đội / thách đấu: hiện chỉ mở bằng chuột) và màn Hoàng Tuyền (3b-2).

## 4d. Menu đồng đạo và màn Hoàng Tuyền (bước 3b-2)

- **Phím P (`player.menu`)** mở menu tương tác (mời vào tổ đội, Thách Đấu, mời tông môn) của đồng đạo GẦN nhất đang thấy trên màn hình (trong khung camera, như Tab với quái). Esc đóng; bấm P lần nữa thì sang người xa hơn rồi vòng lại (`pickNextPlayer` trong `target-lock.ts`, thuần + test; chỉ còn một người thì mở lại chính người đó). Menu đặt cạnh người đó trên màn hình, focus nhảy vào nút hành động đầu tiên dùng được (Enter chọn, mũi tên đi giữa các nút, không phải nút Đóng). Không ai trong tầm nhìn (hoặc người đó đã rời state) thì hiện toast, không mở menu. Mở bằng chuột / chạm vẫn như cũ (`tryClickPlayer` và phím P dùng chung `openPlayerMenuFor`).
- **Lỗi nền đã sửa (của #468):** bốn nút trong menu (✕, mời đội, thách đấu, mời tông môn) ẩn menu bằng `hidden = true` mà không gỡ khỏi `modalStack`, nên sau khi bấm bằng chuột `ui.isKeyboardCaptured()` kẹt `true`: WASD và phím thế giới không chạy cho tới khi bấm Esc. Nay đi qua `closePlayerMenu`. E2E bắt được khi phím P thứ hai không mở menu.
- **Màn Hoàng Tuyền chơi được bằng phím.** Màn là hộp thoại chiếm màn hình nhưng không vào `modalStack`, không nhận focus, thẻ xuất thân là `div` không focus được, nên người chơi chỉ bằng bàn phím không thể mua Tam Sinh Thạch hay đầu thai. Nay: vào `modalStack` (phím thế giới không chạy, Tab xoay trong màn, mũi tên đi giữa các nút); **focus vào KHUNG màn chứ không vào nút nào**: người vừa gục có thể còn đang nhấn Cách / Enter, nút mua / đầu thai không được ăn phím đó, phải bấm mũi tên mới vào nút đầu tiên; **Esc không đóng màn** (chỉ đầu thai mới đóng; `closeTopModal` nuốt phím); thẻ xuất thân có `tabindex`, `role="radio"`, `aria-checked`, Enter / Cách chọn; ô tích ký vật có nhãn và Enter bật / tắt (Cách có sẵn); mọi lần vẽ lại danh sách (mua xong, chọn thẻ, tích ký vật) giữ focus (`withFocusKept` + `data-nav`). `closeAllModals` (WorldScene gọi mỗi lần cập nhật khi đang chết) gỡ cả `modalStack` nên giữ lại mục màn Hoàng Tuyền sau khi dọn.

## 5. Kiểm thử

- Test đơn vị: `keybinds.test.ts` (bảng mặc định, tra phím, nhãn, làm sạch dữ liệu lưu, đổi phím / hoán đổi), `keybinds-dom.test.ts` (nhãn HUD, dòng gợi ý, chữ `data-key-action`), `prompts.test.ts` (thứ tự ưu tiên Y / X, phím mặc định), `target-lock.test.ts` (+ `pickNextPlayer`), `keys-screen.test.ts` (mô hình danh sách, bắt phím lúc đổi, hoán đổi, phím cố định), `target-lock.test.ts` (Tab / Shift+Tab), `panel-nav.test.ts` (chọn phần tử lân cận: lưới, hàng nút, dãy dọc, mép).
- E2E thật `npm run build && npm run e2e:ban-phim -w server`: Chrome headless + server Colyseus thật, phím gửi bằng CDP (`isTrusted`), KHÔNG click chuột. Phủ: nhãn phím, Tab / Shift+Tab / Esc, Space tự khoá + chém, phím 3 / 4, mở / đóng 6 bảng, bảng mở thì Tab / Space / mũi tên không điều khiển thế giới (đo vị trí phía server), chat, túi bằng mũi tên + Enter dùng đan, nói chuyện NPC (F, Enter, mũi tên, phím số) nhận nhiệm vụ, cửa hàng (+ rồi Mua, focus giữ nguyên khi bảng vẽ lại), menu đồng đạo bằng P + mời đội / thách đấu thật giữa hai người chơi (mục 13: tab thứ hai, B trả lời bằng Y / X, hai người cùng tổ đội phía server) và màn Hoàng Tuyền (mục 14: focus ở khung, Cách / Enter lúc vừa gục không mua / đầu thai, Esc không đóng, Tab xoay, mũi tên + Enter chọn xuất thân / ký vật / mua, đầu thai), lời mời / rời / đầu hàng / tấm kết quả (mục 12: Y, X, R, ưu tiên hai lời mời, ghi tin gửi server bằng cách bọc `room.send`), màn Phím tắt (mở từ Cài đặt bằng mũi tên + Enter, W bị từ chối, Esc chỉ huỷ việc đổi, đổi Kiếm khí sang X và X phóng kiếm thật phía server, hoán đổi 1 / 4, nhãn HUD và chữ chỉ dẫn đổi theo, khôi phục mặc định). Đột biến thử (vô hiệu một chức năng thì script đỏ) đã chạy (bước 3b-2: nút menu ẩn thẳng `hidden`, bỏ phím P, bỏ nhảy focus vào nút hành động, showLimbo không vào `modalStack`, `closeAllModals` không giữ lại màn Hoàng Tuyền, Esc đóng được Hoàng Tuyền; mỗi cái đều làm script đỏ. Bước 3b-1: bỏ `prompt.yes`, đảo ưu tiên thách đấu / tổ đội, `buttonShown` chỉ xét `hidden` của chính nút, bỏ `watchModalHidden`, bỏ `exit.fight`; cả năm đều đỏ. Bước 3a: bỏ `stopImmediatePropagation` khi bắt phím, bỏ `rebind` khi gán, trả `ownsArrowKeys` về bản cũ làm thanh trượt nuốt mũi tên Lên / Xuống, bỏ điền `data-key-action`; cả bốn đều làm script đỏ): không chặn đi bộ khi bảng mở, vô hiệu phím số hội thoại, vô hiệu mũi tên bảng, bảng vẽ lại làm rơi focus, `onPress` bỏ Enter, bỏ lọc quái trên màn hình. Chrome headless không có chuột nên script giả lập `pointer: fine` bằng `--blink-settings` (nếu không nhãn phím bị ẩn).
- `npm run e2e:tro-nang -w server` (trợ năng bàn phím có sẵn) phải còn PASS.

## 6. Việc kế tiếp (cùng issue #463)

1. (Xong ở bước 3a: màn "Phím tắt" + chữ hướng dẫn đọc từ bảng phím + gợi ý lần đầu.)
2. Lối bàn phím còn thiếu: xong ở 3b-1 (trả lời lời mời, rời bí cảnh / đầu hàng + xác nhận, tấm kết quả, 4c) và 3b-2 (menu đồng đạo, màn Hoàng Tuyền, 4d).
3. E2E chỉ-bàn-phim cho phần còn lại (lò rèn, nhặt đồ, qua cổng), `CHANGELOG` `[Chưa phát hành]` của nhánh phát hành.
