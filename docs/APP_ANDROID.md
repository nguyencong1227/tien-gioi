# Hướng dẫn Đóng gói Ứng dụng Android (Capacitor)

Tài liệu hướng dẫn quy trình build, đồng bộ và phát triển ứng dụng Android native của Tiên Giới bằng Capacitor.

---

## 1. Cấu trúc Dự án

- `app/`: Thư mục dự án Capacitor riêng biệt (nằm ngoài `workspaces` của `package.json` gốc để CI/Docker không kéo thừa phụ thuộc Android).
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
1. Mọi plugin Capacitor chỉ cài đặt bên trong thư mục `app/` (`cd app && npm install <plugin>`), **tuyệt đối không** thêm vào `package.json` gốc hay `workspaces`.
2. Phải ghim phiên bản chính xác (không dùng dấu `^` hoặc `~`).
3. Sau khi thêm hoặc gỡ bỏ plugin:
   ```bash
   cd app
   npx cap sync android
   ```

---

## 4. Chế độ Thử Nghiệm LAN (Debug)

Khi cần kết nối máy thật tới server dev nội bộ trên mạng WiFi:
1. Đặt IP máy tính vào cấu hình debug.
2. Chạy sync với cờ debug:
   ```bash
   cd app
   CAP_DEBUG=1 npx cap sync android
   ```
> [!WARNING]
> Bản phát hành trên Google Play hoặc APK phát hành cho người chơi **bắt buộc** dùng `capacitor.config.ts` mặc định (không bật `cleartext` hay `server.url`).

---

## 5. Ký và Đóng gói APK (Release Signing)

- Việc dựng và ký file APK phát hành tự động được thực hiện qua GitHub Actions (Dev C phụ trách ở M4.2c, tham khảo `docs/TRIEN_KHAI.md`).
- **Tuyệt đối không lưu trữ:** tệp keystore (`*.jks`, `*.keystore`), mật khẩu store/key trong git. Mọi thông tin nhạy cảm được quản lý qua GitHub Secrets và biến môi trường của CI.
- Mọi thắc mắc về khóa ký được ghi nhận tại `~/TT/orchestra/questions.md`.
