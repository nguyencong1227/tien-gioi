# Làm việc chung một máy qua SSH

Hai dev cùng SSH vào một máy, cùng user Linux `nguyencong`, dùng chung một tài khoản GitHub.
Để không giẫm chân nhau, **mỗi người một thư mục và một bộ cổng riêng**:

| | Thư mục | Server | Client (Vite) | Tên commit |
|---|---|---|---|---|
| **Dev A** (Server & Gameplay) | `~/TT/tien-gioi-a` | 2567 | 5173 | đặt trong `.git/config` của thư mục |
| **Dev B** (Client & Trải nghiệm) | `~/TT/tien-gioi-b` | 2577 | 5183 | đặt trong `.git/config` của thư mục |

Mỗi thư mục là một bản clone riêng của repo: nhánh riêng, `node_modules` riêng, dữ liệu nhân vật riêng
(`server/data/`), tên commit riêng. Hai người chỉ "gặp nhau" qua GitHub (push / PR / pull), giống như làm trên hai máy khác nhau.

> ⚠️ **Không** làm chung trong cùng một thư mục: `git switch` của người này sẽ đổi code dưới chân người kia.

## Thiết lập lần đầu (mỗi người làm một lần)

Node.js 22 nằm ở `~/.local/node`. Thêm vào PATH một lần (dùng chung `~/.bashrc` nên chỉ một người làm):

```bash
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

Thư mục `tien-gioi-a` và `tien-gioi-b` đã được tạo sẵn, có `.env.local` với đúng cổng. Mỗi người chỉ cần đặt tên commit của mình:

```bash
cd ~/TT/tien-gioi-a        # Dev B: ~/TT/tien-gioi-b
git config user.name "Tên của bạn"
git config user.email "email-cua-ban@example.com"
```

Lệnh `git config` (không có `--global`) chỉ áp dụng cho thư mục đó, nên hai người dùng chung user Linux vẫn có tên commit khác nhau.

Nếu cần tạo lại từ đầu:

```bash
git clone https://github.com/nguyencong1227/tien-gioi.git ~/TT/tien-gioi-b
cd ~/TT/tien-gioi-b
cp .env.example .env.local     # rồi sửa PORT=2577, CLIENT_PORT=5183
npm install
```

## Chạy game khi dev

```bash
cd ~/TT/tien-gioi-a && npm run dev
```

Nếu cổng đang bị chiếm, Vite báo lỗi và dừng (không tự đổi sang cổng khác). Lúc đó kiểm tra xem
có phải mình đang chạy ở thư mục của người kia không: `ss -ltnp | grep -E '25[67]7|51[78]3'`.

Nên chạy `npm run dev` trong `tmux` để mất kết nối SSH không làm tắt server (máy chưa có tmux, cài một lần: `sudo apt install tmux`):

```bash
tmux new -s a          # Dev B: tmux new -s b
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

Client tự kết nối tới server cùng địa chỉ, cổng lấy theo `PORT` trong `.env.local`.

**Cách khác, chuyển tiếp cổng qua SSH** (không cần mở cổng ra mạng). Nhớ chuyển cả cổng client lẫn server:

```bash
# Dev A
ssh -L 5173:localhost:5173 -L 2567:localhost:2567 nguyencong@100.109.206.6
# Dev B
ssh -L 5183:localhost:5183 -L 2577:localhost:2577 nguyencong@100.109.206.6
```

Rồi mở `http://localhost:5173` (Dev A) / `http://localhost:5183` (Dev B).

## Soạn code

- **VS Code:** cài extension *Remote - SSH*, kết nối tới máy, rồi *Open Folder* đúng thư mục của mình (`tien-gioi-a` hoặc `tien-gioi-b`).
- Khi mở một issue mới, tạo nhánh trong thư mục của mình:
  ```bash
  git switch main && git pull
  git switch -c a/inventory-server     # Dev B: b/...
  ```

## Thử chung (hai người cùng vào một thế giới)

Mỗi người có server riêng, nên bình thường hai người **không** thấy nhau. Muốn thử chung một tính năng:
1. Merge các PR liên quan vào `main`.
2. Một người `git pull` rồi chạy `npm run dev` ở thư mục của mình.
3. Cả hai cùng mở địa chỉ của người đó (ví dụ `http://100.109.206.6:5173`).

## Những thứ dùng chung, cẩn thận

| Thứ dùng chung | Lưu ý |
|---|---|
| User Linux `nguyencong`, `~/.bashrc`, `~/.gitconfig` | Không sửa cấu hình global của người kia; tên commit đặt theo từng thư mục |
| Tài khoản GitHub `nguyencong1227` | Ai cũng push được mọi nhánh: chỉ push nhánh của mình (`a/...` hoặc `b/...`) |
| Node.js ở `~/.local/node` | Đừng cài đè phiên bản khác khi người kia đang chạy |
| CPU / RAM của máy | Tắt `npm run dev` khi không dùng; đừng chạy thử tải (#29) khi người kia đang làm |
