# Phân công công việc: Tiên Giới M2

> Mục tiêu M2 (≈ 6 tuần, 3 sprint × 2 tuần): biến bản thử M1 thành một vòng chơi có lý do để quay lại.
> Gồm **vật phẩm, túi đồ, rơi đồ, đan dược, NPC, nhiệm vụ, trang bị**, và **thay ảnh tạm bằng asset thật**.

## Vai trò

| | **Dev A: Server & Gameplay** | **Dev B: Client & Trải nghiệm** |
|---|---|---|
| Sở hữu | `server/`, logic trong `shared/` (vật phẩm, nhiệm vụ, công thức chỉ số) | `client/`, asset, âm thanh, UI/UX, build app |
| Quyết định | Luật chơi, cân bằng số liệu, bảo mật, lưu trữ | Cách hiển thị, thao tác, bố cục điện thoại/máy tính |
| Chịu trách nhiệm | Server không bao giờ tin client; dữ liệu nhân vật không mất | Chạy mượt 60 FPS trên điện thoại tầm trung; dễ dùng bằng một tay |

Hai người cùng sở hữu **hợp đồng `shared/`**. Mỗi tính năng đi theo thứ tự:

1. **Hợp đồng trước.** Dev A mở PR nhỏ chỉ sửa `shared/` (kiểu dữ liệu, tin nhắn, bảng số liệu).
2. **Dev B review và merge** trong ngày. Từ đó hai bên làm song song, không phải chờ nhau.
3. Mỗi bên làm phần của mình trên nhánh riêng. Khi cả hai xong thì **thử chung** một buổi rồi đóng tính năng.

---

## Sprint 0: chuẩn bị (2–3 ngày, làm trước)

### Dev A
- [ ] **CI GitHub Actions:** mỗi PR tự chạy `npm ci`, `npm run typecheck`, `npm test`.
- [ ] **Vitest cho `shared/` và `server/`:** viết test mẫu cho `realms.ts` (`expToNext`, `statsFor`, `breakthroughChance`) và `moveWithCollision` (không đi xuyên ô nước/đá).
- [ ] **Tách logic khỏi `WorldRoom.ts`:** file hiện ~400 dòng. Tách thành `server/src/systems/` (`movement.ts`, `combat.ts`, `monsters.ts`, `progression.ts`) để thêm tính năng không phình một file. Hành vi giữ nguyên, test vẫn qua.

### Dev B
- [ ] **ESLint + Prettier** cho toàn repo, thêm `npm run lint` vào CI (phối hợp với A).
- [ ] **Chọn bộ asset CC0** và tạo `CREDITS.md`. Gợi ý:
  - Bản đồ: Kenney *Tiny Town* / *Roguelike RPG Pack*, hoặc bộ tile 16×16/32×32 trên OpenGameArt.
  - Nhân vật: bộ sprite 4 hướng có hoạt ảnh đi (LPC trên OpenGameArt, nhớ kiểm tra giấy phép từng phần: CC-BY-SA thì phải ghi nguồn).
  - Hiệu ứng, âm thanh: Kenney *Impact Sounds*, *RPG Audio*, *Interface Sounds*.
- [ ] **Tài liệu `client/ASSETS.md`:** quy ước key texture, kích thước, chỗ đặt file (`client/public/assets/...`).

### Cả hai
- [ ] **Bảng việc:** dùng GitHub Projects (Board), mỗi việc dưới đây là một issue, gắn nhãn `dev-a` / `dev-b` / `shared`.
- [ ] Thống nhất giờ họp nhanh hằng ngày (15 phút) và buổi demo cuối mỗi sprint.

---

## Sprint 1: Vật phẩm, túi đồ, rơi đồ, đan dược (tuần 1–2)

### Hợp đồng `shared/` (Dev A soạn, Dev B review)
- `shared/src/items.ts`:
  - `ItemDef { id, name, type: "consumable" | "material" | "equip", stack, rarity: 0..4, desc, effect? }`
  - Đan dược khởi đầu: **Hồi Huyết Đan** (hồi 40% khí huyết), **Hồi Linh Đan** (hồi 50% linh lực), **Tụ Khí Đan** (+5% thanh tu vi, hồi chiêu 60 giây; ban đầu 15%, giảm ở #28 vì đan hiếm cũng làm lệch đường cong tu luyện).
  - Nguyên liệu: lông thỏ, nanh sói, da hổ, vảy mãng (dùng cho M3).
- `DROP_TABLES`: mỗi loại quái có danh sách `{ itemId, chance, min, max }`.
- Tin nhắn mới: `useItem { slot }`, `pickup { lootId }`, `dropItem { slot, qty }`. Server → client: `inv { slots }` (chỉ gửi cho chủ túi).
- State mới: `loot: MapSchema<Loot>` với `Loot { itemId, qty, x, y, owner }`.

### Dev A: server
- [ ] **Túi đồ:** 24 ô, cộng dồn theo `stack`. Lưu vào file nhân vật (`SavedPlayer.inventory`). Chỉ gửi cho chủ nhân qua tin nhắn `inv`, không đưa vào state chung (người khác không cần thấy túi đồ của mình).
- [ ] **Rơi đồ:** khi quái chết, tung `DROP_TABLES`.
  - 30 giây đầu chỉ người gây sát thương nhiều nhất nhặt được (`owner`), sau đó ai cũng nhặt được. Hết 90 giây thì biến mất.
- [ ] **Nhặt đồ:** phải đứng trong 48 px, túi còn chỗ (đầy thì báo "Túi đồ đã đầy").
- [ ] **Dùng đan dược:** kiểm tra hồi chiêu theo từng loại; Tụ Khí Đan dùng chung `gainExp`.
- [ ] **Test:** cộng dồn, túi đầy, nhặt đồ của người khác trong 30 giây đầu (phải bị từ chối), dùng khi đã chết (bị từ chối).

**Xong khi:** đánh Linh Thố có lúc rơi đồ; nhặt và dùng được; thoát ra vào lại vẫn còn đồ; hai người tranh đồ thì đúng luật `owner`.

### Dev B: client
- [ ] **Thay ảnh tạm bằng asset thật:** tileset, người chơi (hoạt ảnh đi 4 hướng + đứng yên + chém), 4 loại quái, hiệu ứng chém/kiếm khí.
  - Giữ đúng key texture hiện tại để `WorldScene` không phải sửa nhiều.
  - Tối ưu: gộp ảnh thành atlas (TexturePacker bản free hoặc `free-tex-packer`).
- [ ] **Bảng túi đồ** (phím `I`, nút 袋 trên điện thoại):
  - Lưới 6×4 ô, chạm/rê chuột vào ô thì hiện tên, mô tả, độ hiếm (màu viền theo `rarity`).
  - Nút **Dùng** / **Vứt**.
  - Điện thoại: bảng mở toàn màn hình, nút to tối thiểu 44 px.
- [ ] **Thanh dùng nhanh:** 2 ô đan dược cạnh nút kỹ năng, có hiển thị hồi chiêu.
- [ ] **Hiển thị đồ rơi:** biểu tượng nhấp nháy theo độ hiếm. Đứng gần thì hiện nút **Nhặt** (điện thoại), máy tính bấm `F`. Đồ của người khác mờ đi.
- [ ] **Thông báo nhận đồ:** dòng nhỏ góc phải "+1 Nanh sói".

**Xong khi:** chơi trên điện thoại thật (Android Chrome) được cả vòng: đánh → nhặt → mở túi → dùng đan, không cần bàn phím.

---

## Sprint 2: NPC và nhiệm vụ (tuần 3–4)

### Hợp đồng `shared/`
- `shared/src/npcs.ts`: `NpcDef { id, name, title, x, y, dialog }`. 4 NPC đặt trong Lạc Hà Trấn:
  - **Trưởng trấn**, giao nhiệm vụ chính.
  - **Lão dược sư**, bán đan dược (M3 mới có tiền tệ; tạm thời đổi nguyên liệu lấy đan).
  - **Thợ rèn**, chuẩn bị cho trang bị ở Sprint 3.
  - **Bảng cáo thị**, nhiệm vụ lặp hằng ngày.
- `shared/src/quests.ts`: `QuestDef { id, title, giver, steps: (Kill | Collect | Talk | ReachRealm)[], rewards, next? }`.
- Tin nhắn: `talk { npcId }`, `questAccept`, `questTurnIn`. Server → client: `quests { active, done }`, `dialog { npcId, lines, options }`.

### Dev A: server
- [ ] **Hệ thống nhiệm vụ dữ liệu hóa:** tiến độ cập nhật từ sự kiện (giết quái, nhặt đồ, lên cảnh giới), không viết code riêng cho từng nhiệm vụ.
- [ ] **Tương tác NPC:** kiểm tra khoảng cách (≤ 80 px) và điều kiện nhận nhiệm vụ.
- [ ] **Phần thưởng:** tu vi, vật phẩm. Không trao trùng khi gửi `questTurnIn` hai lần liên tiếp (test!).
- [ ] **Lưu tiến độ** nhiệm vụ vào file nhân vật.
- [ ] **Nội dung:** chuỗi 6–8 nhiệm vụ chính dẫn từ Phàm Nhân lên Luyện Khí tầng 9, cộng 3 nhiệm vụ lặp ở Bảng cáo thị (giết 10 Hôi Lang, nộp 5 nanh sói…). Dev B review lời thoại.

**Xong khi:** người chơi mới biết phải làm gì ngay từ lúc vào game; làm hết chuỗi nhiệm vụ chính trong khoảng 45–60 phút.

### Dev B: client
- [ ] **Hiển thị NPC** trong trấn, có tên và ký hiệu trên đầu: `!` có nhiệm vụ mới, `?` có nhiệm vụ để trả.
- [ ] **Hộp thoại:** chữ hiện dần, chạm để tua nhanh, các lựa chọn dạng nút.
- [ ] **Theo dõi nhiệm vụ:** dưới HUD, hiện bước hiện tại và tiến độ (vd "Hôi Lang 3/10"). Chạm vào thì camera chỉ hướng tới mục tiêu.
- [ ] **Sổ nhiệm vụ** (phím `Q`): danh sách đang làm / đã xong.
- [ ] **Bản đồ nhỏ** góc trên phải: vị trí mình, người khác, NPC, khu an toàn. Phím `M` mở bản đồ lớn.
- [ ] **Âm thanh:** nhạc nền trấn và ngoài hoang dã (đổi khi ra/vào trấn), âm thanh chém, trúng đòn, nhặt đồ, lên cấp. Có nút tắt tiếng.

**Xong khi:** một người chưa từng chơi tự làm được 3 nhiệm vụ đầu mà không cần ai hướng dẫn (thử với bạn bè).

---

## Sprint 3: Trang bị, cân bằng, chịu tải (tuần 5–6)

### Hợp đồng `shared/`
- Thêm `equip` vào `ItemDef`: `slot: "weapon" | "robe" | "talisman"`, `stats: { atk?, hp?, mp?, speed? }`, `reqRealm`.
- `statsFor(realm, tier, equipment)`: chỉ số gốc cộng chỉ số trang bị. Hàm này dùng chung, nên client hiển thị đúng số server tính.
- Tin nhắn: `equip { slot }`, `unequip { slot }`, `craft { recipeId }`.

### Dev A: server
- [ ] **Trang bị:** 3 ô, kiểm tra yêu cầu cảnh giới; chỉ số áp dụng ngay.
- [ ] **Rèn đồ ở Thợ rèn:** nguyên liệu → trang bị theo công thức trong `shared/src/recipes.ts`.
- [ ] **Cân bằng số liệu:**
  - Bảng tính (Google Sheets) mô phỏng thời gian lên từng cảnh giới.
  - Mục tiêu: Luyện Khí ~1 giờ, Trúc Cơ ~3 giờ chơi.
  - Chỉnh `expToNext`, sát thương quái, tỉ lệ rơi đồ theo bảng tính.
- [ ] **Thử tải:**
  - Script `server/scripts/bots.ts` dùng `colyseus.js` tạo 50–100 bot đi lại và đánh quái.
  - Đo thời gian mỗi tick (mục tiêu < 10 ms) và băng thông mỗi người chơi.
  - Ghi kết quả vào `docs/LOAD_TEST.md`.
- [ ] **Rà bảo mật:** giới hạn tần suất mọi tin nhắn, kiểm tra kiểu dữ liệu đầu vào, không để lỗi trong một tin nhắn làm sập phòng (`onUncaughtException`).

### Dev B: client
- [ ] **Bảng nhân vật** (phím `C`): 3 ô trang bị, chỉ số chi tiết, so sánh khi rê chuột vào món mới (xanh tăng, đỏ giảm).
- [ ] **Giao diện rèn đồ** ở Thợ rèn: công thức, nguyên liệu có/thiếu.
- [ ] **Nhân vật đổi ngoại hình** theo vũ khí/áo đang mặc (ít nhất đổi màu áo, kiểu kiếm).
- [ ] **Hoàn thiện cho điện thoại:**
  - Thử trên 2 máy Android thật và iPhone (Safari).
  - Hỗ trợ màn hình ngang.
  - Đảm bảo nút không bị tai thỏ / thanh điều hướng che (safe area).
  - Kiểm tra pin/nhiệt sau 20 phút chơi.
- [ ] **Màn hình cài đặt:** âm lượng, ẩn tên người khác, chất lượng hình ảnh (tắt hiệu ứng trên máy yếu).
- [ ] **PWA:** manifest + icon để "Thêm vào màn hình chính". Bước đệm trước khi làm app Capacitor ở M4.

**Xong khi:** 50 bot + 2 người thật chơi cùng lúc vẫn mượt; người chơi có mục tiêu rõ ràng cho 3 giờ đầu.

---

## Cách làm việc chung

### Git và review
- **Mỗi việc một nhánh:** `a/inventory-server`, `b/inventory-ui`… Đặt tiền tố `a/` hoặc `b/` để biết của ai.
- **Dùng chung một tài khoản GitHub**, nên GitHub không phân biệt được ai làm gì. Mỗi người đặt tên git riêng trên máy mình để lịch sử commit vẫn rõ ràng:
  ```bash
  git config user.name "Tên Dev A"
  ```
  Người kia làm tương tự với tên của họ. Về lâu dài nên mỗi người một tài khoản GitHub (miễn phí) rồi mời vào repo: biết ai review gì, và không phải chia sẻ mật khẩu.
- **PR nhỏ** (tốt nhất < 400 dòng). Người kia review trong vòng 1 ngày làm việc.
  - Vì chung tài khoản nên không bấm "Approve" được. Thay vào đó, người review comment "LGTM" rồi mới merge.
- **Không push thẳng lên `main`.** Mọi thay đổi qua PR, CI phải xanh.

### Definition of Done (một việc được coi là xong khi)
1. Chạy được ở `npm run dev`, không lỗi console.
2. `npm run typecheck`, `npm run lint`, `npm test` đều qua.
3. Logic quyết định kết quả nằm ở server; client không tự cộng đồ/tu vi.
4. Thử trên điện thoại (dùng LAN: `http://<ip-máy>:5173`).
5. Cập nhật `README.md` / `GDD.md` nếu đổi cách chơi hoặc cách chạy.

### Lịch
| Khi nào | Việc |
|---|---|
| Hằng ngày, 15 phút | Hôm qua làm gì, hôm nay làm gì, đang bị chặn ở đâu |
| Đầu sprint | Chốt hợp đồng `shared/` cho các tính năng của sprint |
| Giữa sprint | Thử chung bản đang làm trên nhánh `main` |
| Cuối sprint | Demo, ghi lại vấn đề, điều chỉnh kế hoạch sprint sau |

### Khi bị chặn
- Dev B cần dữ liệu mà server chưa xong: tạm giả lập trong client (dữ liệu mẫu theo đúng kiểu trong `shared/`), không chờ.
- Dev A cần xem kết quả mà UI chưa có: dùng log server hoặc lệnh chat debug (vd `/give hoi_huyet_dan 5`, chỉ bật khi `NODE_ENV !== "production"`).

## Ước lượng khối lượng

| Sprint | Dev A | Dev B |
|---|---|---|
| 0 | CI, test, tách `WorldRoom` (2–3 ngày) | Lint, chọn asset, quy ước asset (2–3 ngày) |
| 1 | Túi đồ, rơi đồ, đan dược (≈ 8 ngày) | Asset thật + hoạt ảnh, UI túi đồ, nhặt đồ (≈ 9 ngày) |
| 2 | Nhiệm vụ, NPC, nội dung (≈ 9 ngày) | NPC, hộp thoại, theo dõi nhiệm vụ, minimap, âm thanh (≈ 9 ngày) |
| 3 | Trang bị, rèn đồ, cân bằng, thử tải, bảo mật (≈ 9 ngày) | Bảng nhân vật, rèn đồ UI, thử thiết bị thật, cài đặt, PWA (≈ 9 ngày) |

Khối lượng của Dev B ở Sprint 1 nhiều hơn một chút vì phải thay toàn bộ asset. Nếu trễ, Dev A nhận phần "thông báo nhận đồ" và "thanh dùng nhanh".

## Sau M2
- **M3:** tổ đội, tông môn, tiền tệ và cửa hàng, PK có điều kiện, nhiều bản đồ, bí cảnh.
- **M4:** tài khoản thật, PostgreSQL, deploy, đóng gói app Android/iOS bằng Capacitor.
