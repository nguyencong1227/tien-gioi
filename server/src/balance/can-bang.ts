// In bảng mô phỏng cân bằng ra docs/CAN_BANG.md (hoặc stdout với --stdout).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MONSTERS, MONSTER_BY_ID, REALMS } from "@tien-gioi/shared";
import {
  ASSUME,
  expectedCoinDrop,
  expectedLootValue,
  expectedTotalCoin,
  minutesToFinish,
  monsterEconomy,
  partyRatio,
  simulate,
} from "./simulate";

const rows = simulate();
const fmt = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} giờ ${Math.round(m % 60)} phút` : `${Math.round(m)} phút`;
const table = [
  "| Bậc | Thanh tu vi | Săn gì | Số quái | Phút ở bậc này | Cộng dồn |",
  "|---|---:|---|---:|---:|---:|",
  ...rows.map(
    (r) =>
      `| ${r.label} | ${r.bar} | ${r.source} | ${r.kills || "–"} | ${r.minutes.toFixed(1)} | ${fmt(r.total)} |`,
  ),
].join("\n");
const partyRatios = rows.flatMap((r) =>
  [2, 3, 4].map((n) => ({
    label: `${REALMS[r.realm].name} bậc ${r.tier + 1}`,
    n,
    ...partyRatio(r.realm, r.tier, n),
  })),
);
const partyMax = partyRatios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
const partyMin = partyRatios.reduce((a, b) => (b.ratio < a.ratio ? b : a));
const partyOver = partyRatios.filter((x) => x.ratio > 1.5).length;
const partyTable = [
  "| Bậc | Một mình săn | Đội 2 | Đội 3 | Đội 4 |",
  "|---|---|---:|---:|---:|",
  ...rows.map((r) => {
    const cells = [2, 3, 4].map((n) => {
      const p = partyRatio(r.realm, r.tier, n);
      return `${p.ratio.toFixed(2)}× (${p.party})`;
    });
    return `| ${REALMS[r.realm].name} bậc ${r.tier + 1} | ${partyRatio(r.realm, r.tier, 2).solo} | ${cells.join(" | ")} |`;
  }),
].join("\n");
const summary = [
  `- Hết Luyện Khí (sẵn sàng Trúc Cơ): **${fmt(minutesToFinish(rows, 1))}** (mục tiêu ~1 giờ)`,
  `- Hết Trúc Cơ (sẵn sàng Kim Đan): **${fmt(minutesToFinish(rows, 2))}** (mục tiêu ~3 giờ)`,
].join("\n");

// ---------- Kinh tế Linh thạch (#102) ----------

const monsterTable = [
  "| Quái | Cấp | Máu | Tiền rơi TB | Bán đồ rơi TB | Tổng LT / con | Đồ bán có giá |",
  "|---|---:|---:|---:|---:|---:|---|",
  ...MONSTERS.map((m) => {
    const coin = expectedCoinDrop(m.id);
    const loot = expectedLootValue(m.id);
    const total = expectedTotalCoin(m.id);
    const notes: Record<string, string> = {
      tho: "Lông thỏ (1 LT), Hồi huyết đan (6 LT)",
      lang: "Nanh sói (2 LT), Hồi huyết đan (6 LT), Hồi linh đan (6 LT)",
      ho: "Da hổ (9 LT), Đan hồi phục (6 LT), Tụ khí đan (45 LT)",
      mang: "Vảy mãng (60 LT), Tụ khí đan (45 LT), Hồi huyết đan (6 LT)",
    };
    return `| ${m.name} (\`${m.id}\`) | ${m.level} | ${m.hp} | ${coin.toFixed(2)} | ${loot.toFixed(2)} | **${total.toFixed(2)}** | ${notes[m.id] ?? "–"} |`;
  }),
].join("\n");

const economyRows = rows.flatMap((r) =>
  MONSTERS.map((m) => {
    const eco = monsterEconomy(m, r.realm, r.tier);
    return eco ? { label: r.label, realm: r.realm, tier: r.tier, ...eco } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null),
);

const economyTable = [
  "| Bậc | Quái săn | Diệt / giờ | Tiền rơi / giờ | Bán đồ / giờ | Tổng LT / giờ | Hồi huyết đan / giờ |",
  "|---|---|---:|---:|---:|---:|---:|",
  ...economyRows.map(
    (e) =>
      `| ${e.label} | ${e.monsterName} | ${Math.round(e.killsPerHour)} | ${Math.round(e.coinDropPerHour).toLocaleString("en-US")} | ${Math.round(e.lootSellPerHour).toLocaleString("en-US")} | **${Math.round(e.totalCoinPerHour).toLocaleString("en-US")}** | ${e.potionsPerHour.toFixed(1)} |`,
  ),
].join("\n");

const langThoRatios = rows
  .map((r) => {
    const tho = monsterEconomy(MONSTER_BY_ID.tho, r.realm, r.tier);
    const lang = monsterEconomy(MONSTER_BY_ID.lang, r.realm, r.tier);
    if (!tho || !lang) return null;
    return {
      label: r.label,
      ratio: lang.totalCoinPerHour / tho.totalCoinPerHour,
      thoCoin: tho.totalCoinPerHour,
      langCoin: lang.totalCoinPerHour,
    };
  })
  .filter((x): x is NonNullable<typeof x> => x !== null);

const minLangTho = langThoRatios.reduce((a, b) => (b.ratio < a.ratio ? b : a));
const maxLangTho = langThoRatios.reduce((a, b) => (b.ratio > a.ratio ? b : a));

const economySection = `## Kinh tế Linh thạch (Sprint 5, #102)

Mô hình kinh tế dựa trên hợp đồng \`shared/src/currency.ts\`: tiền rơi trực tiếp (\`COIN_DROPS\`), tiền bán đồ rơi (\`DROP_TABLES\` × \`sellPrice\`), và giá mua đan hồi phục tại cửa hàng Lão dược sư (\`buyPrice("hoi_huyet_dan") = 24\` Linh thạch).

### 1. Kỳ vọng Linh thạch từ mỗi con quái

${monsterTable}

### 2. Thu nhập Linh thạch mỗi giờ khi săn một loại quái

Giả định người chơi đánh đơn lẻ (solo), dùng Kiếm chém, đả tọa hồi phục khí huyết sau trận, mặc trang bị tốt nhất theo bậc (\`bestGear\`). Chỉ hiển thị những loại quái đủ an toàn để săn đơn (mất ≤ 50% HP mỗi trận). Cột "Hồi huyết đan / giờ" tính theo giá mua ở Dược sư (24 LT/viên).

${economyTable}

### 3. Nhận xét & phân tích cân bằng kinh tế

- **So sánh các bãi quái cùng cấp (Linh Thố vs Hôi Lang - khu vực khởi đầu ngoài trấn):**
  - Cả Thỏ (level 0) và Sói (level 1) đều là quái săn ở giai đoạn đầu game. Hôi Lang cho **5.35 LT/con** (gấp ~2.2× so với Thỏ 2.43 LT/con), nhưng đánh lâu hơn và mất máu nhiều hơn.
  - Tỷ lệ thu nhập Linh thạch mỗi giờ giữa Sói và Thỏ dao động từ **${minLangTho.ratio.toFixed(2)}×** (${minLangTho.label}: Sói ${Math.round(minLangTho.langCoin).toLocaleString("en-US")} vs Thỏ ${Math.round(minLangTho.thoCoin).toLocaleString("en-US")} LT/h) đến **${maxLangTho.ratio.toFixed(2)}×** (${maxLangTho.label}: Sói ${Math.round(maxLangTho.langCoin).toLocaleString("en-US")} vs Thỏ ${Math.round(maxLangTho.thoCoin).toLocaleString("en-US")} LT/h).
  - **Đánh giá:** Không có bãi nào lệch quá 2× (> ~2×) so với bãi cùng cấp. Mức chênh 1.12× – 1.58× là hợp lý: vừa đủ để khuyến khích người chơi tiến sang bãi Sói khi đủ mạnh, vừa không làm bãi Thỏ bị phế bỏ.
- **Đường mua đan bằng tiền vs Đổi nguyên liệu (\`TRADES\`):**
  - Đổi nguyên liệu tại Lão dược sư: 5 Lông thỏ (\`long_tho\`) lấy 1 Hồi Huyết Đan. Lông thỏ rơi 50% số lượng 1–2 (kỳ vọng 0.75 lông/con), cần hạ trung bình **~6.7 con thỏ** để đổi được 1 viên đan.
  - Mua đan bằng tiền: Giá mua là **24 Linh thạch**. Mỗi con thỏ cho trung bình **2.43 LT** (gồm 1.20 LT tiền rơi + 1.23 LT bán đồ). Cần hạ trung bình **~9.9 con thỏ** (hoặc ~12.3 con nếu không bán viên đan nhặt được) để đủ tiền mua 1 viên đan.
  - **Đánh giá:** Đường đổi nguyên liệu (6.7 con thỏ) **rẻ hơn đáng kể** (~1.5× – 1.8×) so với mua thẳng bằng tiền (10–12 con thỏ). Đây là thiết kế cố ý: đổi đồ là đường rẻ nhất cho người mới bắt đầu và người chịu khó gom nguyên liệu; cửa hàng tiền tệ đóng vai trò tiện lợi, xả tiền tích lũy khi không muốn gom nguyên liệu.
- **Quái cấp cao (Hắc Hổ, Xích Mãng):**
  - Hắc Hổ (cấp 2, an toàn từ Luyện Khí Tầng 6): thu nhập tăng mạnh từ ~2,570 LT/h lên ~4,650 LT/h ở Trúc Cơ.
  - Xích Mãng (trùm cấp 3): cho kỳ vọng tới 460.5 LT/con nhưng không an toàn khi solo trước Kim Đan; thích hợp đi săn theo tổ đội (xem mục "Đi theo đội" ở trên).
`;

if (process.argv.includes("--stdout")) {
  console.log(summary + "\n\n" + table + "\n\n" + partyTable + "\n\n" + economySection);
} else {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(here, "../../../docs/CAN_BANG.md");
  writeFileSync(
    out,
    `# Cân bằng tu luyện (bảng tính)

> File này sinh tự động từ \`server/src/balance/simulate.ts\`. Sửa số liệu trong \`shared/\` rồi chạy
> \`npm run can-bang -w server\` để cập nhật. Test \`server/src/balance/simulate.test.ts\` giữ đường cong trong mục tiêu.

## Kết quả

${summary}

${table}

## Giả định

- Mỗi bậc, người chơi chọn nguồn tu vi nhanh nhất mà an toàn: săn một loại quái, hoặc chỉ đả tọa.
- Săn quái: chỉ dùng Kiếm chém (có tính bạo kích trung bình ×${ASSUME.critAvg.toFixed(2)}), quái đánh trúng ${ASSUME.hitTaken * 100}% số đòn,
  bỏ qua loại quái mà mỗi trận mất quá ${ASSUME.maxHpLossPerKill * 100}% khí huyết. Sau mỗi trận đả tọa hồi khí huyết (vẫn được tu vi đả tọa).
- Thời gian tìm quái kế tiếp: ${Object.entries(ASSUME.searchSec)
      .map(([k, v]) => `${k} ${v}s`)
      .join(", ")}.
- Thưởng tu vi của chuỗi nhiệm vụ chính chia đều cho các bậc của cảnh giới tương ứng; đi lại + nói chuyện cả chuỗi: ${ASSUME.questOverheadSec / 60} phút.
- Đột phá thất bại mất 30% thanh tu vi, tính theo số lần thất bại kỳ vọng.
- Trang bị: ${ASSUME.useGear ? "mặc món tốt nhất đủ cảnh giới ở mỗi ô (giả định đã rèn kịp; nguyên liệu rơi trong lúc săn, không tính thời gian đi rèn)" : "không mặc gì"}. Không mặc gì thì chậm hơn khoảng 10%.
- Chưa tính: nhiệm vụ lặp, đan dược, thời gian chết. Đánh theo đội: xem mục "Đi theo đội" bên dưới.
- Tụ Khí Đan (+5% thanh) cố ý hiếm: rơi 1% từ Hắc Hổ, thưởng nhiệm vụ, không đổi được ở Lão dược sư.
  Ước khoảng 11 viên trong 3 giờ đầu, cộng lại chừng nửa thanh Trúc Cơ (rút ngắn khoảng 20 phút).

## Đi theo đội (tổ đội, #74)

Tu vi mỗi giờ của **mỗi thành viên** khi đi theo đội so với đánh một mình (1.00× = bằng nhau). Mỗi bên chọn loại quái
tốt nhất mà đủ an toàn (trong ngoặc là quái đội chọn). Mô hình (\`huntRate(..., party)\` trong \`simulate.ts\`): \`n\` người cùng cảnh giới
đánh chung, sát thương cộng dồn nên trận ngắn \`n\` lần, quái chỉ đánh một mục tiêu nên mỗi người chịu 1/\`n\` sát thương (đội đánh được quái
mà một người không dám), thời gian tìm quái không đổi, tu vi mỗi con nhân \`partyExpShare(n)\` (chia đều, thưởng 15% mỗi người thêm).
Không tính: nhiều đội tranh cùng một con trùm (số quái có hạn và chờ hồi sinh), thời gian tập hợp đội, người cầm đầu mạnh hơn.

${partyTable}

Đọc bảng: lớn hơn 1.5× thường là bậc mà đội đánh được Xích Mãng (trùm) còn một người chưa dám; nhỏ hơn 1× là bậc mà chia tu vi
làm đội chậm hơn đánh một mình (thời gian tìm quái không rút ngắn được). Cao nhất: **${partyMax.ratio.toFixed(2)}×** (${partyMax.label}, đội ${partyMax.n}); thấp nhất:
**${partyMin.ratio.toFixed(2)}×** (${partyMin.label}, đội ${partyMin.n}); **${partyOver}/${partyRatios.length}** ô vượt 1.5×. Đây là số đo của mô hình, **chưa phải quyết định cân bằng**:
mục tiêu "không quá ~1.5×" của #74 chưa đạt ở những ô trên. Xem câu hỏi trong \`~/TT/orchestra/questions.md\` (thưởng tu vi của đội).

${economySection}`,
  );
  console.log(`Đã ghi ${out}\n\n${summary}`);
}
