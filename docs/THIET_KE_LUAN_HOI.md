# Thiết kế luân hồi (M3 bước 2, đề xuất của Dev A cho B và C review)

> **Trạng thái:** thiết kế, chưa có dòng mã nào. Nguồn quyết định: người dùng, 10/11/2026 (`docs/PHAN_CONG_M3.md`, mục "Quyết định của người dùng"). Mọi tên gọi, con số và lời thoại dưới đây **tự đặt cho Tiên Giới**; chỉ lấy ý tưởng cơ chế của thể loại, không chép chữ của game nào. Con số là **đề xuất khởi điểm**, sẽ được `npm run can-bang` mô phỏng lại ở PR 2a rồi chốt vào `docs/CAN_BANG.md` (file đó sinh tự động từ `server/src/balance/simulate.ts`, nên không sửa tay).

## 1. Mục tiêu và phạm vi
Chết không còn là "hồi sinh ở trấn, mất 10% tu vi". Chết là **hết một kiếp**: nhân vật của kiếp đó mất hẳn, linh hồn đầu thai làm lại từ đầu, mang theo **Duyên** (điểm luân hồi) tính theo thành tựu của kiếp vừa qua, dùng Duyên mở khóa lợi ích **vĩnh viễn** cho các kiếp sau.

**Trong phạm vi bước 2:** dữ liệu linh hồn tách nhân vật, vòng đời kiếp, chết thật → Hoàng Tuyền → đầu thai, công thức Duyên, bảng mở khóa bản đầu, bất tử khi rớt mạng, giao diện (B), công cụ đo (C).

**Ngoài phạm vi** (để bước sau hoặc hỏi người dùng, mục 11): tài khoản thật + PostgreSQL (bước 3), PK thách đấu (bước 5, chết vì PK không mất kiếp), tông môn (bước 6), "khắc chân linh" (game chưa có công pháp / nghề để giữ), đầu thai tự nguyện.

## 2. Thuật ngữ (tên trong game)
| Khái niệm | Tên trong game | Ghi chú |
|---|---|---|
| Linh hồn (vĩnh viễn, thuộc về người chơi) | **Chân linh** | dữ liệu `Soul` |
| Một lần sống (nhân vật của kiếp này) | **Kiếp** | "Kiếp thứ 3" |
| Điểm luân hồi | **Duyên** | "Nhận 22 Duyên" |
| Nơi chờ đầu thai (màn hình sau khi chết) | **Hoàng Tuyền** (bến **Vong Xuyên**) | màn hình chặn |
| NPC dẫn vào đầu thai | **Mạnh Bà** | lời thoại tự viết (mục 7) |
| Bảng mở khóa | **Tam Sinh Thạch** | bia đá ghi các lợi ích đã mở |
| Sống lại sau khi chết **không** mất kiếp (PK, bước 5) | **Hồi sinh** | giữ luồng cũ `RESPAWN_MS` |

## 3. Dữ liệu: chân linh tách khỏi nhân vật
Hiện nay một file `server/data/players/<sha1(tên)>.json` giữ cả "con người" (đạo hiệu + mã bí mật) lẫn nhân vật. Sau bước 2:
- **Chân linh** (`Soul`): thứ không bao giờ mất, khoá theo đạo hiệu (sang bước 3 khoá theo tài khoản).
- **Nhân vật của kiếp** (`SavedPlayer` như hiện có, thêm vài trường): bị đặt lại khi đầu thai.

```ts
// server/src/soul.ts (kiểu dùng chung nằm ở shared/src/reincarnation.ts)
interface Soul {
  v: 1;
  /** Khoá: đạo hiệu chuẩn hoá (như tên file nhân vật). Bước 3 đổi thành id tài khoản. */
  id: string;
  kiep: number; // số kiếp đã BẮT ĐẦU (kiếp hiện tại), từ 1
  duyen: number; // Duyên chưa tiêu (>= 0)
  duyenTotal: number; // tổng đã nhận, để thống kê
  unlocks: Record<string, number>; // id mục -> số nấc đã mở
  origins: string[]; // xuất thân đã mở
  best: { step: number; realm: number; tier: number }; // cao nhất mọi kiếp
  lastCreditedLife: string; // lifeId cuối cùng đã cộng Duyên (chống cộng hai lần)
  history: { kiep: number; step: number; minutes: number; gain: number; at: string }[]; // tối đa 20 kiếp gần nhất
  createdAt: string;
  updatedAt: string;
}
```

`SavedPlayer` thêm (mọi trường tuỳ chọn, file cũ không có thì coi như mặc định):
- `lifeId: string` (định danh kiếp, sinh khi bắt đầu kiếp), `life: { playMs; kills; bossKills; }` (bộ đếm thành tựu của kiếp; `playMs` cộng trong `ctrl`, **không** ghi vào state chung).
- `limbo?: { lifeId; summary; coinAtDeath; keepable: string[]; credited: boolean }`: có nghĩa nhân vật đang ở Hoàng Tuyền (đã chết, chưa đầu thai).

**Giao diện lưu trữ** để bước 3 thay bằng PostgreSQL mà không đụng hệ thống game:
```ts
interface SoulStore {
  get(id: string): Promise<Soul | null>;
  /** Đọc - sửa - ghi nguyên tử theo từng id (hàng đợi riêng cho mỗi linh hồn); `fn` thuần, không I/O. */
  update(id: string, fn: (s: Soul) => Soul): Promise<Soul>;
  create(id: string): Promise<Soul>;
}
```
`FileSoulStore` ghi `server/data/souls/<sha1(tên)>.json` (cùng cách `store.ts`: ghi tệp tạm rồi `rename`). Nạp qua **`sanitizeSoul`** (không tin file): số hữu hạn và kẹp về khoảng, bỏ id mục lạ, nấc không vượt tối đa, `duyen >= 0`, `history` cắt 20.

**Di chuyển dữ liệu:** người chơi hiện có vào game lần đầu sau khi bước 2 lên: không có file chân linh thì `create` (kiếp 1, 0 Duyên, `best` = bậc hiện tại); `lifeId` sinh mới; bộ đếm `life` bắt đầu từ 0 (Duyên tính theo **bậc đang đứng** nên không thiệt). `kiem-save` (C) kiểm cả file chân linh.

## 4. Vòng đời một kiếp
```
 Sống ──(rớt mạng bất thường)──> Hồn lìa xác (ghost, BẤT TỬ, 20 s) ──nối lại──> Sống
   │                                         └──hết 20 s──> lưu, rời phòng
   └──(khí huyết = 0, bị quái đánh)──> Hoàng Tuyền ──(Mạnh Bà: đầu thai)──> Sống (kiếp + 1)
```
**Chết thật** (khí huyết về 0 do quái; PK ở bước 5 không đi nhánh này):
1. Server tính `gain` (mục 5) và **chụp** những thứ cần cho màn hình: tóm tắt kiếp, `coinAtDeath`, danh sách trang bị có thể giữ (`keepable`: id trang bị đang mặc hoặc trong túi).
2. **Ghi file nhân vật ở trạng thái Hoàng Tuyền** (`limbo`, các chỉ số đặt lại: Phàm Nhân, tu vi 0, túi rỗng, nhiệm vụ trắng, `coin = 0`, `lifeId` mới, `life` trắng). Thoát game lúc này cũng không giữ lại được gì của kiếp cũ.
3. Cộng Duyên: `SoulStore.update`, **idempotent theo `lifeId`** (`lastCreditedLife === limbo.lifeId` thì bỏ qua). Đặt `limbo.credited = true`.
4. Gửi `limbo` cho chủ; client hiện màn hình Hoàng Tuyền. Người khác thấy xác nằm (cờ `dead` hiện có), quái bỏ mục tiêu (như `hurtPlayer` đang làm).
5. Trong Hoàng Tuyền: mọi tin nhắn gameplay (đánh, đi, mua bán, nhiệm vụ...) bị từ chối ở server; chỉ `soulBuy`, `rebirth`, chat. **Không có đồng hồ**: người chơi thong thả mua và chọn.
6. `rebirth { origin?, keep }`: server kiểm hợp lệ (mục 6), dựng kiếp mới (mục 6), **dịch chuyển tức thời về Lạc Hà Trấn** (`syncPublicPos`; nếu đang ở phòng của bản đồ khác thì lưu rồi gửi `travelTo { lac_ha }`, dùng luồng của `shared/src/travel.ts`), `dead = false`, gửi `reborn`.

**Sập máy giữa chừng:** thứ tự 2 → 3 an toàn khi chạy lại: đăng nhập thấy `limbo` có `credited = false` thì chạy lại bước 3 (idempotent), rồi gửi `limbo`. Đăng nhập khi `limbo.credited = true`: chỉ gửi `limbo`. Không bao giờ cộng Duyên hai lần, không bao giờ mất Duyên đã tính.

**Rớt mạng không bị giết** (người dùng yêu cầu): hiện `ghosts` giữ nhân vật `RECONNECT_GRACE_S` (20) giây nhưng nhân vật vẫn bị quái đánh (`hurtPlayer` không kiểm gì). Sửa: cờ `PlayerCtrl.ghost` đặt khi vào `ghosts`; `hurtPlayer` bỏ qua người `ghost`, quái không chọn người `ghost` làm mục tiêu và bỏ mục tiêu ngay khi người đó thành ghost. Hết 20 s thì lưu và rời như hiện nay. Rủi ro lạm dụng (cố ý rút dây mạng để thoát trận): hồn lìa xác không hồi máu, không tu luyện, không nhặt đồ, nhân vật rời phòng sau 20 s nên không "đứng ngoài" mãi; ghi log số lần ghost mỗi người để C / A soi nếu thấy lạm dụng.

**Chết ở bản đồ / phòng khác, trong đội, trong bí cảnh (bước 4):** như trên, luôn đầu thai ở Lạc Hà Trấn. Đội: người chết vẫn nằm trong đội (đội dùng đạo hiệu, không phụ thuộc kiếp); `partyExpShare` tính theo người có mặt như cũ.

**Đi cùng PK (bước 5):** chết vì thách đấu đi nhánh "hồi sinh" cũ (`RESPAWN_MS`, không mất gì); `DEATH_EXP_LOSS` bỏ ở bước này vì không còn nhánh nào dùng tới.

## 5. Điểm luân hồi (Duyên)
Mục tiêu: (a) chết sớm gần như không có Duyên, nên không lợi dụng cách tự sát để cày; (b) mọi cách chơi cho **tốc độ Duyên tương đương nhau** (~25-32 Duyên mỗi giờ chơi), nên không có "kiểu chơi tối ưu" bóp méo trò chơi; (c) tiến bộ thật nhận nhiều hơn ở lại.

```
Duyên = floor( stepPts + timePts + bossPts )
stepPts = tổng điểm các bậc ĐÃ QUA + điểm bậc hiện tại × (tu vi / thanh tu vi)
          điểm mỗi bậc theo cảnh giới: Phàm Nhân → Luyện Khí: 2 / bậc;  Trúc Cơ: 12 / bậc;  Kim Đan: 60 / bậc (chưa có nội dung)
timePts = min( 15, floor(phút chơi / 10) )     // phút chơi = thời gian nhân vật thật sự ở trong game (không tính ghost, Hoàng Tuyền)
bossPts = min( 15, 3 × số trùm đã hạ )
```
Ước tính theo mốc thời gian của `docs/CAN_BANG.md` (săn hiệu quả một mình; "phút" là lúc đạt bậc; thanh tu vi bậc đó còn 0%):

| Chết ngay khi vừa đạt | Phút | Duyên (0 trùm) | Duyên (hạ 2 trùm) |
|---|---:|---:|---:|
| Luyện Khí tầng 1 | 9 | 2 | 8 |
| Luyện Khí tầng 5 | 29 | 12 | 18 |
| Luyện Khí tầng 9 | 48 | 22 | 28 |
| Trúc Cơ sơ kỳ | 53 | 35 | 41 |
| Trúc Cơ trung kỳ | 86 | 50 | 56 |
| Trúc Cơ hậu kỳ | 122 | 66 | 72 |
| Hết Trúc Cơ, thanh đầy (175 phút) | 175 | 81 | 90 (hạ 3 trùm) |

Chết trong 2 phút đầu hoặc ở Phàm Nhân: 0 Duyên, và không tăng bộ đếm kiếp (chỉ đặt lại, tránh làm "đầu thai" thành nút bấm).
Sau khi có nhiều Duyên, kiếp mới nhanh hơn nhờ Dư âm tu hành (mục 6) nên Duyên mỗi giờ **tăng nhẹ** theo thời gian: đó là chủ ý (cảm giác tiến bộ qua kiếp), `can-bang` đo và test giữ để không vượt ~2× so với kiếp đầu.

## 6. Tam Sinh Thạch: bảng mở khóa bản đầu
Mỗi mục có nhiều **nấc**; mua nấc kế bằng Duyên, vĩnh viễn, chỉ mua được **ở Hoàng Tuyền**. Tổng chi phí mọi mục ≈ 1700 Duyên (~20 kiếp trọn vẹn); riêng Dư âm tu hành ≈ 1080.

| Mục (id) | Nấc: hiệu lực (giá Duyên) | Áp dụng thế nào ở server |
|---|---|---|
| **Dư âm tu hành** (`du_am`) | 10 nấc, mỗi nấc +10% tốc độ tu luyện, tối đa **+100%** (12, 18, 26, 38, 55, 80, 115, 165, 235, 335) | nhân `expMult = 1 + 0.1 × nấc` lên tu vi từ **hạ quái và đả tọa**, sau khi chia đội; **không** nhân lên Tụ Khí Đan / thưởng nhiệm vụ (đã là phần trăm thanh hoặc số cố định) |
| **Kim nang** (`kim_nang`) | 4 nấc: mang theo tối đa 20 / 60 / 150 / 400 Linh thạch qua kiếp (10, 30, 70, 150) | lúc đầu thai `coin = min(coinAtDeath, trần)`; qua `changeCoin` |
| **Lễ Mạnh Bà** (`le_ma`) | 3 nấc: nhận 3+3 / 6+6 / 10+10 Hồi Huyết Đan + Hồi Linh Đan lúc đầu thai (6, 18, 45) | thêm vào túi kiếp mới; **không** có Tụ Khí Đan (giữ quyết định "không bán / cho đan cộng tu vi") |
| **Ký vật** (`ky_vat`) | 3 nấc: giữ lại 1 / 2 / 3 món **trang bị** qua kiếp (25, 60, 140) | `rebirth.keep` chọn trong `keepable` (chụp lúc chết), đặt vào túi kiếp mới; mặc được khi đủ cảnh giới như đồ thường |
| **Xuất thân** (`xuat_than`) | mở từng xuất thân, mỗi cái 20: **Kiếm khách** +12% công, **Thể tu** +15% khí huyết tối đa, **Linh tu** +15% linh lực tối đa | chọn một (hoặc "Phàm gia" không thưởng) ở `rebirth.origin`; `statsFor(realm, tier, equipment, origin?)` nhân hệ số, client và server dùng chung |

**Khắc chân linh** (giữ một công pháp / nghề qua kiếp): chưa làm vì game **chưa có công pháp hay nghề học được** (hai kỹ năng đang có ai cũng có; công thức rèn ai cũng rèn). `Soul` chừa chỗ (`unlocks.khac`), bảng ghi "sắp có". Khi có hệ công pháp thì thêm mục, không đổi dữ liệu.

`soulBuy { id }` kiểm: đang ở Hoàng Tuyền, `id` có trong bảng (tra bằng `byId`), chưa tối đa, đủ Duyên, rồi `SoulStore.update` trừ Duyên + tăng nấc trong **một** thao tác (không bao giờ trừ mà không tăng). Giá và hiệu lực nằm trong `shared/` để client hiển thị đúng số server tính.

**Kiếp mới** (`rebirth`) dựng: Phàm Nhân, tu vi 0, khí huyết / linh lực đầy; túi = Lễ Mạnh Bà + đồ Ký vật; trang bị trống; `coin` như trên; nhiệm vụ trắng (kể cả nhiệm vụ lặp ngày); `lifeId` mới, `life` trắng, `soul.kiep + 1`; đội giữ nguyên.

## 7. Luồng màn hình (cho B)
Màn hình **Hoàng Tuyền** chặn toàn bộ HUD (như màn đăng nhập), chỉ chat còn dùng được. Gợi ý bố cục (điện thoại: một cột, cuộn):
```
┌──────────────────────────────────────────────┐
│  HOÀNG TUYỀN · Bến Vong Xuyên                │
│  Kiếp thứ 3 khép lại                         │
│  Trúc Cơ Trung kỳ · 1 giờ 31 phút · 2 trùm   │
│  Nhận  +56 Duyên      Đang có: 61 Duyên      │
├──────────────────────────────────────────────┤
│  TAM SINH THẠCH                              │
│  Dư âm tu hành   +30% → +40%    [Mở · 38]    │
│  Kim nang        mang 20 LT     [Mở · 30]    │
│  Lễ Mạnh Bà      (chưa mở)      [Mở · 6]     │
│  Ký vật          giữ 1 món      [Mở · 60]    │
│  Xuất thân       Kiếm khách ✓                │
│  Khắc chân linh  (sắp có)                    │
├──────────────────────────────────────────────┤
│  Kiếp sau:  Xuất thân [Kiếm khách ▾]         │
│  Giữ lại (1): ☑ Hắc Hổ kiếm  ☐ Hổ bào ...    │
│            [ Uống canh Mạnh Bà, đầu thai ]   │
└──────────────────────────────────────────────┘
```
- Nút cỡ chạm >= 44 px; giá không đủ thì nút mờ nhưng vẫn đọc được lý do; số Duyên và nút cập nhật ngay theo tin `soul` (server là nguồn sự thật; client không tự trừ).
- Bấm "đầu thai": màn hình mờ, lời Mạnh Bà (một câu), rồi cảnh Lạc Hà Trấn hiện dần; HUD ghi "kiếp N".
- Đóng tab / rớt mạng ở Hoàng Tuyền: lần sau vào game thấy lại đúng màn hình (server gửi `limbo` khi đăng nhập).
- Lời thoại gợi ý (tự viết, B được sửa cho hợp giọng): *Mạnh Bà múc một muỗng canh, hơi nước bốc lên như khói hương: "Cạn chén này, tên ngươi nhẹ như lá. Còn cái đã ngộ, bia đá giữ hộ."*; khi không đủ Duyên: *"Duyên mỏng, chưa khắc nổi nét này. Kiếp sau."*

## 8. Hợp đồng `shared/` (PR 2a, chỉ sửa `shared/`)
`shared/src/reincarnation.ts` (mới):
- Hằng số: `MIN_LIFE_MINUTES_FOR_KIEP` (2), `DUYEN_STEP_PTS`, `DUYEN_TIME_CAP`, `DUYEN_BOSS_CAP`, `HISTORY_MAX`.
- Hàm thuần: `calcDuyen(life)` (mục 5), `UNLOCKS` (bảng mục 6: id, tên, mô tả, giá từng nấc, hiệu lực), `unlockLevelEffect(...)`, `expMultOf(unlocks)`, `coinCarryCap(unlocks)`, `startPackOf(unlocks)`, `keepSlotsOf(unlocks)`, `ORIGINS`, `originMult(origin)`.
- Kiểu tin nhắn:
  - client → server: `SoulBuyMsg { id }`, `RebirthMsg { origin?: string; keep: string[] }`.
  - server → client (chỉ chủ): `LimboMsg { summary: LifeSummary; soul: SoulView; keepable: string[] }` (lúc chết và lúc đăng nhập nếu đang ở Hoàng Tuyền), `SoulMsg` (`SoulView`: một lần ngay khi vào phòng, để HUD ghi "Kiếp N"; và mỗi lần mua), `RebornMsg { kiep }`.
- `statsFor` nhận thêm `mult?` (tham số cuối, tuỳ chọn: **hệ số** chỉ số của xuất thân, lấy từ `originMult(origin)`, thay vì nhận id xuất thân; mọi chỗ gọi cũ không đổi).
- Test: bảng Duyên khớp mục 5, giá tăng dần và tổng tối đa đúng (`+100%`), id duy nhất, `calcDuyen` không bao giờ `NaN`/âm với đầu vào rác.

## 9. Server (PR 2b..2e, A) và chỗ trong mã hiện có phải đổi
- 2b: **ghost bất tử** (`hurtPlayer`, chọn mục tiêu quái; test: rớt mạng giữa trận, quái không đánh được, hết 20 s lưu và rời). Làm trước vì độc lập và có giá trị ngay.
- 2c: `soul.ts` (`SoulStore`, `FileSoulStore`, `sanitizeSoul`), `lifeId` + `life` trong file nhân vật, bộ đếm (`playMs` ở tick, `kills` / `bossKills` ở xử lý quái chết). Test: nạp rác không làm hỏng, ghi nguyên tử, đua cập nhật cùng một linh hồn.
- 2d: chết → Hoàng Tuyền (`hurtPlayer` + bỏ `tickRespawn` cho nhánh quái; bỏ `DEATH_EXP_LOSS` và `RESPAWN_MS` khỏi nhánh quái), `soulBuy`, `rebirth` (đăng ký bằng `this.on`, có giới hạn tần suất), áp `expMult` ở `progression`, `statsFor` với xuất thân. Test tích hợp: chết → Hoàng Tuyền → mua → đầu thai (kiểm toàn bộ mục 6); thoát giữa chừng và vào lại; sập giữa bước 2-3 (mô phỏng bằng ném lỗi ở `SoulStore.update`); cộng trùng bị chặn; tin gameplay bị từ chối khi ở Hoàng Tuyền; mutation check.
- 2e: nối với nhiều bản đồ (đầu thai luôn về Lạc Hà: `travelTo`), đội, `kiem-save`.
- **Thực tế đã làm (#159 = 2c, #162 = 2d; 2e một phần):**
  - `systems/reincarnation.ts`: `beginLimbo` (tính Duyên, chụp `LimboRecord`, đặt lại nhân vật, nằm "chết" không có đồng hồ hồi sinh), `creditSoul` (thuần, idempotent theo `endedLifeId`), `applyRebirth` (dựng kiếp mới đồng bộ: tin `rebirth` thứ hai bị bỏ qua). `World.reincarnate` (mặc định **tắt**: bench và test đơn vị vẫn dùng nhánh hồi sinh cũ; `WorldRoom` bật) và hook `World.onLimbo` (phòng đăng ký để lưu file, cộng Duyên và gửi `limbo`).
  - `WorldRoom`: `enterLimbo` ghi hồ sơ Hoàng Tuyền **trước**, rồi `souls.update` cộng Duyên, rồi ghi "đã cộng" và gửi `limbo`; lỗi cộng thì thử lại sau 3 s; `resumeLimbo` lúc vào lại (cộng bù đúng một lần, hiện lại màn hình); `soulBuy` (`buyUnlock` trong `souls.update` nguyên tử); `rebirth`; gửi `soul` một lần lúc vào phòng.
  - Đầu thai ở phòng của bản đồ khác Lạc Hà: dùng chung `handOff` với `travel` (lưu bản ghi đích, `travelTo`), nên **đội được giữ** (`dropPlayer(sid, true)`); người chết trong đội không nhận chia tu vi / loot (`party.ts` bỏ qua `dead`).
  - Dư âm tu hành nhân tu vi ở hạ quái và đả tọa (`gainExp(..., scale)`), xuất thân nhân chỉ số gốc (`c.mult` truyền vào `applyStats` / `hitMonster`).
  - Còn lại của 2e: `kiem-save` kiểm chân linh và hồ sơ Hoàng Tuyền, mô phỏng nhiều kiếp (C, #151); chết vì PK không mất kiếp (bước 5).
- **Hiệu năng:** không thêm trường vào state chung (người khác không cần biết Duyên / kiếp); mọi thứ là dữ liệu riêng gửi cho chủ khi có sự kiện (lúc chết, mua, đầu thai), không mỗi tick. `playMs` cộng trong `PlayerCtrl`. Bench một bản đồ phải giữ 0.0%.

## 10. Phân công và tiêu chí xong
- **A:** hợp đồng (2a), server (2b-2e), mô phỏng Duyên / bảng cân bằng trong `simulate.ts` (sinh `docs/CAN_BANG.md`).
- **B:** màn hình Hoàng Tuyền + Tam Sinh Thạch (chỉ xem lại được ở Hoàng Tuyền), HUD "kiếp N", chuyển cảnh đầu thai, ảnh chụp 1280x720 và 390x844; người khác thấy xác 5 giây rồi ẩn (cờ `dead` đã có).
- **C:** `can-bang` mô phỏng nhiều kiếp (Duyên mỗi giờ, số kiếp để đạt mốc từng mục, kiểm "tốc độ Duyên tương đương nhau" ở mục 5); `kiem-save` kiểm file chân linh; thử tải: nhiều bot chết cùng lúc, đua `soulBuy` cùng một linh hồn, rớt mạng ở Hoàng Tuyền, không cộng trùng, không mất Duyên; bot `--die` (đi vào chỗ nguy hiểm để chết).
- **Xong khi:** chết thật → Hoàng Tuyền → mua → đầu thai chạy trọn vẹn trên bản thật; rớt mạng giữa trận không chết; thoát ở Hoàng Tuyền vào lại thấy đúng màn hình; Duyên không bao giờ cộng hai lần hay mất; bench và ngân sách giữ nguyên.

## 11. Câu hỏi mở (A chọn hướng an toàn, người dùng đổi nếu muốn)
1. **Đầu thai tự nguyện** ("tọa hóa"): bản đầu **không có**; cách duy nhất để kết thúc kiếp là chết. Khi hết nội dung ở cuối Trúc Cơ, người chơi sẽ tự tìm cách chết (đi vào chỗ nguy hiểm). Có muốn nút "Tọa hóa" (xác nhận hai bước, Duyên nhân 0.8)? Mặc định: chưa làm.
2. **Khắc chân linh:** hoãn tới khi có công pháp / nghề (mục 6). Mặc định: bảng ghi "sắp có".
3. **Duyên có cho rút ngang qua tài khoản khác không** (chuyển Duyên): mặc định **không**, Duyên gắn một chân linh.
