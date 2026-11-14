# Báo cáo Lô Ảnh Thô Pilot ComfyUI SDXL Base (M7.12 #513, #497)

> **Mục đích**: Cung cấp lô ảnh thô (raw images) đầu tiên theo quyết định của người dùng (`QUYET_DINH_M3.md` mục 17.3, 18.3) và kế hoạch đồ họa AI (`docs/KE_HOACH_DO_HOA_AI.md` mục 9) để **Dev B** thực hiện bước 0 (trang phong cách minh hoạ) và chọn + hậu kỳ ảnh nền đăng nhập đầu tiên vào game.

## 1. Ràng buộc & Tiêu chí tuân thủ
- **Model Checkpoint**: Duy nhất `sd_xl_base_1.0.safetensors` (6.5 GB, SHA-256: `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`).
- **LoRA**: `[]` (rỗng, không dùng bất kỳ LoRA hay checkpoint phụ trợ nào).
- **Vị trí lưu trữ ảnh thô**: Phân vùng riêng `/mnt/data/comfyui/output/`.
- **Cam kết Git**: **0 tệp ảnh nháp/thô** trong Git repository hoặc `client/public/`.
- **Môi trường sinh ảnh**: ComfyUI `v0.43.2`, Python 3.12.16 Conda venv, PyTorch `2.14.1+cu130`, GPU NVIDIA RTX 5060 8 GB, giới hạn RAM qua systemd `MemoryMax=7G`.
- **Vòng đời dịch vụ**: Khởi động qua `scripts/art/comfy-up.sh` và giải phóng toàn bộ tài nguyên qua `scripts/art/comfy-down.sh` ngay sau khi sinh xong (cổng 8188 sạch, đơn vị `tg-comfy` inactive).
- **Nội dung ảnh**: Không chứa chữ Hán, không chữ lạ, không logo/watermark, không nhân vật hay phong cách mô phỏng tựa game khác; thuần phong cảnh tiên hiệp hùng vĩ, mờ ảo sương sớm phù hợp làm nền màn đăng nhập.

## 2. Thông số kỹ thuật sinh ảnh (KSampler)
- **Sampler**: `euler`
- **Scheduler**: `normal`
- **Số bước (Steps)**: 25
- **CFG Scale**: 7.0
- **Denoise**: 1.0
- **Kích thước ảnh thô**: 1024 × 1024 px
- **Negative Prompt chung**:
  ```text
  text, letters, words, watermark, signature, logo, cjk, chinese characters, blurry, lowres, distorted, modern, futuristic, photorealistic human face, western fantasy
  ```

## 3. Danh sách 4 ảnh thô Pilot đã sinh tại `/mnt/data/comfyui/output/`

| ID | Tệp trên `/mnt/data` | Chủ đề & Mô tả | Seed | Thời gian sinh | Cỡ tệp thô | SHA-256 ảnh thô (`rawSha256`) |
|:---|:---|:---|:---:|:---:|:---:|:---|
| `login_bg_raw_01` | `login_bg_raw_01_00001_.png` | **Toàn cảnh môn phái tiên hiệp mờ sương**: Núi non trôi nổi bồng bềnh, đình đài mái cong cổ kính, thác nước linh khí, ánh ban mai dịu nhẹ chiếu qua sương sớm. Phù hợp toàn cảnh nền đăng nhập. | `2026111501` | 21.1 s | 1,467.5 KB | `c51ad15c49d374db3a5b81b46edf24b023236a99b1e71787cdc69af14d73c21e` |
| `login_bg_raw_02` | `login_bg_raw_02_00001_.png` | **Cổng vòm tiên giới bồng lai**: Cổng vòm cổ kính uy nghiêm trên đỉnh núi mây mù, bậc thang đá tạc vách núi, ánh ráng chiều/hoàng hôn ấm áp, mây vần vũ bao quanh. | `2026111502` | 16.5 s | 1,474.9 KB | `1fbb353ad623a52cbdd84d3add9e193484483e1a521a9ae34f99c72efd738b8f` |
| `login_bg_raw_03` | `login_bg_raw_03_00001_.png` | **Hồ linh tuyền và cổ thụ ngàn năm**: Thung lũng tĩnh lặng, hồ nước linh tuyền phát sáng lam ngọc, hoa tử đằng và tùng bách khổng lồ, đèn hoa đăng thả hồ, sương lam huyền ảo. | `2026111503` | 13.5 s | 1,489.7 KB | `71e0e991e8fd0ee9cb256791f2720b2cf02529dfa5c21652b57d4477a20ac9fd` |
| `login_bg_raw_04` | `login_bg_raw_04_00001_.png` | **Đỉnh Lạc Hà sương sớm**: Đỉnh núi đón bình minh rực rỡ nhìn ra biển mây cuồn cuộn, bảo tháp gỗ cổ kính bên bờ vực, bóng tiên hạc bay lượn phương xa, không khí thanh tịnh tĩnh tâm. | `2026111504` | 13.5 s | 1,249.9 KB | `dfa1c42d0f9ec836425c86199391cc8f2fc236131442176f406ed974cd541407` |

### Chi tiết Prompt từng ảnh:
- **`login_bg_raw_01`**:
  `masterpiece, ethereal eastern xianxia sect in mountains, ancient pavilions with curved roofs on floating peaks, cascading waterfalls, morning mist, golden dawn rays, subtle pine trees, tranquil atmosphere, soft painterly fantasy style, wide panoramic view, no people, no text`
- **`login_bg_raw_02`**:
  `grand oriental celestial gate archway perched atop a sacred misty mountain summit, glowing spiritual stones, stone stairs carved into cliffside, sea of clouds below, sunset warm glow, majestic taoist immortal sanctuary, painterly landscape art, no people, no text`
- **`login_bg_raw_03`**:
  `serene spiritual spring lake in high mountain valley, giant ancient glowing wisteria and pine trees, floating lotus lanterns with soft spiritual lights, towering cliffs shrouded in blue mist, magical twilight, oriental cultivation fantasy art, no people, no text`
- **`login_bg_raw_04`**:
  `sacred peak at dawn overlooking vast sea of clouds, traditional ancient wooden cultivation pagoda on edge of cliff, flying spirit cranes in distance, gentle sunlight illuminating morning mist, calm meditative ambience, oriental landscape painting, no people, no text`

## 4. Bàn giao cho Dev B
1. Các tệp ảnh thô định dạng PNG chất lượng cao (1024x1024) hiện nằm tại `/mnt/data/comfyui/output/`:
   - `/mnt/data/comfyui/output/login_bg_raw_01_00001_.png`
   - `/mnt/data/comfyui/output/login_bg_raw_02_00001_.png`
   - `/mnt/data/comfyui/output/login_bg_raw_03_00001_.png`
   - `/mnt/data/comfyui/output/login_bg_raw_04_00001_.png`
2. **Quy trình tiếp theo của Dev B** (theo `docs/KE_HOACH_DO_HOA_AI.md` mục 9 và #513):
   - **Bước 0**: Xây dựng trang "phong cách minh hoạ" (bảng màu từ `MAP_STYLES`, từ khóa bắt buộc/cấm, tỉ lệ khung).
   - **Chọn ảnh**: Chọn 1 ảnh đạt yêu cầu nhất từ 4 ảnh trên (hoặc sao chép vào `/mnt/data/comfyui/output/chosen/`).
   - **Hậu kỳ tất định**: Viết script trong `client/scripts/art/` thực hiện:
     + Cắt (crop) / đổi cỡ phù hợp tỉ lệ màn hình đăng nhập (ví dụ: ngang cho desktop/tablet, căn giữa an toàn cho mobile).
     + Giảm bảng màu / tối ưu hóa.
     + Mã hóa WebP sạch (xoá toàn bộ khối siêu dữ liệu `tEXt`, `iTXt`, `EXIF`, `XMP`).
     + Đảm bảo dung lượng <= 150 KB (ngân sách tĩnh `client/perf-budget.json`).
   - **Đưa vào game**:
     + Đặt ảnh tại `client/public/assets/ai/login_bg.webp`.
     + Tạo file siêu dữ liệu `docs/art/nguon/login_bg.json` (chứa `finalSha256`, `rawSha256`, thông tin model SDXL base, `reviewed.noText: true`, `reviewed.noOtherGameLikeness: true`...).
     + Thêm dòng ghi công tại Mục 7 của `CREDITS.md`.
     + Cập nhật con số đếm trong `docs/RA_SOAT_TAI_SAN.md` mục 2e.
