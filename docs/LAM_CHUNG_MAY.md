# Làm việc chung một máy qua SSH

Ba dev cùng SSH vào một máy, cùng user Linux `nguyencong`, dùng chung một tài khoản GitHub.
Để không giẫm chân nhau, **mỗi người một thư mục và một bộ cổng riêng**:

| | Thư mục | Server | Client (Vite) | Tên commit |
|---|---|---|---|---|
| **Dev A** (Server & Gameplay) | `~/TT/tien-gioi-a` | 2597 | 5173 | đặt trong `.git/config` của thư mục |
| **Dev B** (Client & Trải nghiệm) | `~/TT/tien-gioi-b` | 2577 | 5183 | đặt trong `.git/config` của thư mục |
| **Dev C** (Công cụ, Thử tải & Phát hành) | `~/TT/tien-gioi-c` | 2587 | 5193 | `Dev C`, đã đặt sẵn |

Mỗi thư mục là một bản clone riêng của repo: nhánh riêng, `node_modules` riêng, dữ liệu nhân vật riêng
(`server/data/`), tên commit riêng. Mọi người chỉ "gặp nhau" qua GitHub (push / PR / pull), giống như làm trên hai máy khác nhau.

> ⚠️ **Không** làm chung trong cùng một thư mục: `git switch` của người này sẽ đổi code dưới chân người kia.

## Thiết lập lần đầu (mỗi người làm một lần)

Node.js 22 nằm ở `~/.local/node`. Thêm vào PATH một lần (dùng chung `~/.bashrc` nên chỉ một người làm):

```bash
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

Thư mục `tien-gioi-a`, `tien-gioi-b` và `tien-gioi-c` đã được tạo sẵn, có `.env.local` với đúng cổng. Mỗi người chỉ cần đặt tên commit của mình:

```bash
cd ~/TT/tien-gioi-a        # Dev B: ~/TT/tien-gioi-b · Dev C: ~/TT/tien-gioi-c
git config user.name "Tên của bạn"
git config user.email "email-cua-ban@example.com"
```

Lệnh `git config` (không có `--global`) chỉ áp dụng cho thư mục đó, nên ba người dùng chung user Linux vẫn có tên commit khác nhau.

Nếu cần tạo lại từ đầu:

```bash
git clone https://github.com/nguyencong1227/tien-gioi.git ~/TT/tien-gioi-b
cd ~/TT/tien-gioi-b
cp .env.example .env.local     # rồi sửa cổng theo bảng trên (Dev B: 2577/5183, Dev C: 2587/5193)
npm install
```

## Chạy game khi dev

```bash
cd ~/TT/tien-gioi-a && npm run dev
```

Nếu cổng đang bị chiếm, Vite báo lỗi và dừng (không tự đổi sang cổng khác). Lúc đó kiểm tra xem
có phải mình đang chạy ở thư mục của người kia không: `ss -ltnp | grep -E ':(25[678]7|51[789]3) '`.

Nên chạy `npm run dev` trong `tmux` để mất kết nối SSH không làm tắt server (máy chưa có tmux, cài một lần: `sudo apt install tmux`):

```bash
tmux new -s a          # Dev B: tmux new -s b · Dev C: tmux new -s c
npm run dev            # thoát tạm: Ctrl-b rồi d · vào lại: tmux attach -t a
```

## Mở game trên máy tính / điện thoại của mình

Máy chủ dev có các địa chỉ:
- **Cùng mạng LAN:** `192.168.0.124`
- **Tailscale:** `100.109.206.6` (dùng được cả khi ở ngoài, điện thoại cài Tailscale là vào được)

| | Mở trình duyệt |
|---|---|
| Dev A | `http://100.109.206.6:5173` |
| Dev B | `http://100.109.206.6:5183` |
| Dev C | `http://100.109.206.6:5193` |

Client tự kết nối tới server cùng địa chỉ, cổng lấy theo `PORT` trong `.env.local`.

**Cách khác, chuyển tiếp cổng qua SSH** (không cần mở cổng ra mạng). Nhớ chuyển cả cổng client lẫn server:

```bash
# Dev A
ssh -L 5173:localhost:5173 -L 2597:localhost:2597 nguyencong@100.109.206.6
# Dev B
ssh -L 5183:localhost:5183 -L 2577:localhost:2577 nguyencong@100.109.206.6
# Dev C
ssh -L 5193:localhost:5193 -L 2587:localhost:2587 nguyencong@100.109.206.6
```

Rồi mở `http://localhost:5173` (Dev A) / `http://localhost:5183` (Dev B) / `http://localhost:5193` (Dev C).

## Soạn code

### Dev B, Dev C: Antigravity CLI
Antigravity CLI (`agy`) đã cài ở `~/.local/bin/agy`. Luôn mở nó **từ thư mục của mình**, để nó chỉ sửa code trong đó:

```bash
cd ~/TT/tien-gioi-b && agy     # Dev B
cd ~/TT/tien-gioi-c && agy     # Dev C
```

Antigravity đọc quy ước dự án từ `AGENTS.md` ở gốc repo (cùng nội dung Claude Code đọc qua `CLAUDE.md`).
Đừng đặt quy ước riêng của dự án vào `~/.gemini/`: thư mục đó dùng chung cho cả máy (Dev B và Dev C cùng dùng).
Mở phiên mới cho mỗi issue và bảo nó đọc issue trước: `Làm #31, đọc issue bằng gh issue view 31`.

### Trình soạn thảo

- **VS Code:** cài extension *Remote - SSH*, kết nối tới máy, rồi *Open Folder* đúng thư mục của mình (`tien-gioi-a`, `tien-gioi-b` hoặc `tien-gioi-c`).
- Khi mở một issue mới, tạo nhánh trong thư mục của mình:
  ```bash
  git switch main && git pull
  git switch -c a/inventory-server     # Dev B: b/... · Dev C: c/...
  ```

## Thử chung (nhiều người cùng vào một thế giới)

Mỗi người có server riêng, nên bình thường mọi người **không** thấy nhau. Muốn thử chung một tính năng:
1. Merge các PR liên quan vào `main`.
2. Một người `git pull` rồi chạy `npm run dev` ở thư mục của mình.
3. Mọi người cùng mở địa chỉ của người đó (ví dụ `http://100.109.206.6:5173`).

## Những thứ dùng chung, cẩn thận

| Thứ dùng chung | Lưu ý |
|---|---|
| User Linux `nguyencong`, `~/.bashrc`, `~/.gitconfig` | Không sửa cấu hình global; tên commit đặt theo từng thư mục |
| Tài khoản GitHub `nguyencong1227` | Ai cũng push được mọi nhánh: chỉ push nhánh của mình (`a/...`, `b/...` hoặc `c/...`) |
| Node.js ở `~/.local/node` | Đừng cài đè phiên bản khác khi người khác đang chạy |
| Cấu hình trợ lý AI: `~/.claude/` (Claude Code), `~/.gemini/` (Antigravity) | Không sửa: quy ước dự án đặt trong `AGENTS.md` của repo |
| CPU / RAM của máy | Tắt `npm run dev` khi không dùng; đừng chạy thử tải (#29) khi người khác đang làm; báo trước một tiếng |
