# Thiết kế khung trùm nhiều chiêu (QUYET_DINH_M3 mục 42)

> Bản thiết kế của Dev A, soạn TRƯỚC khi viết mã (B client, D / E dữ liệu và mô phỏng, F test, C bot đọc tài liệu này). Quyết định của người dùng (mục 42, 17/11/2026): trùm có **nhiều chiêu + giai đoạn theo % khí huyết** để tăng độ khó; **công bằng vì chết = mất kiếp**. Mọi con số là ĐỀ XUẤT của A; D / E chốt bằng mô phỏng (mục 9). Hỏi người dùng khi phát hành.

## 1. Hiện trạng (đã đọc mã, `main` sau v0.3.1)
- Trùm là `MonsterKind` có `boss: true`: **Xích Mãng** (`mang`, Trúc Cơ, 4.000 máu), **Hắc Giao** (`hac_giao`, Kim Đan, 50.000, 8 con trên Âm Sương, mục 32), **Thiên Hàn Vương** (`thien_han_vuong`, Nguyên Anh, 82.000), **Linh Hư Yêu Vương** (`yeu_vuong`, bí cảnh, 100.000). Ba con đầu chỉ ĐÁNH THƯỜNG (cận chiến); Thiên Hàn Vương có `behavior: "charger"` + `slam`.
- Đã có hạ tầng dùng lại được: **báo trước** `fx` `warn` (hình `circle` / `cone` / `line`, `ms`) gửi bằng `sendNear`; `slam.ts` (gồng -> đáp đòn tính theo VỊ TRÍ lúc đáp, choáng ngắt cú gồng), `charge.ts` (lao thẳng), `bolt.ts` (đạn `fx` `bolt`, không là state), trạng thái người chơi M7 (`applyPlayerStatus`: độc, bỏng, tê cóng, choáng), `placeMonster` (sinh quái con), `hurtPlayer` (MỘT nơi giữ luật: người chết / hồn lìa xác / hộ thể / thách đấu / khu an toàn bị bỏ qua).
- **Chưa có:** nhiều chiêu cho một con, giai đoạn, triệu hồi, cuồng nộ, vành khuyên / mưa / kéo vào, tên chiêu đang vận trên giao diện.

## 2. Nguyên tắc (không thương lượng)
1. **Server quyết định mọi kết quả** (chọn chiêu, thời điểm, trúng hay không). Client chỉ vẽ `warn` đúng lúc.
2. **Công bằng (mục 42.1):** mọi đòn GÂY SÁT THƯƠNG có **báo trước >= `BOSS_MIN_TELEGRAPH_MS` = 800 ms** hiện đúng vùng trên đất (màu theo hệ, kèm âm) và né được bằng di chuyển; **không có đòn chưa báo mà trúng**; đòn tính theo vị trí LÚC ĐÁP (như `slam`); trúng chỉ khi tâm người chơi cách vùng <= `PLAYER_RADIUS` - `BOSS_HIT_GRACE_PX` (8 px, nghiêng về phía người chơi vì độ trễ vẽ ~100 ms).
3. **Không đòn chết ngay:** mỗi trúng <= ~55% khí huyết tối đa của người ĐÚNG bậc khuyến nghị (D kiểm bằng mô phỏng); hai đòn liên tiếp cách >= 1,4 giây kể cả báo trước (uống đan / hồi kịp).
4. **Tôn trọng bảo vệ mất kết nối (mục 33):** hồn lìa xác / hộ thể / Hoàng Tuyền / đã chết / thách đấu / khu an toàn KHÔNG bị nhắm và KHÔNG bị trúng (dùng chung bộ lọc mục tiêu của `monsters.ts` và `hurtPlayer`).
5. **Không phá cân bằng 8 Hắc Giao (mục 32):** chiêu Hắc Giao gọn, chi phí CPU / băng thông trên mỗi con thấp; ngân sách tick < 10 ms, byte / tick mỗi client < 520 giữ nguyên (bench trước / sau).
6. **Dữ liệu, không viết mã riêng từng con:** bộ chiêu nằm trong `shared/` (bảng `BOSSES`), một bộ thực thi chung ở `server/src/systems/boss.ts`.

## 3. Mô hình dữ liệu (`shared/src/bosses.ts`, PR T1)
```
BossDef { kind: string (id MonsterKind), abilities: BossAbility[], phases: BossPhase[], enrage?: BossEnrage, maxAdds: number }
BossPhase { id, fromHp: 1..0 (phân số khí huyết TRÊN, giai đoạn đầu = 1), speedMult, atkMult, cdMult, castGapMs (>= 600),
            abilities: string[] (id chiêu mở ở giai đoạn này), onEnter?: BossAction[] (tiếng gầm, triệu hồi, giáp) }
BossAbility { id, name, shape, telegraphMs (>= 800), recoverMs, cooldownMs, weight, dmgMult, element?, status?, cond: { minDist?, maxDist?, minTargets?, maxTargets?, hpBelow? } }
shape: circleAt { at: "target" | "farthest" | "self", r } | ring { r0, r } | cone { r, arc } | line { len, w } | charge { len, w } | rain { r, count, spreadPx, gapMs }
       | pull { r, pullPx, blastR } | pool { r, ttlMs, tickMs } | summon { kind, count } | buff { dmgTakenMult, ms } | blink { landR }
BossEnrage { afterMs, atkMult, speedMult, cdMult }     // chỉ trùm bí cảnh
```
- `bossPhaseOf(def, hp / maxHp)`: **hàm thuần** (client và server dùng chung): giai đoạn là hàm của khí huyết, chỉ tăng; client suy ra mốc giai đoạn trên thanh máu từ `phases[].fromHp` nên **không thêm trường vào `schema.ts`** (byte / tick giữ 0,0%).
- `bossViolations(BOSSES)` (kiểm dữ liệu cho D / E): kind có thật và `boss: true`; mọi chiêu có sát thương có `telegraphMs >= 800`; `castGapMs >= 600`; giai đoạn giảm dần; id chiêu có thật; `weight > 0`; `cooldownMs >= telegraphMs + recoverMs`; `summon.kind` có thật; tổng `count` triệu hồi <= `maxAdds`.

## 4. Bộ thực thi (`systems/boss.ts`, PR T2)
- `bossStep(w, id, m, mc, target, d, stunned)` gọi trong `monsters.ts` TRƯỚC `slam` / `charger` khi có `BOSS_BY_KIND[def.id]` (trả `true` nếu trùm đang vận chiêu / hồi chiêu: không di chuyển, không đánh thường). Trạng thái ở `MonsterCtrl.boss` (chỉ trùm có): giai đoạn, chiêu đang vận (`ability`, `startAt`, `hitAt`, điểm khoá), `cds`, `nextCastAt`, `adds`, đồng hồ cuồng nộ, bộ đếm miễn khống chế.
- **Chọn chiêu:** khi `now >= nextCastAt` và không đang vận: lọc theo giai đoạn + `cond` + hồi chiêu rồi chọn theo `weight` bằng **bộ ngẫu nhiên có seed riêng của con trùm** (`mc.boss.rng`, KHÔNG `Math.random`: giữ nguyên chuỗi bench có seed, test lặp lại được). Không chiêu nào hợp lệ thì đánh thường như cũ.
- **Vận chiêu:** (1) khoá điểm / hướng, gửi `fx` `warn` (một lần mỗi vòng, `sendNear`) + `fx` `bossCast { by, ability, ms }`; (2) đứng yên tới `hitAt = startAt + telegraphMs` (mưa: mỗi vòng có `warn` riêng, mỗi vòng >= 800 ms từ lúc hiện); (3) ĐÁP: gom người trong vùng (vị trí lúc đáp, bộ lọc mục tiêu mục 2.4) rồi `hurtPlayer` (+ trạng thái); (4) `recoverMs` thở rồi `nextCastAt = now + castGapMs x cdMult`.
- **Một chiêu một lúc** (trừ `rain`, nơi từng vòng tự báo trước): không bao giờ hai đòn nặng chồng báo trước. Lần vận đầu sau khi gây hấn >= 1,2 giây.
- **Khống chế:** trùm đã MIỄN choáng sẵn (`status.ts`: `stunImmune: !!mc.def.boss`) nên không có cú gồng nào bị ngắt bằng choáng; tê cóng (làm chậm) vẫn áp được nhưng KHÔNG làm chậm việc vận chiêu (chỉ làm chậm di chuyển, `speedMult`).
- **Giai đoạn:** hết khí huyết tới ngưỡng thì chuyển MỘT lần: ngắt chiêu đang gồng (không đáp), gầm 1,5 giây KHÔNG sát thương (`fx` `bossPhase`), chạy `onEnter` (triệu hồi tối đa `maxAdds` quái con không rơi đồ / tu vi để khỏi cày, tự biến mất khi trùm chết hoặc reset; giáp: `dmgTakenMult`, hiện qua `fx`).
- **Giáp và triệu hồi báo cho client (T4, #930 + PR máy chủ):** chiêu `buff` và `onEnter` `buff` gửi `fx` `bossArmor { by, x, y, ms, mult }` MỘT lần lúc dựng (client tự đếm `ms`; dựng lại thì fx mới thay fx cũ); chiêu / `onEnter` `summon` gửi `fx` `bossSummon { by, x, y, n }` MỘT lần mỗi lần gọi với `n` = số con THẬT SỰ xuất hiện (không gửi khi đã đủ `maxAdds` hay không còn chỗ dựng). Khi vào giai đoạn, `bossPhase` đi TRƯỚC `bossArmor` / `bossSummon` của `onEnter`. Cộng thêm nên không tăng `PROTOCOL_VERSION`.
- **Cuồng nộ (bí cảnh):** sau `enrage.afterMs` (đếm khi có người trong vùng, dừng khi không): nhân `atkMult` / `speedMult` / `cdMult` và gửi `fx` `bossEnrage`. **KHÔNG rút ngắn báo trước dưới 800 ms** (cuồng nộ làm đòn dày và nặng hơn, không làm đòn không kịp né).
- **Reset:** kéo quá xa nhà (`LEASH_DIST`) hoặc không còn mục tiêu: về nhà, hồi đầy khí huyết, giai đoạn 0, xoá hồi chiêu, đồng hồ cuồng nộ và quái con (không để trùm hồi dở dang giữ giai đoạn cao).
- **Hiệu năng:** trùm ít (<= vài con mỗi phòng); `warn` chỉ gửi lúc bắt đầu vận (không mỗi tick); không cấp phát trong vòng nóng; đo `bench` trước / sau (ca 8 Hắc Giao cùng bản đồ).

## 5. Giao thức và client (B, PR T4)
- Dùng lại `fx` `warn` cho MỌI báo trước nên **client / APK cũ vẫn thấy vùng cảnh báo** (hình vành khuyên được thêm trường tuỳ chọn `r0`: client cũ vẽ cả hình tròn đặc = thận trọng hơn, không nguy hiểm). THÊM ba `fx`: `bossCast { by, ability, ms }` (tên chiêu cho thanh máu), `bossPhase { by, phase }`, `bossEnrage { by }`; client cũ bỏ qua `fx` lạ (T1 kiểm bằng test). `PROTOCOL_VERSION` KHÔNG tăng nếu test xác nhận; tăng ở PR T1 nếu cần.
- Việc của B: vẽ vùng cảnh báo rõ trên điện thoại + máy tính (viền + nền mờ + vòng thời gian co lại, màu theo hệ, âm báo), hoạt ảnh vận chiêu, **thanh máu trùm có mốc giai đoạn + tên chiêu đang vận + chỉ báo cuồng nộ**, hình triệu hồi; đúng ngân sách M5 / mục 21 (Android tầm trung >= 50 FPS); tôn trọng thời điểm máy chủ (`ms` tính từ lúc nhận, bù độ trễ bằng `now` đồng bộ nếu có).
- **KHÔNG làm ở bản đầu:** tường băng CHẶN đường (cần va chạm động trong `shared/` và dự đoán client): thay bằng "vùng băng làm chậm" (tê cóng). Kéo người vào (`pull`) giới hạn `pullPx` và dùng `moveWithCollision` (không kéo vào tường); client hấp thụ bằng đối chiếu mượt của mục 41.

## 6. Bộ chiêu gợi ý (tên và số do D / E chốt; ý tưởng theo mục 42.2, có thể lấy từ Vạn Kiếp Tu Tiên, mục 19-20)
| Trùm | Chiêu (báo trước / hồi) | Giai đoạn |
|---|---|---|
| **Xích Mãng** (Trúc Cơ) | quất đuôi hình nón (0,9 s / 7 s); phun độc tạo vũng độc 5 s (1,0 s / 10 s); cuộn mình lao tới (0,9 s / 9 s, dùng lại `charge`) | < 50%: gọi 2 rắn con (tối đa 2), nhanh hơn 15% |
| **Hắc Giao** (Kim Đan, x8: giữ gọn) | sóng nước theo đường thẳng (0,9 s / 8 s); vực xoáy kéo vào giữa rồi nổ (1,1 s / 14 s); vảy giáp giảm sát thương nhận 40% trong 4 s, thấy được (không sát thương / 20 s) | < 40%: cuồng nộ nhẹ (hồi chiêu x0,7, +20% sát thương) |
| **Thiên Hàn Vương** (Nguyên Anh) | giữ lao tới + đập đất; **mưa băng** (5 vòng cảnh báo rơi lần lượt, mỗi vòng 0,9 s); vùng băng làm chậm | < 50%: hàn khí quanh thân gây tê cóng; < 25%: gọi 2 Hàn Lang |
| **Linh Hư Yêu Vương** (bí cảnh, đội) | 3 giai đoạn (100-70-35); dịch chuyển chớp (báo trước ở điểm đáp); vòng nổ quanh thân buộc tản ra (vành khuyên); đòn nhắm người XA nhất; phân thân nổ sau 3 s trừ khi bị hạ | cuồng nộ sau 5 phút; chiêu P3 dày hơn |

## 7. Chia việc (issue nhãn `boss`, milestone "Trùm: bộ chiêu (mục 42)"; thứ tự T1 -> T2, T3 / T4 / T5 / T6 / T7 song song)
| # | Việc | Ai |
|---|---|---|
| T1 | Hợp đồng `shared/bosses.ts`: kiểu, `BOSS_MIN_TELEGRAPH_MS`, `bossPhaseOf`, `bossViolations`, khung 1-2 trùm mẫu, `fx` mới; PR RIÊNG, B + C review | A |
| T2 | Bộ thực thi `systems/boss.ts` + nối `monsters.ts` + triệu hồi + cuồng nộ + reset; test + đột biến; bench | A |
| T3 | Dữ liệu bộ chiêu 4 trùm (số, tên, lời mô tả; quái con cho triệu hồi), ghi nguồn VKTT | E (cùng D) |
| T4 | Client: vùng cảnh báo (vành khuyên, nón, đường, tròn, mưa), hoạt ảnh vận chiêu, thanh máu trùm có mốc giai đoạn + tên chiêu + cuồng nộ | B |
| T5 | Mô phỏng cân bằng: thời gian hạ trùm, sát thương mỗi đòn / máu tối đa, tỉ lệ chết đi một mình vs đội; mục trùm trong `CAN_BANG.md` | D |
| T6 | Test: máy trạng thái giai đoạn, báo trước đúng thời gian, KHÔNG đòn chưa báo, một chiêu một lúc, reset, triệu hồi có trần; fuzz | F |
| T7 | Bot NÉ vùng cảnh báo (đọc `warn`, bước ra khỏi vùng) trên máy chủ Colyseus thật: đo tỉ lệ chết, thời gian hạ trùm | C (hoặc F) |
| T8 | Nghiệm thu: ảnh, E2E, `kiem-save`, hỏi người dùng phát hành | A |

## 8. Câu hỏi mở (A đã chọn hướng an toàn; người dùng đổi được)
1. Báo trước tối thiểu 800 ms cho MỌI đòn (kể cả cuồng nộ). 2. Mỗi trúng <= ~55% khí huyết tối đa của người đúng bậc. 3. Không có tường chặn đường ở bản đầu. 4. Quái con của trùm không rơi đồ / tu vi. 5. Hắc Giao giữ 3 chiêu để 8 con không nặng.

## 9. Kiểm thử và cân bằng bắt buộc
- **Bất biến công bằng (F + A, đột biến):** không bao giờ có sát thương lên người chơi trước `hitAt`; mọi sát thương trùm tới SAU một `warn` của chính nó cùng vùng với `ms` >= 800 (`bossViolations` kiểm DỮ LIỆU, bộ thực thi kiểm LÚC CHẠY); không hai chiêu nặng chồng; người hồn lìa xác / hộ thể / chết không trúng; reset đúng; số quái con <= `maxAdds`; chọn chiêu tất định theo seed.
- **Né kịp (kiểm TĨNH trên dữ liệu, `bossEscapePx` / `bossEscapeMs` trong `shared/src/bosses.ts`, chạy trong `bossViolations`; PR #919):** người đứng yên ở chỗ XẤU NHẤT trong vùng phải ra kịp trước khi đáp đòn: `BOSS_REACT_MS` (300 ms, phản xạ + trễ vẽ / mạng) + quãng thoát / `BOSS_ESCAPE_SPEED` (150 px/giây, người chậm nhất) <= `telegraphMs`. Quãng thoát theo hình: tròn / vũng / mưa / dịch chuyển = `r` + 3; vành khuyên = nửa bề rộng vành + 3 (lỗ giữa phải chứa được thân người, nhỏ hơn thì coi như vòng đặc); nón = bán kính đường tròn lớn nhất nằm trong quạt + 3; đường / lao = nửa bề rộng + 3; kéo = ra khỏi tầm nổ SAU khi bị kéo. Giới hạn nhanh: tròn `r <= 0,15 T - 48`, đường / vành `w <= 0,3 T - 96` (T = báo trước ms; T 900 thì r <= 87, T 1200 thì r <= 132). Hai hằng số là ĐỀ XUẤT; kiểm này CHƯA tính hiệu ứng làm chậm, tường chặn hay quái con cản đường nên không thay cho bot né (T7) và mô phỏng của D.
- **Mô phỏng (D):** thời gian hạ trùm đúng bậc solo / đội 3-4 người; tỉ lệ chết khi bot né hoàn hảo ~0 và khi KHÔNG né cao (chứng minh chiêu có ý nghĩa mà không quá tàn nhẫn); không có "đường tắt" (đứng sát chân trùm né hết bằng một chỗ).
- Mỗi PR: TOÀN BỘ `npm test` + typecheck + lint + prettier; số đo `bench` trước / sau khi đụng vòng tick.
