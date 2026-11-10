# Thiết kế Tông môn (M3 bước 6)

> Bản thiết kế của Dev A để B và C review **trước khi viết mã** (cùng quy trình với `THIET_KE_BI_CANH.md`, `THIET_KE_PK.md`). Quyết định của người dùng (`~/TT/orchestra/QUYET_DINH_M3.md`, mục 2.6): **tông môn gắn với linh hồn, không gắn với nhân vật của từng kiếp.** Phụ thuộc bước 3 (tài khoản + kho lưu trữ). Năm câu hỏi mở ở mục 10, A đã chọn hướng an toàn.

## 1. Mục tiêu và phạm vi

**Làm:** người chơi **lập tông môn** (tên + biệt hiệu ngắn), **mời** người khác vào (người kia nhận), có **chức vụ** (Tông chủ / Trưởng lão / Đệ tử), **chat tông môn** xuyên mọi bản đồ, **thông báo tông môn** (một dòng), **kho chung Linh thạch** (góp, rút có phân quyền, có sổ ghi), rời / mời ra / chuyển quyền / giải tán. **Thành viên là LINH HỒN**: đầu thai (đổi kiếp, nhân vật đặt lại) vẫn ở trong tông môn với đúng chức vụ.

**Không làm (bản đầu):** cấp tông môn / buff / nhiệm vụ / chiến tranh tông môn / bảng xếp hạng (cần "danh vọng", để sau khi người dùng chốt); kho vật phẩm (trùng lặp / mất đồ khi đồng thời, để sau); xin gia nhập từ ngoài (chỉ mời); nhiều tông môn một người; chia tông môn hay sáp nhập.

## 2. Hiện trạng đã đọc mã (cái để tái dùng, cái cần thêm)
- **Danh tính / linh hồn:** `Identity.soulKey` (`identity.ts`): chế độ tài khoản là `accountId`, chế độ cũ là tên chuẩn hoá. `SoulStore` (`soul.ts`) là mẫu giao diện lưu trữ có bản file (`FileSoulStore`: ghi tệp tạm + `rename`, hàng đợi theo khoá) và bản PostgreSQL (`server/src/pg/`), cùng bộ kiểm chung `store-contract.ts`. Một tài khoản = một linh hồn = một đạo hiệu cố định (`THIET_KE_TAI_KHOAN.md` mục 3): tên hiển thị của thành viên gần như không đổi.
- **Tin nhắn xuyên phòng:** `Hub` (`hub.ts`): `Hub.locate(key)` tìm người ở phòng khác; chat đội `/p` đi theo đội xuyên phòng (`systems/party.ts`); `ChatOut.channel?: "party"` (`shared/src/game.ts`). Tổ đội (`Hub.parties`) là mẫu lời mời / nhận / rời **trong bộ nhớ**; tông môn cần cùng khuôn nhưng **bền vững** (sống qua khởi động lại).
- **Ví:** mọi thay đổi Linh thạch đi qua `changeCoin` / `trySpendCoin` (`systems/wallet.ts`); ví lưu cùng hồ sơ nhân vật (định kỳ 30 giây và khi rời phòng) nên **không nguyên tử** với bản ghi tông môn: xem mục 4.4.
- **Trạng thái công khai:** `Player` (`schema.ts`) chỉ chứa thứ ai cũng cần thấy; một chuỗi ngắn đổi hiếm (như cờ `Player.duel` của PK) chấp nhận được, đo bằng bench.
- **Kiểm dữ liệu:** `kiem-save` (`audit-saves.ts`) đã kiểm tài khoản / phiên / linh hồn; cần thêm kiểm tông môn.

## 3. Trải nghiệm (luồng người chơi)
1. Bấm nút **Tông môn** (HUD) -> chưa có tông môn thì thấy ô "Lập tông môn" (tên 2-16 ký tự như đạo hiệu + biệt hiệu 2-4 ký tự; tên và biệt hiệu duy nhất toàn server, không phân biệt hoa thường). Lập xong là **Tông chủ**, biệt hiệu hiện cạnh tên mình trong game.
2. Tông chủ / Trưởng lão bấm vào người chơi khác -> **"Mời vào tông môn"**; người kia nhận hộp mời (đếm ngược `SECT_INVITE_TTL_MS`, Nhận / Từ chối, như hộp mời đội). Mỗi người chỉ ở **một** tông môn.
3. Bảng tông môn: danh sách thành viên (chức vụ, cảnh giới, đang ở bản đồ nào / ngoại tuyến), thông báo, kho chung (số dư, nút Góp / Rút, sổ ghi gần đây), nút Rời. Tông chủ thấy thêm: Thăng / Giáng chức, Mời ra, Chuyển quyền, Giải tán (xác nhận hai bước).
4. **Chat tông môn**: `/s <nội dung>` (kênh riêng, màu riêng), tới thành viên ở mọi bản đồ; không lưu lịch sử.
5. **Đầu thai**: sau khi chết thật và đầu thai ở Hoàng Tuyền, người chơi vào lại và **vẫn ở tông môn** (cùng chức vụ); Tông chủ chết thật cũng vẫn là Tông chủ.

## 4. Kiến trúc

### 4.1 Mô hình dữ liệu (bền vững)
```
Sect { v: 1, id: uuid, name, tag, leader: soulKey, motd: string (<= 120 ký tự),
       members: { soulKey, name, rank: "chu" | "truong_lao" | "de_tu", joinedAt }[],   // name = đạo hiệu lần cuối thấy
       coin: number (0..SECT_COIN_CAP), log: { at, name, kind: "deposit"|"withdraw", amount }[] (<= 30 mục, MỚI NHẤT ĐỨNG ĐẦU),
       createdAt, updatedAt }
```
- **Nguồn sự thật duy nhất là bản ghi `Sect`** (danh sách thành viên nằm trong đó); chỉ mục `soulKey -> sectId` và `name / tag -> id` dựng trong bộ nhớ lúc khởi động (server một tiến trình, số tông môn nhỏ) và cập nhật cùng lúc với mỗi lần ghi thành công. Không thêm trường vào `Soul` (không hai nơi giữ cùng một sự thật).
- `SectStore` (giao diện, như `SoulStore`; `server/src/sect-store.ts`): `all()`, `get(id)`, `findBySoul(soulKey)`, `create(sect)`, `update(id, fn)` (đọc - sửa - ghi **nguyên tử** theo từng tông môn, `fn` thuần nhận BẢN SAO, trả `null` nếu không có), `delete(id)`. `create` / `update` ném `SectConflictError` (`id_taken` / `name_taken` / `tag_taken` / `member_taken`) khi vi phạm tính duy nhất và ném lỗi thường khi bản ghi sai bất biến (`assertWritableSect`: kho ngoài 0..`SECT_COIN_CAP` hoặc không nguyên, tên / biệt hiệu / thông báo chưa chuẩn hoá, hai Tông chủ... KHÔNG im lặng kẹp: tiền không được biến mất). Bản file (`FileSectStore`): `<DATA_DIR>/sects/<id>.json` (hoặc `SECTS_DIR`); chỉ mục trong bộ nhớ dựng lúc dùng lần đầu, mọi thao tác xếp MỘT hàng chung; tệp hỏng, tên tệp lệch `id`, hoặc trùng tên / biệt hiệu / thành viên với tông môn CŨ hơn (theo `createdAt`) bị cách ly thành `*.hong-*` (không xoá). Bản PostgreSQL (`pg/sect-store.ts`, migration `server/migrations/0002_tong_mon.sql`): bảng `sects (id PK, name_key UNIQUE, tag_key UNIQUE, data jsonb)` + `sect_members (soul_key PK, sect_id)` trong **một transaction**; xung đột được kiểm trong transaction trước khi ghi (từ chối sạch, đúng lý do) và UNIQUE là trọng tài khi hai yêu cầu / hai tiến trình đua nhau. **Không có khoá ngoại / `ON DELETE CASCADE`** (như `sessions` ở 0001: `pg-mem` lệch ở đó): `delete` xoá cả hai bảng trong một transaction. Bộ ca chung `describeSectStoreContract` (`store-contract.ts`) chạy cho cả hai (pg-mem luôn chạy; Postgres thật khi có `TEST_DATABASE_URL`, như CI).
- Làm sạch khi nạp (`sanitizeSect`): kiểu, độ dài, số nguyên, hạng hợp lệ, đúng một Tông chủ và trùng `leader`, không thành viên trùng, `coin` kẹp 0..`SECT_COIN_CAP`; dữ liệu hỏng thì cách ly, không phá cả tiến trình.

### 4.2 Dịch vụ và hệ thống
- `server/src/sect-service.ts` (không đụng Colyseus `Room`, như `AuthService`): `create`, `invite` / `answer`, `leave`, `kick`, `setRank`, `transfer`, `disband`, `setMotd`, `deposit`, `withdraw`, và truy vấn `sectOf(soulKey)`. Mỗi thao tác kiểm lại quyền ở server (`SECT_PERMS`, bảng thuần ở `shared/` để client ẩn nút) rồi ghi bằng `SectStore.update`. Thao tác của MỘT người xếp hàng theo `soulKey` (không hai thao tác chồng nhau); thao tác lên MỘT tông môn xếp hàng theo `sectId` (đã có từ `update`).
- `server/src/systems/sect.ts`: nối dịch vụ với phòng: tin nhắn từ client (`this.on(...)`, giới hạn tần suất), lời mời đang chờ (bộ nhớ, `SECT_INVITE_TTL_MS`, dùng một lần, kiểm lại lúc nhận), gửi `SectMsg` (ảnh chụp tông môn) cho thành viên **khi có đổi** (không mỗi tick) và `sectPresence` (ai đang online, 10 giây một lần chỉ khi đổi), chat `/s` xuyên phòng bằng `Hub.locate` (như `partyChat`). Vào phòng: tra `sectOf(identity.soulKey)`, cập nhật `name` của thành viên nếu đổi, gửi `SectMsg`, đặt `Player.sect`.
- **Cờ công khai `Player.sect`** (biệt hiệu 2-4 ký tự, `""` = không có): đổi chỉ lúc vào / rời / lập / giải tán / bị mời ra; người xem vẽ `[biệt hiệu]` cạnh tên. Bench phải giữ 0.0% (chỉ đổi lúc đổi tông môn); chi phí là một chuỗi ngắn trong state đầy đủ lúc vào vùng nhìn, đo ở bench đám đông.

### 4.3 Chức vụ và quyền (bảng thuần ở `shared/`)
| Thao tác | Tông chủ | Trưởng lão | Đệ tử |
|---|:-:|:-:|:-:|
| Chat, góp kho, xem bảng | có | có | có |
| Mời vào | có | có | không |
| Mời ra | mọi người khác | chỉ Đệ tử | không |
| Thăng / giáng chức, chuyển quyền, giải tán | có | không | không |
| Sửa thông báo | có | có | không |
| Rút kho | có | không (bản đầu) | không |
- Tông chủ muốn rời phải **chuyển quyền trước** (hoặc giải tán nếu còn một mình); không có tông môn "vô chủ". Người bị mời ra / tự rời có `SECT_REJOIN_COOLDOWN_MS` trước khi nhận lời mời mới (chống nhảy tông môn để lấy kho: kho không chia, nhưng chống làm phiền).
- **Giới hạn:** `SECT_MAX_MEMBERS` thành viên; tối đa `SECT_ELDERS_MAX` Trưởng lão.

### 4.4 Kho chung và tính nhất quán tiền (ưu tiên mất hơn nhân đôi)
Ví người chơi (lưu định kỳ) và kho tông môn (lưu ngay) không cùng một giao dịch. Quy tắc **không bao giờ nhân đôi Linh thạch**, chấp nhận mất trong khoảng hở rất nhỏ:
- **Góp:** `trySpendCoin` -> **lưu hồ sơ nhân vật ngay** (chờ ghi xong) -> `SectStore.update` cộng kho + ghi sổ; cộng lỗi thì hoàn tiền (`changeCoin`). Sập giữa "lưu hồ sơ" và "cộng kho": mất số góp (hiếm), không nhân đôi.
- **Rút:** `SectStore.update` trừ kho + ghi sổ -> `changeCoin` cộng ví -> lưu hồ sơ ngay. Sập giữa trừ kho và lưu ví: mất số rút (hiếm), không nhân đôi.
- Số liệu kẹp nguyên dương hữu hạn, kho không âm và không vượt `SECT_COIN_CAP`, ví không vượt `COIN_CAP` (rút quá ví thì từ chối, không rút dở). Mọi lần góp / rút ghi vào `log` (ai, bao nhiêu, lúc nào).

### 4.5 Hiệu năng và rò rỉ
- Không thêm việc mỗi tick: tin tông môn chỉ gửi khi đổi; `sectPresence` theo nhịp 10 giây chỉ khi đổi; chat đi như chat đội. Số tông môn / thành viên đủ nhỏ để giữ chỉ mục trong bộ nhớ.
- Lời mời đang chờ và hồi chiêu quét theo nhịp chung kèm getter đếm cho test rò rỉ (như `Duels` / `Runs`).

## 5. Điều kiện và chống lạm dụng (server quyết định)
Mọi tin kiểm kiểu, giá trị hữu hạn, độ dài; tên qua `cleanName`-họ hàng (`cleanSectName`, `cleanSectTag`); đăng ký bằng `this.on(...)` (giới hạn tần suất):
- **Lập:** chưa ở tông môn; tên / biệt hiệu hợp lệ và chưa dùng (kể cả khi hai người lập cùng lúc: ràng buộc UNIQUE ở kho); hồi chiêu lập.
- **Mời:** người mời có quyền, người kia online, chưa ở tông môn, qua cooldown tham gia lại, tông môn chưa đầy, không có lời mời trùng, tối đa vài lời mời đang chờ tới một người (chống rải).
- **Nhận:** lời mời còn hạn, đúng người, tông môn vẫn còn và chưa đầy, người mời vẫn còn chức vụ có quyền **lúc nhận** (kiểm lại).
- **Mọi thay đổi chức vụ / mời ra / giải tán / rút kho:** kiểm quyền bằng bảng ở mục 4.3 **trên bản ghi đọc trong `update`** (không dựa vào trạng thái cũ ở bộ nhớ), nên hai thao tác đua nhau không phá bất biến (một Tông chủ, không thành viên trùng).
- Thông báo / tên hiển thị ở client luôn bằng `textContent` (không HTML); thông báo cắt độ dài và bỏ ký tự điều khiển ở server.

## 6. Hợp đồng `shared/` (PR 6a, chỉ sửa `shared/`, B và C review)
`shared/src/sect.ts` (mới; **bản thực tế ở PR #227, ghi đúng theo mã**): hằng số (`SECT_MAX_MEMBERS` 30, `SECT_ELDERS_MAX` 3, `SECT_INVITE_TTL_MS`, `SECT_INVITES_MAX`, `SECT_REJOIN_COOLDOWN_MS`, `SECT_CREATE_COOLDOWN_MS`, `SECT_CREATE_COST` 1000 Linh thạch (mất hẳn, không hoàn khi giải tán), `SECT_COIN_CAP`, độ dài tên / biệt hiệu / thông báo, `SECT_LOG_MAX`, `SECT_PRESENCE_MS`); kiểu `SectRank`, `SectMember` (`{ name, rank, joinedAt }`), `SectView` (ảnh chụp gửi thành viên: tên, biệt hiệu, thông báo, hạng của mình, thành viên, kho, sổ; **không** chứa online / cảnh giới / bản đồ: những thứ đổi thường nằm ở `SectPresenceMsg`, client ghép theo đạo hiệu), `SectLogEntry` (`{ at, name, kind, amount }`); `SECT_MSG` và tin nhắn (chat `/s` đi bằng tin `chat` sẵn có, không có tên riêng) (`sectCreate`, `sectInvite`, `sectAccept` / `sectDecline`, `sectLeave`, `sectKick`, `sectRank`, `sectTransfer`, `sectDisband`, `sectMotd`, `sectDeposit`, `sectWithdraw`; server -> client: `sectInvited`, `sect` (ảnh chụp, `null` khi không có), `sectPresence`); bộ đọc không tin client (`parseSect*`, `cleanSectName`, `cleanSectTag`, `cleanMotd`); bảng quyền `SECT_PERMS` + hàm thuần `canSect(action, rank, target?)` và `sectFailMessage(reason)` (client ẩn nút, server kiểm lại); `ChatOut.channel` thêm `"sect"`; `SavedPlayer` không đổi. `sectRank` chỉ nhận `truong_lao` / `de_tu` (Tông chủ chỉ đổi bằng `sectTransfer`); **giải tán khi kho còn Linh thạch bị từ chối** (`treasury_not_empty`: rút hết trước, tiền không biến mất vì giải tán).

## 7. Giao diện (B)
Nút Tông môn ở HUD; bảng Tông môn (lập / danh sách thành viên / thông báo / kho + sổ / Rời, và các nút của Tông chủ theo `canSect`); hộp mời tông môn (như hộp mời đội); thêm "Mời vào tông môn" vào menu bấm người chơi; biệt hiệu `[xxxx]` cạnh tên người chơi (theo `Player.sect`) ở màn chơi và danh sách đội; kênh chat tông môn (`/s`, màu riêng, tab); toast cho mọi từ chối của server (`sectFailMessage`). Ảnh 1280x720 và 390x844; DOM bằng `textContent`; E2E thật hai tab (lập -> mời -> nhận -> chat -> góp kho -> rời).

## 8. Chia PR và phân công
| PR | Nội dung | Ai |
|---|---|---|
| 6a | `shared/`: hợp đồng mục 6 + test + đột biến | A |
| 6b | Server: `SectStore` (file + PostgreSQL + migration + `sanitizeSect` + bộ kiểm chung `store-contract`) | A |
| 6c | Server: `SectService` + `systems/sect.ts` + `Player.sect` + chat `/s` + kho chung; test đơn vị + tích hợp + **đột biến** (nhân đôi tiền, hai Tông chủ, thành viên ở hai tông môn, thao tác thiếu quyền, nhận lời mời hết hạn, đua lập cùng tên, rời khi là Tông chủ) | A |
| 6d | Client: bảng, hộp mời, biệt hiệu, kênh chat, ảnh nghiệm thu | B |
| 6e | Công cụ: `kiem-save` kiểm tông môn (mồ côi, thành viên trùng, hai Tông chủ, kho lệch), bot, thử tải (N tông môn, đua mời / nhận), rò rỉ, mô phỏng sập giữa góp / rút kho | C |

## 9. Lưu ý di chuyển và vận hành
Dữ liệu mới nằm ngoài hồ sơ nhân vật và chân linh nên **không cần di chuyển** file cũ; `chuyen-du-lieu` chuyển thêm thư mục `sects/` -> bảng Postgres (đã làm ở 6b: tệp hỏng / tên tệp lệch `id` bị báo không chuyển; trùng tên với tông môn đã có trong DB thì kho từ chối, đếm vào `failed`). Sao lưu (`backup`) nén cả `DATA_DIR` nên đã gồm `sects/` (như `souls/`); chỉ khi đặt `SECTS_DIR` ra ngoài `DATA_DIR` mới phải sao lưu riêng. Tắt tính năng bằng cách không đăng ký tin nhắn (cờ môi trường `SECTS=off`, mặc định bật) nếu cần gỡ gấp.

## 10. Câu hỏi mở (A chọn hướng an toàn, người dùng đổi nếu muốn)
1. **Một người một tông môn; Tông chủ phải chuyển quyền trước khi rời** (không có tông môn vô chủ). Nếu Tông chủ bỏ chơi vô thời hạn thì tông môn kẹt: chưa có chuyển quyền tự động (đề xuất để sau, cần luật "bỏ chơi bao lâu").
2. **Kho chung chỉ Linh thạch; chỉ Tông chủ rút được** (có sổ ghi). Kho vật phẩm và cho Trưởng lão rút (có hạn mức / ngày) để sau.
3. **Chưa có cấp / buff / nhiệm vụ tông môn**: bản đầu là bộ khung xã hội (thành viên, chức vụ, chat, kho). Kho là chỗ chuẩn bị để sau này nâng cấp tông môn bằng Linh thạch (cũng là một "chỗ xả tiền" mà `CAN_BANG.md` đã nêu thiếu).
4. **Chỉ mời, không xin gia nhập**; tên và biệt hiệu duy nhất, không phân biệt hoa thường, không lọc từ ngữ (chưa có danh sách từ cấm; báo cáo / gỡ do người vận hành xử lý ở dữ liệu).
5. **Tông môn gắn với linh hồn:** chết thật vẫn ở tông môn; đổi đạo hiệu (nếu sau này có) chỉ cập nhật tên hiển thị. Nếu muốn "bị trục xuất khi mất kiếp" thì ngược quyết định gốc: giữ nguyên.
