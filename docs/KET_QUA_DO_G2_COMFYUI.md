# Kết quả đo thử nghiệm Giai đoạn 2 (G2) ComfyUI + SDXL

> Căn cứ: `QUYET_DINH_M3.md` mục 16.2, 17.3, 18.3 và `docs/KE_HOACH_DO_HOA_AI.md` (Issue #486, #497).
> Số liệu đo thực tế trên máy chủ, không suy đoán. Ảnh đầu ra lưu tại `/mnt/data/comfyui/output/`, TUYỆT ĐỐI KHÔNG commit vào repo / git / `client/public/`.

## 1. Môi trường và cấu hình thử nghiệm
- **Hệ điều hành & Phần cứng**: Linux x86_64, NVIDIA GeForce RTX 5060 8 GB (Driver 615.71.09, CUDA 13.4), RAM 14 GB.
- **Thư mục cài đặt**: `/mnt/data/comfyui` (ổ riêng 56 GB, trống 39 GB; liên kết tượng trưng `~/TT/comfyui`). Ổ gốc `/` trống ~28 GB.
- **Môi trường Python & Thư viện**: Python 3.12.16 (Conda venv tại `/mnt/data/comfyui/env`), PyTorch `2.14.1+cu130`, ComfyUI `v0.43.2`.
- **Model Checkpoint**: `sd_xl_base_1.0.safetensors` (SHA256: `31e35c80fc4829d14f90153f4024cc600438d96471b4f422cf69e922ecd7e25` khớp giá trị Hugging Face). Không có LoRA / Custom nodes bên ngoài (`--disable-all-custom-nodes`).
- **Mạng & Cổng**: Nghe cục bộ duy nhất `127.0.0.1:8188` (`--listen 127.0.0.1 --port 8188 --offline`).

## 2. Quản lý tài nguyên qua `systemd-run --user` (G1)
- **Đơn vị dịch vụ**: `tg-comfy` (transient unit).
- **Hạn mức RAM**: `-p MemoryMax=7G -p MemoryHigh=6G`.
- **Thời hạn sống tối đa**: `-p RuntimeMaxSec=1800` (tự ngắt sau 30 phút kể cả khi quên).
- **Tự động canh rảnh**: Script `scripts/art/comfy-idle-watch.sh` thăm dò `/queue` mỗi 15 giây, tự động gọi `comfy-down.sh` tắt dịch vụ khi rảnh rỗi liên tục 5 phút (300 giây).
- **Khóa GPU tự động**: Tệp khóa `/tmp/tg-comfy.lock` kích hoạt nhánh `comfy_running` trong `client/scripts/chrome-gpu.mjs`, Chrome headless tự động chuyển sang `--disable-gpu` nhường hoàn toàn GPU cho ComfyUI.

## 3. Số liệu đo thực tế sinh ảnh (G2)
- **Kịch bản**: Sinh một ảnh mẫu kích thước 1024x1024 bằng SDXL Base (25 bước lấy mẫu Euler, CFG 7.0).
- **Thời gian sinh ảnh**: **32 giây**.
- **VRAM GPU tiêu thụ đỉnh**: **5.3 GB** / 8.0 GB (vừa vặn trong 8 GB của RTX 5060, còn dư 2.7 GB an toàn).
- **RAM hệ thống tiêu thụ đỉnh**: **6.0 GB** (đạt ngưỡng `MemoryHigh`, nằm dưới trần cứng `MemoryMax=7G`).
- **Tệp đầu ra**:
  - Tên tệp: `thu_nghiem_00001_.png`
  - Đường dẫn: `/mnt/data/comfyui/output/thu_nghiem_00001_.png` (trên phân vùng `/mnt/data`)
  - Kích thước ảnh: 1024 x 1024 pixel
  - Dung lượng tệp: **1,343,997 bytes** (~1.34 MB)

## 4. Xác nhận dọn dẹp sau khi tắt (`comfy-down.sh`)
- **Trạng thái dịch vụ**: `systemctl --user is-active tg-comfy` -> `inactive`.
- **Cổng mạng**: Cổng 8188 đóng hoàn toàn (`ss -ltn | grep 8188` rỗng).
- **Tệp khóa**: `/tmp/tg-comfy.lock` được dọn sạch.
- **Tiến trình con**: Không còn tiến trình Python ComfyUI chạy ngầm (`pkill -f ComfyUI/main.py`).
- **Khôi phục GPU**: `detectGpu()` trong `chrome-gpu.mjs` trả về `{ hasGpu: true, reason: "nvidia_rtx_available" }`, sẵn sàng phục vụ các bài test E2E Chrome headless.
