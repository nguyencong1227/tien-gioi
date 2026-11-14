# Kế hoạch dây chuyền đồ hoạ NHÁP bằng ComfyUI + SDXL (M6, QUYET_DINH_M3 mục 16.2)

> Trạng thái: **KẾ HOẠCH, chưa chạy gì.** Dev A chỉ được lập kế hoạch / issue (mục 16.2). Mọi bước "cần người dùng" ở mục 8 phải có đồng ý trước khi làm. Khảo sát ở mục 1 là chỉ-đọc (14/11/2026 ~17:10), không khởi động ComfyUI, không tải thêm gì.

## 1. Hiện trạng đã khảo sát (chỉ đọc)
- **ComfyUI đã được cài sẵn** (không phải do Dev A; theo `install.log` lúc 15:14-15:39 ngày 14/11, tức SAU mục 16) ở `~/TT/comfyui/`: ComfyUI `v0.43.2` (tag cũ hơn 14 ngày, chọn theo `install.sh`), môi trường conda Python 3.12 tại `~/TT/comfyui/env` (7,1 GB), PyTorch `2.14.1+cu130` thấy RTX 5060, `ComfyUI/models/checkpoints/sd_xl_base_1.0.safetensors` (SHA256 `31e35c80...f7e5b` khớp với giá trị Hugging Face công bố; `install.log` ghi `SHA OK`). Tổng 14 GB. **Không đang chạy** (không tiến trình, không nghe cổng 8188). `custom_nodes` chỉ có hai tệp mẫu của chính ComfyUI (không node tuỳ biến), không có LoRA / ControlNet / VAE riêng.
- **Máy:** NVIDIA RTX 5060 8 GB (driver 615.71.09, Chrome headless của #478 dùng ~230 MB khi chạy E2E), RAM 14 GB (đang dùng ~5 GB, ~9 GB còn dùng được lúc kiểm), Python hệ thống 3.12.3.
- **ĐĨA GỐC: 192 GB, đã dùng 93 %, còn ~15 GB.** Docker ảnh 4,0 GB (1,1 GB thu hồi được), `~/.cache` 9,5 GB (Hugging Face 5,4 GB của dự án khác), sao lưu bản chạy thật, ComfyUI 14 GB. Một lô ảnh nháp, thêm một checkpoint / LoRA (2-7 GB mỗi cái) hay cập nhật PyTorch là hết chỗ: **đĩa là rủi ro số một**, không phải GPU.

## 2. Mục đích và ranh giới
- Sinh ảnh **NHÁP** (nền bản đồ thứ tư, ảnh minh hoạ / màn tải, icon vật phẩm nháp) để Dev B hậu kỳ cho đồng bộ phong cách (bằng script, mục 9.2) TRƯỚC khi vào game. **Không** đưa ảnh sinh ra vào repo / game khi chưa qua hậu kỳ + người duyệt và chưa ghi nguồn (mục 5, 9).
- **Không bao giờ trên đường của bản chạy thật:** không GPU trong container / compose của bản chạy thật, không trong CI, không trong server game, không mở cổng ra ngoài (tunnel chỉ trỏ tới 2567). Không TTS (mục 16.3 đã bỏ).
- Nhận định thực tế: SDXL base **không** giỏi pixel-art / sprite sheet nhiều hướng nhiều khung hình nhất quán; sprite nhân vật và quái vẫn sinh bằng mã. Phù hợp hơn: nền, minh hoạ, icon. Pilot hẹp (mục 7, G3).

## 3. Giấy phép: rủi ro chính, cần người dùng quyết
1. **SDXL 1.0 base:** theo trang model là CreativeML Open RAIL++-M (cho dùng thương mại, có điều khoản cấm một số mục đích sử dụng; phân phối lại model thì phải kèm giấy phép). Dev A **chưa kiểm lại trực tuyến** (không gửi truy vấn ra ngoài khi chạy đêm): người dùng hoặc Dev C đọc lại trang model trước khi coi là chốt.
2. **Quy tắc asset của dự án (AGENTS.md): "chỉ CC0 / CC-BY, ghi nguồn trong CREDITS.md".** Ảnh do AI sinh không thuộc hai loại đó theo nghĩa cấp phép, và ảnh AI thuần (không có sáng tạo của người) có thể không được bảo hộ bản quyền ở một số nước, nên không thể "gán CC0 / CC-BY" cho có nghĩa. Cần người dùng quyết: **sửa quy tắc** theo hướng "ảnh do công cụ AI sinh được phép sau khi xử lý hậu kỳ có ghi lại, ghi model + hash, prompt, seed, workflow, các bước hậu kỳ, người duyệt; có mục riêng trong `CREDITS.md` và `RA_SOAT_TAI_SAN.md`", hoặc không dùng AI cho tài sản cuối (chỉ làm tham khảo). **Lưu ý:** hậu kỳ do Dev B (trợ lý AI) làm bằng script, KHÔNG phải tay người vẽ lại, nên không dựa vào "đã chỉnh tay" để nói ảnh được bảo hộ bản quyền (không phải ý kiến pháp lý).
3. **LoRA / checkpoint của bên thứ ba** (Civitai, Hugging Face): mỗi tệp một giấy phép, nhiều tệp cấm thương mại. **Mặc định KHÔNG dùng**; chỉ khi người dùng duyệt từng tệp (tên, nguồn, giấy phép, dung lượng).
4. Prompt không chứa tên / hình / nghệ sĩ / game khác (AGENTS.md: "không dùng chữ, tên, hình hay âm thanh của game khác"); ảnh không được có chữ Hán (SDXL hay sinh ký tự giả: kiểm bằng mắt; `no-cjk.test.ts` chỉ quét mã).
5. **Google Play:** kiểm chính sách về nội dung do AI sinh và khai báo (người dùng / B) trước khi gửi bản có ảnh AI.

## 4. Kiến trúc đề xuất (venv, không Docker, chỉ cục bộ)
- **Thư mục:** giữ `~/TT/comfyui/` (ngoài ba thư mục dev và ngoài `~/TT/tien-gioi-prod/`); model, ảnh sinh ra, `env` KHÔNG vào repo. Ảnh đầu ra: `~/TT/comfyui/out/<issue>/`.
- **Mạng:** `python main.py --listen 127.0.0.1 --port 8188`; không `--enable-cors-header`, không `0.0.0.0`; cổng 8188 không trùng 2567 / 2577 / 2587 / 2597 / 5173 / 5183 / 5193. Khi vận hành đặt `HF_HUB_OFFLINE=1` và `HF_HUB_DISABLE_TELEMETRY=1` để không tự tải gì.
- **Chỉ bật khi cần, tự tắt khi rảnh, giới hạn RAM:** script `scripts/art/comfy-up.sh` (đề xuất, của Dev C) chạy ComfyUI trong `systemd-run --user` (đơn vị tạm, không ghi vào `~/.config/systemd`; `systemctl --user` báo `running`; nếu phiên chạy đêm không dùng được thì lùi về `timeout` + `ulimit -v` và canh rảnh bằng script, G1 kiểm) với `-p MemoryMax=7G -p MemoryHigh=6G -p RuntimeMaxSec=1800` (tự tắt sau 30 phút kể cả khi quên) cộng bộ canh rảnh: không có việc trong hàng đợi 5 phút thì dừng. `comfy-down.sh` dừng ngay. Kết thúc lượt làm việc phải kiểm không còn tiến trình ComfyUI.
- **GPU dùng chung với Chrome test (#478):** SDXL fp16 vừa khít 8 GB. Quy tắc: khi ComfyUI chạy, E2E dùng `DISABLE_GPU=1` (đã hỗ trợ ở `chrome-gpu.mjs`); `comfy-up.sh` từ chối chạy nếu thấy Chrome headless đang dùng GPU (`nvidia-smi --query-compute-apps`).
- **Chuỗi cung ứng:** KHÔNG cài node tuỳ biến, KHÔNG ComfyUI-Manager; ghim ComfyUI `v0.43.2`; chỉ nạp `.safetensors` (không `.ckpt` / pickle), kiểm SHA256; không `pip install` thêm khi chưa duyệt; chạy bằng user thường, không sudo; workflow chỉ gồm node lõi, không URL ngoài.
- **Điều khiển bằng mã:** workflow là tệp JSON (có seed, kích thước, prompt) trong `docs/art/workflows/`; script `scripts/art/comfy-job.mjs` đẩy workflow qua API cục bộ, lấy ảnh về thư mục đầu ra, ghi tệp nguồn (mục 5). Có test không cần model (kiểm sinh JSON, từ chối workflow có URL ngoài / node lạ).

## 5. Quy trình từ ảnh nháp tới tài sản
1. Yêu cầu nhỏ (issue) nêu loại tài sản, kích thước, phong cách, bảng màu. 2. Dev C / A chạy lô 4-8 ảnh với seed cố định. 3. Dev B chọn, hậu kỳ bằng script có ghi lại (đồng bộ bảng màu, hạ cỡ / lượng tử hoá, xoá siêu dữ liệu; xử lý bằng máy, không phải người vẽ lại), kiểm không chữ Hán, không giống game khác, rồi người dùng duyệt. 4. Khi vào repo kèm `docs/art/nguon/<tên>.json` (các trường ở mục 9.3); thêm dòng ở `CREDITS.md` và `docs/RA_SOAT_TAI_SAN.md` (mục "tài sản có AI sinh nháp"). **Hiện `check:credits` CHƯA bắt được tệp ảnh AI thiếu nguồn:** nó chỉ kiểm tên tệp có xuất hiện trong `CREDITS.md` ở `assets` / `icons` / `fonts`, SHA-256 chỉ kiểm ở `fonts`, và không biết `docs/art/nguon/`. Nó chỉ đỏ đúng nghĩa sau khi G3 làm xong mục 9.4 (a).

## 6. Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Đầy đĩa (còn ~15 GB) làm hỏng sao lưu / Docker của bản chạy thật | G0: dọn đĩa trước (mục 8); `comfy-up.sh` từ chối chạy khi đĩa trống < 10 GB; ảnh đầu ra tự xoá sau 14 ngày nếu chưa được chọn |
| Hết RAM làm bản chạy thật chậm / bị OOM | `MemoryMax=7G`, `RuntimeMaxSec`, canh rảnh; không chạy khi bench / soak đang chạy |
| Tranh GPU với E2E | Quy tắc `DISABLE_GPU=1` và kiểm `nvidia-smi` ở mục 4 |
| Giấy phép model / ảnh AI | Mục 3, người dùng quyết trước khi có ảnh nào vào game |
| Phong cách không đồng bộ, sprite không dùng được | Chỉ pilot nền / icon; B hậu kỳ + người duyệt; không dùng cho sprite hoạt ảnh |
| Chuỗi cung ứng (node, model lạ) | Mục 4: không node tuỳ biến, chỉ safetensors, ghim phiên bản |

## 7. Giai đoạn
- **G0 (người dùng quyết, mục 8).**
- **G1 (Dev C, ~nửa ngày):** `comfy-up.sh` / `comfy-down.sh` + canh rảnh + giới hạn RAM + kiểm đĩa / GPU; test bash / vitest không cần model (tiến trình tắt khi hết hạn, nghe đúng 127.0.0.1, từ chối khi đĩa thiếu).
- **G2 (Dev C + A):** chạy thử MỘT ảnh với prompt trung tính, đo VRAM / RAM / thời gian / dung lượng đầu ra, ghi vào `docs/` (số đo, không đoán); xác nhận không còn tiến trình sau khi tắt.
- **G3 (Dev B):** pilot MỘT tài sản: **ảnh minh hoạ màn đăng nhập trước, icon sau** (đã thống nhất A và B, lý do ở mục 9.1); đi hết quy trình mục 5, làm xong các kiểm tự động ở mục 9.4 TRƯỚC khi có ảnh AI nào vào `client/public/`, đạt tiêu chí mục 9.5.
- **G4:** đánh giá; quyết định có mở rộng sang nền bản đồ thứ tư (M7) hay giữ ở mức tham khảo.

## 8. Câu hỏi cho người dùng (chặn G1 trở đi)
1. Xác nhận ComfyUI + SDXL base ở `~/TT/comfyui` là do người dùng cài và cho phép Dev C / A **chạy thử** theo kế hoạch này (mục 16.2 ban đầu chỉ cho lập kế hoạch).
2. Duyệt giấy phép SDXL base 1.0 (sau khi tự đọc trang model) và **sửa / giữ** quy tắc asset ở AGENTS.md (mục 3.2).
3. **Giải phóng đĩa:** mục tiêu >= 30 GB trống (hiện ~15 GB). Gợi ý để người dùng chọn, A không tự xoá: ảnh Docker không dùng (~1,1 GB), bộ nhớ đệm Hugging Face của dự án khác (5,4 GB), thư mục tạm, bản sao lưu cũ của bản chạy thật.
4. Chính sách Google Play về nội dung do AI sinh (khai báo) chấp nhận được không.
5. Có duyệt thêm model / LoRA nào ngoài SDXL base không (mặc định: không).

## 9. Điều kiện G3 (Dev B, từ review ở #487)
Chỉ bắt đầu sau khi người dùng đồng ý ở mục 8. Dev B không cài / tải / chạy ComfyUI; chỉ nhận ảnh thô do C / A sinh.

### 9.1 Pilot: ảnh minh hoạ màn đăng nhập, icon sau
- Màn đăng nhập là `section#login` trong `client/index.html` (tấm giữa, nền giấy riêng, rộng tối đa 380 px, nằm trên nền `--ink`); game chưa có màn tải riêng (chỉ có `WorldScene`). Ảnh đặt làm NỀN phía sau tấm này nên chữ đăng nhập không nằm trên ảnh.
- Lý do chọn trước icon: một tệp, không vào atlas (atlas + tileset bị ngân sách 1 MB), đo được dung lượng, quay lại bằng `git revert`; còn 31 icon hiện có là pixel art 32 px vẽ bằng mã (`client/scripts/gen-assets.mjs`), SDXL base khó giữ nét pixel khi hạ cỡ nên đồng bộ với 31 icon là phần khó nhất.
- Nền dự phòng hiện tại (màu `--ink`) GIỮ NGUYÊN: ảnh lỗi tải hay chưa có (PWA `sw.js` chỉ precache `/`, `/index.html`, `/manifest.webmanifest`, nên ảnh không có sẵn khi offline) thì màn đăng nhập vẫn như cũ.
- Bước 0 (B, trước khi C chạy lô đầu): một trang "phong cách minh hoạ": bảng màu 8-12 màu lấy từ `MAP_STYLES` (`client/src/gfx/map-style.ts`), từ khoá bắt buộc, danh sách từ khoá cấm (tên game, nghệ sĩ, chữ), tỉ lệ khung. G2 dùng prompt trung tính; G3 dùng prompt theo trang này.

### 9.2 Ranh giới của "hậu kỳ"
Hậu kỳ chỉ gồm: đổi cỡ, cắt, giảm bảng màu / lượng tử hoá, mã hoá lại thành WebP, xoá siêu dữ liệu, viết bằng script trong thư mục mới `client/scripts/art/` (tất định, có tham số ghi vào tệp nguồn). Không vẽ thêm / sửa nội dung ảnh bằng tay; nếu cần sửa nội dung thì sinh lại với seed khác.

### 9.3 Trường bắt buộc của `docs/art/nguon/<tên>.json`
`asset` (đường dẫn trong repo), `finalSha256` (tệp cuối), `rawSha256` (ảnh thô được chọn), `model` (tên + sha256), `lora` (`[]` nếu không), `comfyui` (phiên bản ComfyUI, PyTorch, driver), `workflow` (đường dẫn + sha256), `prompt`, `negativePrompt`, `seed`, `postProcess` (danh sách script + tham số), `reviewed` (`by`, `date`, `noText`, `noOtherGameLikeness`), `date`. Thay "người chỉnh" bằng `postProcess` + `reviewed`.
- Cần băm ảnh thô vì đầu ra ComfyUI không tái lập từng byte giữa GPU / driver / PyTorch dù cùng seed; cần băm workflow vì sampler, số bước, cfg, độ phân giải, VAE nằm trong workflow chứ không chỉ trong "commit".
- Ảnh thô được chọn chuyển sang `~/TT/comfyui/out/<issue>/chosen/` (không bị dọn 14 ngày); repo chỉ giữ băm của nó.

### 9.4 Kiểm tự động (làm trước khi có ảnh AI nào vào `client/public/`)
- **(a) Nguồn:** mở rộng `client/scripts/check-credits.mjs` + `client/src/credits.test.ts`: thư mục riêng `client/public/assets/ai/`; mỗi tệp trong đó phải có `docs/art/nguon/<tên>.json` với `finalSha256` khớp tệp thật, mỗi JSON phải trỏ tới tệp tồn tại, và có dòng ở một mục riêng của `CREDITS.md`. Đột biến phải đỏ: xoá JSON, đổi 1 byte ảnh, sửa băm, thêm ảnh không có JSON.
- **(b) Siêu dữ liệu:** ComfyUI mặc định nhúng prompt và toàn bộ workflow vào khối văn bản của PNG đầu ra. Test đọc byte: PNG không có khối `tEXt` / `iTXt` / `zTXt`, WebP không có EXIF / XMP; ảnh vào game đã được mã hoá lại sạch.
- **(c) Dung lượng:** `client/scripts/check-perf-budget.mjs` hiện chỉ cộng `atlas.png`, `tileset.png`, `atlas.json` (<= 1024 KB); `client/public/assets` hiện ~308 KB và ngân sách bộ nhớ texture bậc thấp là 48 MB. Thêm trần cho `assets/ai/` vào `client/perf-budget.json` (đề xuất: mỗi ảnh WebP <= 150 KB, tổng <= 300 KB; B chốt số sau khi đo ở G3). APK gói toàn bộ `client/dist` nên ảnh tính vào dung lượng APK.
- **(d) Rà soát:** `docs/RA_SOAT_TAI_SAN.md` có mục "tài sản có AI sinh nháp"; bài "Tài liệu rà soát khớp số tệp thật" trong `credits.test.ts` đếm cả thư mục mới.

### 9.5 Tiêu chí xong của G3 (đo được)
Một ảnh duy nhất vào game; dung lượng <= trần ở 9.4 (c) (số đo trước / sau của `client/dist`); 0 siêu dữ liệu; `check:credits` xanh VÀ các đột biến ở 9.4 (a) đỏ; ảnh chụp năm khung nhìn của `capture-viewports` (có điện thoại ngang) cho thấy ảnh không che hay làm lệch ô nhập / nút (QUYET_DINH_M3 mục 15); `e2e:giao-dien` và `e2e:tro-nang` xanh; người duyệt xem ảnh phóng 200 % không thấy chữ hay ký tự giả (kiểm bằng mắt, ghi vào `reviewed`); CI xanh.

### 9.6 Ghi cho G1 (việc của C, từ cùng review)
- **Dọn ảnh 14 ngày** đặt trong `comfy-up.sh` / `comfy-down.sh` mỗi lần gọi (`find out -mtime +14 -not -path '*/chosen/*' -delete`), KHÔNG dùng timer / cron (cấm sửa cấu hình global).
- **Khoá GPU tự động** thay vì nhớ `DISABLE_GPU=1`: `detectGpu()` ở `client/scripts/chrome-gpu.mjs` là điểm chung duy nhất của mọi script Chrome; thêm nhánh "có tệp khoá `tg-comfy.lock` hoặc đơn vị `tg-comfy` đang `active` -> `{ hasGpu: false, reason: "comfy_running" }`" cùng test trong `chrome-gpu.test.ts`. Đơn vị `systemd-run` đặt tên riêng `tg-comfy`; `comfy-down.sh` chỉ dừng đúng đơn vị đó (không đụng `orchestra@*`).
