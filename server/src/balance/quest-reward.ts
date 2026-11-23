// Mục "Thưởng tu vi nhiệm vụ một lần" cho docs/CAN_BANG.md (QUYET_DINH_M3 mục 66.4, #1333).
//
// Nhiệm vụ CHÍNH (chuỗi `next`) và VIỆC PHỤ (không bắt buộc, không `daily`) thưởng tu vi MỘT LẦN. Bảng so TRƯỚC / SAU bước 2 (#1362):
// mỗi nhiệm vụ chính nâng lên sàn 5 % thanh bậc nhận, việc phụ 2 %; trần nới 10 % (chính) / 4 % (phụ) mỗi cảnh giới (xem test sàn/trần ở
// `shared/src/kim-dan-world.test.ts`). "SAU" SINH từ dữ liệu `QUESTS` hiện tại (đổi số nhiệm vụ thì bảng tự cập nhật khi chạy can-bang).
// "TRƯỚC" là ảnh chụp cố định của tổng exp THẬT trước #1362 (commit `e5f2db97^` của `shared/src/quests.ts`; A đo ở comment #1333), ghi hằng
// số vì dữ liệu cũ KHÔNG còn trong cây. `daily` (nhiệm vụ lặp Bảng cáo thị — dòng thu nhập lặp mỗi ngày) KHÔNG tính vào đây.
//
// Phân loại GIỐNG HẲN test sàn/trần ở `kim-dan-world.test.ts`: realm của nhiệm vụ = bước `reachRealm` cuối cùng trong `steps` (nếu có),
// ngược lại `minRealm.realm`; việc phụ = `desc` bắt đầu "Việc phụ". "Tổng thanh" của cảnh giới = tổng `expToNext` qua 3 bậc (Sơ/Trung/Hậu kỳ).
import { QUESTS, REALMS, expToNext, type QuestDef } from "@tien-gioi/shared";

// Tổng exp thưởng TRƯỚC #1362 (commit e5f2db97^), theo cảnh giới và chính / phụ. Hằng số lịch sử, KHÔNG sinh từ dữ liệu hiện tại.
// A đo ở comment #1333: chuỗi chính 1,31 / 3,48 / 4,92 %; việc phụ 1,96 / 2,40 / 1,95 % — khớp tổng exp dưới đây chia tổng thanh.
const BEFORE_EXP: Record<number, { main: number; side: number }> = {
  2: { main: 200, side: 300 },
  3: { main: 5800, side: 4000 },
  4: { main: 49200, side: 19500 },
};

// Chỉ so Trúc Cơ / Kim Đan / Nguyên Anh: chuỗi chính Luyện Khí thưởng rất to so với thanh nhỏ (đặc điểm giai đoạn dạy học), KHÔNG cùng khung.
const REALMS_SHOWN = [2, 3, 4];

/** Realm của nhiệm vụ: bước reachRealm cuối, ngược lại minRealm.realm (giống kim-dan-world.test.ts). */
function realmOf(q: QuestDef): number {
  const reach = [...q.steps].reverse().find((s) => s.kind === "reachRealm");
  return reach?.kind === "reachRealm" ? reach.realm : (q.minRealm?.realm ?? 1);
}

/** Tổng exp thưởng một lần (chính / phụ) của cảnh giới `realm` từ dữ liệu hiện tại (KHÔNG tính `daily`). */
function afterSums(realm: number): { main: number; side: number } {
  const s = { main: 0, side: 0 };
  for (const q of QUESTS) {
    if (q.daily || !q.rewards.exp || realmOf(q) !== realm) continue;
    if (q.desc.startsWith("Việc phụ")) s.side += q.rewards.exp;
    else s.main += q.rewards.exp;
  }
  return s;
}

/** Tổng thanh tu vi 3 bậc (Sơ/Trung/Hậu kỳ) của cảnh giới. */
function bar3(realm: number): number {
  return [0, 1, 2].reduce((a, t) => a + expToNext(realm, t), 0);
}

const pct = (x: number, bar: number) => ((x / bar) * 100).toFixed(2);
const num = (x: number) => x.toLocaleString("en-US");

export interface RealmQuestReward {
  realm: number;
  name: string;
  bar: number;
  before: { main: number; side: number };
  after: { main: number; side: number };
}

/** Số liệu thưởng tu vi nhiệm vụ một lần mỗi cảnh giới (chính / phụ, trước / sau, % tổng thanh) — để test canh, render chỉ định dạng lại. */
export function questRewardSummary(): RealmQuestReward[] {
  return REALMS_SHOWN.map((realm) => {
    const bar = bar3(realm);
    return {
      realm,
      name: REALMS[realm]!.name,
      bar,
      before: BEFORE_EXP[realm]!,
      after: afterSums(realm),
    };
  });
}

export function renderQuestReward(): string {
  const rows = questRewardSummary();
  const table = [
    "| Cảnh giới | Tổng thanh | Chuỗi chính TRƯỚC | Chuỗi chính SAU | Việc phụ TRƯỚC | Việc phụ SAU | Tổng 1-lần SAU |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...rows.map((x) => {
      const total = pct(x.after.main + x.after.side, x.bar);
      return (
        `| ${x.name} | ${num(x.bar)} | ` +
        `${pct(x.before.main, x.bar)}% (${num(x.before.main)}) | ` +
        `${pct(x.after.main, x.bar)}% (${num(x.after.main)}) | ` +
        `${pct(x.before.side, x.bar)}% (${num(x.before.side)}) | ` +
        `${pct(x.after.side, x.bar)}% (${num(x.after.side)}) | ` +
        `**${total}%** |`
      );
    }),
  ].join("\n");
  const shorts = rows
    .map((x) => `${x.name} ${pct(x.after.main + x.after.side, x.bar)}%`)
    .join(" / ");
  // cảnh giới rút ngắn nhiều nhất (theo exp bonus) — để nhắc ngưỡng báo A (~12%, mục 66.4, #1333)
  const maxRealm = rows.reduce(
    (m, x) => {
      const r = (x.after.main + x.after.side) / x.bar;
      return r > m.r ? { name: x.name, r } : m;
    },
    { name: rows[0]!.name, r: 0 },
  );

  return `## Thưởng tu vi nhiệm vụ một lần (M66.4, #1333)

Nhiệm vụ **chính** (chuỗi \`next\`) và **việc phụ** (không bắt buộc) thưởng tu vi MỘT LẦN. Bảng dưới so **trước / sau** bước 2 (#1362): mỗi nhiệm vụ chính
nâng lên sàn 5 % thanh bậc nhận, việc phụ 2 %; trần nới 10 % (chuỗi chính) / 4 % (việc phụ) mỗi cảnh giới (ngưỡng ở \`shared/src/kim-dan-world.test.ts\`).
"Tổng thanh" = tổng \`expToNext\` qua 3 bậc của cảnh giới. Nhiệm vụ lặp hằng ngày (\`daily\`, Bảng cáo thị — dòng thu nhập lặp mỗi ngày) KHÔNG tính ở đây.

${table}

**Hoàn thành MỌI nhiệm vụ một lần** (chuỗi chính + việc phụ) thưởng thêm **${shorts}** tổng thanh — tức phần tu vi bonus rút ngắn cảnh giới đó chừng ấy %
(nghĩa đen về phía tu vi; thời gian thật rút ngắn ÍT HƠN vì còn thời gian đi lại, nói chuyện và chính việc săn quái trong nhiệm vụ — A đo Kim Đan ~4,2 → 3,9 giờ,
~7 %). Trước #1362 các cảnh giới chỉ thưởng 1-lần ${pct(BEFORE_EXP[2]!.main + BEFORE_EXP[2]!.side, bar3(2))} / ${pct(
    BEFORE_EXP[3]!.main + BEFORE_EXP[3]!.side,
    bar3(3),
  )} / ${pct(BEFORE_EXP[4]!.main + BEFORE_EXP[4]!.side, bar3(4))}% (Trúc Cơ / Kim Đan / Nguyên Anh).

> Lưu ý cân bằng: thưởng 1-lần sau #1362 đạt **${(maxRealm.r * 100).toFixed(2)}%** tổng thanh ở ${maxRealm.name} — sát ngưỡng ~12 % A đặt (comment #1333: trên ~12 %
> thì báo trước khi chốt). Đây là hệ quả của dữ liệu #1362 đã merge, KHÔNG đổi ở đây; \`daily\` giữ nguyên nên không thành đường tắt cày tu vi lặp.
`;
}
