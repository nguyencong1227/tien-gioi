# Kiểm toán nguồn của MỌI vật phẩm (Issue #751 · D5)

> Trạng thái: **Đã xong** — test chéo (`shared/src/item-sources.test.ts`) đỏ nếu phát hiện vật phẩm mồ côi / nguyên liệu chết / itemId rác. Báo cáo này là ảnh chụp số liệu tại thời điểm kiểm.
>
> **Không có gì trong game bị đổi** — việc này chỉ KIỂM CHỨNG (test chéo), không sửa số dữ liệu. Nếu sau này test đỏ, mở issue `dev-a` để nối nguồn (xem mục "Kết luận cho Dev A").

## 1. Mục đích & phương pháp

Mọi vật phẩm trong game phải có **ít nhất một đường vào** (người chơi nhận được từ đâu đó): rơi quái / mua cửa hàng / mua cửa hàng tông / chế thành phẩm / thưởng nhiệm vụ / thưởng nhiệm vụ tông / NPC đổi cho / rương bí cảnh. Nguyên liệu (`type: "material"`) phải được **ít nhất một nơi tiêu thụ** (công thức đầu vào / mục thu thập nhiệm vụ / mục thu thập nhiệm vụ tông / NPC thu khi đổi), không để thành nguyên liệu "chết".

Kiểm bằng hai hàm thuần trong `shared/src/item-sources.test.ts`:

- `sourcesOf(itemId)` — mọi cách người chơi **nhận** vật phẩm: `drop` (rơi quái, `DROP_TABLES`), `shop` (`SHOPS`), `sect_shop` (mua ở cửa hàng tông `SECT_SHOP`), `recipe` (thành phẩm `RECIPES[].output`), `quest` (thưởng `QUESTS[].rewards.items`), `sect_quest` (thưởng nhiệm vụ tông `SECT_QUESTS[].byTier[*].rewards.items`), `trade` (NPC cho: `TRADES[].get` là thứ người chơi NHẬN), `dungeon` (thưởng `DUNGEONS[].reward.items`).
- `consumedBy(itemId)` — mọi cách nguyên liệu bị **tiêu thụ**: `recipe` (nguyên liệu đầu vào `RECIPES[].inputs`), `quest` (bước thu thập `steps[].kind === "collect"`), `sect_quest` (bước thu thập `collect` của nhiệm vụ tông), `trade` (`TRADES[].give` là thứ người chơi NỘP).

Test gồm 4 điều kiện (xem tệp test): mọi vật phẩm có ≥1 nguồn vào; mọi nguyên liệu được ≥1 nơi dùng; mọi itemId trong các bảng nguồn đều trỏ tới vật phẩm có thật; mọi mục ngoại lệ (nếu có) đều hợp lệ và nêu lý do.

## 2. Kết quả tổng quát

| Chỉ số | Giá trị |
| --- | --- |
| Tổng số vật phẩm (`ITEMS`) | **78** |
| — đan dược (`consumable`) | 10 |
| — nguyên liệu (`material`) | 13 |
| — trang bị (`equip`) | 37 |
| — kinh quyển (`book`) | 18 |
| Vật phẩm mồ côi (không nguồn vào) | **0** |
| Nguyên liệu chết (material không ai dùng) | **0** |
| itemId rác trong bảng nguồn | **0** |

**Kết luận: dữ liệu vật phẩm hiện KHÔNG có lỗ hổng nguồn — mọi vật phẩm đều có đường vào, mọi nguyên liệu đều được dùng tới.** Test `shared/src/item-sources.test.ts` chạy xanh.

## 3. Bảng nguồn theo nhóm

Kí hiệu: `S:` = nguồn vào (sources), `C:` = nơi tiêu thụ (consumed). Dấu `-` nghĩa là không có.

### 3.1. Đan dược (`consumable`)

| Id | S (nguồn vào) | C (tiêu thụ) | Ghi chú |
| --- | --- | --- | --- |
| `hoi_huyet_dan` | drop, shop, sect_shop, quest, sect_quest, trade | | Đan hồi máu cơ bản; cũng bán ở cửa hàng tông & thưởng nhiệm vụ tông |
| `hoi_linh_dan` | drop, shop, sect_shop, quest, trade | | Đan hồi linh lực; cũng bán ở cửa hàng tông |
| `tu_khi_dan` | drop, sect_shop, quest, dungeon | - | Thưởng bí cảnh Linh Hư; cũng bán ở cửa hàng tông |
| `dai_hoi_huyet_dan` | drop, shop, quest | - | |
| `dai_hoi_linh_dan` | drop, shop, quest | - | |
| `thuong_hoi_huyet_dan` | drop, shop, quest | - | |
| `thuong_hoi_linh_dan` | drop, shop, quest | - | |
| `dot_pha_dan` | recipe | - | Đan hộ đạo (Lò đan #763): CHỈ chế, KHÔNG có giá bán (xem §4) |
| `kinh_chi_dan` | recipe | - | Đan hộ đạo: CHỈ chế, KHÔNG có giá bán |
| `duong_anh_dan` | recipe | - | Đan hộ đạo: CHỈ chế, KHÔNG có giá bán |

### 3.2. Nguyên liệu (`material`) — mọi loại đều được công thức + nhiệm vụ dùng tới

| Id | S (nguồn vào) | C (tiêu thụ) | Ghi chú |
| --- | --- | --- | --- |
| `long_tho` | drop | recipe, quest, trade | |
| `nanh_soi` | drop | recipe, quest, trade | |
| `da_ho` | drop | recipe, quest | Vừa là nguyên liệu công thức, vừa là mục thu thập nhiệm vụ |
| `vay_mang` | drop, dungeon | recipe, quest | Thưởng bí cảnh Linh Hư |
| `suong_mao` | drop | recipe, quest | |
| `quy_giap` | drop | recipe, quest | |
| `doc_nang` | drop | recipe, quest | |
| `giao_lan` | drop | recipe, quest | |
| `han_lang_mao` | drop | recipe, quest | Từ elite Hàn Lang |
| `phong_nha_vu` | drop | recipe, quest | Từ elite Phong Nha |
| `tuong_cot` | drop | recipe, quest | Từ elite Cốt Tượng |
| `doc_tuoc_nang` | drop | recipe, quest | Từ elite Độc Tước |
| `thien_han_chau` | drop | recipe, quest | |

### 3.3. Trang bị (`equip`) — mọi món đều chế từ công thức (một số còn thưởng bí cảnh)

| Id | S (nguồn vào) | C (tiêu thụ) | Ghi chú |
| --- | --- | --- | --- |
| `lang_nha_kiem` | recipe | - | |
| `tho_nhung_bao` | recipe | - | |
| `lang_nha_phu` | recipe | - | |
| `hac_ho_kiem` | recipe | - | |
| `hac_ho_bao` | recipe | - | |
| `ho_hon_phu` | recipe | - | |
| `xich_mang_kiem` | recipe | - | |
| `xich_lan_bao` | recipe, dungeon | - | Thưởng bí cảnh Linh Hư |
| `mang_dam_phu` | recipe | - | |
| `suong_vu_kiem` | recipe | - | |
| `suong_ho_bao` | recipe | - | |
| `ho_tam_phu` | recipe | - | |
| `huyen_quy_kiem` | recipe | - | |
| `quy_giap_bao` | recipe | - | |
| `quy_tuc_phu` | recipe | - | |
| `hac_giao_kiem` | recipe | - | |
| `giao_lan_bao` | recipe | - | |
| `giao_long_phu` | recipe | - | |
| `han_vu_kiem` | recipe | - | |
| `han_lang_bao` | recipe | - | |
| `phong_nha_phu` | recipe | - | |
| `ho_bo_ngoa` | recipe | - | |
| `mang_hanh_ngoa` | recipe | - | |
| `suong_van_ngoa` | recipe | - | |
| `giao_anh_ngoa` | recipe | - | |
| `tuyet_hanh_ngoa` | recipe | - | |
| `tho_nguyet_boi` | recipe | - | |
| `mang_tinh_boi` | recipe | - | |
| `suong_linh_boi` | recipe | - | |
| `giao_chau_boi` | recipe | - | |
| `han_tinh_boi` | recipe | - | |
| `ho_than_an` | recipe | - | |
| `hap_linh_chau` | recipe | - | |
| `xich_diem_an` | recipe | - | |
| `han_bang_an` | recipe | - | |
| `dinh_tam_chung` | recipe | - | |
| `phong_hanh_boi` | recipe | - | |

### 3.4. Kinh quyển (`book`)

| Id | S (nguồn vào) | C (tiêu thụ) | Ghi chú |
| --- | --- | --- | --- |
| `kinh_hoa_van_kiem` | drop, shop, quest | - | |
| `kinh_bon_thach_quyen` | drop, shop | - | |
| `kinh_ung_trao` | shop | - | |
| `kinh_trong_nhac_tram` | shop | - | |
| `kinh_huyen_bang_chi` | shop | - | |
| `kinh_kim_chung_trao` | shop | - | |
| `kinh_bich_thuy_hoi_xuan` | shop | - | |
| `kinh_phieu_phong_bo` | shop | - | |
| `kinh_thanh_tung_phi_cham` | drop | - | |
| `kinh_lac_tuyet_phan_phi` | drop | - | |
| `kinh_cuu_cung_khon_sat` | drop | - | |
| `kinh_me_tung_bo` | drop | - | |
| `kinh_han_quang_tien` | drop, quest | - | |
| `kinh_bach_kim_trao` | drop, quest | - | |
| `kinh_van_thach_tran` | drop | - | |
| `kinh_bang_hoa_loan` | drop | - | |
| `kinh_liet_hoa_kiem` | drop | - | |
| `kinh_van_hanh_bo` | drop, quest | - | |

_(đầy đủ 18 kinh quyển — mọi quyển đều có nguồn `drop` / `shop` / `quest`, không có quyển mồ côi.)_

## 4. Ghi chú về vật phẩm đặc biệt

- **Đan hộ đạo** (`dot_pha_dan`, `kinh_chi_dan`, `duong_anh_dan`): CHỈ có nguồn vào là `recipe` (chế tại Lò đan, #763), KHÔNG bán được và KHÔNG có giá trong `ITEM_VALUE` (theo thiết kế — đồ tự chế chỉ tiêu hao). Đây KHÔNG phải vật phẩm mồ côi: chúng có nguồn vào hợp lệ (công thức). Test `data-integrity` (`shared/src/data-integrity.test.ts`) đã có danh sách trắng riêng cho ba món này ở điều kiện "mọi vật phẩm đều có định nghĩa giá".
- **Trang bị ô riêng của chủ** (`OWNER_GEAR_ITEMS` trong `owner-gear.ts`, 16 món: hài / ngọc bội / pháp bảo — M7.4 #505): tất cả đều là equip CÙNG id đã có trong `ITEMS` (đã được kiểm nguồn ở §3.3). Test `item-sources.test.ts` có điều kiện đảm bảo KHÔNG có owner-gear nào "lang thang" ngoài `ITEMS` (khi đó nó sẽ KHÔNG bị kiểm nguồn).
- **Nguyên liệu elite** (`han_lang_mao`, `phong_nha_vu`, `tuong_cot`, `doc_tuoc_nang`): rơi từ quái elite, dùng chế trang bị bậc cao và là mục thu thập nhiệm vụ — đều được dùng tới, không chết.
- **Cửa hàng tông & nhiệm vụ tông** (`SECT_SHOP`, `SECT_QUESTS`): hai nguồn vào/tiêu thụ này được `sourcesOf` / `consumedBy` công nhận kể từ lần cập nhật này, để tránh báo sai "mồ côi / nguyên liệu chết" cho những món Dev D dự định đặt riêng cho tông (M8.7). Mẫu hiện tại (`hoi_huyet_dan`, `hoi_linh_dan`, `tu_khi_dan` ở cửa hàng; thưởng `hoi_huyet_dan` ở nhiệm vụ tông) đều là món ĐÃ có nguồn vào khác, nên kết quả kiểm toán KHÔNG đổi (vẫn 0 mồ côi, 0 nguyên liệu chết). Khi D thay bảng thật, nếu có món CHỈ có ở cửa hàng / nhiệm vụ tông thì chúng vẫn được tính là có nguồn — test KHÔNG báo sai.

## 5. Kết luận cho Dev A

- **Không cần hành động sửa dữ liệu.** Mọi vật phẩm đều có nguồn vào, mọi nguyên liệu đều được tiêu thụ, không itemId rác.
- **Kiểm chứng lâu dài:** `shared/src/item-sources.test.ts` chạy trong `npm test` mọi nơi — thêm vật phẩm mới mà quên nối nguồn (rơi / shop / cửa hàng tông / công thức / thưởng nhiệm vụ / thưởng nhiệm vụ tông / đổi / rương) thì test RED, buộc phải nối trước khi merge.
- **Nếu phát hiện vật phẩm mồ côi HỢP PHÁP** (cố ý không có nguồn, ví dụ vật phẩm sự kiện): thêm vào `NGOAI_LE` trong `item-sources.test.ts` kèm lý do, đừng để test đỏ.
- **Nếu phát hiện vật phẩm mồ côi DO QUÊN** nối nguồn: mở issue `dev-a` để nối nguồn rơi / shop / cửa hàng tông / công thức / thưởng nhiệm vụ / thưởng nhiệm vụ tông / đổi / rương — việc này KHÔNG sửa số game.
