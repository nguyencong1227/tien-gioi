// Hệ số tu vi THỬ NGHIỆM cho nhân vật chỉ định (QUYET_DINH_M3 mục 34, người dùng yêu cầu để chính họ test game).
//
// Biến môi trường `TEST_EXP_MULT`: `đạo_hiệu:hệ_số`, nhiều mục cách nhau dấu phẩy, vd `Han:5` hoặc `Han:5,Linh Nhi:2`.
// Mặc định rỗng = TẮT (không ai được nhân). Khớp đạo hiệu KHÔNG phân biệt hoa thường (cùng chuẩn hoá với khoá chân linh, `soulIdOf`);
// hệ số là SỐ NGUYÊN từ 1 đến 10. Mục sai (thiếu `:`, tên rỗng, hệ số không phải số nguyên 1-10) bị bỏ KÈM cảnh báo lúc khởi động,
// không bao giờ đoán / kẹp lặng lẽ (gõ nhầm `Han:50` không được thành x10 ngầm).
//
// Chỉ nhân TU VI (`gainExp`, sau mọi hệ số khác); không đổi rơi đồ, Linh thạch, sát thương. Đổi cấu hình phải khởi động lại máy chủ
// (docs/VAN_HANH.md mục 11). Minh bạch: audit `test.exp_mult` mỗi lần nhân vật vào phòng, cảnh báo khởi động liệt kê ai đang được nhân,
// và nhãn "Thử nghiệm ×N" ở client của chính người đó (`Player.testExpMult`, chỉ chủ nhận).
import { soulIdOf } from "./soul";

/** Hệ số nhỏ nhất / lớn nhất cho phép (1 = không đổi gì). */
export const TEST_EXP_MULT_MIN = 1;
export const TEST_EXP_MULT_MAX = 10;

export interface TestExpMult {
  /** Đạo hiệu chuẩn hoá (`soulIdOf`) -> hệ số nguyên 1-10. Rỗng khi tắt. */
  value: ReadonlyMap<string, number>;
  /** Đạo hiệu như người vận hành gõ (để in log): cùng thứ tự với `value`. */
  names: ReadonlyMap<string, string>;
  /** Cảnh báo: mục bị bỏ vì sai cú pháp, và (khi có mục hợp lệ) dòng báo đang bật. In lúc khởi động (`startup.ts`). */
  warnings: string[];
}

/** Đọc `TEST_EXP_MULT` từ môi trường (thuần hàm, test được). */
export function testExpMultOf(env: NodeJS.ProcessEnv): TestExpMult {
  const value = new Map<string, number>();
  const names = new Map<string, string>();
  const warnings: string[] = [];
  const raw = env.TEST_EXP_MULT;
  if (raw === undefined || raw.trim() === "") return { value, names, warnings };
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (entry === "") continue;
    const colon = entry.lastIndexOf(":");
    const name = colon < 0 ? "" : entry.slice(0, colon).trim();
    const text = colon < 0 ? "" : entry.slice(colon + 1).trim();
    if (name === "" || !/^\d{1,3}$/.test(text)) {
      warnings.push(
        `TEST_EXP_MULT: bỏ mục '${entry}' (cần dạng đạo_hiệu:hệ_số, hệ số nguyên ${TEST_EXP_MULT_MIN}-${TEST_EXP_MULT_MAX}, vd Han:5).`,
      );
      continue;
    }
    const n = Number(text);
    if (n < TEST_EXP_MULT_MIN || n > TEST_EXP_MULT_MAX) {
      warnings.push(
        `TEST_EXP_MULT: bỏ mục '${entry}' (hệ số ${n} ngoài khoảng ${TEST_EXP_MULT_MIN}-${TEST_EXP_MULT_MAX}).`,
      );
      continue;
    }
    const key = soulIdOf(name);
    if (value.has(key)) {
      warnings.push(`TEST_EXP_MULT: '${name}' xuất hiện nhiều lần, lấy mục SAU CÙNG (${n}).`);
    }
    value.set(key, n);
    names.set(key, name);
  }
  const active = [...value].filter(([, n]) => n > 1).map(([k, n]) => `${names.get(k)} x${n}`);
  if (active.length > 0) {
    warnings.push(
      `TEST_EXP_MULT đang BẬT (chỉ để thử nghiệm): nhân tu vi của ${active.join(", ")}. Gỡ biến này rồi khởi động lại để tắt (docs/VAN_HANH.md mục 11).`,
    );
  }
  return { value, names, warnings };
}

/** Hệ số của một đạo hiệu (1 nếu không có trong cấu hình). `name` được chuẩn hoá như khoá cấu hình. */
export function testExpMultFor(map: ReadonlyMap<string, number>, name: string): number {
  return map.get(soulIdOf(name)) ?? 1;
}
