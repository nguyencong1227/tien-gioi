# Thiết Kế Đóng Gói Ứng Dụng Di Động Android (M4.2)

> **Tài liệu tham chiếu thiết kế kiến trúc đóng gói Android cho Tiên Giới.**  
> Biên soạn: Dev B (Client & Trải nghiệm).  
> Liên quan: Milestone M4 (Mục 4.2), Issue #280.  
> Trạng thái: **Bản thiết kế đề xuất (chỉ tài liệu)** chờ Người Dùng chốt hướng đi trước khi tạo issue mã nguồn.  
> Rà soát: Dev A đối chiếu từng tham chiếu (hàm, biến, đường dẫn) với mã trên `main` ngày 11/11/2026; chỗ nào lệch đã sửa tại chỗ, thêm mục 5.2 (lời gọi HTTP và CORS) và số đo ở 6.1.

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
| **Cơ chế hoạt động** | Bọc toàn bộ bundle `client/dist` vào trong APK native (`assets/`). WebView nạp nội bộ từ `https://localhost` hoặc `http://localhost` (tuỳ `server.androidScheme`, chốt ở M4.2a theo phiên bản Capacitor). Kết nối server qua WSS/HTTPS. | Bọc trang web PWA (`https://tiengioi.vn`) chạy trên phiên bản Chrome/WebView của máy. |
| **Kích thước APK** | Ước tính ~6 – 15 MB (bundle `client/dist` hiện 2,1 MB, cộng runtime native; số thật đo ở M4.2a). | Siêu nhẹ (~2 – 3 MB, chỉ là vỏ mở trình duyệt). |
| **Tốc độ khởi động** | **Tức thì (0ms tải mạng ban đầu)** vì toàn bộ HTML/JS/CSS/ảnh nạp từ bộ nhớ máy. | Phụ thuộc tốc độ mạng trong lần mở đầu tiên (sau đó SW cache). |
| **Yêu cầu hạ tầng** | **Không cần tên miền HTTPS thật để phát triển**; dev có thể trỏ tới IP LAN (`http://192.168.x.x:2567`, cổng `PORT` của server) nhưng chỉ với bản debug và phải bật cấu hình cleartext (xem 5.3). Bản phát hành vẫn cần HTTPS / WSS. | **Bắt buộc phải có tên miền HTTPS thật** và cấu hình file xác thực `assetlinks.json`. |
| **Khả năng can thiệp Native** | **Toàn diện:** Xử lý phím Back cứng, Haptics (rung khi trúng đòn), khoá màn hình sáng, Safe-area insets. | **Hạn chế:** Chỉ có các Web API tiêu chuẩn mà trình duyệt Chrome trên máy hỗ trợ. |
| **Vòng đời cập nhật** | Cập nhật client cần tải bản APK mới từ Store (hoặc tích hợp giải pháp Live Updates). | Cập nhật tự động ngay khi deploy bản web lên server. |
| **Mở rộng sang iOS** | Dùng chung 1 codebase Capacitor cho cả Android và iOS. | Chỉ áp dụng cho Android; iOS phải làm giải pháp khác hoàn toàn. |

> **Khuyến nghị kiến trúc của Dev B:** Nên chọn **Hướng 1 (Capacitor)** cho game MMORPG:
> - Người chơi tải game về máy kỳ vọng vào game ngay lập tức, không muốn chờ đợi tải tài nguyên qua mạng lúc mới mở app.
> - Game cần can thiệp phím Back phần cứng của Android để đóng bảng UI thay vì vô tình thoát game.
> - Hỗ trợ tốt môi trường phát triển cục bộ và mạng nội bộ mà không đòi hỏi domain HTTPS có chứng chỉ công khai.
>
> **Cái giá của Capacitor (cần người dùng biết):** client bị đóng băng trong APK, nên mỗi lần đổi `shared/` không tương thích ngược (tăng `PROTOCOL_VERSION`, xem `AGENTS.md`) mà muốn nâng `MIN_PROTOCOL_VERSION` thì mọi người chơi Android phải cập nhật qua Store (duyệt có thể mất vài giờ đến vài ngày), trong lúc đó họ chỉ thấy màn hình "Có bản mới". Quy tắc đề xuất: phát hành bản app mới và chờ đa số cập nhật TRƯỚC khi nâng `MIN_PROTOCOL_VERSION` trên server. TWA không có ràng buộc này vì client luôn là bản web mới nhất.

---

## 3. Vòng đời ứng dụng & Trải nghiệm Native (Lifecycle & Native UX)

### 3.1. Chuyển đổi Nền / Tiền cảnh (Background / Foreground)
- **Vấn đề:** Khi người chơi ấn phím Home, nhận cuộc gọi hoặc chuyển sang ứng dụng khác, hệ điều hành Android sẽ đóng băng hoặc hạn chế tiến trình mạng của WebView, dẫn đến mất kết nối WebSocket Colyseus.
- **Giải pháp:**
  - Tiên Giới đã có sẵn kiến trúc giữ nhân vật `RECONNECT_GRACE_S = 20s` trên server (#116) và cơ chế tự động kết nối lại bằng `activeToken` trong RAM (#117). Phần client nằm trong `client/src/main.ts` (`setupRoomLifecycle`: `onLeave` với mã khác 1000 / 4xxx chạy vòng `client.reconnect(token)` mỗi 1,5 giây tối đa 20 giây, banner `ui.showReconnectNotice`), không phải `connection.ts` (file đó chỉ lo lỗi 426).
  - **Hiện chưa có** bộ lắng nghe `visibilitychange` / `appStateChange` nào: vòng nối lại chỉ chạy khi `onLeave` bắn. Khi app xuống nền, socket có thể chết mà WebView chưa báo (nửa mở), nên cần thêm (M4.2b), khi app quay lại tiền cảnh (`appStateChange` của `@capacitor/app` hoặc `visibilitychange`):
    - Nếu app ở nền quá vài giây hoặc `room.connection.isOpen` là `false`: coi như đã rớt và chạy vòng nối lại sẵn có ngay, không chờ WebView tự phát hiện.
    - Hiển thị banner `Đang kết nối lại...` (đã có `showReconnectNotice`).
  - **Ở nền quá 20 giây:** server đã gỡ nhân vật (`allowReconnection` hết hạn), `client.reconnect(token)` báo lỗi và client rơi vào `showDisconnected()`. Nhân vật vẫn được lưu nên người chơi chỉ cần vào lại; bản native phải kiểm màn hình này dẫn về đăng nhập thay vì kẹt banner.
  - Trong bí cảnh không có nối lại (`main.ts`: rớt mạng thì rời run ngay, không thử `reconnect`), nên xuống nền giữa bí cảnh là rời run; cần xem lại hệ quả lượt ngày (`docs/THIET_KE_BI_CANH.md`) và cân nhắc cảnh báo trước khi vào bí cảnh trên app (nhỏ, để M4.2b quyết).

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
        ui.toast({ text: 'Nhấn lần nữa để thoát trò chơi', tone: 'info' });
      }
    });
    ```
  - Tận dụng `ui.handleEscape()` (`client/src/ui.ts`, gọi `processEscapeKey()` và `modalStack` ở `client/src/a11y.ts`, #269 / #281). Lưu ý `handleEscape()` trả `true` cả khi chỉ bỏ focus ô chat hoặc ẩn lời mời (Esc không từ chối lời mời), nên Back lần đầu có thể chỉ làm việc đó; chấp nhận được, ghi vào kiểm thử máy thật.

### 3.3. Tai thỏ, Nốt ruồi và Vùng an toàn (Notch & Safe Area Insets)
- **Đã có sẵn từ PWA:** `viewport-fit=cover` (`client/index.html`) và `env(safe-area-inset-*)` cho HUD, nút nhanh, hộp thoại (`client/src/style.css`). M4.2b không viết lại mà chỉ kiểm lại trong WebView.
- Trò chơi hiển thị dạng ngang (Landscape) toàn màn hình. Cạnh trái/phải sẽ gặp tai thỏ (notch) hoặc thanh điều hướng hệ thống.
- **Điểm rủi ro cần thử trên máy thật:** `env(safe-area-inset-*)` trong WebView Android chỉ trả giá trị khác 0 khi ứng dụng vẽ tràn viền (edge-to-edge); nếu không, HUD không bị che nhưng cũng không tràn viền. Cấu hình `StatusBar` / `SystemBars` của Capacitor (tên cấu hình đổi theo phiên bản) quyết định việc này, nên chốt ở M4.2a cùng phiên bản Capacitor.
- Canvas Phaser dùng `Phaser.Scale.RESIZE` (`client/src/main.ts`), tự co theo cửa sổ.

### 3.4. Bàn phím ảo (Virtual Keyboard) che ô Chat
- Khi người chơi chạm vào ô nhập chat (`#chat-input`), bàn phím ảo Android đẩy lên.
- Cấu hình trong `AndroidManifest.xml`: `android:windowSoftInputMode="adjustResize"`.
- Vì canvas dùng `Scale.RESIZE` và client chưa xử lý `visualViewport`, với `adjustResize` cả cửa sổ (kể cả canvas và HUD) sẽ co lại khi bàn phím hiện; điều này CHƯA được kiểm chứng là chấp nhận được. Thử ở M4.2d trên máy thật; nếu HUD bị bóp méo thì phương án thay thế là `adjustNothing` và tự dịch riêng ô chat theo `visualViewport`.

### 3.5. Chính sách tự phát Âm thanh (Audio Autoplay Policy)
- Android WebView cấm AudioContext tự động phát trước khi có tương tác người dùng.
- Client Tiên Giới (`client/src/audio.ts`) đã có cơ chế unlock AudioContext ở cú chạm / phím đầu tiên (`pointerdown` / `keydown` trên cửa sổ), nên bước đăng nhập đã đủ làm tương tác đầu tiên.
- **Hiện chưa có** việc tạm dừng khi xuống nền (`audio.ts` chỉ gọi `resume()`): thêm ở M4.2b, khi `visibilitychange: hidden` thì `suspend()` AudioContext và `resume()` khi quay lại.

---

## 4. Quản lý Phiên bản (`PROTOCOL_VERSION`) & Cập nhật ứng dụng

- **Cơ chế hiện tại:** Server kiểm tra `v: PROTOCOL_VERSION` ở bước `onAuth` đầu tiên. Nếu client quá cũ (`v < MIN_PROTOCOL_VERSION`), server ngắt kết nối với mã lỗi 426 (`wrong_protocol`) và client hiện modal `#outdated-modal` yêu cầu cập nhật (#257, #264).
- **Khác biệt trên App Android:**
  - Trên trình duyệt web, modal có nút "Tải Lại Trang" (`location.reload()`) để tải bundle mới từ máy chủ.
  - Trên app native Capacitor, gói mã nằm cứng trong APK (`assets/`), việc reload trang **không thể** cập nhật logic client nếu có thay đổi giao thức!
- **Giải pháp trên Android:**
  - Phát hiện môi trường native qua `window.Capacitor?.isNativePlatform()` ở một chỗ duy nhất (`main.ts`), không rải vào `ui.ts`.
  - `ui.showClientOutdated(minVersion, onReload?)` đã nhận callback `onReload` (hiện `main.ts` truyền `handleOutdatedReload`), nhưng **câu thông báo và nhãn nút đang viết cứng "tải lại trang"** (`ui.ts`). Việc cần làm: thêm tham số tuỳ chọn cho nội dung và nhãn nút; bản native truyền nhãn **"Cập Nhật Bản Mới"** và callback mở cửa hàng ứng dụng:
    - `market://details?id=<applicationId>` (fallback `https://play.google.com/store/apps/details?id=<applicationId>`). `applicationId` là giá trị **minh hoạ** (xem 5.1 và câu hỏi cuối tài liệu), không được đổi sau khi đã lên Google Play.
    - Không còn nút tải lại trang vô ích.
  - **Tắt service worker PWA ở bản native:** `main.ts` gọi `setupPwa` khi `import.meta.env.PROD`, sẽ đăng ký `sw.js` trong WebView và có thể hiện toast "Có bản cập nhật mới" mà bundle trong APK không bao giờ tự đổi. Bản build cho Capacitor phải bỏ nhánh này (cờ build, ví dụ `VITE_NATIVE=1`).

---

## 5. Cấu hình Địa chỉ Máy chủ theo Môi trường (Không nhúng Bí mật)

> Mọi tên miền và `applicationId` trong tài liệu này (`game.tiengioi.vn`, `vn.tiengioi.game`) là **giá trị minh hoạ**, chưa đăng ký; người dùng chốt giá trị thật.

### 5.1. Địa chỉ server theo môi trường
- **Nguyên tắc an toàn:**
  - Tuyệt đối **không nhúng** private key, mật khẩu cơ sở dữ liệu, secret token vào mã nguồn client hoặc file cấu hình APK.
  - Client chỉ chứa URL công khai của máy chủ.
- **Biến môi trường Vite build-time đã có:** `VITE_SERVER_URL` (`client/src/main.ts`, hàm `serverUrl()`; nếu không đặt thì client lấy cùng host với trang). Hiện chỉ dùng cho `new Client(...)` của Colyseus nên có dạng `ws(s)://...`. **Không có `VITE_WS_URL`**; không thêm biến thứ hai, mà suy ra URL HTTP từ cùng một biến (xem 5.2).
  ```bash
  # .env.production (minh hoạ)
  VITE_SERVER_URL=wss://game.tiengioi.vn
  ```

### 5.2. Lời gọi HTTP và CORS (CHẶN cho Capacitor, phát hiện khi rà soát)
Ở web, client và server cùng nguồn nên mọi lời gọi HTTP dùng đường dẫn tương đối. Trong Capacitor trang chạy ở `localhost` của WebView, nên các lời gọi đó trỏ vào chính app chứ không phải server:
- `client/src/auth.ts`: `getHttpBaseUrl()` trả `""` (có chú thích "Cùng nguồn"); `AuthClient` ghép `baseUrl + path` cho `/api/auth/*`; `detectAuthMode()` gọi `fetch("/health")`. Hậu quả nếu bỏ qua: `/health` lỗi nên client đoán nhầm `legacy` (với server `AUTH_MODE=account` thì hiện sai màn hình đăng nhập), và mọi lời gọi đăng ký / đăng nhập hỏng.
- `server/src/index.ts` (express) **chưa có CORS ở đâu cả** (`AGENTS.md` ghi auth là "cùng nguồn, không CORS"). Khi trang ở nguồn khác (`https://localhost`, `http://localhost`, và `capacitor://localhost` nếu làm iOS) trình duyệt sẽ chặn phản hồi.
- Việc cần làm (đưa vào M4.2a, **gồm một phần phía server của Dev A**):
  1. Client: một hàm base URL HTTP dùng chung, dẫn xuất từ `VITE_SERVER_URL` (`wss` thành `https`, `ws` thành `http`; rỗng thì giữ `""` như hiện nay), dùng cho `AuthClient` và `detectAuthMode`.
  2. Server: CORS theo **danh sách cho phép** các nguồn (biến môi trường, ví dụ `CORS_ORIGINS`; mặc định rỗng = như hiện nay) cho `/health` và `/api/auth/*`, kèm xử lý `OPTIONS` cho header `Content-Type` / `Authorization`; không bao giờ `*` cho `/api/auth/*`; có test (nguồn lạ không nhận header, nguồn được phép nhận) và ghi `docs/TRIEN_KHAI.md`. Colyseus có xử lý CORS riêng cho đường matchmaking: kiểm lại khi làm, đừng giả định.
  3. Cách khác (cân nhắc ở M4.2a): dùng `CapacitorHttp` của Capacitor để lời gọi HTTP đi qua native, tránh CORS, nhưng làm hai đường mã (web / native) và khó kiểm bằng Chrome headless; đề xuất mặc định là CORS allowlist.

### 5.3. Phát triển trên mạng LAN (chỉ bản debug)
- Trang ở `https://localhost` mà nối tới `ws://192.168.x.x:2567` là nội dung hỗn hợp nên bị chặn; Android 9 trở lên cũng chặn lưu lượng không mã hoá mặc định. Muốn thử LAN phải bật cleartext và (nếu cần) `androidScheme: "http"` **chỉ ở bản debug**, tuyệt đối không có trong bản phát hành. Chi tiết cấu hình chốt ở M4.2a theo phiên bản Capacitor.

### 5.4. Hộp thoại đổi server cho tester
- Đề xuất ban đầu: bấm liên tiếp 5 lần vào biểu tượng Tiên Giới ở màn hình đăng nhập để nhập địa chỉ máy chủ thử (lưu vào `localStorage("tg_custom_server")`), để dùng một APK cho cả máy dev lẫn staging.
- **Chỉ có trong bản debug / nội bộ, không đưa lên Google Play:** nếu người chơi bị dụ nhập địa chỉ server lạ thì tên và mật khẩu (khi `AUTH_MODE=account`) bị gửi cho kẻ đó. Bản phát hành chỉ dùng `VITE_SERVER_URL` lúc build. Điều kiện bật phải là cờ build (loại bỏ mã khỏi bundle phát hành), KHÔNG dùng mẫu `import.meta.env.DEV || ?debug` của các công cụ dev khác, vì `?debug` trên URL vẫn bật được trong bản production.

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
   - **Không dùng** `Network.emulateNetworkConditions` (offline) một mình: Dev A đo trên Chrome 156 headless, bật offline 6 giây khi một WebSocket đang mở và gửi đều thì lưu lượng bị nghẽn nhưng **không bên nào thấy sự kiện đóng** (client `onclose` không bắn, server không thấy ngắt), nên `onLeave` không bắn và vòng nối lại của `main.ts` không chạy.
   - Trình duyệt cũng không tự gây mã 1006: `WebSocket.close(code)` chỉ nhận 1000 hoặc 3000-4999, mà `main.ts` coi 1000 và 4xxx là thoát chủ động (không nối lại). Bot Node (`server/scripts/bots.ts`, `ws.close()`) làm được vì không bị giới hạn đó.
   - **Đã triển khai trong `npm run e2e:noi-lai -w server` (#288):** Sử dụng một proxy TCP trung gian (`node:net`) đặt giữa tab Chrome headless và server Colyseus thật; proxy chủ động gọi `destroy()` trên socket để tạo lỗi ngắt kết nối bất thường (mã 1006) ép trình duyệt kích hoạt vòng lặp `setupRoomLifecycle`. Kiểm thử 3 ca hoàn chỉnh: (1) rớt mạng rồi tự nối lại thành công bảo toàn `sessionId`, túi đồ, vị trí; (2) rớt quá hạn grace (hạ `reconnectGraceS = 2`) nhận lỗi dứt khoát, hiện banner thất bại và lưu đĩa; (3) thoát chủ động mã 4000 không kích hoạt nối lại.
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
| **M4.2a-1** | **Server + client: HTTP tuyệt đối và CORS allowlist** (mục 5.2): hàm base URL dùng chung, `CORS_ORIGINS` cho `/health` và `/api/auth/*`, test, `docs/TRIEN_KHAI.md`. Làm TRƯỚC vì chặn mọi thứ khác. | Dev A (server) + Dev B (client) | 1 PR mỗi bên |
| **M4.2a** | Khởi tạo dự án Capacitor (`app/`), `capacitor.config.ts`, `applicationId` do người dùng chốt, icon & splash screen, cờ build native (tắt service worker, mục 4), cấu hình cleartext chỉ cho debug (mục 5.3). | Dev B | 1 PR |
| **M4.2b** | Phím Back Android, kiểm Safe Area Insets trong WebView, bộ lắng nghe nền / tiền cảnh và tạm dừng âm thanh (mục 3), nhãn + callback mở cửa hàng khi lỗi 426 (mục 4). | Dev B | 1 PR |
| **M4.2c** | Workflow GitHub Actions tự động build APK unsigned / test artifact cho mỗi release tag. | Dev C | 1 PR |
| **M4.2d** | Thử nghiệm thực tế trên máy Android thật, tối ưu FPS và kiểm tra bàn phím ảo. | Dev B + C | 1 PR |
| **M4.2e** | E2E nối lại bằng proxy TCP (mục 6.1) và ca viền màn hình / vùng an toàn. | Dev B (đã xong phần proxy TCP #288) / Dev C | Đã hoàn thành phần E2E nối lại (#288) |

Ngoài mã: để lên Google Play còn cần trang chính sách quyền riêng tư (game có tài khoản), bảng khai Data safety, xếp hạng nội dung và đáp ứng yêu cầu API mục tiêu mới nhất của Google tại thời điểm phát hành; đây là việc của người dùng, ghi ở câu hỏi 2.

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
   - [ ] **Phương án A (Capacitor), khuyến nghị:** Đóng gói toàn bộ bundle offline, khởi động tức thì, hỗ trợ phím Back native, thử được trên LAN bằng bản debug. Cái giá: mỗi lần nâng `MIN_PROTOCOL_VERSION` bắt buộc người chơi cập nhật qua Store (xem mục 2); cần thêm CORS ở server (mục 5.2).
   - [ ] **Phương án B (TWA / Bubblewrap):** Đóng gói PWA siêu nhẹ (< 3 MB), bắt buộc có domain HTTPS thật và cài đặt `assetlinks.json`; client luôn là bản web mới nhất nên không vướng ràng buộc cập nhật ở trên.
2. **Kênh phát hành ban đầu:**
   - Bạn muốn xuất file **APK cài trực tiếp** (cho tester tải về cài qua link) hay đưa thẳng lên **Google Play Store** (cần tài khoản Google Play Developer, phí một lần 25 USD, cùng trang chính sách quyền riêng tư và bảng Data safety)?
3. **Thứ tự ưu tiên nền tảng:**
   - Tập trung hoàn thiện Android trước, hay muốn chuẩn bị cấu hình để sau này build đồng thời cả iOS (cần macOS & tài khoản Apple Developer)?
4. **Tên miền và mã ứng dụng:**
   - Tên miền thật của server (dùng cho `VITE_SERVER_URL` và CORS) và `applicationId` (dạng `com.xxx.yyy`) là gì? `applicationId` không đổi được sau khi lên Google Play; tài liệu này chỉ dùng giá trị minh hoạ.
