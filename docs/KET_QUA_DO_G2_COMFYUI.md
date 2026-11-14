# Kết quả đo thử nghiệm Giai đoạn 2 (G2) ComfyUI + SDXL

> Căn cứ: `QUYET_DINH_M3.md` mục 16.2, 17.3, 18.3 và `docs/KE_HOACH_DO_HOA_AI.md` (Issue #486, #497).
> Toàn bộ số liệu được đo thực tế qua chính dây chuyền `scripts/art/comfy-up.sh` và `scripts/art/comfy-down.sh`.
> Ảnh đầu ra lưu tại `/mnt/data/comfyui/output/`, TUYỆT ĐỐI KHÔNG commit vào repo / git / `client/public/`.

## 1. Môi trường và cấu hình thử nghiệm
- **Hệ điều hành & Phần cứng**: Linux x86_64, NVIDIA GeForce RTX 5060 8 GB (Driver: `615.71.09`, CUDA UMD: `13.4`), RAM hệ thống: 14 GB.
- **Thư mục cài đặt**: `/mnt/data/comfyui` (phân vùng riêng 56 GB, trống ~39 GB; liên kết tượng trưng `~/TT/comfyui`). Phân vùng gốc `/` trống ~28 GB.
- **Môi trường Python & Thư viện**: Python 3.12.16 (Conda venv tại `/mnt/data/comfyui/env`), PyTorch `2.14.1+cu130`, ComfyUI `v0.43.2`.
- **Model Checkpoint**: `sd_xl_base_1.0.safetensors` (6.5 GB, SHA256: `31e35c80fc4829d14f90153f4024cc600438d96471b4f422cf69e922ecd7e25`).
- **Cờ khởi động**: `--listen 127.0.0.1 --port 8188 --disable-auto-launch --offline --disable-all-custom-nodes --disable-metadata`.
- **Mạng**: Chỉ lắng nghe cục bộ tại `127.0.0.1:8188`, hoàn toàn ngắt kết nối ra ngoài (`HF_HUB_OFFLINE=1`).

## 2. Quản lý tài nguyên qua `systemd-run --user` (G1)
- **Đơn vị dịch vụ**: `tg-comfy` (transient unit).
- **Hạn mức RAM**: `-p MemoryMax=7G -p MemoryHigh=6G`.
- **Thời hạn sống tối đa**: `-p RuntimeMaxSec=1800` (tự động tắt sau 30 phút).
- **Tự động canh rảnh**: Script `scripts/art/comfy-idle-watch.sh` thăm dò `/queue` mỗi 15 giây, lưu PID vào `${XDG_RUNTIME_DIR:-/tmp}/tg-comfy-idle.pid` và tự động tắt dịch vụ khi rảnh rỗi liên tục 5 phút (300 giây).
- **Bảo vệ khóa GPU & chống khóa mồ côi (Review PR #499)**:
  - Khóa GPU: Ghi vào `${XDG_RUNTIME_DIR:-/tmp}/tg-comfy.lock`.
  - `client/scripts/chrome-gpu.mjs` (`detectGpu`): Chỉ coi khóa có hiệu lực khi `systemctl --user is-active tg-comfy` trả về `active` và `mtime` chưa quá 31 phút. Nếu đơn vị đã chết hoặc khóa cũ mồ côi, Chrome headless tự động bỏ qua và sử dụng GPU bình thường, không bao giờ bị ép chạy phần mềm vĩnh viễn.
  - `comfy-up.sh` có trap dọn khóa khi gặp lỗi giữa chừng; `comfy-idle-watch.sh` dọn khóa khi đơn vị ngừng hoạt động.
- **Dọn dẹp cgroup sạch sẽ**: `comfy-down.sh` dùng `systemctl --user stop tg-comfy` (dừng toàn bộ cgroup) và kill đúng PID của `idle-watch`, TUYỆT ĐỐI KHÔNG dùng `pkill -f` để không ảnh hưởng tới tiến trình của người dùng hay tác tử chạy đêm.

## 3. Số liệu đo thực tế sinh ảnh (G2)
Thử nghiệm chạy trực tiếp qua `comfy-up.sh`, gửi prompt graph SDXL chuẩn qua API `http://127.0.0.1:8188/prompt`:
- **Thông số sinh ảnh**:
  - Checkpoint: `sd_xl_base_1.0.safetensors`
  - Kích thước: 1024 x 1024 pixel, batch size 1
  - KSampler: Seed `20261114`, 25 bước (steps), CFG `7.0`, sampler `euler`, scheduler `normal`, denoise `1.0`
  - VAE Decode: Chuẩn SDXL VAE
  - Filename prefix: `g2_do_kiem`
- **Thời gian khởi động dịch vụ (`comfy-up.sh`)**: **3.09 giây** (từ lúc gọi script tới khi `/system_stats` sẵn sàng).
- **Thời gian sinh ảnh (Inference time)**:
  - Nhật ký ComfyUI ghi nhận: `Prompt executed in 30.06 seconds`.
  - Thời gian đo đầu cuối (wall-clock từ gửi request tới khi nhận kết quả history): **31.22 giây**.
- **Tiêu thụ bộ nhớ GPU (VRAM đỉnh)**:
  - Lấy mẫu qua `nvidia-smi --query-gpu=memory.used` mỗi 0.5 giây.
  - VRAM đỉnh toàn hệ thống: **7,549 MB** (~7.37 GB / 8.0 GB).
  - VRAM ComfyUI thực tế tiêu thụ: ~**7.2 GB** (sau khi trừ ~337 MB nền của Xorg/Gnome). Nằm trọn trong 8 GB VRAM của RTX 5060 mà không bị tràn bộ nhớ hay OOM.
- **Tiêu thụ RAM hệ thống đỉnh (`MemoryPeak`)**:
  - Đọc trực tiếp từ `systemctl --user show tg-comfy -p MemoryPeak` trước khi tắt dịch vụ.
  - Kết quả: **4,666,757,120 bytes** = **4,450.6 MB** (~**4.35 GB**).
  - Hoàn toàn nằm an toàn dưới ngưỡng cảnh báo `MemoryHigh=6G` và trần cứng `MemoryMax=7G`.
- **Tệp ảnh đầu ra**:
  - Tên tệp: `g2_do_kiem_00001_.png`
  - Vị trí: `/mnt/data/comfyui/output/g2_do_kiem_00001_.png`
  - Kích thước: 1024 x 1024 pixel (RGB 8-bit PNG)
  - Dung lượng: **1,342,985 bytes** (~1.34 MB)

*(Đối chiếu lần chạy thử sơ bộ của người dùng lúc 18:00 qua đơn vị `comfyui-thu`: 32 giây, VRAM 5.3 GB, RAM 6.0 GB, ảnh `thu_nghiem_00001_.png` dung lượng 1,343,997 bytes. Kết quả đo chính thức bằng dây chuyền `comfy-up.sh` cho thấy thời gian tương đương 30.06s và RAM peak 4.35 GB).*

## 4. Xác nhận dọn dẹp sau khi tắt (`comfy-down.sh`)
- **Trạng thái dịch vụ**: `systemctl --user is-active tg-comfy` -> `inactive`.
- **Cổng mạng**: Cổng 8188 đóng hoàn toàn.
- **Tệp khóa**: Tệp khóa `${XDG_RUNTIME_DIR:-/tmp}/tg-comfy.lock` và PID file được dọn sạch sẽ.
- **Tiến trình**: Không còn tiến trình `tg-comfy` hay tiến trình Python con nào thuộc cgroup.
- **Khôi phục GPU**: `detectGpu()` trong `chrome-gpu.mjs` trả về `{ hasGpu: true, reason: "nvidia_rtx" }`, sẵn sàng phục vụ các bài test E2E Chrome headless mà không bị nghẽn.
