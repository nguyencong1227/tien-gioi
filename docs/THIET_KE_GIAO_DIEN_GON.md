# Thiết kế: giao diện gọn, không che màn chơi

Nguồn: `~/TT/orchestra/QUYET_DINH_M3.md` mục 15 (người dùng, 14/11/2026, ưu tiên cao). Người dùng gửi ảnh cửa sổ hẹp (~550 px): cột trái gồm thẻ nhân vật + lưới nút, bảng Tổ đội, bảng Nhiệm vụ, khung chat xếp chồng chiếm gần nửa màn hình; các nút trong thẻ nhân vật lệch nhau, "Đạo hữu: 2" xuống dòng, ô Linh thạch lơ lửng. Làm theo ba PR nhỏ vào `main` (v0.2.0).

## 1. Đo trước

`npm run shot:layout -w server -- <thư-mục> <nhãn>` (sau `npm run build -w client`) dựng màn chơi "đông" (tổ đội 3 người, 2 nhiệm vụ, chat 8 dòng: `server/scripts/layout-kit.ts`) và chụp ở 6 cỡ: điện thoại dọc 360x640 và 412x915, ngang 915x412, cửa sổ hẹp 550x900, máy tính 1366x768 và 1920x1080, kèm bảng số đo diện tích. Ảnh "trước" (trên `main` ở `9b2aac8`) và ảnh sau từng bước nằm ở `docs/screenshots/giao-dien-gon/` (`truoc-<rộng>x<cao>.webp`, `sau-a-...`).

Cột trái (thẻ nhân vật + đội + nhiệm vụ) CHIẾM, trước khi sửa: 56% rộng x 78% cao ở 360x640; 53% x 83% ở 412x915; 44% x 84% ở 550x900; 19% x 80% ở 1366x768. Thẻ nhân vật một mình cao 350 px trên điện thoại dọc / cửa sổ hẹp (lưới nút 3 hàng) và 215 px trên máy tính.

## 2. Yêu cầu (mục 15) và cách làm

| # | Yêu cầu | Cách làm | PR |
|---|---|---|---|
| 1 | Thẻ nhân vật gọn: tên, huy hiệu Kiếp, cảnh giới, 3 thanh mảnh (số nằm trong thanh), MỘT dòng chip (Linh thạch, số đạo hữu) không bao giờ xuống dòng; bỏ lưới nút | `#hud` còn hàng tên + 3 `.bar` 13 px + `.hud-chips` (nowrap, ẩn tràn; chip `💎` và `👥`). Màn hẹp: tên một dòng riêng, huy hiệu + cảnh giới ở dòng dưới | a |
| 2 | Thanh menu riêng: Nhân vật / Túi / Nhiệm vụ / Tông môn / Âm thanh / Cài đặt, một hàng biểu tượng cùng cỡ, có chú thích khi rê chuột + nhãn phím; điện thoại dọc gộp vào một nút menu | `#hud-menu` ở cột phải dưới bản đồ nhỏ (`#hud-col-right`); nút 38 px (44 px khi cảm ứng), nhãn chữ ẩn (`title` + `aria-label` + nhãn phím `.keycap` của #463 giữ nguyên); màn < 480 px chỉ có nút ☰ mở ra đúng MỘT hàng 6 nút, chọn một mục hoặc chạm ra ngoài thì đóng | a |
| 3 | Tổ đội / Nhiệm vụ / Chat thu gọn được, nhớ trạng thái, mặc định thu gọn trên màn hẹp, chat 1 dòng + tự mờ, nhiệm vụ trống chỉ một dòng, tổ đội hàng gọn | mục 5 (bước b) | b |
| 4 | Ngân sách diện tích: các bảng nổi không quá ~25-30% chiều rộng, không cao quá màn hình, giữ vùng giữa trống | E2E `e2e:giao-dien` đo ở 6 cỡ | a, b |
| 5 | Phím ẩn toàn bộ giao diện (ghi vào màn Phím tắt) | xem bước c | c |
| 6 | Giữ phong cách tu tiên, không chữ Hán, tôn trọng bàn phím (#463) và cảm ứng (M5) | giữ biến màu / viền cũ; nút vẫn là `<button>` có `aria-*`; mọi id nút (`btn-char`, `btn-bag`...) giữ nguyên nên `bindTap`, phím tắt và các E2E cũ không đổi | a, b, c |

## 3. Cấu trúc sau bước a

- `#hud-col-left`: `#hud` (thẻ nhân vật), `#party-panel`, `#quest-tracker` (bước b sẽ gọn lại). `#chat` đứng riêng.
- `#hud-col-right` (MỚI, cố định góc trên phải, xếp dọc): `#minimap-wrap` rồi `#hud-menu`. Con của cột tự định vị lại (`position: relative !important`, như cột trái) nên các quy tắc cũ về vị trí cố định của `#minimap-wrap` ở nhiều khối `@media` không còn tác dụng.
- `body.in-limbo` ẩn cả hai cột như trước.
- Chat trên điện thoại (góc phải, dưới bản đồ) dời xuống 56 px để không đè thanh menu; bước b làm lại chat.

## 4. Kiểm thử

- `npm run e2e:giao-dien -w server` (Chrome + server Colyseus thật): ở 6 cỡ, thẻ không có nút nào, hai chip cùng một hàng và không tràn, thẻ không quá 30% (máy tính) / 60% (hẹp) chiều rộng và không quá 115 / 135 px cao; sáu nút menu cùng cỡ, cùng một hàng, cách đều, trong khung, >= 36 px (>= 44 px khi cảm ứng); màn < 480 px chỉ có ☰, bấm mở ra một hàng sáu nút, chọn một mục thì đóng; không bảng nổi nào chồng lên nhau.
- Đột biến (bước a): hiện lại chữ trên nút (làm nút khác cỡ và đè nhau), chat điện thoại về chỗ cũ (đè thanh menu), bỏ gộp ☰ ở màn hẹp: cả ba làm script đỏ.

## 5. Bước b: Tổ đội / Nhiệm vụ / Chat thu gọn được, gọn và nhớ trạng thái

- **Một quy tắc "mặc định thu gọn":** `gfx/hud-compact.ts` `isCompactHud` = MỌI điện thoại (dọc lẫn ngang, cao bao nhiêu cũng vậy) hoặc cửa sổ rộng dưới 700 px (`COMPACT_MAX_WIDTH`); máy tính / máy tính bảng đủ rộng không. Trước đây điện thoại dọc cao >= 700 px được coi là thoáng, nên cửa sổ ~550x900 (ảnh người dùng gửi) vẫn xếp ba bảng chồng lên nhau. `panelOpen(pref, display)` = lựa chọn đã nhớ, chưa có thì `!isCompactHud`; Nhiệm vụ, Tổ đội, Chat dùng chung (`ui.ts` `setupPanelPref`).
- **Nhớ lựa chọn** (`localStorage`, "1" = mở, "0" = thu gọn): Nhiệm vụ `tg_qt_open` (có sẵn), Tổ đội `tg_party_open` (khoá cũ `tg_party_collapsed`, 1 = thu gọn, chỉ đọc khi chưa có khoá mới), Chat `tg_chat_open`. Chưa chọn thì tự đổi theo cỡ cửa sổ khi xoay máy / kéo cửa sổ (`onDisplayChange`).
- **Chat:** nút 💬 ở đầu khung (hoặc chạm vào dòng tin đang thu gọn) mở / thu. Thu gọn còn đúng MỘT dòng tin mới nhất (log cao `1.4em + 4px`, `justify-content: flex-end` nên luôn thấy dòng cuối), ô nhập ẩn. **Enter** (`ui.focusChat`) hiện ô nhập tạm (`.typing`, log mở rộng lúc gõ), rời ô (Esc / gửi) thì thu lại. Không dùng 6 giây (`CHAT_IDLE_MS`) thì tự mờ (`.idle`, opacity 0.4); tin mới, rê chuột, đang gõ, mở / thu thì sáng lại. Rộng tối đa 30% khung (`min(360px, 30vw)`). Điện thoại ngang vẫn ẩn chat như trước.
- **Nhiệm vụ:** chưa có nhiệm vụ thì chỉ còn tiêu đề một dòng (`.empty`: ẩn danh sách, gợi ý và mũi tên; câu "gặp Trưởng trấn hoặc Bảng cáo thị" nằm ở `title`).
- **Tổ đội gọn:** tiêu đề 28 px (nút ▾ và Rời nhỏ; cảm ứng 40 px), mỗi thành viên MỘT dòng tên + cảnh giới với thanh khí huyết mảnh 3 px sát đáy hàng, nút trục xuất là biểu tượng nhỏ 22 px (cảm ứng 36 px). Tổ đội 3 người từ 222 px còn 141 px cao.
- **Thẻ nhân vật trên màn hẹp:** thanh 11 px (từ 13) để vùng giữa màn (quanh nhân vật) trống ở 360x640.
- **Ngân sách (E2E `e2e:giao-dien` đo ở 6 cỡ):** tổng diện tích các bảng nổi <= 25% khung trên máy tính, <= 35% trên màn hẹp; bảng rộng nhất <= 30% (máy tính) / 60% (hẹp) chiều rộng; cột trái cao <= 60% khung; vùng giữa (40%-60% mỗi chiều) không bị bảng nào che; không bảng nào chồng lên nhau.
- **Kết quả (cột trái trên khung nhìn, trước -> sau b):** 360x640 56%x78% -> 56%x38%; 412x915 53%x83% -> 53%x27%; 915x412 26%x97% -> 26%x59%; **550x900 44%x84% -> 44%x23%**; 1366x768 19%x80% -> 19%x55%; 1920x1080 14%x57% -> 14%x39%. Ảnh: `docs/screenshots/giao-dien-gon/sau-b-<rộng>x<cao>.webp`.
- **Đột biến (bước b), đều làm E2E đỏ:** không ghi `localStorage`, chat không bao giờ mờ, chat thu gọn không còn một dòng, `isCompactHud` cũ, nhiệm vụ trống vẫn chiếm chỗ, Enter không hiện ô nhập tạm.
