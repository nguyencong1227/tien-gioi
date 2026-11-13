// PK và bí cảnh ở Kim Đan sau nội dung M6 (#406 mục 6): bảng ở `docs/CAN_BANG.md` còn đúng với bậc Kim Đan và ba bộ trang bị mới không.
// Dùng chính `duelOnce` / `summarizeDuels` (mã server thật) với `Level.gearUpTo` để cho hai người CÙNG bậc mặc bộ khác nhau.
import { REALMS, stepOf } from "@tien-gioi/shared";
import { PK_TARGET_SECONDS, summarizeDuels, type DuelSummary } from "./pk";
import { LINH_HU } from "./dungeon";

const KD = 3;
const RUNS = 20;

export interface PkMirror {
  tier: number;
  label: string;
  /** Hai người cùng bậc, cùng mặc `gearUpTo` bộ (undefined = trang bị tốt nhất đủ bậc) */
  gearUpTo: number | undefined;
  summary: DuelSummary;
}

export interface PkGap {
  tier: number;
  label: string;
  /** Bên mạnh hơn mặc bộ `hi`, bên yếu mặc bộ `lo` (cùng bậc) */
  hi: number;
  lo: number;
  summary: DuelSummary;
}

/** Hai người cùng bậc Kim Đan mặc cùng một bộ: trận có nằm trong 25-45 giây không (mọi bậc, mọi bộ mặc được). */
export function kimDanPkMirrors(runs = RUNS): PkMirror[] {
  const out: PkMirror[] = [];
  for (let tier = 0; tier < REALMS[KD].tiers.length; tier++)
    for (let gearUpTo = 0; gearUpTo <= tier + 1; gearUpTo++) {
      const l = { realm: KD, tier, gearUpTo };
      out.push({
        tier,
        label: `${REALMS[KD].name} ${REALMS[KD].tiers[tier]}`,
        gearUpTo,
        summary: summarizeDuels(l, l, runs),
      });
    }
  return out;
}

/** Hai người cùng bậc Kim Đan khác bộ trang bị: bên mặc bộ cao nhất của bậc, thách người mặc bộ liền dưới và người không có bộ nào. */
export function kimDanPkGaps(runs = RUNS): PkGap[] {
  const out: PkGap[] = [];
  for (let tier = 0; tier < REALMS[KD].tiers.length; tier++) {
    const hi = tier + 1;
    for (const lo of new Set([hi - 1, 0]))
      out.push({
        tier,
        label: `${REALMS[KD].name} ${REALMS[KD].tiers[tier]}`,
        hi,
        lo,
        summary: summarizeDuels(
          { realm: KD, tier, gearUpTo: hi },
          { realm: KD, tier, gearUpTo: lo },
          runs,
        ),
      });
  }
  return out;
}

const bo = (n: number) => (n === 0 ? "không bộ Kim Đan nào" : `bộ ${"I".repeat(n)}`);
const n1 = (x: number) => x.toFixed(1);

/** Mục 8 của "Kim Đan sau nội dung" trong `docs/CAN_BANG.md`. */
export function renderKimDanPkBiCanh(): string {
  const mirrors = kimDanPkMirrors();
  const gaps = kimDanPkGaps();
  const mirrorRows = mirrors.map(
    (m) =>
      `| ${m.label} | ${bo(m.gearUpTo ?? 0)} | ${n1(m.summary.median)} | ${n1(m.summary.min)} - ${n1(m.summary.max)} |`,
  );
  const gapRows = gaps.map(
    (g) =>
      `| ${g.label} | ${bo(g.hi)} thách ${bo(g.lo)} | ${Math.round(g.summary.winRate * 100)}% | ${n1(g.summary.median)} |`,
  );
  const allInTarget = mirrors.every(
    (m) => m.summary.min >= PK_TARGET_SECONDS.min && m.summary.max <= PK_TARGET_SECONDS.max,
  );
  const minStep = stepOf(KD, 0);
  const wins = gaps.map((g) => Math.round(g.summary.winRate * 100));
  const winRange =
    Math.min(...wins) === Math.max(...wins)
      ? `${wins[0]}%`
      : `${Math.min(...wins)}-${Math.max(...wins)}%`;
  return `### 8. PK và bí cảnh ở Kim Đan (#406)

**PK.** Cùng mô hình với mục "PK thách đấu" (\`duelOnce\`: mã server thật, đánh thường liên tục, ${RUNS} trận mỗi dòng). Hai người CÙNG bậc Kim Đan mặc CÙNG bộ trang bị: trận ${allInTarget ? "đều nằm trong" : "CÓ trận ngoài"} mục tiêu ${PK_TARGET_SECONDS.min}-${PK_TARGET_SECONDS.max} giây ở mọi bậc và mọi bộ.

| Bậc | Trang bị (cả hai) | Giây đánh (trung vị) | Nhỏ nhất - lớn nhất |
|---|---|---:|---:|
${mirrorRows.join("\n")}

Cùng bậc nhưng KHÁC bộ: bên mặc bộ cao hơn thắng ${winRange} số trận (như chênh một tầng ở mục "Chênh bậc"), trận ngắn hơn một chút. Linh thạch (phí rèn bộ III ~47.000, mục 6) mua được lợi thế PK quyết định so với người cùng bậc chưa rèn; PK là thách đấu hai bên đồng ý (người yếu hơn từ chối được), và câu hỏi chuẩn hoá chỉ số về bậc / bộ thấp hơn vẫn chờ người dùng (câu hỏi 4 ở \`questions.md\`).

| Bậc | Trận | Bên mạnh thắng | Giây đánh (trung vị) |
|---|---|---:|---:|
${gapRows.join("\n")}

**Bí cảnh Linh Hư.** Không bị nội dung M6 làm đổi: bí cảnh có trần bậc ${LINH_HU.maxStep} (hết Trúc Cơ, PR #428) và người Kim Đan bắt đầu từ bậc ${minStep} nên ${minStep > (LINH_HU.maxStep ?? Infinity) ? "KHÔNG vào được (`member_high`)" : "vào được (cần xem lại bảng bí cảnh)"}; bảng "Bí cảnh Linh Hư" ở trên (bậc ${LINH_HU.minStep}-${LINH_HU.maxStep}) vẫn đúng nguyên. Phân tích đội Kim Đan phá bí cảnh (trước khi có trần) ở mục "Kim Đan trước M6", phần 4.
`;
}
