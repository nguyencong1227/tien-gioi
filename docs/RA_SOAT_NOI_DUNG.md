# Rà soát nội dung — bộ kiểm `npm run check:content` (Issue #1200 · mục 61.2)

> Trạng thái: **Phần 1 + Phần 2 (nguồn vật phẩm) đã xong** (F, nhánh `f/1200-check-content`). Gom MỌI bộ kiểm
> dữ liệu nội dung (cấu trúc) hiện có thành MỘT lệnh `npm run check:content`, báo lỗi gọn theo "nhóm · tệp · id",
> nối CI, đỏ khi dữ liệu game sai. Phần 2 đã thêm kiểm CHÉO nguồn vật phẩm (mồ côi / nguyên liệu chết / tham chiếu
> trỏ thật). Phần 2 còn lại (id trùng chéo bảng, sách trỏ chiêu...) và Phần 3 (thuật ngữ theo từ điển) làm sau.
>
> **Bắt buộc trước mọi PR nội dung** (Dev D / E / G). CI đỏ nếu dữ liệu sai. Không nới luật cho xong:
> dữ liệu hiện phải qua sạch, hoặc mọi vi phạm thật được liệt kê cho chủ dữ liệu sửa.

## 1. `check:content` gồm những gì (Phần 1 — đã gom)

Script: `server/scripts/check-content.ts`. Chạy: `npm run check:content` (root) → `-w server` → `tsx scripts/check-content.ts`.
Nguyên tắc: KHÔNG viết lại bộ kiểm cũ, chỉ GỌI các hàm kiểm thuần trong `shared/` với dữ liệu mặc định (bảng thật).
Mỗi hàm trả danh sách chuỗi lỗi; in kèm tên nhóm + tệp nguồn. Thoát mã 1 nếu có lỗi.

| Nhóm kiểm | Dữ liệu thật | Hàm kiểm | Tệp hàm |
| --- | --- | --- | --- |
| Chiêu thức | `LEARNABLE_SKILLS` | `skillViolations` | `shared/src/skill-violations.ts` |
| Trùm | `BOSSES` | `bossViolations` | `shared/src/bosses.ts` |
| Chặn đường cảnh + bầy | `AMBUSH_SCENES` / `AMBUSH_FOES` | `ambushViolations` | `shared/src/ambush-data.ts` |
| Nhiệm vụ tông | `SECT_QUESTS` | `sectQuestViolations` | `shared/src/sect-depth.ts` |
| Cửa hàng tông môn | `SECT_SHOP` | `sectShopViolations` | `shared/src/sect-depth.ts` |
| Cổng giữa các bản đồ | `MAPS` | `portalLinkViolations` | `shared/src/map-checks.ts` |
| Trùm thế giới (lịch) | `WORLD_BOSS_SCHEDULE` | `worldBossViolations` | `shared/src/social.ts` |
| Thành tựu | `ACHIEVEMENTS` | `achievementViolations` | `shared/src/social.ts` |
| Danh hiệu | `TITLES` | `titleViolations` | `shared/src/social.ts` |

**Dữ liệu game hiện tại qua sạch** cả 10 bộ kiểm (chạy 2026-11-23). Thời gian < 5 giây.

### 1b. Kiểm CHÉO nguồn vật phẩm (Phần 2 — đã làm)

| Nhóm kiểm | Dữ liệu thật | Hàm kiểm | Tệp hàm |
| --- | --- | --- | --- |
| Nguồn vật phẩm | `ITEMS` × `DROP_TABLES` / `SHOPS` / `RECIPES` / `QUESTS` / `TRADES` / `DUNGEONS` / `SECT_SHOP` / `SECT_QUESTS` | `itemSourceViolations` | `shared/src/item-sources.ts` |

Kiểm CHÉO (hàm thuần `itemSourceViolations`, dùng chung với `item-sources.test.ts` — issue #751):
1. **Vật phẩm mồ côi** — mọi vật phẩm trong `ITEMS` có ÍT NHẤT MỘT nguồn vào (rơi / bán / chế / thưởng nhiệm
   vụ + nhiệm vụ tông / đổi NPC / rương bí cảnh), trừ danh sách ngoại lệ `NGOAI_LE` (hiện rỗng).
2. **Owner-gear lang thang** — `OWNER_GEAR_ITEMS` phải là vật phẩm CÓ trong `ITEMS` (kẻo lọt khỏi kiểm nguồn).
3. **Nguyên liệu chết** — mọi vật phẩm `type: "material"` phải được ít nhất một công thức / nhiệm vụ / đổi đồ
   DÙNG TỚI.
4. **Tham chiếu trỏ thật** — mọi `itemId` trong các bảng nguồn phải có trong `ITEMS` (không itemId rác).

Phần 2 CÒN LẠI (chưa làm, bổ sung vào `check-content.ts` sau): id không trùng chéo các bảng cùng loại; sách
kinh quyển trỏ chiêu có thật; chiêu học được có nguồn sách; vật phẩm vừa không bán vừa không dùng được.

## 2. Các bộ kiểm KHÔNG gom vào `check:content` (vẫn chạy trong `npm test`)

Những bộ này KHÔNG phải hàm thuần gọi được với bảng thật lúc kiểm nội dung, hoặc là kiểm KHÔNG bắt buộc
từng PR; giữ trong test suite (đỏ khi dữ liệu sai), KHÔNG đưa vào `check:content`:

- **Ngôn ngữ hiển thị** — `shared/src/ngon-ngu.test.ts`: CJK / khoảng trắng thừa / ký tự điều khiển / chữ
  NFD (phải NFC) / thuật ngữ "Linh thạch" viết sai / id nội bộ lộ vào chữ hiển thị / lời thoại toast thiếu
  dấu câu. Đi sâu vào mọi bảng hiển thị (`ITEMS`, `MONSTERS`, `NPCS`, `QUESTS`, `LEARNABLE_SKILLS`,
  `SKILL_BOOK_ITEMS`, `SECT_QUESTS`, `SECT_LEVELS`, `BOSSES`, `DUNGEONS`, `ACHIEVEMENTS`, `TITLES`,
  `SECT_TERMS`, 48 toast, 70 lời thoại NPC, 36 lời thoại nhiệm vụ tông). Chi tiết `docs/KIEM_NGON_NGU.md`.
- **CJK trong toàn mã nguồn** — `server/scripts/no-cjk.test.ts`: quét `client/ shared/ server/ app/` không
  có chữ Hán / kana / hangul / dấu câu CJK.
- **Kiểm chéo ngôn ngữ khác** — `shared/src/social-content.test.ts`: mỗi danh hiệu có thành tựu mở nó, không chữ Hán.
- **Cân bằng dữ liệu** (số liệu, không phải cấu trúc) — `server/src/balance/*.test.ts`:
  `bossBalanceViolations` (`trum.test.ts`), `sectBalanceViolations` (`tong-mon.test.ts`),
  `ambushBalanceViolations` / `ambushSensitivityViolations` (`chan-duong.test.ts`),
  `worldBossBalanceViolations` (`trum-the-gioi.test.ts`). Đo bởi `npm run can-bang -w server` khi đụng số.
- **Độ phủ chặn đường** — `ambushCoverageViolations` (`shared/src/ambush-data.test.ts`): KHÔNG bắt buộc từng
  PR (tài liệu thiết kế: hộp thoại có nơi chưa dựng được chỉ là lỗ hổng nội dung, KHÔNG phải lỗi dữ liệu).
  Dữ liệu hiện còn `lac_ha/leader` chưa phủ → KHÔNG đưa vào `check:content` để khỏi chặn mọi PR nội dung.
- **Khả năng đạt nhiệm vụ tông** — `sectQuestFeasibleViolations` (`shared/src/sect-quest-feasible.test.ts`).
- **Bản đồ (liên thông / vùng sinh)** — `reachabilityViolations` / `spawnZoneViolations`
  (`server/src/systems/map-checks.test.ts`, `spawn-zone.test.ts`); `portalLinkViolations` đã gom ở trên.
- **Tệp bản đồ Tiled** — `tiledViolations` (`shared/src/tiled.ts`): nhận JSON Tiled thô (`json: unknown`),
  KHÔNG có bảng dữ liệu game tĩnh để gọi lúc kiểm nội dung; kiểm cấu trúc tệp Tiled chạy ở
  `server/scripts/map-build.ts` + `map-check.ts` (lát cắt S2, trên tệp thật) và trong test `tiled.test.ts`.
  Ghi nhận trong `EXCLUDED_VIOLATION_FUNCS` của `check-content.ts`; test chống mục nát kiểm tra điều đó.
- **Kinh tế kim đan** — `server/src/balance/kim-dan-kinh-te.test.ts`.
- **Gói tài nguyên riêng** — manifest KHÔNG ở trong repo (nằm ngoài ở `/mnt/data/assets-private/`, đọc từ đĩa
  lúc chạy), nên kiểm ở server runtime: `server/src/private-packs.ts` gọi `privatePackViolations`
  (manifest hợp lệ, path / url an toàn). `check:credits` (client) ghi nguồn mọi tài nguyên.

## 3. Phần 2 — kiểm CHÉO giữa các bảng

- ✅ **Nguồn vật phẩm** (đã làm, xem mục 1b): mồ côi / nguyên liệu chết / tham chiếu trỏ thật / owner-gear.
- ⬜ ID không trùng giữa các bảng cùng loại.
- ⬜ Sách kinh quyển trỏ chiêu CÓ THẬT; mọi chiêu học được có nguồn sách.
- ⬜ Không vật phẩm nào vừa không bán vừa không dùng được.
- Ngoại lệ có lý do (vật phẩm chỉ để dành cho sự kiện) khai trong MỘT danh sách ngoại lệ có chú thích
  (`NGOAI_LE` trong `shared/src/item-sources.ts`).

## 4. Phần 3 — kiểm THUẬT NGỮ theo từ điển (chưa làm)

Làm SAU khi `shared/src/glossary.ts` (E) và `glossary-banned.ts` (G) vào main:
- Biến thể sai → lỗi kèm gợi ý cách viết đúng; từ cấm → lỗi.
- Phạm vi chỉ NỘI DUNG GAME (tên, mô tả, hội thoại), KHÔNG quét `CREDITS.md` / tài liệu tác quyền / test.
- Khung gọi sẵn bằng `try` / cờ để không chặn khi hai tệp chưa có.

## 5. Đột biến đã chứng minh (mã thật commit TRƯỚC, chèn lỗi vào DỮ LIỆU THẬT, chạy, `git checkout` sau)

| Lỗi chèn vào dữ liệu thật | Kết quả `check:content` |
| --- | --- |
| Thêm chiêu trùng id `hoa_van_kiem` vào `shared/src/skills.ts` (`LEARNABLE_SKILLS`) | ĐỎ: nhóm "chiêu thức (LEARNABLE_SKILLS)", `skill-violations.ts`, `chiêu hoa_van_kiem: trùng id`; exit 1 |
| Đổi `itemId: "nanh_soi"` → `"zzz_khong_co"` ở `shared/src/sect-depth.ts` (`SECT_QUESTS[st_nop_thu_pham].t0`) | ĐỎ: nhóm "nhiệm vụ tông (SECT_QUESTS)", id `st_nop_thu_pham.t0: vật phẩm zzz_khong_co không tồn tại`; exit 1 |
| Đổi `DROP_TABLES.tho[0].itemId: "long_tho"` → `"zzz_khong_co_ton_tai"` ở `shared/src/items.ts` (tham chiếu rác) | ĐỎ: nhóm "nguồn vật phẩm", `item-sources.ts`, `DROP_TABLES[tho]: vật phẩm zzz_khong_co_ton_tai lạ`; exit 1 |
| Thêm vật phẩm mồ côi `{ id: "zzz_orphan_tmp", ... }` vào `ITEMS` (`shared/src/items.ts`) | ĐỎ: nhóm "nguồn vật phẩm", `item-sources.ts`, `vật phẩm mồ côi: zzz_orphan_tmp (không có nguồn...)`; exit 1 |

Cả bốn đều báo đúng nhóm + tệp + id, thoát mã 1. Đã hoàn nguyên bằng `git checkout --`.

### 5b. Đột biến CODE — răng của `itemSourceViolations` (chứng minh test bắt được hàm bị làm yếu)

Dữ liệu thật đang sạch nên ca test duy nhất canh `itemSourceViolations()` (không tham số) là "sạch => rỗng";
xóa hay làm yếu một trong bốn kiểm TRONG HÀM thì CI vẫn xanh — chỉ đột biến dữ liệu như trên mới thấy răng.
Đã tham số hoá hàm (`itemSourceViolations(input)` nhận `{ items?, tables?, ownerGear? }`, mặc định bảng thật nên
`check-content.ts` giữ nguyên lời gọi) và thêm 5 ca dữ liệu giả vào `shared/src/item-sources.test.ts`. Bốn đột
biến CODE dưới đây (mã thật commit TRƯỚC tại `089efa57`, mỗi lần `git diff` xác nhận đã áp, `cp` khôi phục sau)
chứng minh MỖI đột biến làm ĐỎ đúng 1 ca tương ứng, 11 ca kia xanh (tổng 12/12 khi sạch):

| Đột biến trong `itemSourceViolations` | Kết quả `item-sources.test.ts` |
| --- | --- |
| (M1) bỏ kiểm (3): `if (consumedBy(m.id, T).length === 0)` → `if (false)` | ĐỎ ca "(3) nguyên liệu chết bị báo"; 11 ca kia xanh |
| (M2) bỏ kiểm (4) bảng rơi: `for (const d of table) ref(...)` → `for (const d of table) void d` | ĐỎ ca "(4) tham chiếu trỏ vật phẩm lạ bị báo (bảng rơi)"; 11 ca kia xanh |
| (M3) bỏ kiểm (1): `src.set(i.id, sourcesOf(i.id, T))` → `src.set(i.id, ["drop"])` | ĐỎ ca "(1) vật phẩm mồ côi bị báo"; 11 ca kia xanh |
| (M4) bỏ kiểm (2): `if (!valid.has(g.id))` → `if (false)` | ĐỎ ca "(2) owner-gear ngoài ITEMS bị báo"; 11 ca kia xanh |

Bốn ca test dữ liệu giả (mồ côi / owner-gear ngoài ITEMS / nguyên liệu chết / bảng rơi trỏ vật phẩm lạ) là răng
của hàm: ai xóa hay làm yếu một kiểm thì ca tương ứng đỏ. Đã hoàn nguyên bằng `cp` từ bản đã commit.
