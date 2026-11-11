# Hướng dẫn Đóng gói Ứng dụng Android (Capacitor)

Tài liệu hướng dẫn quy trình build, đồng bộ và phát triển ứng dụng Android native của Tiên Giới bằng Capacitor.

---

## 1. Cấu trúc Dự án

- `app/`: Thư mục dự án Capacitor riêng biệt (nằm ngoài `workspaces` của `package.json` gốc để CI/Docker không kéo thừa phụ thuộc Android: CLI, `@capacitor/android`). Riêng `client/` có `@capacitor/core` + `@capacitor/app` bản JS (xem mục 3).
  - `capacitor.config.ts`: Cấu hình chính cho bản phát hành (`appId: "site.hethongtm.tiengioi"`, `appName: "Tiên Giới"`, `androidScheme: "https"`, trỏ tới `../client/dist`).
  - `capacitor.config.debug.ts`: Cấu hình debug nội bộ khi `CAP_DEBUG=1` (cho phép HTTP LAN / cleartext).
  - `android/`: Mã nguồn dự án Android Studio nguyên bản (đã cấu hình `allowBackup="false"`, `usesCleartextTraffic="false"`, `adjustResize`, `sensorLandscape`).
- `client/.env.native`: Cấu hình môi trường bản native (`VITE_SERVER_URL=wss://tiengioi.hethongtm.site`, `VITE_NATIVE=1`). Khi có cờ này, client tự động tắt Service Worker PWA (`setupPwa`) để tránh xung đột bộ nhớ đệm WebView.

---

## 2. Lệnh Thường Dùng

### 2.1 Build Bundle Web cho Native
Chạy từ thư mục gốc hoặc trong `client/`:
```bash
npm run build:native -w client
```
Lệnh này chạy `vite build --mode native`, đọc biến môi trường từ `client/.env.native` và xuất tài nguyên web tối ưu vào `client/dist`.

### 2.2 Đồng bộ Sang Android
Chuyển vào thư mục `app/` và chạy:
```bash
cd app
npm run sync       # tương đương npx cap sync android
```
Lệnh này sao chép web assets từ `client/dist` vào `app/android/app/src/main/assets/public/` và cập nhật các plugin Android.

### 2.3 Kiểm tra Sức Khỏe Dự án
```bash
cd app
npm run doctor     # tương đương npx cap doctor
```

### 2.4 Sinh Lại Biểu Tượng & Màn Hình Chờ
Nếu có cập nhật ảnh trong `client/public/icons/`, chạy script:
```bash
python3 app/scripts/generate-android-assets.py
cd app && npm run sync
```

---

## 3. Quản lý Plugin Capacitor

**Quy tắc bắt buộc:**
1. Phần NATIVE của plugin (Android, `cap sync`) chỉ cài trong thư mục `app/` (`cd app && npm install <plugin>`), **không** thêm `app/` vào `workspaces` của gốc.
2. Phải ghim phiên bản chính xác (không dùng dấu `^` hoặc `~`).
3. **Phần JS của plugin cũng phải nằm trong `client/package.json`** (cùng phiên bản đúng từng số với `app/package.json`; test `native-capacitor-wiring.test.ts` giữ điều này). Lý do: bridge Android KHÔNG tự điền `window.Capacitor.Plugins.<Tên>`; chỉ `registerPlugin('<Tên>')`, chạy khi gói JS được `import`, mới điền. Không import thì plugin không dùng được trên máy thật (đã dính với `@capacitor/app`, review #314). Hiện `client/` phụ thuộc `@capacitor/core` + `@capacitor/app` (chỉ JS, vài kB); `main.ts` nạp động `@capacitor/app` chỉ khi `VITE_NATIVE=1`, bản web không tải. Plugin mới: thêm vào CẢ hai nơi, `import` nó trong mã client, thêm test nối dây như `native-capacitor-wiring.test.ts` (dùng `@capacitor/core` thật với bridge giả).
4. Sau khi thêm hoặc gỡ bỏ plugin:
   ```bash
   cd app
   npx cap sync android
   ```

---

## 4. Chế độ Thử Nghiệm LAN (Debug)

Khi cần kết nối máy thật tới server dev nội bộ trên mạng WiFi:
1. Chạy sync với cờ `CAP_DEBUG=1`:
   ```bash
   cd app
   CAP_DEBUG=1 npm run sync
   ```
   Khi có biến môi trường `CAP_DEBUG=1`, `capacitor.config.ts` tự động cấu hình `androidScheme: "http"` và `cleartext: true`.
2. Mặc định (khi không có biến `CAP_DEBUG`), `npm run sync` luôn sinh cấu hình phát hành an toàn (`androidScheme: "https"`, không cleartext).

> [!WARNING]
> Bản phát hành trên Google Play hoặc APK phát hành cho người chơi **bắt buộc** chạy không có cờ `CAP_DEBUG` (không bật `cleartext` hay `server.url`).

---

## 5. Ký và Đóng gói APK (Release Signing)

- Việc dựng và ký file APK phát hành tự động được thực hiện qua GitHub Actions (Dev C phụ trách ở M4.2c, tham khảo `docs/TRIEN_KHAI.md`).
- **Tuyệt đối không lưu trữ:** tệp keystore (`*.jks`, `*.keystore`), mật khẩu store/key trong git. Mọi thông tin nhạy cảm được quản lý qua GitHub Secrets và biến môi trường của CI.
- Mọi thắc mắc về khóa ký được ghi nhận tại `~/TT/orchestra/questions.md`.

---

## 6. Phím Back Android & Vòng đời Native (M4.2b)

- **Phím Back vật lý / Cử chỉ điều hướng:**
  - Được quản lý bởi `NativeBackButtonController` (`client/src/native-app.ts`).
  - Khi có modal/dialog/menu mở: gọi `ui.handleEscape()` đóng tầng trên cùng.
  - Khi đang ở màn hình đăng nhập: thoát ứng dụng ngay lập tức (`App.exitApp()`).
  - Khi đang hiển thị modal "Phiên bản đã cũ" (426): phím Back bị vô hiệu hóa để không thoát nhầm.
  - Khi đang phiêu bạt trong thế giới game: nhấn 2 lần trong 2 giây mới thoát game (lần đầu hiển thị thông báo toast: *"Nhấn lần nữa để thoát trò chơi"*).
- **Vòng đời xuống nền / tiền cảnh:**
  - Sự kiện `appStateChange` của `@capacitor/app`:
    - `isActive: false` (xuống nền): tạm dừng âm thanh (`sound.suspend()`) và thông báo cho bộ nhịp tim `HeartbeatController.onVisibilityChange(true)` dừng ping định kỳ.
    - `isActive: true` (quay lại tiền cảnh): phục hồi âm thanh (`sound.resume()`) và thông báo cho bộ nhịp tim kiểm tra ngay kết nối còn sống hay socket nửa mở.

---

## 7. Cập nhật Phiên bản Cũ (Lỗi 426) & Cấu hình URL

- Khi máy chủ nâng cấp `MIN_PROTOCOL_VERSION` và trả về mã lỗi `426` (`JOIN_CLIENT_OUTDATED`):
  - Trên web: hiển thị nút *"Tải Lại Trang"* để tải lại bundle mới từ máy chủ.
  - Trên bản native: hiển thị nút *"Cập Nhật Bản Mới"* và khi bấm sẽ mở liên kết tải bản mới.
- **Biến môi trường URL tải:**
  - Mặc định mở trang GitHub Releases: `https://github.com/nguyencong1227/tien-gioi/releases`.
  - Khi phát hành trên Google Play Store, cấu hình biến build `VITE_APP_UPDATE_URL` (ví dụ: `https://play.google.com/store/apps/details?id=site.hethongtm.tiengioi` hoặc link tải APK trực tiếp) mà không cần sửa mã nguồn.

---

## 8. Trang Quyền Riêng Tư (Privacy Policy)

- Tệp tĩnh `client/public/privacy.html` chứa nội dung chính sách quyền riêng tư bằng tiếng Việt theo yêu cầu của Google Play Store (mục đích dữ liệu, lưu trữ mã hóa scrypt, quyền xóa tài khoản và thông tin liên hệ).
