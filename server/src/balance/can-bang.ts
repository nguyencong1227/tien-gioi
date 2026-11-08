// In bảng mô phỏng cân bằng ra docs/CAN_BANG.md (hoặc stdout với --stdout).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSUME, minutesToFinish, simulate } from "./simulate";

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
const summary = [
  `- Hết Luyện Khí (sẵn sàng Trúc Cơ): **${fmt(minutesToFinish(rows, 1))}** (mục tiêu ~1 giờ)`,
  `- Hết Trúc Cơ (sẵn sàng Kim Đan): **${fmt(minutesToFinish(rows, 2))}** (mục tiêu ~3 giờ)`,
].join("\n");

if (process.argv.includes("--stdout")) {
  console.log(summary + "\n\n" + table);
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
- Chưa tính: nhiệm vụ lặp, đan dược, đánh theo nhóm, thời gian chết.
- Tụ Khí Đan (+5% thanh) cố ý hiếm: rơi 1% từ Hắc Hổ, thưởng nhiệm vụ, không đổi được ở Lão dược sư.
  Ước khoảng 11 viên trong 3 giờ đầu, cộng lại chừng nửa thanh Trúc Cơ (rút ngắn khoảng 20 phút).
`,
  );
  console.log(`Đã ghi ${out}\n\n${summary}`);
}
