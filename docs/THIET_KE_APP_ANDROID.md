# Thiết Kế Đóng Gói Ứng Dụng Di Động Android (M4.2)

> **Tài liệu tham chiếu thiết kế kiến trúc đóng gói Android cho Tiên Giới.**  
> Biên soạn: Dev B (Client & Trải nghiệm).  
> Liên quan: Milestone M4 (Mục 4.2), Issue #280.  
> Trạng thái: **Bản thiết kế đề xuất (chỉ tài liệu)** chờ Người Dùng chốt hướng đi trước khi tạo issue mã nguồn.

---

## 1. Bối cảnh & Mục tiêu

- **Hiện trạng:** Tiên Giới là game MMORPG 2D tu tiên thời gian thực trên nền web. Phía client sử dụng Phaser 3.90 kết hợp giao diện HUD DOM, build ra gói tĩnh `client/dist` bằng Vite. Đã hoàn thành chuẩn PWA (Service Worker precache tài nguyên tĩnh, manifest, icon maskable, #251).
- **Mục tiêu:** Đưa Tiên Giới lên hệ điều hành di động Android dưới dạng ứng dụng cài đặt (file APK / AAB trên Google Play Store), mang lại trải nghiệm mượt mà, khởi động nhanh, tích hợp sâu vào hệ điều hành (phím Back, vùng an toàn, thông báo cập nhật).
- **Nguyên tắc thiết kế:**
  1. Giữ nguyên 100% logic gameplay và kết nối Colyseus hiện có, không chia rẽ mã nguồn giữa web và mobile.
  2. Không cài đặt gói phụ thuộc native vào repo khi chưa có quyết định của Người Dùng.
  3. Mọi tài nguyên âm thanh, hình ảnh đều tuân thủ giấy phép CC0 / CC-BY và được kiểm duyệt qua `npm run check:credits`.

---

## 2. So sánh hai hướng đóng gói: Capacitor vs TWA (Bubblewrap)

| Tiêu chí | Hướng 1: Capacitor (Khuyên dùng) | Hướng 2: TWA (Trusted Web Activity) |
|---|---|---|
| **Cơ chế hoạt động** | Bọc toàn bộ bundle `client/dist` vào trong APK native (`assets/`). WebView nạp nội bộ từ `http://localhost`. Kết nối server qua WSS/HTTPS. | Bọc trang web PWA (`https://tiengioi.vn`) chạy trên phiên bản Chrome/WebView của máy. |
| **Kích thước APK** | ~10 – 15 MB (chứa toàn bộ assets, atlas, âm thanh, runtime native). | Siêu nhẹ (~2 – 3 MB, chỉ là vỏ mở trình duyệt). |
| **Tốc độ khởi động** | **Tức thì (0ms tải mạng ban đầu)** vì toàn bộ HTML/JS/CSS/ảnh nạp từ bộ nhớ máy. | Phụ thuộc tốc độ mạng trong lần mở đầu tiên (sau đó SW cache). |
| **Yêu cầu hạ tầng** | **Không cần tên miền HTTPS thật ngay lập tức**; dev có thể trỏ tới IP LAN (`http://192.168.x.x:2577`) để test ngay. | **Bắt buộc phải có tên miền HTTPS thật** và cấu hình file xác thực `assetlinks.json`. |
| **Khả năng can thiệp Native** | **Toàn diện:** Xử lý phím Back cứng, Haptics (rung khi trúng đòn), khoá màn hình sáng, Safe-area insets. | **Hạn chế:** Chỉ có các Web API tiêu chuẩn mà trình duyệt Chrome trên máy hỗ trợ. |
| **Vòng đời cập nhật** | Cập nhật client cần tải bản APK mới từ Store (hoặc tích hợp giải pháp Live Updates). | Cập nhật tự động ngay khi deploy bản web lên server. |
| **Mở rộng sang iOS** | Dùng chung 1 codebase Capacitor cho cả Android và iOS. | Chỉ áp dụng cho Android; iOS phải làm giải pháp khác hoàn toàn. |

> **Khuyến nghị kiến trúc của Dev B:** Nên chọn **Hướng 1 (Capacitor)** cho game MMORPG:
> - Người chơi tải game về máy kỳ vọng vào game ngay lập tức, không muốn chờ đợi tải tài nguyên qua mạng lúc mới mở app.
> - Game cần can thiệp phím Back phần cứng của Android để đóng bảng UI thay vì vô tình thoát game.
> - Hỗ trợ tốt môi trường phát triển cục bộ và mạng nội bộ mà không đòi hỏi domain HTTPS có chứng chỉ công khai.

---

## 3. Vòng đời ứng dụng & Trải nghiệm Native (Lifecycle & Native UX)

### 3.1. Chuyển đổi Nền / Tiền cảnh (Background / Foreground)
- **Vấn đề:** Khi người chơi ấn phím Home, nhận cuộc gọi hoặc chuyển sang ứng dụng khác, hệ điều hành Android sẽ đóng băng hoặc hạn chế tiến trình mạng của WebView, dẫn đến mất kết nối WebSocket Colyseus.
- **Giải pháp:**
  - Tiên Giới đã có sẵn kiến trúc giữ nhân vật `RECONNECT_GRACE_S = 20s` trên server (#116) và cơ chế tự động kết nối lại bằng `activeToken` trong RAM (#117, `client/src/connection.ts`).
  - Khi app quay lại tiền cảnh (lắng nghe sự kiện `appStateChange` của `@capacitor/app` hoặc `visibilitychange` của document):
    - Kiểm tra ngay trạng thái kết nối `room.connection.isOpen`.
    - Nếu kết nối đã bị đóng, lập tức kích hoạt chu kỳ `reconnect()` mà không cần đợi timeout 5-10 giây của WebSocket.
    - Hiển thị banner đếm ngược mờ nhẹ `Đang kết nối lại...`.

### 3.2. Phím Quay lại Phần cứng của Android (Hardware Back Button)
- **Vấn đề:** Trên thiết bị Android, người chơi có thói quen bấm phím Back (hoặc cử chỉ vuốt cạnh màn hình) để đóng modal. Mặc định WebView có thể back trang web hoặc thoát app.
- **Giải pháp:**
  - Lắng nghe sự kiện `backButton` native qua `@capacitor/app`:
    ```ts
    App.addListener('backButton', () => {
      // 1. Nếu có modal/popup đang mở: gọi hàm xử lý Esc tập trung
      const closed = ui.handleEscape();
      if (closed) return;

      // 2. Nếu không có modal nào mở: cơ chế Double-back to exit
      if (Date.now() - lastBackPress < 2000) {
        App.exitApp();
      } else {
        lastBackPress = Date.now();
        ui.showToast('Nhấn lần nữa để thoát trò chơi');
      }
    });
    ```
  - Tận dụng 100% hàm `processEscapeKey()` và ngăn xếp `modalStack` đã được chuẩn hoá ở Issue #269 / #280.

### 3.3. Tai thỏ, Nốt ruồi và Vùng an toàn (Notch & Safe Area Insets)
- Khai báo meta viewport trong `client/index.html`: `viewport-fit=cover`.
- Trò chơi hiển thị dạng ngang (Landscape) toàn màn hình. Cạnh trái/phải sẽ gặp tai thỏ (notch) hoặc thanh điều hướng hệ thống.
- Sử dụng CSS Safe Area Insets:
  ```css
  #hud-top-left {
    padding-top: max(8px, env(safe-area-inset-top));
    padding-left: max(8px, env(safe-area-inset-left));
  }
  #quickbar {
    padding-right: max(8px, env(safe-area-inset-right));
    padding-bottom: max(8px, env(safe-area-inset-bottom));
  }
  ```
- Canvas của Phaser 3 giữ nguyên tỷ lệ scale `RESIZE`, tự động vẽ tràn viền dưới tai thỏ để tạo cảm giác không gian vô cực.

### 3.4. Bàn phím ảo (Virtual Keyboard) che ô Chat
- Khi người chơi chạm vào ô nhập chat (`#chat-input`), bàn phím ảo Android đẩy lên.
- Cấu hình trong `AndroidManifest.xml`: `android:windowSoftInputMode="adjustResize"`.
- Khi bàn phím xuất hiện, khung chat co ngắn lại nhưng không làm lệch vị trí render của Phaser canvas hoặc đẩy trôi thanh HUD.

### 3.5. Chính sách tự phát Âm thanh (Audio Autoplay Policy)
- Android WebView cấm AudioContext tự động phát trước khi có tương tác người dùng.
- Client Tiên Giới (`client/src/audio.ts`) đã sẵn sàng cơ chế unlock AudioContext ngay từ cú chạm đầu tiên vào nút "Vào Trò Chơi" hoặc màn hình đăng nhập.
- Khi app chuyển xuống nền (`visibilitychange: hidden`), tự động tạm dừng Web Audio / BGM để tiết kiệm pin và tránh làm phiền người dùng.

---

## 4. Quản lý Phiên bản (`PROTOCOL_VERSION`) & Cập nhật ứng dụng

- **Cơ chế hiện tại:** Server kiểm tra `v: PROTOCOL_VERSION` ở bước `onAuth` đầu tiên. Nếu client quá cũ (`v < MIN_PROTOCOL_VERSION`), server ngắt kết nối với mã lỗi 426 (`wrong_protocol`) và client hiện modal `#outdated-modal` yêu cầu cập nhật (#257, #264).
- **Khác biệt trên App Android:**
  - Trên trình duyệt web, modal có nút "Tải Lại Trang" (`location.reload()`) để tải bundle mới từ máy chủ.
  - Trên app native Capacitor, gói mã nằm cứng trong APK (`assets/`), việc reload trang **không thể** cập nhật logic client nếu có thay đổi giao thức!
- **Giải pháp trên Android:**
  - Phát hiện môi trường native qua `window.Capacitor?.isNativePlatform()`.
  - Trong hàm `ui.showClientOutdated()`:
    - Nếu là App Native: Đổi tiêu đề và nhãn nút thành **"Cập Nhật Bản Mới"**.
    - Khi bấm nút: Mở ứng dụng Google Play Store hoặc trình duyệt chuyển tiếp tới liên kết tải app:
      `market://details?id=vn.tiengioi.game` (fallback sang `https://play.google.com/store/apps/details?id=vn.tiengioi.game`).
    - Chặn nút tải lại trang vô ích.

---

## 5. Cấu hình Địa chỉ Máy chủ theo Môi trường (Không nhúng Bí mật)

- **Nguyên tắc an toàn:**
  - Tuyệt đối **không nhúng** private key, mật khẩu cơ sở dữ liệu, secret token vào mã nguồn client hoặc file cấu hình APK.
  - Client chỉ chứa URL công khai của máy chủ WebSocket / HTTP API.
- **Biến môi trường Vite build-time:**
  ```bash
  # .env.production
  VITE_SERVER_URL=https://game.tiengioi.vn
  VITE_WS_URL=wss://game.tiengioi.vn
  ```
- **Hỗ trợ Tester / Dev nội bộ:**
  - Thêm một "cửa sổ bí mật" dành cho dev/tester: Bấm liên tiếp 5 lần vào biểu tượng Tiên Giới ở màn hình Đăng nhập để mở hộp thoại nhập địa chỉ máy chủ thử nghiệm (lưu vào `localStorage("tg_custom_server")`).
  - Giúp dev có thể dùng 1 file APK duy nhất để kiểm thử kết nối tới máy dev nội bộ (`http://192.168.x.x:2577`) hoặc server staging mà không phải build lại APK nhiều lần.

---

## 6. Ma trận Kiểm thử (Test Matrix)

### 6.1. Kiểm thử tự động qua Chrome Headless CDP (Dev chạy tự động)
Các hạng mục có thể kiểm thử tự động 100% trong môi trường CI/Linux mà không cần thiết bị thật:
1. **Giả lập kích thước màn hình Android:**
   - 360x640 (màn hình phổ thông nhỏ).
   - 390x844 (màn hình chuẩn hiện đại).
   - 412x915 (Google Pixel 7).
   - 844x390 (màn hình ngang landscape).
2. **Giả lập cảm ứng & Điều khiển:**
   - Thao tác di chuyển bằng Joystick ảo góc trái.
   - Thao tác vừa di chuyển vừa bấm nút kỹ năng/chém (multitouch).
3. **Giả lập ngắt mạng và tự động nối lại:**
   - Sử dụng lệnh CDP `Network.emulateNetworkConditions` để ngắt mạng 5s rồi bật lại, xác nhận nhân vật giữ nguyên vị trí và trạng thái sau khi nối lại.
4. **Giả lập màn hình tai thỏ:**
   - Kiểm tra padding CSS safe-area không làm tràn hoặc che mất các nút HUD.

### 6.2. Kiểm thử trên Thiết bị Android Thật (Cần người dùng / QA)
1. **Hiệu năng thực tế (Frame rate & CPU):**
   - Đo FPS thực tế trên các dòng chip di động khác nhau (Snapdragon, MediaTek Dimensity, Exynos) ở cảnh đông người (100 người trong Lạc Hà Trấn).
2. **Nhiệt độ & Pin:**
   - Chạy game liên tục trong 20 – 30 phút, kiểm tra máy có bị nóng ran hoặc throttle CPU làm tụt FPS không.
3. **Gõ tiếng Việt trên bàn phím ảo:**
   - Kiểm thử gõ chat bằng bộ gõ Gboard, Laban Key, Samsung Keyboard xem có bị mất dấu hoặc che mất ô chat không.
4. **Cử chỉ điều hướng hệ thống:**
   - Thử nghiệm cử chỉ vuốt từ cạnh màn hình (Gesture Navigation) trên Android 13/14 để kiểm tra phím Back.

---

## 7. Kế hoạch Triển khai (Đề xuất phân công công việc)

Khi Người Dùng quyết định triển khai Android, công việc sẽ được chia thành các Issue nhỏ, gọn:

| Mã việc | Nội dung việc | Dev phụ trách | Ước lượng |
|---|---|---|---|
| **M4.2a** | Khởi tạo dự án Capacitor, cấu hình `capacitor.config.ts`, bundle ID `vn.tiengioi.game`, icon & splash screen. | Dev B | 1 PR |
| **M4.2b** | Tích hợp xử lý phím Back Android, Safe Area Insets, và nút mở Google Play khi lỗi 426 (`PROTOCOL_VERSION`). | Dev B | 1 PR |
| **M4.2c** | Workflow GitHub Actions tự động build APK unsigned / test artifact cho mỗi release tag. | Dev C | 1 PR |
| **M4.2d** | Thử nghiệm thực tế trên máy Android thật, tối ưu FPS và kiểm tra bàn phím ảo. | Dev B + C | 1 PR |

---

## 8. Giấy phép Tài nguyên & Biểu tượng (Licensing & Assets)

- **Tuân thủ bản quyền:** Toàn bộ ảnh tileset, sprite quái, trang bị và âm thanh của game đều là tài sản CC0 hoặc CC-BY được ghi danh rõ ràng trong `CREDITS.md`. Trò chơi không sử dụng bất kỳ tài nguyên vi phạm bản quyền hay tài sản từ game khác.
- **Biểu tượng ứng dụng (App Icons):**
  - Đã có sẵn bộ icon tiêu chuẩn tại `client/public/icons/`:
    - `icon-192.png`: 192x192 px.
    - `icon-512.png`: 512x512 px.
    - `icon-maskable-512.png`: Icon thích ứng (Adaptive Icon) đáp ứng chuẩn an toàn hiển thị của Google Play Store (vùng an toàn 80% đường kính tròn).
  - Có thể tạo thêm icon định dạng Vector Drawable XML cho Android Native mà không mất thêm chi phí thiết kế.

---

## 9. Các câu hỏi quyết định cần Người Dùng chốt

1. **Phương án đóng gói:**
   - [x] *(Khuyên nghị)* **Phương án A (Capacitor):** Đóng gói toàn bộ bundle offline, khởi động tức thì, hỗ trợ phím Back native và chạy được trên cả mạng LAN nội bộ chưa có domain.
   - [ ] **Phương án B (TWA / Bubblewrap):** Đóng gói PWA siêu nhẹ (< 3 MB), nhưng bắt buộc phải có domain HTTPS thật và cài đặt `assetlinks.json`.
2. **Kênh phát hành ban đầu:**
   - Bạn muốn xuất file **APK cài trực tiếp** (cho tester tải về cài qua link) hay đưa thẳng lên **Google Play Store** (cần tài khoản Google Play Developer 25$)?
3. **Thứ tự ưu tiên nền tảng:**
   - Tập trung hoàn thiện Android trước, hay muốn chuẩn bị cấu hình để sau này build đồng thời cả iOS (cần macOS & tài khoản Apple Developer)?
