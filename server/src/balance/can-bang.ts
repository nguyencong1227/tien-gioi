// In bảng mô phỏng cân bằng ra docs/CAN_BANG.md (hoặc stdout với --stdout).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REALMS } from "@tien-gioi/shared";
import { ASSUME, minutesToFinish, partyRatio, simulate } from "./simulate";

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

if (process.argv.includes("--stdout")) {
  console.log(summary + "\n\n" + table + "\n\n" + partyTable);
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
`,
  );
  console.log(`Đã ghi ${out}\n\n${summary}`);
}
