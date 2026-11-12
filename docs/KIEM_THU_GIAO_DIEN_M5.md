# Kiểm Thử Giao Diện & Hiệu Năng M5 Trên Điện Thoại Thật (M5.4)

Tài liệu này dành cho **người dùng** (có điện thoại Android tầm trung) làm cùng nhóm ở bước M5.4. Máy dev không có thiết bị thật nên các số FPS trong CI chỉ là chỉ số phụ (Chrome headless vẽ bằng phần mềm, xem `docs/HIEU_NANG_DI_DONG.md`); **số đo thật chỉ có thể lấy từ điện thoại của bạn**. Làm xong, điền bảng ở mục 5 và gửi lại cho Dev A: A ghi số vào `docs/HIEU_NANG_DI_DONG.md` và chỉnh bảng hồ sơ chất lượng nếu cần. Không cần cài gì thêm ngoài Chrome trên điện thoại. Mất khoảng 25 phút.

## 1. Chuẩn bị
1. **Điện thoại và máy dev cùng Wi-Fi.** Nhờ Dev A bật `npm run dev` ở thư mục `~/TT/tien-gioi-a` (client cổng 5173, server cổng 2597). Vite in ra dòng `Network: http://<IP>:5173/` (ví dụ `http://192.168.0.124:5173/`); client tự nối tới server cùng IP cổng 2597.
2. Trên điện thoại mở **Chrome** (không dùng trình duyệt trong ứng dụng khác), vào `http://<IP>:5173/?perf=1`. Có `?perf=1` thì góc màn hình hiện **lớp phủ đo**; đăng ký / đăng nhập như thường.
3. Tắt chế độ Tiết kiệm pin của hệ điều hành, sạc ≥ 50 %, đóng bớt ứng dụng nền, để điện thoại nguội (vừa chạy game nặng thì đợi vài phút).
4. Ghi lại: tên máy, bản Android, RAM, phiên bản Chrome (Cài đặt Chrome -> Giới thiệu).

> Chưa làm được: APK không có thanh địa chỉ nên không thêm được `?perf=1`; đo bằng Chrome (cùng bộ máy WebView). Muốn đo riêng APK thì báo A thêm cách bật lớp phủ trong APK.
> Sau khi phát hành v0.1.1 (chỉ khi bạn đồng ý) có thể đo ngay trên `https://tiengioi.hethongtm.site/?perf=1`.

## 2. Đọc lớp phủ `?perf=1`
| Dòng | Ý nghĩa | Mong muốn |
|---|---|---|
| `FPS n  p95 x ms` | khung hình / giây và thời gian khung ở bách phân vị 95 | **FPS ≥ 50** và **p95 ≤ 22 ms** ở chỗ đông |
| `chất lượng <bậc> (<chế độ>)  hạ n  xấu n tốt n` | bậc đang dùng (`low` / `mid` / `high`), chế độ (`auto` = Tự động, hoặc đúng bậc đã chọn tay), số lần bộ điều tốc đã hạ bậc | chế độ `auto`: `hạ` ≤ 3 |
| `WxH dpr d xs` | khung nhìn CSS, mật độ điểm ảnh, hệ số vẽ (`renderScale`) | ghi lại |
| `heap n MB` | bộ nhớ JS | không tăng liên tục khi chơi 5 phút |
| `hạt`, `emitter`, `fx bỏ` | hạt đang sống, bộ phát, số hiệu ứng bị bỏ vì hết ngân sách | `fx bỏ` tăng nhiều ở bậc Thấp là bình thường |

(Số draw call và bộ nhớ texture không hiện trên lớp phủ: harness của C đo trong CI.)

## 3. Kịch bản đo (mỗi mục 60 giây, ghi FPS / p95 sau ~30 giây cho ổn định)
Đặt **Cài đặt -> Chất lượng đồ hoạ** về từng bậc **Thấp (`low`) / Vừa (`mid`) / Cao (`high`)** (chọn tay thì bộ điều tốc tắt), lặp các cảnh dưới đây, điền bảng mục 5.
- **Cảnh A, đứng yên trong Lạc Hà Trấn** (không thấy quái, có NPC / người chơi khác nếu có).
- **Cảnh B, đi bộ ra vùng quái và đánh liên tục** (Chém + kỹ năng; có chữ bay, hạt, hoạt ảnh đánh / bị đánh).
- **Cảnh C, đông người:** nếu có người khác trực tuyến thì tụ lại; nếu không, nhờ Dev C / A chạy bot (`npm run bots -w server -- --bots=50 --duration=120`, nhắm cổng dev 2597, không dùng 2567) lúc bạn đứng trong trấn.
- **Cảnh D, Hắc Phong Cốc** (qua cổng truyền tống): thời tiết + sương + mặt nước.
- **Tự động:** đặt `Tự động (khuyên dùng)`, chơi 3 phút (đi, đánh, qua cổng, mở các tấm), ghi bậc cuối và số lần `hạ`.
- **Tiết kiệm pin:** bật, ghi FPS (mong đợi ~30) và xem có giật không.
- **Xoay máy dọc <-> ngang** 3 lần: không tải lại trang, FPS và bố cục không vỡ.

## 4. Kiểm tra bằng mắt (đánh dấu Đạt / Lỗi, ghi chú lỗi kèm ảnh chụp màn hình)
Làm ở **cả dọc và ngang**.
1. **Bố cục:** HUD không che quá nửa cảnh; joystick (nửa trái, nửa dưới) kéo được kể cả khi ngón đặt trên bảng Nhiệm vụ / HUD; nút Chém / kỹ năng / Nhặt / Mục tiêu bấm đúng, không dính nhau; không phần tử nào lọt dưới tai thỏ / thanh điều hướng.
   - **Bảng Nhiệm vụ** (cột HUD trái): ở điện thoại ngang và điện thoại dọc thấp (< 700 px) thu gọn sẵn thành một dòng `Nhiệm vụ (n) ▸`; bấm tiêu đề để mở / thu, lựa chọn được nhớ kể cả sau khi tải lại và xoay máy; cột HUD trái nên chiếm khoảng 65-70 % chiều cao ở điện thoại ngang.
   - **Nút HUD** (Nhân vật, Túi, Nhiệm vụ, Tông môn, Âm thanh, Cài đặt) và ô chat: đủ to để chạm bằng ngón cái (>= 44 px), không bấm nhầm nút bên cạnh; ở điện thoại ngang sáu nút xếp lưới 3 cột x 2 hàng, nằm gọn trong bảng HUD, không bị cắt. Khi mở bảng Nhiệm vụ có nhiệm vụ, dòng gợi ý "Chạm vào một nhiệm vụ để chỉ đường" nằm dưới tiêu đề (không phải trong nút thu gọn).
   - **Điều khiển di chuyển:** thử cả hai kiểu ở **Cài đặt -> Điều khiển di chuyển**: *Joystick nổi* (nửa trái, 65 % chiều cao phía dưới) và *Nút hướng cố định* (D-pad 8 hướng, không đè cột HUD trái).
   - **Nút Mục tiêu:** mờ khi không có quái trong tầm khoá (520 px); bấm khoá con gần nhất, bấm tiếp chuyển sang con xa hơn (vòng lại), vòng đánh dấu hiện trên mục tiêu; Chém xoay về con đang khoá.
   - **Đa chạm:** vừa đi (joystick / D-pad) vừa bấm Chém và Kiếm khí cùng lúc; chạm đúp / chụm hai ngón KHÔNG làm trang phóng to.
2. **Tấm bảng** (Nhân vật, Túi, Nhiệm vụ, Bản đồ, Cài đặt, Cửa hàng, Lò rèn, **Tông môn**): mở ra toàn màn hình (dọc) hoặc ngăn kéo bên phải (ngang), cuộn mượt, nút **Đóng** ở góc dưới phải với tới bằng ngón cái; thẻ kết quả (Bí cảnh, Quyết đấu, Chỉ dẫn người mới, Phiên bản cũ nếu gặp) nằm giữa màn hình.
   - **Kéo để đóng:** vuốt TIÊU ĐỀ tấm xuống (dọc) / sang phải (ngang): tấm đi theo ngón tay; thả sớm thì trượt về, kéo qua khoảng 1/3 hoặc vuốt nhanh thì đóng. Vuốt ở thân tấm chỉ cuộn nội dung, không đóng. Có thanh nắm nhỏ ở mép tiêu đề. Bật Giảm chuyển động thì đóng ngay, không trượt.
   - **Tông môn:** cuộn danh sách thành viên rồi bấm Nhường / Trục xuất / Rời: hộp xác nhận phủ kín tấm (không trôi ra ngoài màn hình dù đã cuộn).
   - **Hộp thoại NPC** (dock đáy màn hình): không che nút Chém, chạm để hiện hết chữ, các lựa chọn bấm được.
3. **Chữ:** nội dung bảng đọc được không phải nheo mắt (≥ 14 px); thử **Cài đặt -> Cỡ chữ** Nhỏ / Vừa / Lớn, rồi **xoay máy** (cỡ đã chọn phải được giữ).
   - Để khỏi báo nhầm: nhãn HUD ≥ 12 px và **KHÔNG đổi theo Cỡ chữ** (đúng thiết kế); trên điện thoại **Nhỏ ≈ Vừa** (sàn 14 px thắng), **Lớn** chỉ nới chữ gốc ≥ 13 px; **tên ô đan dược ở thanh nhanh bị cắt** ("Hồi H…") là hạn chế đã biết (tên đầy đủ ở `title`).
4. **Hiệu ứng:** chém / kỹ năng có hạt và rung nhẹ, chữ sát thương bay rõ; đột phá cảnh giới, Tam Sinh Thạch, cổng truyền tống (chuyển cảnh mống mắt) hiện đúng; **Giảm chuyển động** của hệ điều hành thì rung / chớp tắt.
5. **Hoạt ảnh:** người và yêu thú đi / đánh / bị đánh / gục mượt; thực thể ở xa không giật; tween nhẹ (nhấp nhô khi đi, co giãn khi đánh / bị đánh, chân đứng yên một chỗ) và bóng đốm dưới chân. Bật **Giảm chuyển động** của hệ điều hành: gục chỉ hiện khung xác nằm lại, không tween.
6. **Bản đồ:** thời tiết, sương trôi, nước lấp lánh (trôi ở bậc Vừa / Cao, đứng yên ở bậc Thấp), bóng đốm dưới chân; ở bậc Thấp thì tối giản nhưng không lỗi.
7. **Mất mạng:** tắt Wi-Fi 10 giây rồi bật lại: game tự nối lại và nhân vật còn nguyên chỗ cũ (server giữ chỗ 20 giây). Thử thêm **tắt > 25 giây**: sau 20 giây server không giữ chỗ nữa nên phải hiện thông báo / nút **Tải lại trang** (không treo im).
8. **Nóng máy / pin:** sau 15 phút chơi, ghi nhiệt độ cảm nhận (bình thường / ấm / nóng) và % pin đã tụt.

## 5. Mẫu báo cáo (sao chép, điền, gửi cho Dev A)
```
Máy: ...   Android: ...   RAM: ...   Chrome: ...   Mạng: Wi-Fi ...
Bậc | Cảnh A (FPS / p95) | Cảnh B | Cảnh C | Cảnh D
Thấp |  /   |  /   |  /   |  /
Vừa  |  /   |  /   |  /   |  /
Cao  |  /   |  /   |  /   |  /
Tự động: bậc cuối = ..., số lần hạ = ...
Tiết kiệm pin: FPS = ...
heap sau 5 phút: ... MB (đầu: ... MB)
Xoay máy: Đạt / Lỗi ...
Mục 4 (Đạt / Lỗi + ghi chú, ảnh): 1 ... 2 ... 3 ... 4 ... 5 ... 6 ... 7 ... 8 ...
Nhận xét chung: ...
```

## 6. A làm gì với kết quả
- Bậc nào dưới ngưỡng (FPS < 50 hoặc p95 > 22 ms ở cảnh B / C): hạ ngân sách của bậc đó trong `client/src/gfx/quality.ts` (`particleBudget`, `farAnimHz`, `fogPatches`, `renderScaleMax`, `ambient`), đo lại.
- Ghi số vào `docs/HIEU_NANG_DI_DONG.md` (thêm mục "Đo trên máy thật") và cập nhật bảng 13.1 của `docs/THIET_KE_GIAO_DIEN_DO_HOA.md`.
- Mặc định bậc cho điện thoại tương tự (hồ sơ `Tự động`) chỉnh theo số thật.
