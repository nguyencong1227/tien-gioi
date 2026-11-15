// Tinh anh (M7.3, `systems/elite.ts`) trong mô hình: mức nguy hiểm và thời gian hạ so với loài thường, để thấy tinh anh có "mini-trùm" vừa tay hay giết người.
// Dùng đúng công thức của `huntRate` / `dangerFraction` (đứng yên chém, KHÔNG né, KHÔNG đan, quái trúng 80 % số đòn) nên là CẬN TRÊN: người né được báo trước (đòn lao,
// đập đất) hoặc uống đan thì nhẹ hơn (bot thật của C: né giảm ~33 % sát thương ở Cốt Tượng, 0 % ở loài không có đòn báo trước).
import { MONSTER_BY_ID, REALMS, SKILLS, statsFor } from "@tien-gioi/shared";
import {
  eliteDefOf,
  ELITE_ATK_MULT,
  ELITE_CHANCE,
  ELITE_HP_MULT,
  ELITE_MAX,
} from "../systems/elite";
import { ASSUME, bestGear } from "./simulate";
import { dangerFraction } from "./kim-dan-sau";

/** Mỗi loài thường hiếu chiến ở bậc "chuẩn" của nó (cảnh giới, bậc nhỏ): nơi người chơi thường săn loài đó. */
export const ELITE_CASES: readonly { id: string; realm: number; tier: number }[] = [
  { id: "lang", realm: 1, tier: 8 },
  { id: "ho", realm: 2, tier: 0 },
  { id: "suong_ho", realm: 3, tier: 0 },
  { id: "thach_quy", realm: 3, tier: 0 },
  { id: "doc_thiem", realm: 3, tier: 1 },
  { id: "han_lang", realm: 4, tier: 0 },
  { id: "phong_nha", realm: 4, tier: 0 },
  { id: "cot_tuong", realm: 4, tier: 0 },
  { id: "doc_tuoc", realm: 4, tier: 1 },
];

export interface EliteRow {
  id: string;
  label: string;
  /** Giây hạ một con (đứng yên chém, không tính thời gian tìm) */
  normalSec: number;
  eliteSec: number;
  /** Phần khí huyết (0..) mất mỗi trận */
  normalDanger: number;
  eliteDanger: number;
}

export function eliteRows(): EliteRow[] {
  return ELITE_CASES.map(({ id, realm, tier }) => {
    const m = MONSTER_BY_ID[id];
    const e = eliteDefOf(m);
    const s = statsFor(realm, tier, bestGear(realm, tier));
    const dps = (s.atk * SKILLS.slash.mult * ASSUME.critAvg) / (SKILLS.slash.cooldown / 1000);
    return {
      id,
      label: `${REALMS[realm].name} ${REALMS[realm].tiers[tier]}`,
      normalSec: m.hp / dps,
      eliteSec: e.hp / dps,
      normalDanger: dangerFraction(m, realm, tier),
      eliteDanger: dangerFraction(e, realm, tier),
    };
  });
}

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);

/** Mục Markdown "Tinh anh" cho `docs/CAN_BANG.md`. */
export function renderTinhAnh(): string {
  const rows = eliteRows();
  const table = rows.map(
    (r) =>
      `| ${MONSTER_BY_ID[r.id].name} | ${r.label} | ${n1(r.normalSec)} / ${n1(r.eliteSec)} | ${n0(r.normalDanger * 100)}% / ${n0(r.eliteDanger * 100)}% | ${r.eliteDanger > 1 ? "giết người đứng yên" : r.eliteDanger > ASSUME.maxHpLossPerKill ? "nguy hiểm, cần né / đan" : "an toàn"} |`,
  );
  const lethal = rows.filter((r) => r.eliteDanger > 1).length;
  return `## Tinh anh (M7.3, \`systems/elite.ts\`)

Mỗi lần sinh quái thường hiếu chiến (không trùm, không Linh Thố hiền) ở bản đồ thường có ${n0(ELITE_CHANCE * 100)}% là tinh anh, tối đa ${ELITE_MAX} con cùng lúc mỗi bản đồ: khí huyết x${ELITE_HP_MULT}, công x${ELITE_ATK_MULT} (trận dài ~${n1(ELITE_HP_MULT * ELITE_ATK_MULT)}x sát thương nhận), tu vi x2, tiền rơi x2, tung bảng rơi đồ thêm một lần. Bảng dưới là CẬN TRÊN theo mô hình (đứng yên chém, không né, không đan, quái trúng 80% số đòn): thời gian hạ (giây, thường / tinh anh) và khí huyết mất mỗi trận (thường / tinh anh) ở bậc chuẩn của từng loài.

| Loài | Bậc chuẩn | Giây hạ (thường / tinh anh) | Khí huyết mất (thường / tinh anh) | Nhận xét |
|---|---|---:|---:|---|
${table.join("\n")}

Đọc bảng: ${lethal} / ${rows.length} loài có tinh anh làm người ĐỨNG YÊN solo mất hơn 100% khí huyết (Kim Đan và Nguyên Anh), nên tinh anh là mini-trùm: phải né báo trước đòn (loài gốc đã có), uống đan hoặc đi theo đội; chạy về khu an toàn là cách thoát. Luyện Khí / Trúc Cơ chỉ nhích nhẹ. Chết do quái là mất kiếp (Hoàng Tuyền) nên đây là rủi ro thật: số hệ số (khí huyết x${ELITE_HP_MULT}, công x${ELITE_ATK_MULT}, xác suất ${n0(ELITE_CHANCE * 100)}%) là số khởi đầu theo \`docs/PHAN_CONG_M7.md\` mục 6, chờ bot thật của C và quyết định của người dùng (\`questions.md\`).
`;
}
