# Thiết kế Tông môn (M3 bước 6)

> Bản thiết kế của Dev A để B và C review **trước khi viết mã** (cùng quy trình với `THIET_KE_BI_CANH.md`, `THIET_KE_PK.md`). Quyết định của người dùng (`~/TT/orchestra/QUYET_DINH_M3.md`, mục 2.6): **tông môn gắn với linh hồn, không gắn với nhân vật của từng kiếp.** Phụ thuộc bước 3 (tài khoản + kho lưu trữ). Năm câu hỏi mở ở mục 10, A đã chọn hướng an toàn.

## 1. Mục tiêu và phạm vi

**Làm:** người chơi **lập tông môn** (tên + biệt hiệu ngắn), **mời** người khác vào (người kia nhận), có **chức vụ** (Tông chủ / Trưởng lão / Đệ tử), **chat tông môn** xuyên mọi bản đồ, **thông báo tông môn** (một dòng), **kho chung Linh thạch** (góp, rút có phân quyền, có sổ ghi), rời / mời ra / chuyển quyền / giải tán. **Thành viên là LINH HỒN**: đầu thai (đổi kiếp, nhân vật đặt lại) vẫn ở trong tông môn với đúng chức vụ.

**Không làm (bản đầu):** cấp tông môn / buff / nhiệm vụ / chiến tranh tông môn / bảng xếp hạng (cần "danh vọng", để sau khi người dùng chốt; **cấp, buff, nhiệm vụ, cống hiến và cửa hàng tông đã được người dùng chốt làm ở M8: MỤC 12**; chiến tranh và bảng xếp hạng vẫn để sau); kho vật phẩm (bản đầu chưa làm; đã thiết kế ở MỤC 11 sau yêu cầu của người dùng, `QUYET_DINH_M3.md` mục 27); xin gia nhập từ ngoài (chỉ mời); nhiều tông môn một người; chia tông môn hay sáp nhập.

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

**Hiện thực (6c):** `sect-service.ts` (`SectService`) lo luật + kho (quyền kiểm TRÊN bản ghi trong `update`, từ chối bằng `Refusal` ném từ `fn`; `SectStore.delete(id, guard)` cho giải tán "kho rỗng" nguyên tử); `systems/sect.ts` nối phòng: `SectBook` (`Hub.sects`: lời mời đang chờ theo `soulKey` người được mời, thành viên TRỰC TUYẾN `online`, bản ghi nhớ `cache` chỉ cho tông môn đang có người), `sectOnJoin` (vào phòng: `refreshName`, đặt `Player.sect`, gửi `SectMsg` + presence), `sectDrop` (rời phòng, kể cả qua cổng), `tickSect` (nhịp chung `SECT_PRESENCE_MS`: dọn lời mời hết hạn, gửi `sectPresence` khi đổi), `/s` trong `systems/chat.ts` (`sectChat`, `channel: "sect"`), các tin `SECT_MSG.*` đăng ký bằng `this.on(...)` trong `WorldRoom`. Dịch vụ gắn qua `World.sectService` (WorldRoom đặt; `SECTS=off` => `null` => mọi tin bị từ chối `disabled`); kho theo `STORE` (`index.ts`: `WorldRoom.sects = new SectService(stores.sects)`). `World.onSaveNow` = lưu hồ sơ NGAY (chờ ghi xong) cho phần tiền (mục 4.4). Người trực tuyến tìm bằng `Hub.locate(đạo hiệu)` rồi kiểm lại `identity.soulKey` (không chỉ tên).

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
- **"Đã lưu" phải là THẬT** (6e, `World.onSaveNow` trả `boolean`): hook chỉ trả `true` khi hồ sơ đã nằm trên đĩa / DB. Lưu lỗi, hoặc người chơi đang qua cổng (`PlayerCtrl.travelling`: `persist` bỏ qua vì bản ghi của cổng đã giữ ví cũ) thì trả `false`, và **góp / lập bị huỷ, hoàn ví** (toast `error`), kho chưa đụng tới. Rút khi đang qua cổng bị từ chối sớm. Trước 6e hook nuốt lỗi và coi như đã lưu: lưu lỗi hoặc gửi `sectDeposit` ngay sau `travel` làm kho được cộng mà đĩa vẫn giữ ví cũ (nhân đôi nếu sập).
- **Kiểm bằng mô phỏng sập** (`systems/sect-crash.test.ts`): sập ở thời điểm bất kỳ chỉ còn những gì đã nằm trên đĩa, mà mỗi lần ghi nguyên tử, nên "sập ở mọi điểm" = kiểm tổng Linh thạch TRÊN ĐĨA (ví đã lưu + kho) sau TỪNG lần ghi. Hàng loạt kịch bản đua ngẫu nhiên (góp / rút / lưu định kỳ chen vào / qua cổng / rớt mạng / lưu lỗi / kho lỗi): tổng không bao giờ vượt tổng ban đầu; không sự cố thì bảo toàn đúng (chỉ mất phí lập). Giới hạn đã biết: "commit không rõ kết quả" (kho ghi xong nhưng báo lỗi, như mất kết nối DB đúng lúc COMMIT) thì dịch vụ báo `error` và hoàn ví, có thể nhân đôi số góp đó; chỉ xử lý được bằng sổ giao dịch có id (ngoài phạm vi M3).
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
2. **Kho chung Linh thạch: chỉ Tông chủ rút được** (có sổ ghi). **Kho đồ (vật phẩm) đã thiết kế ở mục 11** (Trưởng lão rút tự do, Đệ tử có hạn mức theo ngày).
3. **Chưa có cấp / buff / nhiệm vụ tông môn**: bản đầu là bộ khung xã hội (thành viên, chức vụ, chat, kho). Kho là chỗ chuẩn bị để sau này nâng cấp tông môn bằng Linh thạch (cũng là một "chỗ xả tiền" mà `CAN_BANG.md` đã nêu thiếu).
4. **Chỉ mời, không xin gia nhập**; tên và biệt hiệu duy nhất, không phân biệt hoa thường, không lọc từ ngữ (chưa có danh sách từ cấm; báo cáo / gỡ do người vận hành xử lý ở dữ liệu).
5. **Tông môn gắn với linh hồn:** chết thật vẫn ở tông môn; đổi đạo hiệu (nếu sau này có) chỉ cập nhật tên hiển thị. Nếu muốn "bị trục xuất khi mất kiếp" thì ngược quyết định gốc: giữ nguyên.

## 11. Kho đồ tông môn (người dùng yêu cầu, `QUYET_DINH_M3.md` mục 27: "tông môn chưa có chức năng gì")

> Bổ sung của Dev A, soạn TRƯỚC khi viết mã (B giao diện, D test / fuzz, C bot đọc mục này). Mọi chữ "kho" không kèm "đồ" ở các mục 1-10 vẫn là kho Linh thạch. Đổi hợp đồng `shared/` đi qua PR riêng (mục 11.10).

### 11.1 Quyết định
- Thêm **kho đồ**: lưới `SECT_VAULT_SLOTS` = 40 ô (cùng hình `InvSlot` như túi đồ, xếp chồng theo `ItemDef.stack`), nằm TRONG bản ghi `Sect` (cùng nơi giữ kho Linh thạch). Giao diện là tab "Kho đồ" của bảng Tông môn (việc của B, dùng đúng hành vi chọn đã sửa ở mục 24: bấm chọn, rê chuột không đổi lựa chọn).
- **Góp:** mọi thành viên, từ túi đồ (số lượng chọn được với đồ xếp chồng). **Rút:** theo chức vụ (mục 11.3). **Sổ kho đồ:** ai góp / rút món gì, bao nhiêu, lúc nào; mọi thành viên xem được.
- **Ưu tiên tuyệt đối: KHÔNG BAO GIỜ nhân đôi đồ** (thà mất hơn nhân đôi), đúng nguyên tắc mục 4.4 của kho Linh thạch.
- Kho thuộc TÔNG MÔN và sống qua mọi kiếp của thành viên (thành viên là linh hồn). Câu hỏi "người vừa đầu thai có rút lại đồ mình góp ở kiếp trước không" CHƯA được người dùng trả lời: mặc định **cho phép** theo luật chức vụ, nhưng có sẵn một cờ cấu hình để khoá (mục 11.7).
- Chưa làm (chờ người dùng chọn): cấp tông môn mở rộng ô kho, cống hiến, cửa hàng / nhiệm vụ / buff tông môn.

### 11.2 Mô hình dữ liệu
Trong bản ghi `Sect` (server, `sect-store.ts`) thêm, TÙY CHỌN khi đọc (bản ghi cũ thiếu thì `sanitizeSect` dựng kho rỗng; `v` giữ 1; PostgreSQL lưu cả bản ghi ở cột `data jsonb` nên KHÔNG cần di chuyển lược đồ):
```
vault: { slots: (InvSlot | null)[SECT_VAULT_SLOTS],
         log: { at, name, kind: "deposit" | "withdraw", itemId, qty }[] (<= SECT_VAULT_LOG_MAX, MỚI NHẤT ĐỨNG ĐẦU),
         drawPerDay: 0..SECT_VAULT_DRAW_MAX }          // chính sách của Tông chủ, mặc định SECT_VAULT_DRAW_DEFAULT = 3
members[i].draw?: { day: string, n: number }           // lượt Đệ tử đã rút trong ngày `day` (`dayKey`, cùng hàm nhiệm vụ hằng ngày)
```
- `sanitizeSect`: bỏ ô có món không còn tồn tại hoặc `qty` < 1, ép `qty` về [1, stack], ép đúng `SECT_VAULT_SLOTS` ô, `drawPerDay` kẹp, `draw` hỏng thì bỏ. `assertWritableSect` (lúc GHI) KHÔNG im lặng kẹp: ô sai bất biến thì ném lỗi, đồ không được biến mất âm thầm.
- Sổ nằm cạnh kho (không dùng chung `log` Linh thạch: kiểu mục khác nhau, giới hạn độ dài khác).

### 11.3 Quyền (thêm vào `SECT_PERMS` / `canSect`)
| Thao tác | Tông chủ | Trưởng lão | Đệ tử |
|---|:-:|:-:|:-:|
| Xem kho đồ + sổ | có | có | có |
| Góp đồ | có | có | có |
| Rút đồ | tự do | tự do | **hạn mức** `drawPerDay` lượt / ngày, mỗi lượt tối đa `SECT_VAULT_DRAW_QTY_DE_TU` món (mục 11.6) |
| Chỉnh `drawPerDay` | có | không | không |
- Quyền kiểm TRÊN bản ghi đọc trong `update` (như mục 5), không dựa vào bộ nhớ.

### 11.4 Luồng và thứ tự ghi (mất hơn nhân đôi)
Đồ trong túi (bộ nhớ, lưu định kỳ) và kho (lưu ngay) không cùng một giao dịch, như Linh thạch (mục 4.4):
- **Góp:** kiểm sớm (món hợp lệ, ô có đủ, chưa trong danh sách cấm, kho còn chỗ theo bản nhớ) -> trừ khỏi túi -> **lưu hồ sơ nhân vật NGAY và chờ xong** (`World.onSaveNow`, trả `false` khi đang qua cổng hoặc lưu lỗi thì HUỶ và trả đồ) -> `SectStore.update` cộng vào kho + ghi sổ. `update` từ chối (kho vừa đầy do người khác góp) hoặc lỗi thì **trả đồ vào túi**; túi không còn chỗ thì **rơi xuống đất tại chân** (`spawnLoot`, chủ nhặt trước): không bao giờ cộng hai chỗ. Sập giữa "lưu hồ sơ" và "cộng kho": mất số góp, không nhân đôi.
- **Rút:** kiểm sớm (quyền, hạn mức, khoá kiếp mới, túi còn chỗ cho món + số lượng, không đang qua cổng) -> `SectStore.update` **trừ kho + ghi sổ + tăng `draw`** (nguyên tử) -> cộng vào túi -> **lưu hồ sơ ngay**. Túi vừa đầy ở giữa (đua với nhặt đồ): trả lại kho bằng một `update` nữa, không được thì rơi xuống đất tại chân. Sập giữa trừ kho và lưu túi: mất số rút (hiếm), không nhân đôi.
- Các nhánh lỗi chỉ BỚT, không bao giờ THÊM; mọi cộng vào túi đi qua `addToInventory` (kiểm số thừa), mọi trừ qua `takeFromSlot`.
- Giới hạn đã biết (giống mục 4.4): "commit không rõ kết quả" (kho ghi xong mà báo lỗi) có thể nhân đôi MỘT lần số góp đó; chỉ chữa được bằng sổ giao dịch có id (ngoài phạm vi).

### 11.5 Đồng thời: hai người rút cùng một món
Ba lớp, mỗi lớp có test riêng và đột biến:
1. **Mọi thay đổi kho trong `SectStore.update(id, fn)`:** hàng đợi theo `sectId`, `fn` thuần trên BẢN SAO đọc mới nhất, nên hai lần rút không bao giờ thấy cùng một số dư.
2. **Khoá kỳ vọng theo ô (phiên bản của ô):** tin rút mang `{ slot, itemId, qty }`; trong `update`, ô `slot` phải CÒN giữ đúng `itemId` với `qty` đủ, nếu không từ chối `vault_changed` (không bao giờ rút một món KHÁC vì giao diện cũ: ô vừa bị người khác rút hết rồi người khác góp món khác vào đúng ô đó). Không dùng số phiên bản toàn kho (làm hai người rút hai món khác nhau chặn nhau oan).
3. **Một người một thao tác kho tại một thời điểm** (hàng đợi theo `soulKey`, như mục 4.2): hai tin `vaultWithdraw` liên tiếp của cùng người xử lý lần lượt, lần sau thấy túi / hạn mức đã đổi.
- Hạn mức Đệ tử cũng đọc-sửa-ghi TRONG `update` (đếm lượt cùng lúc trừ kho), nên gửi dồn nhiều tin không vượt hạn mức.

### 11.6 Chính sách và hạn mức
- `drawPerDay` do Tông chủ đặt (0 = Đệ tử không rút được; tối đa `SECT_VAULT_DRAW_MAX` = 10; mặc định 3) qua tin `vaultPolicy`, ghi vào kho, thông báo cho thành viên trực tuyến.
- Một **lượt** = một lần rút MỘT ô (một loại món), tối đa `SECT_VAULT_DRAW_QTY_DE_TU` = 10 món / lượt cho Đệ tử (chống "rút cả chồng 99 trong một lượt"); Tông chủ / Trưởng lão không bị hạn. Qua ngày (`dayKey`) đếm lại từ 0. Đếm theo LINH HỒN (`members[i].draw`), nên đầu thai không đặt lại hạn mức.
- Báo lượt còn lại trong ảnh chụp (`myDrawsLeft`; `null` = không hạn).

### 11.7 Luân hồi: cờ "kiếp mới chưa được rút"
Kẽ hở (đã có sẵn với kho Linh thạch của Tông chủ): góp đồ rồi chết thật, đầu thai, rút lại làm "thừa kế". Cờ `SECT_NEWLIFE_LOCK_HOURS` (biến môi trường, **mặc định 0 = tắt**, người dùng chọn sau): bật thì người chơi có `life.playMs` của kiếp hiện tại nhỏ hơn chừng đó giờ KHÔNG rút được kho đồ (`vault_locked`) và KHÔNG rút được kho Linh thạch. Dùng `playMs` có sẵn (không thêm trường lưu). Đây là khoá theo KIẾP chứ không theo từng món: món xếp chồng nên không biết ai góp phần nào (sổ chỉ ghi giao dịch); khoá theo món cần ghi người góp trên từng ô và chia nhỏ ô, quá nặng so với lợi ích.

### 11.8 Đồ không góp được
- **Đồ đang mặc:** nằm ở ô trang bị chứ không ở túi đồ, nên tự nhiên không góp được (phải tháo ra túi trước).
- **"Đồ đã khắc chân linh":** hiện đồ KHÔNG có trạng thái riêng từng món (túi là `{ itemId, qty }`); khắc chân linh là chiêu gắn vào linh hồn lúc đầu thai, không phải thuộc tính của đồ. Nếu sau này đồ có trạng thái riêng thì món đó nằm ngoài kho (ghi vào hợp đồng khi ấy).
- **Vật phẩm nhiệm vụ:** `ItemDef` chưa có cờ riêng. Dùng danh sách chặn `SECT_VAULT_DENY_ITEMS` (`shared/`, ban đầu RỖNG; test kiểm mọi id có thật). D rà các nhiệm vụ (`QUESTS`) tìm món chỉ dùng cho nhiệm vụ rồi đề xuất danh sách (issue K5); góp món bị chặn trả `vault_denied`.
- Số ô, số lượng, `itemId` từ client luôn kiểm bằng `slotIndex`, `byId(ITEM_BY_ID, id)`, số nguyên dương hữu hạn (như `dropItem`).

### 11.9 Tin nhắn (ĐÃ CHỐT ở PR hợp đồng K1 #792, `shared/src/sect.ts`)
- Client -> server (`SECT_MSG`, đăng ký bằng `this.on(...)`, giới hạn tần suất): `sectVaultDeposit {slot, qty}` (ô túi 0..`INVENTORY_SLOTS`-1, qty nguyên 1..`SECT_VAULT_QTY_MAX`), `sectVaultWithdraw {slot, itemId, qty}` (ô kho 0..`SECT_VAULT_SLOTS`-1, `itemId` CÓ THẬT), `sectVaultPolicy {drawPerDay}` (0..`SECT_VAULT_DRAW_MAX`); bộ đọc `parseSectVaultDeposit` / `parseSectVaultWithdraw` / `parseSectVaultPolicy` (máy chủ vẫn gọi lại, không tin client); `sectVaultAccepts(itemId)` = món góp được. Quyền: `SectAction` `vaultDeposit` / `vaultWithdraw` (mọi chức vụ được THỬ) / `vaultPolicy` (chỉ Tông chủ); hạn mức Đệ tử ở `SECT_VAULT_DRAW_MODE` + `sectVaultDrawQtyCap(rank)`.
- Server -> client: `sectVault {vault: SectVaultView | null}` (ảnh chụp kho đồ: ô, sổ, `drawPerDay`, `myDrawsLeft`, `lockMs`; gửi lúc vào phòng và mỗi khi kho đổi, cho thành viên trực tuyến; tách khỏi `SectView` để đổi thông báo / thành viên không kéo theo cả kho). Kho 40 ô + sổ 50 mục ~ vài KB một lần gửi, không mỗi tick; kiểm ở bench (không tick nào gửi khi không ai đụng kho).
- Mã từ chối mới (`SECT_FAILS`, kèm câu tiếng Việt ở `sectFailMessage`): `vault_full`, `vault_changed`, `vault_limit`, `vault_denied`, `vault_locked`, `bag_full`, `item_invalid`.
- `PROTOCOL_VERSION` KHÔNG tăng: chỉ THÊM tin / trường tùy chọn (client cũ bỏ qua tin lạ; không có giao diện kho thì không gửi). Ghi vào CHANGELOG.

### 11.9b Hiện thực máy chủ (K2 + K3, `server/`)
- `sect-store.ts`: `SectVault` / `emptySectVault`, `Sect.vault`, `SectMemberRecord.draw`, `sanitizeVault` (món lạ bỏ, qty ép [1, stack], đủ `SECT_VAULT_SLOTS` ô, hạn mức mặc định khi thiếu), `assertWritableSect` TỪ CHỐI kho sai (không im lặng sửa), `withVaultLogEntry`. PostgreSQL không đổi lược đồ (`data jsonb`).
- `sect-service.ts`: `vaultDeposit` (all-or-nothing, `vault_full` / `vault_denied`), `vaultWithdraw` (khoá kỳ vọng theo ô `vault_changed`; Đệ tử: số món / lượt và `drawPerDay` đọc-sửa-ghi trong `update`), `vaultReturn` (trả phần túi không nhận được, hoàn lượt khi không nhận gì), `vaultPolicy` (chỉ Tông chủ), `sectVaultViewOf`.
- `systems/sect.ts`: `sectVaultDeposit` (kiểm sớm -> trừ túi -> LƯU hồ sơ -> kho; lỗi thì trả túi, túi đầy thì rơi đất tại chân), `sectVaultWithdraw` (túi còn chỗ -> trừ kho -> cộng túi -> lưu; túi vừa đầy / người chơi rời / gục / đang qua cổng thì trả kho), `sectVaultPolicy`; một người một thao tác kho đồ (`SectBook.vaultBusy`); `broadcastSect` / `sectOnJoin` gửi `sectVault` (mất tông môn: `vault: null`).
- Cờ kiếp mới: `sect-config.ts` (`SECT_NEWLIFE_LOCK_HOURS`, mặc định tắt; `docs/TRIEN_KHAI.md`), `World.sectNewLifeLockMs`, khoá cả `sectWithdraw` (Linh thạch).
- Tin nhắn đăng ký bằng `this.on(...)` trong `WorldRoom` (giới hạn tần suất sẵn có; `red-team` tấn công cả ba). Nhật ký kiểm toán: `sect.vault_deposit` / `sect.vault_withdraw` / `sect.vault_policy`.
- Test: `systems/sect-vault.test.ts` (27 ca, gồm đua rút, lỗi chen giữa chừng, bảo toàn đồ ngẫu nhiên có seed), `store-contract.ts` (file + PostgreSQL), `sect-store.test.ts`, `sect-config.test.ts`, `WorldRoom.sect.test.ts` (Colyseus thật).

### 11.10 Chia PR và phân công
| PR | Nội dung | Ai |
|---|---|---|
| K1 | `shared/`: hợp đồng mục 11.9 + hằng số + `canSect` mở rộng + test + đột biến (PR riêng, một dev khác review) | A |
| K2 | Server: `Sect.vault` + `sanitizeSect` / `assertWritableSect` + bộ kiểm chung `store-contract` (file + PostgreSQL) | A |
| K3 | Server: `SectService` góp / rút / chính sách + `systems/sect.ts` nối phòng + cờ kiếp mới + sổ; test đơn vị + tích hợp + **đột biến** (nhân đôi đồ, rút sai món, vượt hạn mức, thiếu quyền, kho đầy, đua rút, qua cổng, lưu lỗi) | A |
| K4 | Client: tab "Kho đồ" (lưới, góp / rút, sổ, chính sách), xác nhận rút số lớn, ảnh 5 cỡ, script Chrome thật, bàn phím + cảm ứng | B |

**K4 ĐÃ LÀM (B, #788):** `client/src/sect-vault.ts` (hàm thuần: làm sạch ảnh chụp, lý do Góp / Rút không bấm được bằng CHỮ, kế hoạch gửi + hộp xác nhận, sổ; 24 test) + tab "Kho đồ" trong `ui.ts` (HTML `#sect-tab-vault`, hai lưới ô dùng lại `.inv-slot`: kho 40 ô và túi). Hành vi: chọn ô CHỈ bằng bấm / chạm (`pointerdown`) hoặc bàn phím (focus, Enter = làm), rê chuột KHÔNG chọn (mục 24); bấm chuột chuyển focus theo ô được chọn để Enter luôn chạy đúng ô đang chọn; bộ chỉnh số lượng kẹp theo số có trong ô, `SECT_VAULT_QTY_MAX` và mỗi lượt tối đa của chức vụ (Đệ tử 10); **hộp xác nhận** (`askActConfirm` dùng chung) cho trang bị / đồ quý, số lượng >= 10, và Đệ tử có hạn mức ("Tốn 1 lượt rút (còn M / N hôm nay)."), kiểm lại ĐÚNG món + số lượng lúc xác nhận (kho / túi đổi giữa chừng thì huỷ + báo, không gửi theo lời hỏi cũ); rút gửi kèm `itemId` đang thấy (khoá kỳ vọng); **nút khoá ("Đang xử lý…") tới khi có ảnh chụp kho mới, một toast từ chối hoặc 5 giây** (máy chủ chỉ cho mỗi người một thao tác kho đồ cùng lúc); Tông chủ thấy form chỉnh hạn mức Đệ tử (0..10 lượt / ngày), Đệ tử không thấy; sổ kho đồ mới nhất đứng đầu; rời tông môn thì xoá ảnh chụp kho. Kiểm: `check-sect-vault.mjs` (Chrome thật, 5 khung nhìn, ảnh `docs/screenshots/kho-do-tong-mon/`; 10 đột biến đỏ trong Chrome + 8 ở unit test). Chỉ phía client: máy chủ K2 + K3 + #799 đã có, không đổi `shared/` hay giao thức.
| K5 | Test / mô phỏng ĐỒNG THỜI và sập: tổng đồ (túi mọi người + kho + đất) không bao giờ vượt tổng ban đầu qua hàng loạt kịch bản đua (như `sect-crash.test.ts` của Linh thạch) + danh sách `SECT_VAULT_DENY_ITEMS` | D (LGTM B / C) |
| K6 | Bot / soak đồng thời, `kiem-save` kiểm kho đồ | C |
- Thứ tự: K1 -> (K2, K3 máy chủ; K4 giao diện bằng dữ liệu giả; K5 viết khung test) song song -> ghép. Người dùng xếp ưu tiên SAU lỗi túi đồ (mục 24), di chuyển (25), chế độ nhắm (26) và song song nghề nhỏ (#514).

### 11.11 Câu hỏi mở (A đã chọn hướng an toàn, người dùng đổi được)
1. Luân hồi: cờ mặc định tắt (mục 11.7). Nếu người dùng muốn chặn: đặt `SECT_NEWLIFE_LOCK_HOURS` (vd 24); áp cho cả kho Linh thạch.
2. Hạn mức Đệ tử: 3 lượt / ngày, tối đa 10 món / lượt (con số do A đề xuất).
3. Trưởng lão rút TỰ DO (theo yêu cầu): rủi ro một Trưởng lão xấu rút sạch kho; giảm nhẹ bằng sổ kho + Tông chủ giáng chức được. Nếu muốn, thêm sau hạn mức riêng cho Trưởng lão.
4. 40 ô cố định, chưa mở rộng theo cấp tông môn (cấp tông môn chưa có).

## 12. Chiều sâu tông môn (M8, `QUYET_DINH_M3.md` mục 39)

> Bổ sung của Dev A, soạn TRƯỚC khi viết mã (B giao diện, C bot / thử tải, D nội dung / mô phỏng / fuzz kinh tế đọc mục này; kế hoạch và chia việc ở `docs/PHAN_CONG_M8.md`). **Mọi con số trong mục này là ĐỀ XUẤT của A**, D chốt lại bằng mô phỏng (mục 12.11). Chiến tranh tông môn NGOÀI phạm vi (người dùng: để sau).

### 12.1 Quyết định và nguồn ý tưởng
- Người dùng chốt năm thứ: **cống hiến**, **cửa hàng tông**, **cấp tông**, **buff tông**, **nhiệm vụ tông hằng ngày**. Cống hiến theo LINH HỒN (sống qua kiếp, như mọi thứ của thành viên).
- Nguồn ý tưởng (mục 19-20; thuật ngữ của Vạn Kiếp Tu Tiên, `site/assets/content-ClG6Ha-i.json`, `/content/meta/thuat_ngu.yaml`): **cống hiến** = "điểm làm việc cho tông, dùng để đổi đồ ở bảo khố, Tàng Kinh Các; tiêu thì mất"; **công tích** = "thành tích tích lũy, không mất khi tiêu cống hiến"; **bảo khố** = đổi đồ; **Tàng Kinh Các** = đổi công pháp. Chỉ lấy KHÁI NIỆM và tên gọi chung; không lấy tông phái / nhân vật của game đó. Tên cấp tông, mặt hàng, nhiệm vụ do D soạn (ghi `docs/NGUON_NOI_DUNG.md` mục 3 khi lấy nguyên văn).
- **Nguyên tắc xuyên suốt (như mục 4.4 / 11):** server quyết định; mọi thao tác thu / chi đọc - sửa - ghi trong `SectStore.update` (nguyên tử theo tông môn); khi có nhiều bước ngoài kho thì thứ tự là "nhánh lỗi chỉ BỚT, không bao giờ THÊM" (thà mất hơn nhân đôi).

### 12.2 Ba con số và cấp tông (dữ liệu bền vững)
Thêm vào bản ghi `Sect` (đều TÙY CHỌN khi đọc: bản ghi cũ thiếu thì `sanitizeSect` đặt 0; `v` giữ 1; PostgreSQL lưu `data jsonb` nên KHÔNG đổi lược đồ):
```
members[i].contrib  : số dư cống hiến có thể TIÊU (nguyên, 0..SECT_CONTRIB_CAP)
members[i].merit    : công tích = tổng cống hiến đã kiếm trong tông này, KHÔNG BAO GIỜ giảm (nguyên, >= contrib)
members[i].today    : { day: dayKey, earned, deposit, quests: string[], dungeon: boolean, buys: { [itemId]: n } }   // sổ trong NGÀY, đổi ngày thì đặt lại
Sect.points         : điểm tông = tổng cống hiến mọi thành viên từng kiếm (nguyên, chỉ TĂNG, kể cả khi thành viên đã rời)
```
- **Cấp tông KHÔNG lưu**: `sectLevelOf(points)` (hàm thuần ở `shared/`, bảng `SECT_LEVELS`) nên không thể lệch với điểm. Tiêu cống hiến KHÔNG làm tụt điểm tông hay cấp tông.
- Bất biến (`assertWritableSect` TỪ CHỐI khi ghi sai, không kẹp lặng lẽ; `sanitizeSect` kẹp khi ĐỌC; `kiem-save` báo): `0 <= contrib <= merit`; `points >= tổng merit các thành viên hiện có`; `today.earned <= SECT_EARN_DAY_CAP`; mọi số nguyên hữu hạn.
- **Rời tông / bị mời ra / giải tán: cống hiến và công tích CỦA NGƯỜI ĐÓ MẤT** (bản ghi thành viên biến mất; VKTT cũng "nộp lại cống hiến" khi xuống núi). Điểm tông của tông môn giữ nguyên (đã đóng góp cho tông). Client hỏi xác nhận kèm số cống hiến sẽ mất.

### 12.3 Kiếm cống hiến (trần theo NGÀY, chống lạm dụng)
Mọi nguồn đi qua MỘT hàm `SectService.award(soulKey, source, amount, key?)` trong `update`: cộng `contrib`, `merit`, `Sect.points` CÙNG MỘT lần ghi, kiểm trần, ghi `today`. Không có đường kiếm nào khác.
| Nguồn | Cống hiến | Trần / ngày / người |
|---|---|---|
| Nhiệm vụ tông (mục 12.7) | 20 / 30 / 40 theo độ khó, 3 nhiệm vụ / ngày | 90 (mỗi `questId` một lần / ngày) |
| Góp kho (Linh thạch hoặc đồ, mục 4.4 / 11.4) | 1 cống hiến mỗi `SECT_DEPOSIT_VALUE_PER_CH` = 100 Linh thạch giá trị (đồ tính theo `ITEM_VALUE x qty`; phần lẻ dồn lại không có, làm tròn xuống) | 30 (`today.deposit`) |
| Bí cảnh hoàn thành khi trong đội có từ 2 thành viên CÙNG tông (hook ở `payReward`, `systems/dungeon.ts`) | 20 cho MỖI thành viên cùng tông trong đội | 1 lần / ngày (`today.dungeon`) |
| **Tổng** | | `SECT_EARN_DAY_CAP` = 140 |
- **Vòng góp - rút (Tông chủ / Trưởng lão rút tự do): chỉ kiếm được tối đa trần góp (30) mỗi ngày dù lặp bao nhiêu lần** (hai người góp - rút chéo cũng bị chặn bởi trần của TỪNG người). Không dựa vào "số ròng": đơn giản và kiểm được.
- **Chống nhảy tông / lập tông hằng ngày để lấy trần lại: chỉ thành viên ĐÃ VÀO tông từ trước ngày hôm nay (`dayKey(joinedAt) < dayKey(now)`) mới kiếm được cống hiến** (`sectCanEarn`, hàm thuần). Tính chất: một linh hồn kiếm tối đa MỘT trần mỗi ngày trên mọi tông môn gộp lại (rời tông thì mất cả cống hiến, vào tông khác lại phải chờ sang ngày). Người mới vào / Tông chủ mới lập thấy dòng "ngày mai mới kiếm được cống hiến". Góp kho vẫn góp được, chỉ không tính cống hiến.
- Thao tác thu - chi cống hiến khi **đã chết / ở Hoàng Tuyền / hồn lìa xác** bị từ chối (cùng `isDown` của #834): không nhận nhiệm vụ, không trả, không mua, không góp-tính-cống-hiến lúc đã chết (chết do mạng được tha thì như đang sống).

### 12.4 Cấp tông (`SECT_LEVELS`, bảng thuần ở `shared/`)
| Cấp | Điểm tông cần | Thành viên tối đa | Trưởng lão tối đa | Ô kho đồ | Mở ở cửa hàng |
|:-:|--:|:-:|:-:|:-:|---|
| 1 | 0 | 30 | 3 | 40 | nhóm 1 |
| 2 | 1.000 | 35 | 4 | 50 | nhóm 2 |
| 3 | 4.000 | 40 | 5 | 60 | nhóm 3 |
| 4 | 12.000 | 45 | 6 | 70 | nhóm 4 |
| 5 | 30.000 | 50 | 7 | 80 | nhóm 5 |
- Cấp 1 GIỮ đúng giới hạn hiện có (30 thành viên, 3 Trưởng lão, 40 ô) nên **không tông môn nào đang chạy bị vượt giới hạn hay mất ô**. Tông 3 người tích cực: kiếm TỐI ĐA 140 / người / ngày thì lên cấp 2 sau ~3 ngày, cấp 3 ~10 ngày, cấp 4 ~4 tuần, cấp 5 ~10 tuần; chỉ làm 3 nhiệm vụ (90 / ngày) thì ~4 ngày, ~15 ngày, ~6 tuần, ~16 tuần (tông 2 người: gấp rưỡi): lên cấp là chuyện của tuần, không phải của giờ, và cấp 5 là mục tiêu dài hạn. Quy mô thật hiện nay là 1 tông / 2 thành viên (`SELECT` trên bản chạy thật 16/11/2026) nên bảng phải với tới được bằng ít người.
- **Kho mở rộng:** mảng `Sect.vault.slots` dài `SECT_VAULT_SLOTS_MAX` = 80 (bản ghi cũ 40 ô được ĐỆM thêm ô trống khi đọc, không đổi thứ tự); chỉ `slotsOf(level)` ô đầu dùng được, ô sau bị khoá (client vẽ mờ, server từ chối góp vào ô khoá `vault_locked_slot`). Tên hằng `SECT_VAULT_SLOTS` giữ nghĩa "ô ở cấp 1" để không vỡ mã đang dùng; thêm `SECT_VAULT_SLOTS_MAX`.
- Lên cấp: ghi trong cùng lần `update` cộng điểm (so `levelOf` trước / sau), phát `sectHall` + toast "Tông môn lên cấp N" cho thành viên trực tuyến, cập nhật buff (mục 12.5), audit `sect.level_up`. Chưa có xuống cấp.

### 12.5 Buff tông môn (chỉ cho người đang TRỰC TUYẾN, nhẹ)
| Cấp | Tu vi | Cơ hội rơi đồ | Hồi khí huyết / linh lực (ngoài đả tọa) |
|:-:|:-:|:-:|:-:|
| 1 | – | – | – |
| 2 | +2% | – | – |
| 3 | +3% | +3% | – |
| 4 | +4% | +5% | +10% |
| 5 | +5% | +5% | +15% |
- Cài vào `PlayerCtrl.sectBuff` ({exp, drop, regen} dạng hệ số 1,0x) lúc vào phòng, khi tông môn lên cấp, khi rời / bị mời ra / giải tán (xoá). KHÔNG thêm trường vào `schema.ts` (client chỉ cần ảnh chụp `sectHall` để hiện), nên byte / tick bench giữ 0,0%; số liệu sống ở `PlayerCtrl` và chỉ đọc khi cần, không việc mỗi tick mới.
- Điểm gắn (đúng MỘT chỗ mỗi loại, có test đột biến): **tu vi** = `gainExp` nhân `sectBuff.exp` SAU `scale` và TRƯỚC `testExpMult` (thứ tự: `scale`, buff tông, hệ số thử nghiệm); **rơi đồ** = `rollDrops(kind, rng, chanceMult = 1)` (`shared/src/items.ts`, mặc định 1 nên mọi chỗ gọi cũ và bench không đổi): `chance x chanceMult` kẹp 1, dùng buff của CHỦ ĐỒ (`lootOwner`); **hồi phục** = `regen` trong `systems/progression.ts` nhân tỉ lệ ngoài đả tọa.
- Buff cộng GỘP trong từng loại (không nhân chồng giữa nhiều nguồn); trần cứng `SECT_BUFF_EXP_MAX` 1,10 / `SECT_BUFF_DROP_MAX` 1,10 / `SECT_BUFF_REGEN_MAX` 1,30 để một lỗi bảng không làm buff vô hạn. Ngân sách cân bằng: tu vi +5% là trần cho cả 5 cấp (D kiểm bằng mô phỏng `can-bang` rằng nhịp lên bậc không đổi quá 5%).

### 12.6 Cửa hàng tông môn (Bảo khố: đồ; Tàng Kinh Các: kinh quyển công pháp)
- **Tiền tệ riêng:** chỉ tiêu `contrib` (không tiêu `merit`, không tiêu Linh thạch). Bảng `SECT_SHOP: { itemId, cost, minLevel, limitDay }[]` ở `shared/` (D soạn dữ liệu, mục 12.11); mua bằng tin `sectShopBuy { itemId, qty }`.
- **Neo giá:** `SECT_CH_VALUE_LT` = 5: một cống hiến "đáng" 5 Linh thạch giá mua NPC; góp kho đổi cống hiến theo 100 Linh thạch / 1 cống hiến (mục 12.3), nên đường Linh thạch -> cống hiến -> hàng lỗ ~95%: cửa hàng KHÔNG phải chỗ đổi tiền. Bất biến test: `cost x SECT_CH_VALUE_LT >= giá mua NPC của món` hoặc món không bán ở NPC nào; trần giá trị mua được mỗi ngày = `SECT_EARN_DAY_CAP x SECT_CH_VALUE_LT` = 700 Linh thạch-tương-đương, D kiểm so với thu nhập `CAN_BANG.md` (Luyện Khí ~1.300 Linh thạch / giờ săn, Kim Đan 5.000-15.000): không vượt ~1 giờ săn của bậc thấp nhất món dùng được.
- **Gợi ý nhóm hàng** (D chốt): nhóm 1 đan hồi phục + nguyên liệu cơ bản; nhóm 2 kinh quyển phổ thông (`rarity` 0-1); nhóm 3 đan tu luyện trung cấp; nhóm 4 kinh quyển `rarity` 2; nhóm 5 đồ hiếm + kinh quyển `rarity` 3. Mọi món có **hạn mức THEO NGÀY** mỗi người (`limitDay`, đếm trong `members[i].today.buys`; kinh quyển / đồ hiếm thường 1 / ngày). Không có hạn mức "trọn đời": rời tông là mất cống hiến nên không còn gì để mua lại, và chờ sang ngày + trần kiếm đã chặn việc gom. Kinh quyển mà người mua ĐÃ HỌC rồi thì server từ chối (`shop_known`, kiểm theo chiêu đã học), tránh phí cống hiến.
- **Luồng mua** (mua trọn vẹn hoặc không gì cả, giống `shop.ts`): kiểm sớm (còn sống, không qua cổng, một thao tác tông môn một lúc: dùng `SectBook.busy` chung với kho đồ, đủ cống hiến, đủ cấp, còn hạn mức ngày, túi còn chỗ bằng thử trên BẢN SAO) -> `update` trừ `contrib` + tăng `today.buys` -> cộng vào túi (`addToInventory`) -> LƯU hồ sơ ngay (`World.onSaveNow`). Túi vừa đầy ở giữa / lưu lỗi: hoàn cống hiến bằng một `update` nữa (không hoàn thì chỉ MẤT cống hiến, không bao giờ có hàng mà vẫn còn cống hiến). Sập giữa trừ và lưu: mất cống hiến, không nhân đôi.

### 12.7 Nhiệm vụ tông môn hằng ngày
- **3 nhiệm vụ mỗi ngày mỗi tông môn**, chọn tất định từ bảng `SECT_QUESTS` bằng `hash(sectId, dayKey)` (mọi thành viên cùng tông thấy cùng 3 "ô"; ô nào cũng có bản theo BẬC của người nhận: Luyện Khí / Trúc Cơ / Kim Đan / Nguyên Anh, nên người ở bậc nào cũng có việc vừa sức). Loại bước dùng lại `QuestStep` (`kill` / `collect` / `reachRealm` / `talk`) và dùng lại bộ máy tiến độ của `systems/quests.ts` (`bump`, `stepSatisfied`): thêm các `QuestDef` của tông vào `QUEST_BY_ID` (cờ `sect: true`, KHÔNG có NPC giao; `acceptQuest` / `turnInQuest` hiện có bỏ qua chúng) để `sanitizeQuests`, tiến độ, sổ nhiệm vụ, `onMonsterKilled` chạy sẵn.
- **Nhận / trả qua bảng Tông môn** (không cần đứng gần NPC): tin `sectQuestAccept { questId }` / `sectQuestTurnIn { questId }`. Server kiểm: là thành viên, `questId` thuộc 3 ô hôm nay ĐÚNG bậc của mình, chưa trả hôm nay (`members[i].today.quests`, theo LINH HỒN nên đầu thai giữa ngày không làm lại được), đang sống. Trả: kiểm túi trên bản sao -> `award` (đánh dấu + cộng cống hiến trong `update`) -> trừ / thêm đồ + tu vi (qua `gainExp`, nên có buff tông) -> toast. Thứ tự đảm bảo chỉ MẤT (sập giữa chừng mất phần thưởng đồ / tu vi), không bao giờ nhận hai lần.
- Thưởng ngoài cống hiến nhỏ (tu vi ~ một nhiệm vụ hằng ngày thường, thỉnh thoảng một đan); độ khó 20 / 30 / 40 cống hiến tương ứng 1 / 2 / 3 mức (hạ quái cùng bậc, nộp nguyên liệu, hạ tinh anh / cùng đội). D soạn >= 12 mẫu x 4 bậc.
- Tông môn không đủ người thì vẫn có 3 nhiệm vụ (không cần đội); nhiệm vụ "cùng đội" chỉ là một loại trong bảng, không bắt buộc.

### 12.8 Luân hồi, chết, rời tông (tóm tắt các va chạm)
- Chết thật + đầu thai: cống hiến / công tích GIỮ (theo linh hồn); sổ trong ngày (`today`) giữ nên không làm lại nhiệm vụ trong ngày; buff theo tông môn (vẫn trong tông) nên đầu thai xong còn buff.
- Cờ `SECT_NEWLIFE_LOCK_HOURS` (mục 11.7) KHÔNG áp cho cửa hàng (cống hiến không phải đồ của kiếp trước; mất ở chỗ khác: giới hạn ngày).
- Mời ra / rời / giải tán: mất cống hiến (mục 12.2), không hoàn lại. Giải tán vẫn chỉ khi kho Linh thạch và kho đồ rỗng (như cũ); điểm tông mất theo tông môn.
- Tông chủ chuyển quyền: cống hiến không đi theo chức vụ.

### 12.9 Hợp đồng `shared/` (PR M8.1, chỉ sửa `shared/`, B và C review; chi tiết cuối cùng theo mã)
- Hằng số: `SECT_CONTRIB_CAP`, `SECT_POINTS_CAP`, `SECT_EARN_DAY_CAP`, `SECT_DEPOSIT_VALUE_PER_CH`, `SECT_DEPOSIT_DAY_CAP`, `SECT_CH_VALUE_LT`, `SECT_VAULT_SLOTS_MAX`, `SECT_BUFF_*_MAX`; bảng `SECT_LEVELS`; hàm thuần `sectLevelOf(points)`, `sectLevelInfo(level)`, `sectBuffOf(level)`, `sectCanEarn(joinedAt, now)`, `sectDepositValue(...)`, `sectQuestSlots(sectId, day)`, `sectDayState(member, now)` (đặt lại sổ khi sang ngày).
- Bảng dữ liệu (D điền): `SECT_QUESTS` (`QuestDef` + `{ sect: true, tier, cong_hien }`), `SECT_SHOP`. PR M8.1 chỉ có KHUNG + vài mục mẫu cho test; dữ liệu thật ở PR của D.
- Tin nhắn (THÊM, không đổi cái cũ nên `PROTOCOL_VERSION` KHÔNG tăng; client cũ bỏ qua tin lạ): client -> server `sectQuestAccept`, `sectQuestTurnIn`, `sectShopBuy`; server -> client `sectHall { hall: SectHallView | null }` = { cấp, điểm, ngưỡng cấp kế, buff, giới hạn theo cấp, `me` { `contrib`, `merit`, `earnedToday`, `earnFrom` (ngày được kiếm), `depositLeft` }, 3 nhiệm vụ hôm nay + trạng thái, cửa hàng (món, giá, khoá theo cấp, số lượt còn) }; gửi lúc vào phòng và khi ĐỔI (kiếm / tiêu / lên cấp), cho NGƯỜI ĐỔI, riêng thay đổi cấp / điểm gửi cả tông môn. `SectView.members[i]` thêm `merit` (công tích) để hiện thứ hạng đóng góp. Mã từ chối mới (`SECT_FAILS` + `sectFailMessage`): `not_warm`, `earn_cap`, `no_contrib`, `shop_locked`, `shop_limit`, `shop_known`, `quest_unavailable`, `quest_done`, `quest_active`, `down`, `vault_locked_slot`.
- Nhật ký kiểm toán (AGENTS.md: thêm sự kiện nhạy cảm thì ghi ở đây + test): `sect.earn` { tên, nguồn, số }, `sect.shop_buy` { tên, món, số, giá }, `sect.level_up` { sectId, cấp }, `sect.quest_turnin`. Không đưa bí mật vào trường.

### 12.10 Hiệu năng, lưu trữ
- Không việc mỗi tick: tin `sectHall` chỉ khi đổi, mỗi người vài lần / ngày; buff đọc từ `PlayerCtrl`. Bản ghi `Sect` nhỉnh thêm: ~1 KB (30 thành viên x `today`), vẫn trong một lần ghi. `perf.test.ts` giữ ngưỡng; bench byte / tick phải 0,0% so mốc.
- Đồng thời: mọi thu / chi qua `SectStore.update` (hàng đợi theo `sectId`); một người một thao tác tông môn tại một thời điểm (`SectBook.busy`, đổi tên từ `vaultBusy` ở PR M8.2).
- `kiem-save` (C) kiểm thêm bất biến mục 12.2; `chuyen-du-lieu` không đổi (bản ghi cùng `data jsonb`).

### 12.11 Kiểm thử bắt buộc và mô phỏng (D + A; "chống sinh tiền / nhân đôi")
1. **Bảo toàn / giới hạn cống hiến:** hàng loạt kịch bản ngẫu nhiên có seed (góp - rút chéo giữa người, nhảy tông, rời - vào lại, đầu thai giữa ngày, trả nhiệm vụ hai lần, gửi dồn tin, lưu lỗi, sập giữa chừng): với MỌI linh hồn và MỌI ngày, tổng cống hiến kiếm trên mọi tông môn `<= SECT_EARN_DAY_CAP`; `contrib` không bao giờ âm hay vượt `merit`; tổng `points` của tông môn đúng bằng tổng đã `award`; đồ mua không nhân đôi (tổng cống hiến + đồ trên đĩa không tăng qua sập).
2. **Đột biến** cho từng bất biến (bỏ trần ngày, bỏ chờ sang ngày, bỏ kiểm `isDown`, cộng `contrib` mà không cộng `merit`, tiêu `merit`, buff nhân hai lần, đổi thứ tự `gainExp`...): test phải ĐỎ đúng chỗ.
3. **Mô phỏng cân bằng (`npm run can-bang -w server`, D mở rộng):** (a) tốc độ lên cấp theo số thành viên tích cực (1 / 2 / 3 / 5 / 10 người) so bảng mục 12.4; (b) giá trị hàng mua được mỗi ngày so thu nhập từng bậc (mục 12.6); (c) tác động buff lên nhịp lên bậc (<= 5%) và lượng rơi đồ (<= +5%); (d) không có vòng Linh thạch -> cống hiến -> hàng -> bán lại có lời. Số ra ghi `docs/CAN_BANG.md` mục tông môn.
4. **Tích hợp (Colyseus thật, `WorldRoom.sect.test.ts`):** một vòng đời đầy đủ: lập tông -> mời -> sang ngày -> nhiệm vụ -> cống hiến -> lên cấp -> buff thấy trong `gainExp` -> mua hàng -> rời (mất cống hiến).

### 12.12 Chia PR (chi tiết, thứ tự, người làm: `docs/PHAN_CONG_M8.md`)
M8.1 hợp đồng `shared/` (A) -> M8.2 lưu trữ + dịch vụ cống hiến / điểm / cấp (A) -> M8.3 nguồn kiếm + buff (A) -> M8.4 nhiệm vụ tông (A, dùng nội dung D) -> M8.5 cửa hàng tông (A, dùng nội dung D); song song: M8.6 giao diện (B), M8.7 nội dung + mô phỏng (D), M8.8 fuzz kinh tế (D), M8.9 bot / kiểm save / thử tải (C); M8.10 nghiệm thu + hỏi người dùng phát hành.

### 12.13 Câu hỏi mở (A đã chọn hướng an toàn; người dùng đổi được, KHÔNG chặn)
1. Rời tông MẤT cống hiến + công tích (mặc định; chống nhảy tông). Nếu người dùng muốn giữ một phần: đề xuất hoàn 0%.
2. Tông mới vào / mới lập phải chờ sang ngày mới kiếm cống hiến (mặc định; chống nhảy tông). Nới: cho Tông chủ vừa lập kiếm ngay (mở cửa cho "lập tông mỗi ngày", chi phí 1.000 Linh thạch mỗi lần).
3. Trần 140 cống hiến / ngày và neo giá 1 cống hiến = 5 Linh thạch: số khởi đầu, D chỉnh bằng mô phỏng.
4. Buff tối đa +5% tu vi / +5% rơi đồ / +15% hồi: số khởi đầu.
5. Kinh quyển `rarity` cao ở cửa hàng cấp 4-5: có hay không (mặc định có, mỗi ngày một quyển / người).
6. Bảng xếp hạng tông môn (điểm tông / cấp) và đối kháng / chiến tranh: KHÔNG làm trong M8 (chiến tranh người dùng đã để sau; bảng xếp hạng hỏi khi M8 xong).
7. Tông chủ bỏ chơi vô thời hạn: giữ nguyên mục 10.1 (chưa chuyển quyền tự động).
