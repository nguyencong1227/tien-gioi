# Phân công M9: XÃ HỘI (người dùng chọn 17/11/2026)

> Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục **50** (phương án 2 trong đề xuất M9 của Dev A, `questions.md` 17/11 ~12:10). Dựa trên `main` sau v0.4.1 (bản vá trùm tìm đường, mục 48 / 49). **Mọi con số trong tài liệu này là ĐỀ XUẤT của Dev A**; D / E chốt lại bằng mô phỏng, người dùng đổi được ở mục 8. Thiết kế nằm ở mục 3-5 của chính tài liệu này (khác M8: không có tệp thiết kế riêng).

## 1. Quyết định đã chốt và ràng buộc
| Điều | Quyết định |
|---|---|
| Hướng | M9 = **xã hội**: **bảng xếp hạng** (cảnh giới / linh hồn, tông môn, PK), **trùm thế giới theo giờ**, **thành tựu + danh hiệu** theo linh hồn |
| Ngoài phạm vi | Chiến tranh tông môn, nhà / đất riêng, giao dịch người với người (chợ), bạn bè / thư tín, xếp hạng theo thời gian thực (mỗi tick) |
| Thứ tự | Làm SAU v0.4.1. M9.1 (hợp đồng `shared/`) trước hết; ba mảng (BXH, trùm thế giới, thành tựu) làm song song sau đó |
| Nguồn nội dung | Mục 19-20: tên thành tựu / danh hiệu có thể lấy ý từ Vạn Kiếp Tu Tiên (chỉ khái niệm; mỗi mục lấy nguyên văn ghi `docs/NGUON_NOI_DUNG.md` mục 3); trùm thế giới là NỘI DUNG GỐC của Tiên Giới. KHÔNG lấy nhân vật / tông phái của game đó |
| Giữ nguyên | "Server quyết định mọi kết quả"; **thành viên / thành tựu là LINH HỒN** (sống qua kiếp); ưu tiên **mất hơn nhân đôi**; ngân sách hiệu năng (tick < 10 ms, byte / tick mỗi client < 520, bench mốc); mục bấm >= 44 px, không chữ Hán, chơi được bằng bàn phím (mục 13); `PROTOCOL_VERSION` KHÔNG tăng (chỉ THÊM tin / trường tuỳ chọn; client cũ bỏ qua) |
| Công bằng | **Tài khoản có `TEST_EXP_MULT` KHÔNG vào bảng tu vi** (đánh dấu "thử nghiệm" ở các bảng khác); chỉ hiện ĐẠO HIỆU (không id, không tài khoản, không thời gian chơi riêng tư) |
| Phát hành | **Hỏi người dùng khi xong** (không tự phát hành M9) |

## 2. Hiện trạng (đã đọc mã)
- **Dữ liệu có sẵn để xếp hạng:** `Soul` (`shared/src/reincarnation.ts`: `kiep`, `best {step, realm, tier}`, `history`); nhân vật (`SavedPlayer`: `realm`, `tier`, `exp`, `life`); tông môn (`SectStore.all()`, `Sect.points`, `sectLevelOf`); PK: `endDuel` (`systems/duel.ts`) biết người thắng nhưng **chưa ghi đếm ở đâu**.
- **Chưa có:** liệt kê toàn bộ chân linh / nhân vật (`SoulStore` chỉ `get / create / update`; kho nhân vật chỉ tra theo tên), bộ đếm thắng PK, bộ lập lịch theo giờ, kênh tin giữa các phòng cho SỰ KIỆN (chỉ có chat / `sys`), mọi khái niệm thành tựu / danh hiệu, `Player.title`.
- **Dùng lại được:** `Hub` (chat toàn server `addChatSink`, `Hub.worlds` / `locate`, sổ đội / tông môn), khung trùm nhiều chiêu `BOSSES` + `systems/boss.ts` (mục 42), **tìm đường + rút về** (`systems/nav*.ts`, mục 48; trùm thế giới KHÔNG bị kẹt cây, chống cày bằng đứng sau vật cản), bảo vệ mất kết nối (`isShielded`, `NET_RECONNECT_GRACE_S`, mục 33), `sectAwardDay` / `dayKey` (trần theo ngày), `soulIdOf` + `testExpMultOf` (nhận diện tài khoản thử nghiệm), `audit(ev, fields)`.
- Quy mô thật: vài chục nhân vật. Thiết kế phải chạy tốt ở quy mô nhỏ (bảng ít dòng vẫn đẹp) và không vỡ ở 100 người dồn một phòng.

## 3. Bảng xếp hạng (BXH)
**Bốn bảng**, mỗi bảng top 20 + hạng của chính người xem:
| Bảng | Khoá xếp | Nguồn | Ghi chú |
|---|---|---|---|
| `tuvi` Tu vi (kiếp hiện tại) | (`realm`, `tier`, `exp`) giảm dần | kho nhân vật | **loại `TEST_EXP_MULT`**; chỉ nhân vật còn sống kiếp hiện tại |
| `linhhon` Linh hồn | (`best.step`, `kiep`) giảm dần; tab phụ "kiếp nhiều nhất" | `SoulStore` | hiện kiếp + cảnh giới cao nhất từng đạt |
| `tongmon` Tông môn | (`sectLevelOf(points)`, `points`) | `SectStore.all()` | hiện tên tông, cấp, số thành viên, tổng cống hiến; KHÔNG hiện kho |
| `pk` Thách đấu | số trận thắng, rồi tỉ lệ thắng | bộ đếm mới `soul.social.pk` | **>= 10 trận mới lên bảng**; một cặp linh hồn chỉ tính tối đa 3 thắng / ngày (chống đổi thắng) |

- **Làm mới định kỳ, KHÔNG mỗi tick:** một `LeaderboardService` (một đối tượng dùng chung toàn tiến trình, như `Hub`) tính lại mỗi `BOARD_REFRESH_MS` = **5 phút** bằng việc đọc kho (bất đồng bộ, ngoài vòng tick; mỗi lần đọc tối đa vài trăm bản ghi), giữ bản chụp trong bộ nhớ. Khởi động tính ngay một lần. Hỏng một lần đọc thì giữ bản cũ.
- **Giao thức (chỉ THÊM):** client gửi `boardsGet { board }` (giới hạn tần suất, `this.on`); server trả `boards { board, rows, mine, ageMs }` (chỉ cho người hỏi; `rows` <= 20 dòng gồm hạng, đạo hiệu, `titleId?` và SỐ LIỆU THÔ (realm / tier / step / kiếp / điểm / thắng) để client định dạng bằng `shared/` (tên cảnh giới), tiêu đề cột lấy từ `BOARD_COLUMNS[board]` của `shared/`; `mine: { rank: number | null, reason?: "test" | "min_games", need?: number }` để client in "tài khoản thử nghiệm không vào bảng này" / "cần thêm N trận" thay vì ô trống; `ageMs` là TUỔI bản chụp, thời gian trong mọi tin M9 là TƯƠNG ĐỐI, không dùng đồng hồ tuyệt đối của máy chủ). Không đưa BXH vào state chung. (Góp ý của B ở #1015.)
- **Kho:** thêm `SoulStore.all()` (tệp + PostgreSQL, bộ kiểm chung `store-contract`) và `PlayerStore.listProfiles()` (chỉ các trường xếp hạng, KHÔNG đọc mật khẩu / túi đồ); đọc tối đa `BOARD_SCAN_MAX` = 5000 bản ghi.
- **Bất biến (có test + đột biến):** không hiện `TEST_EXP_MULT` ở bảng tu vi; không rò dữ liệu riêng tư; hết hạn / hỏng kho thì không sập; PK chống đổi thắng.

## 4. Trùm thế giới theo giờ
- **Lịch (dữ liệu của E, mặc định đề xuất):** hai sự kiện mỗi ngày lúc **12:00 và 21:00** (giờ máy chủ, cố định UTC+7), mỗi sự kiện một trùm thế giới ở một bản đồ (xoay vòng), tồn tại **30 phút**; thông báo toàn server trước **10 / 5 / 1 phút** (kênh `sys` giữa các phòng, qua `Hub`) và lúc xuất hiện / hạ gục / bỏ chạy. `WORLD_BOSS_SCHEDULE` (dữ liệu, `shared/`) kiểm bằng `worldBossViolations` (như `bossViolations`).
- **Bộ lập lịch (`systems/world-boss.ts`, một đồng hồ ở `Hub`):** đến giờ thì yêu cầu phòng của bản đồ đích SINH trùm (qua hook tương tự `onSaveNow`); phòng chưa tạo (không ai ở đó) thì tạo / giữ khi có người vào; chạy nhiều tiến trình thì dùng `presence` của Colyseus (ngoài M9, như M3). Sập máy giữa sự kiện: sự kiện đó coi như HUỶ (không thưởng lại, không bù), sự kiện kế vẫn đúng giờ.
- **Trùm:** dùng khung `BOSSES` (nhiều chiêu, giai đoạn, cuồng nộ, quái con) + tìm đường / rút về (mục 48). Máu cố định lớn (E chốt bằng mô phỏng `can-bang`); cuồng nộ khi hết nửa thời gian. **Không** co giãn theo số người (đơn giản, dễ cân bằng); đội đông thì hạ nhanh hơn.
- **Đóng góp:** mỗi linh hồn có điểm = sát thương gây ra (`damageBy`) + hỗ trợ (hồi / khiên cho người khác, quy ra sát thương tương đương, trần 30% điểm); **ngưỡng tối thiểu 1,5% máu tối đa** để được thưởng (chống "ké"); người rớt mạng quá `NET_RECONNECT_GRACE_S` hoặc đã bị tính chết do mạng không mất phần đã có nhưng không được cộng thêm khi đang vắng; mỗi linh hồn **chỉ nhận thưởng MỘT lần mỗi sự kiện** (dù đổi phòng / đổi nhân vật).
- **Thưởng (mất hơn nhân đôi):** tu vi + Linh thạch theo tỉ lệ đóng góp (đi qua `gainExp` / `changeCoin`, trần ngày `WORLD_BOSS_EARN_DAY_CAP`), top 3 đóng góp thêm một vật phẩm hiếm của bảng rơi riêng; quái con KHÔNG thưởng (như mục 42). Tính theo thứ tự "ghi sổ đã nhận -> lưu -> trao" để sập máy chỉ MẤT, không nhân đôi.
- **Hiệu năng:** 100 người dồn một phòng + trùm đang vận chiêu: `perf.test` ca mới (`world-boss-crowd`) giữ tick < 10 ms và byte / tick < 600 mỗi client; hiệu ứng báo trước gửi `sendNear`; bảng đóng góp chỉ gửi 1 lần / 2 giây cho người trong vùng (không phải mỗi tick).
- **Giao thức (chỉ THÊM):** `worldBoss { phase: "soon" | "live" | "ended", name, mapId, startsInMs?, endsInMs?, hpPct?, top?, mine? }` (gửi người trong phòng đích + thông báo `sys` toàn server; thời gian TƯƠNG ĐỐI để đếm ngược không lệch theo đồng hồ người chơi; lịch hiển thị kèm "giờ máy chủ, UTC+7"; `top` chỉ 3-5 dòng, `mine: { pts, pct, eligible }` với `eligible` = đã qua ngưỡng 1,5 % để UI hiện "chưa đủ ngưỡng" thay vì danh sách dài).

## 5. Thành tựu + danh hiệu (theo LINH HỒN)
- **Lưu:** `Soul.social` (TUỲ CHỌN khi đọc, `sanitizeSoul` kẹp): `pk {won, lost}`, `counters: Record<string, number>` (kiếp bắt đầu, trùm đã hạ theo loài, thắng PK, cấp tông cao nhất, nghề, bản đồ đã tới...), `ach: Record<id, atISO>`, `title: string | null`. Sống qua kiếp (như `Soul.best`).
- **Dữ liệu (D / E / G):** `ACHIEVEMENTS` (>= 40 mục; nhóm: **luân hồi, tông môn, nghề, trùm, PK, khám phá bản đồ**): `{ id, name, desc, group, cond: { counter, atLeast }, reward?: { titleId?, duyen? } }`; `TITLES` (id -> chữ hiển thị <= 12 ký tự, nhóm, nguồn). Phần thưởng chỉ là danh hiệu + `duyen` nhỏ (có trần); KHÔNG đồ / tu vi. Kiểm bằng `achievementViolations` / `titleViolations` (id duy nhất, `counter` có thật, ngưỡng tăng, không chữ Hán, độ dài).
- **Máy chủ (`systems/achievements.ts`):** MỘT cổng `trackSocial(w, sid, counter, delta)`; sự kiện nhạy cảm gọi từ nơi đã có (hạ trùm `killMonster`, thắng PK `endDuel`, bắt đầu kiếp `applyRebirth`, lên cấp tông, hoàn thành nghề, vào bản đồ lần đầu). Cấp thành tựu idempotent theo linh hồn (`ach[id]` đã có thì thôi), audit `achievement.grant`. Đừng cộng bộ đếm ở chỗ khác (như `sectAwardDay`).
- **Danh hiệu:** người chơi chọn một danh hiệu đã mở: `titleSet { id | null }` (kiểm đã mở, giới hạn tần suất); `Player.title` (state công khai, chỉ đổi khi chọn) là **ID ngắn** (số nguyên hoặc id <= 4 ký tự; client tra `TITLES` của `shared/` ra chữ: ít byte trong bản chụp đầu khi người mới vào vùng nhìn, không lệch khi sửa chữ), kèm `titleId` tuỳ chọn ở tin chat toàn server từ phòng khác; hiện CẠNH đạo hiệu ở đầu nhân vật / chat / BXH. Vào phòng đặt từ `Soul.social.title`.
- **Giao thức (chỉ THÊM):** `achievements { ach, counters, title }` (đúng `Soul.social`, KHÔNG gửi lại định nghĩa: client đã có `ACHIEVEMENTS` / `TITLES` từ `shared/` và tự tính tiến độ từ `cond.{counter, atLeast}`, nên thêm thành tựu mới không đổi giao thức; chỉ cho chủ, khi mở sổ và khi có thành tựu mới), `achievementNew { id }` (toast).

## 6. Chia việc (mỗi dòng một issue; nhãn `dev-x` + `m9`)
| # | Việc | Ai | Phụ thuộc | Tiêu chí xong |
|---|---|---|---|---|
| M9.1 | **Hợp đồng `shared/`** (`shared/src/social.ts`): kiểu + hằng số + hàm thuần (`BOARD_IDS`, `BoardRow`, tin `boardsGet` / `boards`, `worldBoss`, `titleSet`, `achievements`, `achievementNew`, `Soul.social` + `sanitizeSocial`, `worldBossViolations`, `achievementViolations`, `titleViolations`), KHUNG `WORLD_BOSS_SCHEDULE` / `ACHIEVEMENTS` / `TITLES` (vài mục mẫu), `Player.title` (id ngắn) ở schema, hàm mẫu `sampleBoards()` / `sampleWorldBossEvent()` / `sampleAchievements()` (hàm thuần đúng kiểu thật, như `sampleSectHall`, để B / F dùng chung với `window.__sample...` ở `?debug`), `BOARD_COLUMNS`; test + đột biến; PR RIÊNG chỉ sửa `shared/` (+ schema nếu cần), B hoặc C review | A | v0.4.1 | `PROTOCOL_VERSION` không đổi; mọi thứ tuỳ chọn khi đọc |
| M9.2 | **Kho + bộ đếm**: `SoulStore.all()` (tệp + PG + `store-contract`), `PlayerStore.listProfiles()`, `Soul.social` đọc / ghi / chống rỗng, bộ đếm PK (`endDuel`, chống đổi thắng), `kiem-save` kiểm bất biến | A | M9.1 | đột biến đỏ; bản chụp tệp cũ đọc được |
| M9.3 | **Dịch vụ BXH** (`LeaderboardService`, làm mới 5 phút, loại `TEST_EXP_MULT`, tin `boards`, giới hạn tần suất) | A | M9.2 | 4 bảng đúng; đột biến đỏ; đo CPU |
| M9.4 | **Trùm thế giới**: lập lịch ở `Hub`, thông báo, sinh / bỏ chạy, đóng góp, ngưỡng, thưởng một lần mỗi linh hồn, mất kết nối, tin `worldBoss`; ca hiệu năng 100 người | A | M9.1, dữ liệu M9.10 | sập máy không nhân đôi thưởng; `perf` xanh |
| M9.5 | **Thành tựu + danh hiệu** (`systems/achievements.ts`, `trackSocial`, nối hook, `titleSet`, `Player.title`) | A | M9.2, dữ liệu M9.9 | idempotent; đột biến đỏ |
| M9.6 | **Giao diện BXH** (B chọn: MỘT nút HUD "Xã hội" mở một bảng có tab **Xếp hạng / Thành tựu / Sự kiện**, không thêm nhiều nút HUD điện thoại; thanh trùm thế giới dùng lại khung `boss-bar-ui.ts`; phím tắt chọn ở `ACTIONS`): bốn bảng (tab phụ), hạng của mình + lý do khi không có hạng, tuổi bản chụp, điện thoại + bàn phím | B | M9.1 (dữ liệu giả) | script Chrome 5 khung; không tràn chữ |
| M9.7 | **Giao diện trùm thế giới**: thông báo + đếm ngược, thanh trùm + bảng đóng góp, toast thưởng | B | M9.1 | script Chrome; không che màn chiến đấu |
| M9.8 | **Giao diện thành tựu + danh hiệu**: sổ theo nhóm + tiến độ, chọn danh hiệu, danh hiệu cạnh đạo hiệu (đầu người, chat, BXH), toast mở khoá | B | M9.1 | script Chrome; mục >= 44 px |
| M9.9 | **Nội dung thành tựu + danh hiệu** (`ACHIEVEMENTS` >= 40, `TITLES`), qua `achievementViolations`; ghi nguồn `NGUON_NOI_DUNG.md` | D | M9.1 | test luật xanh; không chữ Hán |
| M9.10 | **Nội dung trùm thế giới** (2-3 trùm, bộ chiêu `BOSSES`, lịch, bảng thưởng, ngưỡng) + mô phỏng cân bằng (`can-bang`: số người để hạ trong 30 phút ở 5 / 20 / 50 người, thưởng / giờ so với săn thường) | E | M9.1 | `bossViolations` / `worldBossViolations` xanh; `CAN_BANG.md` sinh lại |
| M9.11 | **Rà ngôn ngữ**: lời thông báo, tên, mô tả (không CJK, không lộ id, thuật ngữ nhất quán) | G | M9.9, M9.10 | test rà soát xanh |
| M9.12 | **Kiểm thử đối kháng**: E2E hai tab (đánh trùm thế giới cùng nhau, thắng PK, mở thành tựu, đổi danh hiệu, xem BXH), fuzz bộ đếm / đóng góp (ké, rớt mạng, sập máy), BXH loại `TEST_EXP_MULT` | F | M9.3-M9.5 | đột biến đỏ; lỗi thì issue `dev-a` kèm test tái hiện |
| M9.13 | **Kiểm thử thành tựu / PK**: idempotent, sập máy giữa lúc cấp, chống đổi thắng PK, giới hạn bộ đếm | H (khi bộ tự mở rộng bật) hoặc F | M9.5 | đột biến đỏ |
| M9.14 | **Công cụ + thử tải**: bot dồn 100 người về một phòng lúc trùm thế giới xuất hiện (đo CPU / byte / tick / số `fx`), `kiem-save` cho `Soul.social`, `LOAD_TEST.md` | C | M9.4 | không rò rỉ; bench mốc |
| M9.15 | **Nghiệm thu tổng hợp**: E2E, ảnh, CHANGELOG, hướng dẫn người chơi (`HUONG_DAN_NGUOI_CHOI.md`), hỏi người dùng phát hành | A (+ B, C) | tất cả | người dùng đồng ý phát hành |

**Thứ tự:** M9.1 trước hết (PR nhỏ, hợp đồng) -> (M9.2 -> M9.3 / M9.5 song song; M9.4 cần dữ liệu của M9.10; B làm M9.6-M9.8 bằng dữ liệu giả; D / E / G nội dung) -> M9.12-M9.14 -> M9.15.

## 7. Kiểm thử, hiệu năng, rủi ro
- Mọi tính năng server mới có test; mọi thao tác ghi bộ đếm / thưởng có **đột biến**. Mỗi PR chạy TOÀN BỘ `npm test` + `typecheck` + `lint` + `prettier --check .` (+ `can-bang` khi đụng số liệu).
- Hiệu năng: không việc mỗi tick (BXH tính ngoài tick, 5 phút; bảng đóng góp 2 giây / lần); `perf.test.ts` + `npm run bench -w server` giữ mốc; ca mới 100 người + trùm thế giới.
| Rủi ro | Cách giảm |
|---|---|
| BXH bị gian lận (tài khoản thử nghiệm, đổi thắng PK, tạo nhiều nhân vật) | Loại `TEST_EXP_MULT`; PK ngưỡng 10 trận + 3 thắng / cặp / ngày; xếp theo linh hồn (không tạo nhân vật mới để leo bảng linh hồn) |
| Trùm thế giới thành nơi "ké" / sinh tiền | Ngưỡng 1,5% máu; một thưởng / linh hồn / sự kiện; trần ngày; thưởng đi qua cổng chung (`gainExp`, `changeCoin`) |
| Đông người dồn một phòng làm tick vọt | Ca hiệu năng riêng; `sendNear`; bảng đóng góp thưa; trùm không co giãn theo số người |
| Sập máy giữa sự kiện / giữa lúc cấp thưởng | Ghi sổ đã nhận TRƯỚC khi trao; sự kiện sập = huỷ, không bù |
| Đổi `Soul` làm hỏng tệp cũ | `social` tuỳ chọn khi đọc, `sanitizeSocial` kẹp; `kiem-save` trên dữ liệu thật trước khi phát hành |
| Giao diện quá tải trên điện thoại | B ra ảnh 5 khung nhìn; BXH và sổ thành tựu là bảng riêng, cuộn |

## 8. Câu hỏi cho người dùng (KHÔNG chặn; A đã chọn mặc định, đổi được)
1. Giờ trùm thế giới: **12:00 và 21:00 (UTC+7)**, 30 phút mỗi lần? 2. Mức vật phẩm hiếm của top 3 đóng góp (E chốt, mặc định ngang bí cảnh Linh Hư)? 3. Danh hiệu hiện cạnh đạo hiệu cho mọi người (mặc định) hay chỉ ở chat / BXH? 4. Bảng PK: ngưỡng 10 trận và 3 thắng / cặp / ngày có hợp lý với quy mô hiện tại (vài chục người)?
