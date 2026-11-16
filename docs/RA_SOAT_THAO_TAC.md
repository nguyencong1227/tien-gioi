# Rà soát thao tác không hoàn tác được + lỗi "rê chuột đổi lựa chọn" (issue #779)

Sau lỗi túi đồ (`QUYET_DINH_M3.md` mục 24, sửa ở #776): người dùng gặp lỗi chỉ trên bản chạy thật, nên rà **có hệ thống** thay vì chờ báo thêm. Tài liệu này là KẾT QUẢ rà (đọc mã `client/src/ui.ts`, `scenes/WorldScene.ts`, `main.ts`, `sect.ts`, hợp đồng `shared/`, luật máy chủ) và QUYẾT ĐỊNH từng thao tác; PR kèm mã nối theo bảng.

Khuôn hộp xác nhận (đã dùng ở #776, `client/src/inv-drop.ts`): nêu **tên + số lượng / hậu quả** bằng chữ; kế hoạch chụp lúc bấm và **kiểm lại lúc xác nhận**; nút "Giữ lại" được focus mặc định; **Esc = Giữ lại** (đóng hộp trước rồi mới tới bảng); **chống click ma 450 ms** cho cảm ứng; đóng khi đổi bối cảnh (nối lại, gục, đổi bản đồ, đóng bảng). Tiêu chí thêm hộp: hậu quả LỚN **và** không hoàn tác được (hoặc hoàn tác phải tốn kém). Thao tác nhỏ / hoàn tác được thì KHÔNG thêm (tránh phiền người chơi).

## 1. Bảng thao tác

Cột "Có hộp?" = hiện trạng trên `main` (cb75d00). Cột "Quyết định": **THÊM** (làm ở PR kèm), **GIỮ** (đã có), **KHÔNG** (kèm lý do).

| # | Thao tác | Nơi bấm | Hậu quả / hoàn tác | Có hộp? | Quyết định |
|---|---|---|---|---|---|
| 1 | **Vứt đồ** (Vứt 1 / Vứt hết) | Túi đồ | Mất món ra đất; xa hơn `LOOT_DESPAWN_MS` thì mất hẳn | Có (#776: tên + số lượng, đồ quý nhắc thêm) | **GIỮ** |
| 2 | **Bán đồ** | Cửa hàng, thẻ món, nút "Bán (+N)" | Món mất, nhận Linh thạch thấp hơn giá mua; mua lại tốn hơn. Số lượng chỉnh bằng +/- ngay trên thẻ, nút ghi số tiền nhận | Không | **THÊM** khi món là đồ quý (bậc >= 2) hoặc trang bị: "Bán <tên> ×N được M Linh thạch?" (kiểm lại món + số lượng lúc xác nhận). Đồ thường (nguyên liệu, đan 1-2 viên) KHÔNG: số tiền ghi sẵn trên nút, mua lại rẻ |
| 3 | **Mua đồ** | Cửa hàng, nút "Mua" | Tốn Linh thạch, bán lại lỗ | Không | **KHÔNG**: giá + số lượng ghi trên thẻ, thao tác chủ ý, bán lại được (lỗ nhỏ); hộp mỗi lần mua gây phiền |
| 4 | **Rèn / Luyện / Chế** | Lò rèn / Lò đan / Bàn phù, nút trên thẻ công thức | Tốn nguyên liệu + phí Linh thạch, nhận thành phẩm | Không | **KHÔNG**: chip nguyên liệu + phí ghi rõ trên thẻ, nút tắt khi thiếu, kết quả là thứ người chơi chủ ý làm; giữ tất định (thiết kế nghề nhỏ 2.6) |
| 5 | **Đổi đồ** (trade) | Hộp thoại NPC | Tốn đồ đổi lấy đồ; nhãn lựa chọn ghi đủ "Đổi 5 Lông thỏ lấy 1 Hồi Huyết Đan" | Không | **KHÔNG**: nhãn lựa chọn đã là lời xác nhận (người chơi chọn trong danh sách đọc được) |
| 6 | **Mặc / Tháo trang bị** | Túi đồ, bảng nhân vật | Đổi chỗ giữa ô trang bị và túi; hoàn tác bằng thao tác ngược (tháo cần chỗ trống trong túi, máy chủ báo) | Không | **KHÔNG**: hoàn tác tức thì, không mất gì |
| 7 | **Dùng đan** (nút Dùng, nhấp đúp, Enter, ô dùng nhanh) | Túi đồ, thanh dùng nhanh | Tiêu hao viên đan để hồi / tu vi; máy chủ từ chối khi vô ích (đầy máu, tu vi đầy) | Không | **KHÔNG**: máy chủ chặn lãng phí; đan / phù gắn trạng thái đã loại khỏi ô dùng nhanh (#773) |
| 8 | **Học kinh quyển** (nhấp đúp / nút Học) | Túi đồ | Tiêu quyển để học / tăng tầng chiêu | Không | **KHÔNG**: chính là mục đích của quyển; máy chủ từ chối khi chưa đủ cảnh giới (quyển còn nguyên) |
| 9 | **Gắn chiêu đè lên ô đã có / gỡ chiêu** | Bảng Công pháp | Thay chiêu ở ô; chiêu cũ vẫn trong sổ, gắn lại được | Không | **KHÔNG**: hoàn tác tức thì, không mất gì |
| 10 | **Đột phá** (nút Đột phá, phím tắt) | HUD kỹ năng, `skill.breakthrough` | **Thất bại: mất 30 % tu vi + nửa khí huyết** (xác suất thành công 77 / 69 / 61 % theo cảnh giới, cộng đan hộ đạo); thành công lên cảnh giới mới (không hoàn tác) | **Không** (gửi ngay) | **THÊM** (ưu tiên cao nhất): "Đột phá <cảnh giới> -> <cảnh giới kế>: thành công N %. Thất bại mất 30 % tu vi và nửa khí huyết." kèm "(đã tính +15 % đan hộ đạo)" khi có chip; bấm nhầm bằng phím giữa lúc săn quái là mất tu vi |
| 11 | **Mở nâng cấp chân linh / xuất thân bằng Duyên** | Hoàng Tuyền, nút "Mở · N Duyên" | Tốn **Duyên** (tiền vĩnh viễn, tích qua nhiều kiếp), không hoàn lại | Không | **THÊM**: "Mở <tên> tốn N Duyên (còn lại M)?"; các thẻ sát nhau, chạm nhầm trên điện thoại là mất Duyên |
| 12 | **Đầu thai** (chọn xuất thân, di vật giữ, chiêu khắc) | Hoàng Tuyền, nút "Đầu thai" | Mở kiếp mới: nhân vật về đầu, chỉ giữ di vật + chiêu khắc đã chọn; lựa chọn không đổi lại được | Không | **THÊM** hộp TÓM TẮT: "Đầu thai làm <xuất thân>, giữ K di vật, khắc N chiêu?" (đường duy nhất ra khỏi Hoàng Tuyền nên chỉ để bắt lỗi chọn nhầm, không chặn) |
| 13 | **Lập tông môn** | Bảng Tông môn, biểu mẫu (Enter trong ô cũng gửi) | Tốn `SECT_CREATE_COST` = 1 000 Linh thạch, không hoàn lại | Không | **THÊM**: "Lập tông môn «<tên>» [<biệt hiệu>]? Tốn 1.000 Linh thạch." |
| 14 | **Nộp Linh thạch vào kho tông môn** | Bảng Tông môn, biểu mẫu Nộp (Enter gửi) | Chỉ **Tông chủ** rút được (`SECT_PERMS.withdraw`): người khác nộp là KHÔNG lấy lại được | Không | **THÊM khi `!canSect("withdraw", rank)`**: "Nộp N Linh thạch vào kho? Chỉ Tông chủ rút được." Tông chủ nộp thì rút lại được: KHÔNG hỏi |
| 15 | Rút kho tông môn | Bảng Tông môn (chỉ Tông chủ) | Đưa Linh thạch về ví; nộp lại được | Không | **KHÔNG**: hoàn tác được |
| 16 | **Rời / Trục xuất / Nhường vị / Giải tán** tông môn | Bảng Tông môn | Mất biệt hiệu / chức; giải tán xoá tông môn | Có (`sect-action-confirm`, `sect-disband-confirm`) | **GIỮ** |
| 17 | Đổi chức vụ, sửa lời nhắn, mời vào tông môn | Bảng Tông môn | Đổi được lại bằng thao tác ngược | Không | **KHÔNG**: hoàn tác được |
| 18 | **Rời bí cảnh** / **Đầu hàng quyết đấu** | HUD bí cảnh / thách đấu | Mất lượt / thua trận | Có (`dhud-leave-confirm`, `duel-yield-confirm`) | **GIỮ** |
| 19 | **Qua cổng khi có hiệu lực đan / phù** | Nút Qua cổng, phím tương tác | Mất hiệu lực chế phẩm (máy chủ xoá thật, #767) | Có (#773, chỉ khi có chip chế phẩm) | **GIỮ** |
| 20 | Rời / mời / trục xuất khỏi tổ đội | Bảng Tổ đội | Mời lại được | Không | **KHÔNG**: hoàn tác được, tổn hại thấp |
| 21 | Nhận / trả nhiệm vụ | Hộp thoại NPC | Nhận không có chỗ bỏ ở client; trả là chủ ý | Không | **KHÔNG** |
| 22 | Nhặt đồ, đả tọa, chat, di chuyển | Thế giới | Không phá huỷ | Không | **KHÔNG** |
| 23 | Khôi phục phím mặc định | Màn Phím tắt | Mất phím đã tuỳ chỉnh (gán lại được) | Không | **KHÔNG**: nhãn rõ, hoàn tác bằng gán lại; ghi nhận, đổi nếu người dùng yêu cầu |
| 24 | Mã khôi phục tài khoản mới | Bảng tài khoản | Mã cũ mất hiệu lực | Có (ô đánh dấu xác nhận) | **GIỮ** |

Thoát phòng khi còn đồ rơi chưa nhặt: KHÔNG thêm hộp (vào lại được, đồ rơi giữ tới `LOOT_DESPAWN_MS`, không phải thao tác phá huỷ chủ động).

## 2. Rà "rê chuột / tiêu điểm / pointermove đổi lựa chọn" ở mọi bảng

Quét toàn bộ `client/src` tìm `pointerenter`, `pointerover`, `pointermove`, `mouseenter`, `mouseover`, `mousemove`, `focus`, `focusin` (trừ test). Kết quả (sau #776):

| Nơi | Sự kiện | Làm gì | Kết luận |
|---|---|---|---|
| Ô túi đồ (`ui.ts`) | `focus` | Chọn ô (bàn phím: mũi tên / Tab, #463) | AN TOÀN: chuột không gây `focus` (`pointerdown` chặn mặc định); hover chỉ `:hover` CSS. Có test canh mã nguồn + script Chrome thật |
| Hàng trang bị ở bảng nhân vật | (đã bỏ `pointerenter`) | Xem trước so sánh chỉ khi bấm | ĐÃ SỬA ở #776 |
| Cửa hàng bán đồ | không có sự kiện hover | Số lượng định bán khoá theo `ô:món` | ĐÃ SỬA ở #776 (không thừa kế số lượng sang món khác) |
| Lò rèn / bảng nghề | không có | Nút theo từng thẻ công thức, không có ô chọn | AN TOÀN |
| Bảng Công pháp | không có | Gắn chiêu bằng bấm nút ô; không có trạng thái "đang chọn" | AN TOÀN |
| Tông môn, Tổ đội, Thách đấu, Bí cảnh | không có | Nút theo từng dòng / thành viên; hộp xác nhận theo dòng đã bấm | AN TOÀN |
| Hộp thoại NPC | `click` + phím số 1-9 | Phím số = chọn VÀ làm (chủ ý, nhãn hiện số) | AN TOÀN (không có hover) |
| Thẻ xuất thân (đầu thai) | `click` / Enter / Cách | Chọn bằng bấm hoặc phím; không hover | AN TOÀN |
| Canvas thế giới (`WorldScene.ts`) | `pointermove` | Chỉ ghi `mouseIn` (nhắm chiêu theo con trỏ lúc BẤM chiêu), không đổi mục tiêu / lựa chọn | AN TOÀN |
| Bản đồ lớn (`map-input.ts`) | `pointermove` | Kéo bản đồ chỉ khi đang giữ con trỏ | AN TOÀN |
| Cần điều khiển, kéo để đóng tấm | `pointermove` | Chỉ trong lúc đang kéo | AN TOÀN |
| Khung chat | `pointerenter` / `focusin` | Hiện khung (`bumpChat`) | AN TOÀN (không đổi lựa chọn) |

Canh lâu dài: `client/src/inv-select.test.ts` thất bại nếu `ui.ts` có nghe sự kiện rê chuột nào ngoài danh sách cho phép (chỉ khung chat).

## 3. Việc làm theo bảng (các PR nhỏ)

1. Hạ tầng hộp xác nhận dùng chung `act-confirm` (lớp thuần `act-confirm.ts` + một hộp DOM `#act-confirm`: nêu chữ + dòng nhắc, "Giữ lại" focus mặc định, Esc, chống click ma 450 ms, đóng khi nối lại / gục) + **Đột phá** (hàng 10).
2. **Bán đồ quý** (hàng 2).
3. **Hoàng Tuyền**: mở nâng cấp bằng Duyên (hàng 11) và tóm tắt đầu thai (hàng 12).
4. **Tông môn**: lập (hàng 13) và nộp kho khi không rút được (hàng 14).
5. Mỗi bước kèm script Chrome thật (khuôn `client/scripts/check-inv-select.mjs`: chuột / cảm ứng / bàn phím, 5 khung nhìn), đột biến đỏ cho mỗi luật, ảnh 5 cỡ.

Không đổi `shared/` / máy chủ. Hộp chỉ là bước xác nhận ở client: máy chủ vẫn là bên kiểm và quyết định.
