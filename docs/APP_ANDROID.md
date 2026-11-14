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

---

## 5. Phím Back Android & Vòng đời Native (M4.2b)

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

## 6. Cập nhật Phiên bản Cũ (Lỗi 426) & Cấu hình URL

- Khi máy chủ nâng cấp `MIN_PROTOCOL_VERSION` và trả về mã lỗi `426` (`JOIN_CLIENT_OUTDATED`):
  - Trên web: hiển thị nút *"Tải Lại Trang"* để tải lại bundle mới từ máy chủ.
  - Trên bản native: hiển thị nút *"Cập Nhật Bản Mới"* và khi bấm sẽ mở liên kết tải bản mới.
- **Biến môi trường URL tải:**
  - Mặc định mở trang GitHub Releases: `https://github.com/nguyencong1227/tien-gioi/releases`.
  - Khi phát hành trên Google Play Store, cấu hình biến build `VITE_APP_UPDATE_URL` (ví dụ: `https://play.google.com/store/apps/details?id=site.hethongtm.tiengioi` hoặc link tải APK trực tiếp) mà không cần sửa mã nguồn.

---

## 7. Trang Quyền Riêng Tư (Privacy Policy)

- Tệp tĩnh `client/public/privacy.html` chứa nội dung chính sách quyền riêng tư bằng tiếng Việt theo yêu cầu của Google Play Store (mục đích dữ liệu, lưu trữ mã hóa scrypt, quyền xóa tài khoản và thông tin liên hệ).
- Kênh liên hệ trong trang (13/11/2026, người dùng cung cấp): trang Facebook của nhà phát triển `https://www.facebook.com/CongKudo.a/` (mục 4, nhận cả yêu cầu xóa dữ liệu). `client/src/privacy.test.ts` chặn phát hành lại với chỗ trống chưa điền hoặc mục liên hệ không có liên kết. Lưu ý khi lên Google Play: Play Console còn yêu cầu một địa chỉ email liên hệ của nhà phát triển (nhập trong Console, tách khỏi trang chính sách; không lưu vào repo).

---

## 8. Dựng APK trên GitHub Actions & Cài Đặt (M4.2c - Issue #302)

Do môi trường máy chủ cục bộ không có sẵn JDK và Android SDK, việc biên dịch và đóng gói APK được tự động hóa hoàn toàn trên GitHub Actions (`.github/workflows/android.yml`).

### 8.1 Kích hoạt dựng APK
Workflow được kích hoạt tự động theo 2 cách:
1. **Gắn thẻ phiên bản mới (`v*`):** Khi push tag (ví dụ `v0.1.0`), workflow sẽ tự động chạy song song cùng workflow phát hành Docker image.
2. **Kích hoạt thủ công (`workflow_dispatch`):** Vào mục **Actions -> Android APK -> Run workflow**, nhập thẻ phiên bản cần dựng lại (ví dụ `v0.1.0`).

### 8.2 Lấy APK từ GitHub Releases & Kiểm tra Checksum
Sau khi workflow hoàn tất:
1. Vào trang **Releases** của repository hoặc mục **Artifacts** của lượt chạy Actions.
2. Tải về file APK và file mã băm checksum tương ứng:
   - `tien-gioi-<thẻ>-debug.apk` và `tien-gioi-<thẻ>-debug.apk.sha256` (bản debug).
   - `tien-gioi-<thẻ>-release.apk` và `tien-gioi-<thẻ>-release.apk.sha256` (bản release đã ký, nếu repo đã cấu hình khóa).
3. **Đo và xác minh mã băm SHA-256:**
   - **Linux / macOS:**
     ```bash
     sha256sum -c tien-gioi-<thẻ>-debug.apk.sha256
     # hoặc:
     shasum -a 256 tien-gioi-<thẻ>-debug.apk
     ```
   - **Windows (PowerShell):**
     ```powershell
     Get-FileHash .\tien-gioi-<thẻ>-debug.apk -Algorithm SHA256
     ```
   Đối chiếu chuỗi SHA-256 với nội dung trong file `.sha256` đính kèm để đảm bảo tệp không bị lỗi tải hoặc can thiệp trên đường truyền.

### 8.3 Cài đặt APK lên thiết bị Android
- **Cách 1: Qua cáp USB với Android Debug Bridge (`adb`):**
  Bật "Gỡ lỗi USB" (USB Debugging) trên điện thoại và chạy:
  ```bash
  adb install -r tien-gioi-<thẻ>-debug.apk
  ```
- **Cách 2: Chép tệp thủ công vào điện thoại:**
  1. Chép file APK vào bộ nhớ điện thoại (qua cáp USB, Zalo, Google Drive, trình duyệt...).
  2. Mở ứng dụng **Quản lý tệp** (Files / My Files) trên điện thoại và chọn file APK.
  3. Khi hệ thống hỏi quyền, bật **"Cài đặt ứng dụng từ nguồn không xác định"** (Install unknown apps) cho ứng dụng Quản lý tệp.
  4. Nhấn **Cài đặt** (Install) và mở trò chơi để trải nghiệm.

### 8.4 Kiểm thử trên máy thật (M4.2d)
Sau khi cài đặt APK lên máy Android thật, vui lòng làm theo quy trình nghiệm thu chi tiết 8 bước (splash, xoay ngang, safe area, bàn phím, 4 ca phím Back, xuống nền/tiền cảnh, đổi mạng 4G) và điền mẫu báo cáo tại:
👉 **[Hướng Dẫn Kiểm Thử Ứng Dụng Android Trên Máy Thật (docs/KIEM_THU_MAY_THAT.md)](KIEM_THU_MAY_THAT.md)**

> [!NOTE]
> **Cài đè bản cũ:** mỗi lần dựng, bản debug được ký bằng khoá debug do máy chạy Actions tự sinh MỚI, nên không cài đè lên bản debug của lần dựng trước được (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`): gỡ cài đặt rồi cài lại (mất phiên đăng nhập lưu trên máy). Bản release ký bằng khoá của bạn (mục 9) cài đè được. `versionCode` KHÔNG cố định: Dev A tăng tay, cùng `versionName`, trong `app/android/app/build.gradle` ở PR phát hành mỗi bản (v0.1.1 = 2, v0.1.2 = 3, v0.1.3 = 4, v0.2.0 = 5); Google Play đòi `versionCode` tăng nghiêm ngặt giữa các lần tải lên. Test `server/scripts/release-consistency.test.ts` (chạy trong `npm test` và CI) bắt quên tăng: mọi `package.json` / khoá của app cùng số phiên bản, `versionName` khớp, mục đầu CHANGELOG là bản hiện tại và `versionCode` không nhỏ hơn số bản phát hành trong CHANGELOG (mục `[Chưa phát hành]` không tính). Dùng `>=` nên tải lại CÙNG phiên bản lên Google Play (đổi khoá ký, sửa khai báo; vẫn phải tăng `versionCode`) không phải bịa mục CHANGELOG; đổi lại test KHÔNG biết giá trị đã tải lên Google Play, nên lần tải đầu của bản mới vẫn cần người kiểm số trên Play Console.
>
> **Java:** dự án Android do Capacitor 8 sinh ra đòi **Java 21** (`sourceCompatibility JavaVersion.VERSION_21`); workflow dùng Temurin 21. Dựng cục bộ cũng cần JDK 21.

---

## 9. Ký Bản Phát Hành (Release Signing)

Để phân phối bản phát hành chính thức cho người chơi hoặc đưa lên Google Play, gói APK cần được ký số bằng khóa phát hành (Keystore) hợp lệ.

> [!IMPORTANT]
> **Nguyên tắc an toàn tuyệt đối:**
> - Tuyệt đối **không lưu trữ** tệp keystore (`*.jks`, `*.keystore`) hay mật khẩu trong repo git.
> - Agent không tự sinh hay quản lý khóa bí mật; người dùng tự tạo và cấu hình vào GitHub Secrets.
> - Chi tiết trao đổi và quyết định xem tại `~/TT/orchestra/questions.md` (mục Bước 6).

### Các bước cấu hình cho Người Dùng:

#### Bước 1: Tạo tệp Keystore bằng `keytool`
Trên máy tính cá nhân có cài đặt JDK 17+:
```bash
keytool -genkeypair -v \
  -keystore tiengioi-release.jks \
  -alias tiengioi \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```
Nhập mật khẩu cho keystore và thông tin chứng chỉ theo hướng dẫn của terminal.

#### Bước 2: Mã hóa tệp Keystore sang Base64
```bash
base64 -w0 tiengioi-release.jks > tiengioi-release.jks.b64
```
Lưu trữ tệp `tiengioi-release.jks` và mật khẩu ở nơi an toàn bên ngoài kho mã (nếu mất khóa, người chơi sẽ không thể cập nhật ứng dụng).

#### Bước 3: Thêm 4 Secret vào GitHub Actions
Truy cập kho GitHub: **Settings -> Secrets and variables -> Actions -> Repository secrets**, thêm đủ 4 bí mật:
1. `ANDROID_KEYSTORE_B64`: Toàn bộ nội dung chuỗi trong file `tiengioi-release.jks.b64`.
2. `ANDROID_KEYSTORE_PASSWORD`: Mật khẩu của keystore đã đặt ở Bước 1.
3. `ANDROID_KEY_ALIAS`: Tên alias đã đặt (ở lệnh trên là `tiengioi`).
4. `ANDROID_KEY_PASSWORD`: Mật khẩu của alias.

### Cơ chế hoạt động của CI:
- **Khi đủ 4 bí mật:** Workflow `.github/workflows/android.yml` sẽ dựng bản release, giải mã keystore vào file tạm quyền 600, căn chỉnh `zipalign`, dùng `apksigner` ký số (truyền mật khẩu qua biến môi trường an toàn `env:VAR` tránh lộ log), kiểm tra chữ ký với `apksigner verify`, dọn dẹp file tạm và xuất bản `tien-gioi-<thẻ>-release.apk`.
- **Khi thiếu bí mật:** Workflow **không bị lỗi**, chỉ in thông báo hướng dẫn và xuất bản `tien-gioi-<thẻ>-debug.apk`.
