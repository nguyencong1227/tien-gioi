// Độ nhạy của mô hình với đồ ba ô RIÊNG (hài, ngọc bội, pháp bảo; M7.4): `ASSUME.useOwnerGear` đang TẮT vì mọi chốt cân bằng M6 / M7 đo khi
// chưa có đồ này, và bật lên làm nhiều ca đỏ (nhịp Nguyên Anh, trùm theo đội, bí cảnh). Thay vì bật rồi sửa mù, mục này đo SỐNG hai
// cấu hình cạnh nhau để quyết định có chỉnh số trùm / thanh tu vi hay giữ cờ tắt như giả định bảo thủ.
import { MONSTER_BY_ID, REALMS } from "@tien-gioi/shared";
import { ASSUME, huntRate, simulate } from "./simulate";
import { dangerFraction, withKimDan } from "./kim-dan-sau";
import { nguyenAnhPacing } from "./nguyen-anh-kinh-te";

const TC = 2;
const KD = 3;
const NA = 4;
/** Cỡ đội lớn nhất thử khi tìm đội nhỏ nhất đánh trùm an toàn (mô hình đội: sát thương cộng dồn, mỗi người chịu 1 / n) */
export const MAX_PARTY = 6;

/** Chạy `fn` với `ASSUME.useOwnerGear = on`, rồi khôi phục (kể cả khi `fn` ném lỗi). */
export function withOwnerGear<T>(on: boolean, fn: () => T): T {
  const saved = ASSUME.useOwnerGear;
  ASSUME.useOwnerGear = on;
  try {
    return fn();
  } finally {
    ASSUME.useOwnerGear = saved;
  }
}

/** Đội nhỏ nhất (1..MAX_PARTY) đánh trùm `bossId` ở bậc (realm, tier) an toàn theo mô hình `huntRate`; `null` nếu cả đội MAX_PARTY cũng không. */
export function minSafeParty(bossId: string, realm: number, tier: number): number | null {
  const m = MONSTER_BY_ID[bossId];
  for (let n = 1; n <= MAX_PARTY; n++) if (huntRate(m, realm, tier, n)) return n;
  return null;
}

export interface OwnerGearMetrics {
  /** Phút cộng dồn tới hết Trúc Cơ (mục tiêu ~3 giờ) */
  truncoMinutes: number;
  /** Giờ riêng cảnh giới Kim Đan, đường "bãi mới" (mục tiêu 5-7) */
  kimDanHours: number;
  /** Giờ riêng cảnh giới Nguyên Anh (mục tiêu 6-9) */
  nguyenAnhHours: number;
  /** Đội nhỏ nhất đánh Hắc Giao an toàn, ba bậc Kim Đan */
  hacGiao: (number | null)[];
  /** Đội nhỏ nhất đánh Thiên Hàn Vương an toàn, ba bậc Nguyên Anh */
  thienHanVuong: (number | null)[];
  /** Khí huyết (phần trăm) mất mỗi trận khi solo Độc Thiềm Hậu kỳ Kim Đan và Độc Tước Hậu kỳ Nguyên Anh */
  docThiemDanger: number;
  docTuocDanger: number;
}

/** Đo các chỉ số then chốt với đồ ô riêng bật / tắt. */
export function ownerGearMetrics(on: boolean): OwnerGearMetrics {
  return withOwnerGear(on, () => {
    const tc = simulate(TC);
    const kd = withKimDan(() => simulate(KD), true);
    const before = kd.filter((r) => r.realm === KD - 1).at(-1)!.total;
    return {
      truncoMinutes: tc.at(-1)!.total,
      kimDanHours: (kd.at(-1)!.total - before) / 60,
      nguyenAnhHours: nguyenAnhPacing().hours,
      hacGiao: REALMS[KD].tiers.map((_, t) => minSafeParty("hac_giao", KD, t)),
      thienHanVuong: REALMS[NA].tiers.map((_, t) => minSafeParty("thien_han_vuong", NA, t)),
      docThiemDanger: dangerFraction(MONSTER_BY_ID.doc_thiem, KD, 2) * 100,
      docTuocDanger: dangerFraction(MONSTER_BY_ID.doc_tuoc, NA, 2) * 100,
    };
  });
}

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);
const party = (xs: (number | null)[]) =>
  xs.map((x) => (x === null ? `>${MAX_PARTY}` : `${x}`)).join(" / ");

/** Mục 5 của "Nguyên Anh sau nội dung" trong `docs/CAN_BANG.md`. */
export function renderOwnerGearSensitivity(): string {
  const off = ownerGearMetrics(false);
  const on = ownerGearMetrics(true);
  const rows: [string, string, string][] = [
    ["Hết Trúc Cơ (phút cộng dồn; mục tiêu ~180)", n0(off.truncoMinutes), n0(on.truncoMinutes)],
    ["Riêng Kim Đan, bãi mới (giờ; mục tiêu 5-7)", n1(off.kimDanHours), n1(on.kimDanHours)],
    ["Riêng Nguyên Anh (giờ; mục tiêu 6-9)", n1(off.nguyenAnhHours), n1(on.nguyenAnhHours)],
    [
      "Đội nhỏ nhất đánh Hắc Giao an toàn (Sơ / Trung / Hậu kỳ Kim Đan)",
      party(off.hacGiao),
      party(on.hacGiao),
    ],
    [
      "Đội nhỏ nhất đánh Thiên Hàn Vương an toàn (Sơ / Trung / Hậu kỳ Nguyên Anh)",
      party(off.thienHanVuong),
      party(on.thienHanVuong),
    ],
    [
      "Khí huyết mất / trận, solo Độc Thiềm Hậu kỳ Kim Đan (%)",
      n0(off.docThiemDanger),
      n0(on.docThiemDanger),
    ],
    [
      "Khí huyết mất / trận, solo Độc Tước Hậu kỳ Nguyên Anh (%)",
      n0(off.docTuocDanger),
      n0(on.docTuocDanger),
    ],
  ];
  return `### 5. Độ nhạy với đồ ba ô riêng (\`ASSUME.useOwnerGear\`)

Mọi mục trên đo với \`useOwnerGear = false\`: người chơi chỉ mặc ba ô công khai (vũ khí, bào, phù), KHÔNG tính hài, ngọc bội, pháp bảo (M7.4; \`OWNER_EQUIP_SLOTS\`: hài thêm tốc độ + \`guard\` giảm sát thương nhận, ngọc bội thêm khí huyết / linh lực / giảm hồi chiêu). Đó là giả định BẢO THỦ (người mới chưa rèn kịp) và là lý do mọi chốt cân bằng cũ vẫn đúng; bật cờ lên làm vài ca "một người không hạ nổi trùm" lệch. Bảng dưới đo SỐNG cả hai cấu hình (mô hình, không tính chiêu / hệ / trạng thái) để thấy mức lệch trước khi quyết có chỉnh số trùm / thanh tu vi hay giữ cờ tắt:

| Chỉ số | Không đồ ô riêng (mặc định) | Có đồ ô riêng |
|---|---:|---:|
${rows.map(([k, a, b]) => `| ${k} | ${a} | ${b} |`).join("\n")}

Đọc bảng: có đồ ô riêng thì nhịp nhanh hơn ${n0(off.truncoMinutes - on.truncoMinutes)} phút (Trúc Cơ), ${n1(off.kimDanHours - on.kimDanHours)} giờ (Kim Đan), ${n1(off.nguyenAnhHours - on.nguyenAnhHours)} giờ (Nguyên Anh) và solo bớt ${n0(off.docThiemDanger - on.docThiemDanger)} / ${n0(off.docTuocDanger - on.docTuocDanger)} điểm phần trăm khí huyết: mô hình lệch NHỎ. Độ lệch nằm ở các ngưỡng cứng. **Thử bật cờ (A, 15/11/2026): 10 ca đỏ**, chia ba nhóm: (1) mô hình: nhịp Nguyên Anh xuống dưới 6 giờ, Thiên Hàn Vương Sơ kỳ đội 3 đã hạ được (test ghim đội 4), Trúc Cơ cộng dồn lệch 1 phút so với số ghim; (2) mã server thật: bí cảnh (một người hạ được trùm ở bậc 11, thêm đan thì đỡ hơn mức test ghim), \`hunt-check\` trùm theo đội (Hắc Giao, Thiên Hàn Vương); (3) \`search-check\`: thợ săn seed 2 không hạ được con nào ở Âm Sương khi tốc độ đổi (thợ săn nhạy với tốc độ, chưa phải lỗi của đồ). Vì vậy giữ cờ **TẮT** (giả định bảo thủ: người mới chưa rèn kịp hài / ngọc bội / pháp bảo); bật thì phải chỉnh cùng lúc số trùm (công / máu), dải bậc bí cảnh và ngưỡng nhịp, chưa làm vì cần số đo bot thật của C để biết người chơi thật mặc bao nhiêu đồ ô riêng ở từng bậc.
`;
}
