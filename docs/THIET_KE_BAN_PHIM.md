# Thiết kế: chơi hoàn toàn bằng bàn phím (máy tính)

Nguồn: `~/TT/orchestra/QUYET_DINH_M3.md` mục 13 (người dùng, 13/11/2026: "thao tác trên bàn phím chưa hợp lý, phải dùng cả chuột"). Issue theo dõi: **#463**. Mục tiêu: trên máy tính chơi được TOÀN BỘ chỉ bằng bàn phím, chuột là tuỳ chọn. Không đổi hành vi cảm ứng, không đổi giao thức server.

## 1. Bảng phím mặc định

Một nguồn duy nhất: `client/src/keybinds.ts` (`ACTIONS`). HUD, dòng gợi ý đầu màn hình và (sau này) màn "Phím tắt" đều đọc từ đây.

| Hành động | Phím (chính trước) | Ghi chú |
|---|---|---|
| Di chuyển | W A S D, mũi tên | CỐ ĐỊNH, không đổi được |
| Kiếm chém | Space | giữ phím thì chém liên tục; chưa có mục tiêu thì tự khoá con gần nhất |
| Chọn mục tiêu / mục tiêu kế | Tab, T | gần nhất, bấm tiếp đi xa dần rồi vòng lại; chỉ còn một con thì bấm nữa là nhả |
| Mục tiêu trước | Shift+Tab | đi ngược xa -> gần |
| Bỏ chọn mục tiêu | Esc | chỉ khi không còn bảng / hộp thoại nào để đóng |
| Kiếm khí | 3, K | tự khoá con gần nhất nếu chưa có mục tiêu |
| Đả tọa | 4, L | bật / tắt |
| Đột phá | B | |
| Đan dược ô 1 / 2 | 1 / 2 | giữ nguyên như v0.1.2 (xem mục 3) |
| Nhặt / nói chuyện / qua cổng | F | |
| Túi đồ / Nhân vật / Sổ nhiệm vụ / Tông môn / Bản đồ lớn / Cài đặt | I / C / J (Q) / G / M / O | bấm lại để đóng |
| Chat | Enter mở, Enter gửi, Esc thoát | đang gõ chữ thì mọi phím khác không điều khiển nhân vật |
| Bật / tắt âm thanh | N | |
| Đóng bảng trên cùng | Esc | một lần một tầng (xác nhận con -> menu / hộp thoại -> bảng chính) |

Phím được ghi theo `KeyboardEvent.code` (vị trí vật lý): bật bộ gõ tiếng Việt vẫn chạy (khi đó `key` có thể là "Process"). Nhãn hiện ở HUD / gợi ý là tên phím theo QWERTY.

## 2. Luật dùng chung

- **Phím thuộc về bảng khi bảng đang mở.** Hành động của THẾ GIỚI (chém, kỹ năng, đan, mục tiêu, tương tác, mở chat; cờ `world` trong `ACTIONS`) không chạy khi có bảng / hộp thoại / menu mở (`ui.isKeyboardCaptured()`), để Space / Enter / Tab thuộc về bảng. Mở / đóng bảng và bật / tắt âm thanh vẫn chạy.
- **Phím đã bị nút xử lý (`preventDefault`) thì thế giới bỏ qua**, như Phaser trước đây: nút HUD đang giữ focus thì Enter / Space kích hoạt nút, không chém.
- **Đang gõ chữ** (ô chat, ô nhập trong bảng): mọi phím hành động bị bỏ qua.
- **Ctrl / Alt / Meta đi kèm = phím tắt của trình duyệt**, bỏ qua. Giữ Shift mà không có phím `Shift+...` tương ứng thì coi như phím thường (vừa chạy vừa mở túi).
- Chỉ Space và Kiếm khí lặp khi giữ phím; mở / đóng bảng không lặp (khỏi nhấp nháy).
- Nhãn phím trên nút (`<kbd class="keycap">`) chỉ hiện ở máy tính (`pointer: fine` và rộng > 640 px); cảm ứng ẩn hẳn. Nút Mục tiêu vốn chỉ hiện trên cảm ứng.

## 3. Quyết định đáng chú ý

- **Đan dược giữ 1 / 2, kỹ năng là 3 / 4.** Người đã quen 1 / 2 để uống đan lúc nguy cấp; đổi sang kỹ năng thì bấm nhầm Kiếm khí / đả tọa đúng lúc cần hồi máu là nguy hiểm. Đổi lại cần một dòng trong `ACTIONS` (và test).
- **J = Sổ nhiệm vụ** (người dùng yêu cầu), Q vẫn mở sổ nhiệm vụ. Trước đây J là chém: nay chém chỉ còn Space.
- **Esc bỏ chọn mục tiêu** đi qua chuỗi Esc có sẵn (`processEscapeKey`, bước cuối), nên không bao giờ đóng bảng và bỏ chọn cùng lúc.
- **Tab**: ngoài bảng, Tab là chọn mục tiêu (trình duyệt không đổi focus); trong bảng Tab vẫn là focus trap có sẵn.

## 4. Đổi phím

`keybinds.ts` đã có sẵn lưu / đọc (`localStorage` khoá `tg_keymap`, chỉ lưu phần KHÁC mặc định), `rebind(hành động, phím)` (gán phím đang của hành động khác thì hoán đổi, không bao giờ để hành động nào mất sạch phím, không có phím trùng, từ chối phím cố định WASD / mũi tên / Esc) và `onKeymapChange` (HUD vẽ lại nhãn). Giao diện đổi phím nằm trong màn "Phím tắt" ở Cài đặt (bước sau).

## 4b. Điều hướng trong bảng và hộp thoại (bước 2)

- **Mũi tên chuyển focus sang phần tử lân cận THEO HÌNH HỌC** (`client/src/panel-nav.ts`, `pickNeighbor` thuần + test): một mẫu duy nhất phủ túi (lưới), cửa hàng / lò rèn (thẻ có hàng nút), hội thoại (dãy lựa chọn), tông môn, nhiệm vụ, cài đặt, không viết riêng từng bảng. Ưu tiên phần tử cùng hàng / cột gần nhất; ở mép bảng thì đứng yên (KHÔNG vòng lại; lối thoát là Esc). Chưa có focus trong bảng thì mũi tên đầu tiên vào phần tử đầu. Ô nhập chữ, thanh trượt, select giữ mũi tên của chính nó.
- **Bảng / hộp thoại mở thì nhân vật đứng yên:** WASD / mũi tên chỉ còn điều hướng bảng (`ui.isKeyboardCaptured()`); đóng bảng (Esc) là đi lại được.
- **Enter / Cách kích hoạt phần tử đang focus.** Nút `<button>` chỉ nhận `click` khi bấm phím, nên các nút trước đây chỉ nghe `pointerdown` (tháo / mặc trang bị, nút +/- cửa hàng, đuổi khỏi đội) nay đi qua `onPress` (chuột / chạm vẫn `pointerdown` như cũ, bàn phím Enter / Cách).
- **Vẽ lại bảng không làm rơi focus** (`withFocusKept`): bảng nhân vật, lò rèn, cửa hàng (mua / bán), sổ nhiệm vụ, tông môn vẽ lại cả danh sách khi dữ liệu đổi; focus được trả về đúng phần tử (theo `data-nav`, không có thì theo thứ tự).
- **Túi đồ:** focus vào ô = chọn ô (hiện chi tiết như rê chuột), Enter = dùng / mặc (như nhấp đúp); mũi tên Xuống từ nút đóng vào lưới, tới nút Dùng / Mặc / Vứt như mọi nút khác.
- **Hộp thoại NPC:** F mở, focus ở THÂN hộp (không ở nút đóng nên Enter không đóng hộp); Enter / Cách tua nhanh chữ đang hiện dần; **phím số 1-9 chọn dòng lựa chọn** (nhãn số hiện trước mỗi dòng, chỉ máy tính); mũi tên Xuống / Lên vào dòng đầu rồi đi giữa các dòng, Enter chọn. Esc đóng.
- **Tab / Space chỉ khoá quái ĐANG THẤY trên màn hình** (khung camera), không phải cả tầm khoá 520 px (góp ý của A ở #465); nút Mục tiêu cảm ứng giữ nguyên.

## 5. Kiểm thử

- Test đơn vị: `keybinds.test.ts` (bảng mặc định, tra phím, nhãn, làm sạch dữ liệu lưu, đổi phím / hoán đổi), `keybinds-dom.test.ts` (nhãn HUD, dòng gợi ý), `target-lock.test.ts` (Tab / Shift+Tab), `panel-nav.test.ts` (chọn phần tử lân cận: lưới, hàng nút, dãy dọc, mép).
- E2E thật `npm run build && npm run e2e:ban-phim -w server`: Chrome headless + server Colyseus thật, phím gửi bằng CDP (`isTrusted`), KHÔNG click chuột. Phủ: nhãn phím, Tab / Shift+Tab / Esc, Space tự khoá + chém, phím 3 / 4, mở / đóng 6 bảng, bảng mở thì Tab / Space / mũi tên không điều khiển thế giới (đo vị trí phía server), chat, túi bằng mũi tên + Enter dùng đan, nói chuyện NPC (F, Enter, mũi tên, phím số) nhận nhiệm vụ, cửa hàng (+ rồi Mua, focus giữ nguyên khi bảng vẽ lại). Đột biến thử (vô hiệu một chức năng thì script đỏ) đã chạy: không chặn đi bộ khi bảng mở, vô hiệu phím số hội thoại, vô hiệu mũi tên bảng, bảng vẽ lại làm rơi focus, `onPress` bỏ Enter, bỏ lọc quái trên màn hình. Chrome headless không có chuột nên script giả lập `pointer: fine` bằng `--blink-settings` (nếu không nhãn phím bị ẩn).
- `npm run e2e:tro-nang -w server` (trợ năng bàn phím có sẵn) phải còn PASS.

## 6. Việc kế tiếp (cùng issue #463)

1. Màn "Phím tắt" trong Cài đặt (danh sách + đổi phím dùng `rebind` / `resetKeymap`) và gợi ý phím lần đầu chơi.
2. Lối bàn phím còn thiếu: trả lời lời mời (tổ đội / bí cảnh / thách đấu / tông môn), nút HUD của bí cảnh / quyết đấu (rời, nhận thua) và hộp xác nhận của chúng, mở menu người chơi khác (mời đội / thách đấu) không cần chuột, màn Hoàng Tuyền / luân hồi.
3. E2E chỉ-bàn-phím cho phần còn lại (lò rèn, nhặt đồ, qua cổng), `CHANGELOG` `[Chưa phát hành]` của nhánh phát hành.
