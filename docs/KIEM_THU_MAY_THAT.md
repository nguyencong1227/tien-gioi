# Hướng Dẫn Kiểm Thử Ứng Dụng Android Trên Máy Thật (M4.2d)

> **Tài liệu chuẩn bị cho giai đoạn M4.2d:** Dành cho người kiểm thử / người dùng cầm điện thoại Android thật để nghiệm thu gói cài đặt APK chính thức của Tiên Giới.  
> Không yêu cầu kiến thức kỹ thuật chuyên sâu hay công cụ dòng lệnh `adb`. Mọi thao tác đều có thể thực hiện trực tiếp trên màn hình cảm ứng điện thoại.

---

## 1. Mục Đích & Lưu Ý Trước Khi Kiểm Thử

- **Mục đích:** Xác minh các tính năng chỉ có thể kiểm chứng chính xác trên phần cứng và hệ điều hành Android thật (WebView hệ thống, phím Back phần cứng/cử chỉ vuốt cạnh, xoay màn hình tự động, vùng an toàn tai thỏ/nốt ruồi, bàn phím ảo, vòng đời xuống nền/tiền cảnh, chuyển đổi mạng Wi-Fi/4G).
- **Trạng thái hiện tại:** Đã kiểm thử tĩnh và kiểm thử giả lập nối dây 100% xanh; **chưa kiểm thử trên máy thật** (chờ người dùng thực hiện theo tài liệu này).
- **Gói APK kiểm thử:** Tải từ mục [Releases của kho lưu trữ](https://github.com/nguyencong1227/tien-gioi/releases) (phiên bản `v0.1.1-rc.1` trở lên, tệp có đuôi `-debug.apk`).
- **Lưu ý cài đặt:**
  - Bản APK debug được ký bằng khóa thử nghiệm tự sinh ngẫu nhiên trên máy chủ CI GitHub Actions theo từng lượt dựng. Do đó, **không thể cài đè** lên bản debug cũ đã có trên máy. Nếu máy đã cài bản Tiên Giới trước đó, vui lòng **gỡ cài đặt bản cũ** trước khi cài bản mới.
  - Sau này, bản release chính thức (được ký bằng Keystore riêng của người dùng) sẽ cho phép cập nhật cài đè bình thường.

---

## 2. Quy Trình Kiểm Thử Chi Tiết (8 Bước Đánh Số)

### Bước 1: Cài đặt APK & Xác minh toàn vẹn tệp

1. **Làm gì:**
   - Tải tệp `tien-gioi-<thẻ>-debug.apk` và tệp đối chiếu `tien-gioi-<thẻ>-debug.apk.sha256` từ trang Releases.
   - Đối chiếu mã băm SHA-256 để đảm bảo tệp tải về nguyên vẹn theo hướng dẫn tại [Mục 8.2 docs/APP_ANDROID.md](APP_ANDROID.md#82-lấy-apk-từ-github-releases--kiểm-tra-checksum).
   - Mở tệp APK bằng ứng dụng **Quản lý tệp** (Files) trên điện thoại. Nếu hệ điều hành cảnh báo "Ứng dụng từ nguồn không xác định", hãy chọn Cho phép/Cấp quyền cài đặt cho ứng dụng quản lý tệp rồi bấm **Cài đặt**.
2. **Kết quả đúng:**
   - Hệ thống thông báo "Đã cài đặt ứng dụng" thành công, không báo lỗi xung đột chữ ký (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).
   - Nếu xảy ra lỗi không cài được: Gỡ bản cũ trên máy rồi thử lại.

---

### Bước 2: Khởi động, Biểu tượng & Giao diện vùng an toàn

1. **Làm gì:**
   - Quan sát biểu tượng (icon) và tên ứng dụng ngoài màn hình chính (Launcher) của điện thoại.
   - Nhấn mở ứng dụng Tiên Giới.
   - Quan sát màn hình chờ (Splash Screen).
   - Xoay ngang điện thoại theo cả 2 chiều (xoay 180 độ).
   - Quan sát mép màn hình nơi có "tai thỏ" (notch), camera nốt ruồi (punch-hole) và thanh điều hướng ảo (Home bar / Navigation bar).
2. **Kết quả đúng:**
   - Tên ứng dụng hiển thị chính xác là **"Tiên Giới"** (không bị cắt chữ, không có hậu tố tiếng Anh lạ).
   - Biểu tượng hiển thị sắc nét, đúng hình thái âm dương tu tiên của trò chơi.
   - Màn hình chờ xuất hiện êm ái trước khi nạp giao diện chính.
   - Ứng dụng tự động khóa hướng ngang theo cảm biến (`sensorLandscape`); xoay lật 180 độ màn hình vẫn tự động đảo chiều ngang chuẩn xác, không bị ép dọc.
   - **Vùng an toàn (`safe-area`):** Khung viền và các nút bấm HUD (thanh máu, avatar, ô chat, cần ảo joystick, nút kỹ năng) thụt lùi hợp lý, **tuyệt đối không bị khuyết tật màn hình (tai thỏ, nốt ruồi) hay thanh điều hướng Android che mất góc bấm**.

---

### Bước 3: Đăng ký / Đăng nhập & Trải nghiệm chơi game qua mạng thật

1. **Làm gì:**
   - Tại màn hình đăng nhập, đăng ký một tài khoản mới hoặc đăng nhập tài khoản có sẵn (kết nối trực tiếp tới máy chủ chính thức `wss://tiengioi.hethongtm.site`).
   - Tạo hoặc chọn đạo hiệu để tiến nhập thế giới.
   - Sau khi vào thế giới:
     - Dùng cần điều khiển ảo (joystick) góc trái dưới để di chuyển nhân vật trong Lạc Hà Trấn.
     - Đi ra ngoài hoang dã đánh quái, bấm phím Đánh và Kỹ năng, quan sát số nhảy sát thương, thanh tu vi tăng, nhặt vật phẩm rơi.
     - Bấm nút mở bảng **Túi Đồ**, **Nhân Vật**, **Nhiệm Vụ**.
     - Bấm vào khung **Trò Chuyện** (Chat), chạm vào ô nhập văn bản để bàn phím ảo hệ điều hành bật lên, gõ thử vài câu và bấm Gửi.
   - Vuốt đa nhiệm đóng hẳn ứng dụng (Kill App), sau đó nhấn mở lại Tiên Giới từ màn hình chính.
2. **Kết quả đúng:**
   - Đăng ký/đăng nhập mượt mà qua giao thức HTTPS/WSS công khai, không báo lỗi kết nối mạng (CORS hoặc SSL).
   - Cần ảo joystick và các nút cảm ứng nhạy bén, không bị trễ hoặc lệch vị trí chạm.
   - Di chuyển mượt mà, kỹ năng và sát thương hiển thị đúng.
   - **Bàn phím ảo (`adjustResize`):** Khi bàn phím ảo bật lên, giao diện co giãn hợp lý; ô nhập chữ và nút gửi tin được đẩy lên phía trên bàn phím, **không bị bàn phím che khuất tầm nhìn**.
   - **Lưu phiên đăng nhập:** Khi tắt hẳn ứng dụng rồi mở lại, người chơi được tự động nhận diện phiên (`token` lưu trong RAM/bộ nhớ ứng dụng) và đưa thẳng vào trò chơi mà không bắt đăng nhập lại từ đầu.

---

### Bước 4: Kiểm thử Phím Back Android (4 trường hợp)

1. **Làm gì & Kết quả đúng từng trường hợp:**
   - **Trường hợp 4a (Khi đang mở bảng giao diện / modal):**
     - *Thao tác:* Mở bảng Túi Đồ, bảng Cài Đặt hoặc khung Chat. Sau đó bấm phím Back phần cứng (hoặc vuốt từ mép màn hình vào trong đối với điều hướng cử chỉ).
     - *Kết quả đúng:* Bảng giao diện đang mở trên cùng lập tức đóng lại; nhân vật vẫn đứng trong game bình thường; ứng dụng **không bị thoát**.
   - **Trường hợp 4b (Khi đang ở màn hình chơi game chính, không có bảng nào mở):**
     - *Thao tác:* Bấm phím Back lần thứ nhất.
     - *Kết quả đúng:* Xuất hiện thông báo toast thông tin màu xanh: *"Nhấn lần nữa để thoát trò chơi"*; ứng dụng **chưa thoát**.
     - *Thao tác:* Chờ quá 2 giây rồi bấm Back lần nữa -> vẫn chỉ hiện toast thông báo.
     - *Thao tác:* Bấm Back 2 lần liên tiếp nhanh trong vòng 2 giây.
     - *Kết quả đúng:* Ứng dụng thoát ra màn hình chính của điện thoại êm đẹp.
   - **Trường hợp 4c (Tại màn hình Đăng ký / Đăng nhập tài khoản):**
     - *Thao tác:* Đang ở màn hình đăng nhập (chưa vào game), bấm phím Back 1 lần duy nhất.
     - *Kết quả đúng:* Ứng dụng thoát ngay lập tức ra màn hình chính của điện thoại (không đòi hỏi bấm 2 lần).
   - **Trường hợp 4d (Khi hiện thông báo "Phiên bản đã cũ" - Lỗi 426):**
     - *Thao tác:* Khi xuất hiện modal yêu cầu cập nhật phiên bản, bấm phím Back.
     - *Kết quả đúng:* Phím Back bị chặn hoàn toàn, modal cập nhật không bị tắt đi để tránh người chơi ở lại trạng thái lỗi (chỉ có thể bấm nút "Cập Nhật Bản Mới" hoặc bấm Home ra ngoài).

---

### Bước 5: Vòng đời Xuống nền & Tiền cảnh (Background & Foreground)

1. **Làm gì & Kết quả đúng:**
   - **Trường hợp 5a (Xuống nền ngắn ~5 giây):**
     - *Thao tác:* Đang đứng trong thế giới game, bấm nút **Home** hoặc vuốt về màn hình chính Android (ứng dụng xuống nền), chờ khoảng 5 giây rồi nhấn vào biểu tượng Tiên Giới để quay lại.
     - *Kết quả đúng:* Khi xuống nền, âm thanh lập tức tạm dừng (không phát trộm pin). Khi quay lại tiền cảnh, âm thanh tiếp tục phát, nhân vật vẫn ở nguyên vị trí cũ, kết nối máy chủ vẫn duy trì thông suốt.
   - **Trường hợp 5b (Xuống nền dài ~1 phút):**
     - *Thao tác:* Để ứng dụng xuống nền khoảng 60–90 giây, mở ứng dụng khác lướt xem rồi quay lại Tiên Giới.
     - *Kết quả đúng:* Nhịp tim native hoạt động chuẩn xác; khi quay lại, nếu mạng bị ngắt do hệ điều hành tiết kiệm pin thì banner thông báo *"Mất kết nối, đang nối lại..."* sẽ xuất hiện đếm ngược và tự động nối lại thành công, nhân vật không bị mất dữ liệu hay văng app.

---

### Bước 6: Chuyển đổi trạng thái mạng (Wi-Fi ⮂ 4G / Chế độ máy bay)

1. **Làm gì & Kết quả đúng:**
   - **Trường hợp 6a (Đang dùng Wi-Fi chuyển sang 4G hoặc ngược lại):**
     - *Thao tác:* Khi nhân vật đang đứng trong game, vuốt thanh trạng thái xuống và tắt Wi-Fi để máy chuyển sang dữ liệu di động 4G.
     - *Kết quả đúng:* Banner đỏ xuất hiện đếm ngược thông báo đang nối lại; sau khi 4G sẵn sàng (khoảng 1–3 giây), ứng dụng tự động kết nối lại thành công, toast *"Đã nối lại."*, nhân vật giữ nguyên vị trí, không tạo ra bóng ma hay bị văng.
   - **Trường hợp 6b (Mất mạng tạm thời):**
     - *Thao tác:* Bật **Chế độ máy bay** (Airplane Mode) trong khoảng 10 giây, sau đó tắt chế độ máy bay.
     - *Kết quả đúng:* Game nhận biết mất kết nối và tự động khôi phục ngay khi có mạng trở lại.

---

### Bước 7: Âm thanh & Trang Chính sách Quyền riêng tư

1. **Làm gì:**
   - Chú ý âm thanh khi mới mở ứng dụng và sau cái chạm tay đầu tiên vào màn hình.
   - Bấm vào biểu tượng Cài Đặt (hoặc liên kết ở chân màn hình đăng nhập), chọn xem liên kết **"Quyền riêng tư"**.
2. **Kết quả đúng:**
   - Theo chính sách của trình duyệt WebView Android, âm thanh sẽ phát ngay sau cú chạm/bấm đầu tiên của người dùng trên màn hình; âm lượng rõ ràng, không rè, hiệu ứng chiêu thức và nhạc nền khớp hành động.
   - Liên kết quyền riêng tư mở trang `privacy.html` với nội dung văn bản tiếng Việt rõ ràng, trình bày minh bạch về dữ liệu lưu trữ (không đòi quyền nhạy cảm GPS, danh bạ, máy ảnh).

---

### Bước 8: Cách ghi nhận lỗi & Trích xuất log điều tra

Nếu gặp bất kỳ bước nào không đạt kết quả mong đợi:

1. **Chụp ảnh hoặc quay video màn hình:**
   - Dùng tính năng chụp màn hình (Phím Nguồn + Giảm âm lượng) hoặc Trình ghi màn hình tích hợp sẵn của Android để ghi lại hiện tượng lạ.
2. **Cách trích xuất log WebView qua máy tính (khi cần điều tra sâu):**
   - **Cách 1: Trình duyệt Chrome máy tính (Không cần cài phần mềm):**
     1. Trên điện thoại: Vào **Cài đặt -> Tùy chọn nhà phát triển -> Bật "Gỡ lỗi USB" (USB Debugging)**.
     2. Cắm cáp USB nối điện thoại với máy tính.
     3. Mở trình duyệt Google Chrome trên máy tính, gõ vào thanh địa chỉ:
        ```text
        chrome://inspect/#devices
        ```
     4. Tìm mục ứng dụng `site.hethongtm.tiengioi`, bấm nút **inspect**.
     5. Cửa sổ DevTools hiện ra: chuyển sang tab **Console** và tab **Network** để xem toàn bộ lỗi đỏ hoặc tin nhắn WebSocket bị ngắt.
   - **Cách 2: Dùng lệnh `adb` (nếu máy tính có sẵn Android SDK):**
     ```bash
     # Xuất log WebView Chromium của điện thoại:
     adb logcat -d | grep -i -E "chromium|Capacitor|Tiengioi" > logcat_error.txt
     ```

---

## 3. Mẫu Báo Cáo Kiểm Thử (Điền & Gửi Cho Nhóm Phát Triển)

Sau khi hoàn thành đợt kiểm thử trên máy thật, người kiểm thử vui lòng sao chép bảng dưới đây, điền thông tin và gửi lại cho **Dev A** (qua issue hoặc ghi chú trao đổi).

```markdown
### BÁO CÁO KIỂM THU MÁY THẬT (M4.2d)

- **Người kiểm thử:** [Tên hoặc biệt hiệu]
- **Thiết bị:** [Ví dụ: Samsung Galaxy S23 Ultra / Xiaomi Redmi Note 12 / Google Pixel 7]
- **Phiên bản Android:** [Ví dụ: Android 13 / Android 14 / OneUI 6.0 / HyperOS]
- **Bản APK kiểm thử:** [Ví dụ: v0.1.1-rc.1-debug]
- **Thời gian kiểm thử:** [Ngày/giờ thực hiện]

| Bước kiểm tra | Trạng thái (ĐẠT / LỖI / BỎ QUA) | Ghi chú & Hiện tượng thực tế |
|---|---|---|
| Bước 1: Cài đặt APK & Checksum | [ĐẠT] | Cài đặt thuận lợi, không báo lỗi chữ ký. |
| Bước 2: Splash, Icon, Hướng xoay & Safe Area | [ĐẠT] | Tên đúng "Tiên Giới", xoay ngang tốt, không che tai thỏ. |
| Bước 3: Đăng nhập, Điều khiển & Bàn phím | [ĐẠT] | Đăng nhập server thật nhanh, bàn phím không che chat. |
| Bước 4: Phím Back (4 trường hợp) | [ĐẠT] | Đóng modal -> Bấm 2 lần thoát -> Màn login thoát ngay. |
| Bước 5: Vòng đời Xuống nền & Tiền cảnh | [ĐẠT] | Xuống nền 5s và 1 phút quay lại đều hoạt động bình thường. |
| Bước 6: Chuyển mạng 4G & Máy bay | [ĐẠT] | Tự động nối lại sau 2 giây đổi mạng. |
| Bước 7: Âm thanh & Trang quyền riêng tư | [ĐẠT] | Tiếng phát sau chạm đầu, privacy.html mở tốt. |

- **Các lỗi phát hiện (nếu có):**
  - *Lỗi 1:* [Mô tả chi tiết bước bị lỗi, kèm ảnh chụp màn hình hoặc log console]
- **Đánh giá chung:** [Đạt yêu cầu đưa lên bản phát hành chính thức / Cần chỉnh sửa thêm]
```
