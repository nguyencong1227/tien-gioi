// `npm run check:content` — gom MỌI bộ kiểm dữ liệu nội dung (cấu trúc) hiện có thành MỘT lệnh, báo lỗi gọn
// theo "nhóm · tệp · id" (issue #1200, QUYET_DINH_M3 mục 61.2). Chạy trước mọi PR nội dung, đỏ khi dữ liệu sai.
//
// Nguyên tắc (theo issue): KHÔNG viết lại bộ kiểm cũ, chỉ GỌI các hàm kiểm thuần đã có trong `shared/` với dữ
// liệu mặc định (bảng thật). Mỗi hàm trả danh sách chuỗi lỗi; in ra kèm tên nhóm + tệp nguồn để biết lỗi ở đâu.
//
// PHÂN LOẠI (issue #1200):
//   Phần 1 (ở đây): các hàm `*Violations` thuần trong `shared/` — kiểm cấu trúc / khung dữ liệu, gọi với bảng thật.
//   Phần 2 (sau):   kiểm CHÉO giữa các bảng (id không trùng chéo, nhiệm vụ / hội thoại / rơi / công thức / cửa
//                   hàng / bộ chiêu trùm / sách chỉ trỏ tới thực thể CÓ THẬT, vật phẩm không "mồ côi", chiêu có
//                   sách) — thêm vào đây khi có.
//   Phần 3 (sau):   kiểm THUẬT NGỮ theo từ điển (`glossary.ts` / `glossary-banned.ts` của E / G) — thêm khi hai
//                   tệp đó vào main (khi thêm, mỗi bộ kiểm là một mục CHECKS; `runChecks` đã bắt gọn hàm ném
//                   nên một phần chưa sẵn KHÔNG chặn các phần khác — KHÔNG có khung riêng cho Phần 3).
//   Các bộ kiểm KHÔNG gom vào đây (lý do kèm, xem docs/RA_SOAT_NOI_DUNG.md): chạy dưới dạng test trong `npm test`
//   (ngôn ngữ `ngon-ngu.test.ts` / `no-cjk.test.ts`, cân bằng `balance/*.test.ts`, ...), KHÔNG có bảng thật để gọi
//   (`tiledViolations`, `privatePackViolations`), hoặc KHÔNG bắt buộc từng PR (`ambushCoverageViolations`).
//   Mọi hàm `*Violations` trong `shared/src` PHẢI nằm trong CHECKS hoặc EXCLUDED_VIOLATION_FUNCS — test
//   `check-content.test.ts` quét và khẳng định điều đó (chống mục nát danh sách).
//   Liệt kê đầy đủ ở docs/RA_SOAT_NOI_DUNG.md.

import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  achievementViolations,
  ambushViolations,
  bossViolations,
  MAPS,
  portalLinkViolations,
  sectQuestViolations,
  sectShopViolations,
  skillViolations,
  titleViolations,
  worldBossViolations,
} from "@tien-gioi/shared";

interface Check {
  /** Tên hàm kiểm `*Violations` trong `shared/` — test chống mục nát đối chiếu với mọi hàm export ở shared/src. */
  func: string;
  /** Tên nhóm in ra (để biết lỗi thuộc bảng nào). */
  name: string;
  /** Tệp nguồn của hàm kiểm (in kèm lỗi). */
  file: string;
  /** Hàm kiểm; trả danh sách chuỗi lỗi (rỗng = sạch). Không được ném. */
  run: () => string[];
}

export const CHECKS: readonly Check[] = [
  {
    func: "skillViolations",
    name: "chiêu thức (LEARNABLE_SKILLS)",
    file: "shared/src/skill-violations.ts",
    run: () => skillViolations(),
  },
  {
    func: "bossViolations",
    name: "trùm (BOSSES)",
    file: "shared/src/bosses.ts",
    run: () => bossViolations(),
  },
  {
    func: "ambushViolations",
    name: "chặn đường cảnh + bầy (AMBUSH_SCENES / AMBUSH_FOES)",
    file: "shared/src/ambush-data.ts",
    run: () => ambushViolations(),
  },
  {
    func: "sectQuestViolations",
    name: "nhiệm vụ tông (SECT_QUESTS)",
    file: "shared/src/sect-depth.ts",
    run: () => sectQuestViolations(),
  },
  {
    func: "sectShopViolations",
    name: "cửa hàng tông môn (SECT_SHOP)",
    file: "shared/src/sect-depth.ts",
    run: () => sectShopViolations(),
  },
  {
    func: "portalLinkViolations",
    name: "cổng giữa các bản đồ (MAPS)",
    file: "shared/src/map-checks.ts",
    run: () => portalLinkViolations(MAPS),
  },
  {
    func: "worldBossViolations",
    name: "trùm thế giới (WORLD_BOSS_SCHEDULE)",
    file: "shared/src/social.ts",
    run: () => worldBossViolations(),
  },
  {
    func: "achievementViolations",
    name: "thành tựu (ACHIEVEMENTS)",
    file: "shared/src/social.ts",
    run: () => achievementViolations(),
  },
  {
    func: "titleViolations",
    name: "danh hiệu (TITLES)",
    file: "shared/src/social.ts",
    run: () => titleViolations(),
  },
];

/**
 * Mọi hàm `*Violations` trong `shared/src` KHÔNG gọi được trong `check:content`, kèm lý do. Test
 * `check-content.test.ts` quét `export function \w+Violations` ở `shared/src/*.ts` (trừ `*.test.ts`) và khẳng
 * định mỗi tên hoặc ở `CHECKS` hoặc ở đây — để hàm kiểm mới của D / E / G KHÔNG lọt khỏi `check:content` mà không ai biết.
 */
export const EXCLUDED_VIOLATION_FUNCS: ReadonlyArray<{ func: string; why: string }> = [
  {
    func: "ambushCoverageViolations",
    why: "độ phủ chặn đường KHÔNG bắt buộc từng PR (hộp thoại chưa dựng được là lỗ hổng nội dung, KHÔNG phải lỗi dữ liệu); dữ liệu hiện còn lac_ha/leader chưa phủ; giữ trong shared/src/ambush-data.test.ts",
  },
  {
    func: "privatePackViolations",
    why: "manifest gói tài nguyên riêng KHÔNG ở trong repo (ở /mnt/data/assets-private/, đọc từ đĩa lúc chạy); kiểm ở server runtime server/src/private-packs.ts, không có bản manifest tĩnh để gọi",
  },
  {
    func: "tiledViolations",
    why: "nhận JSON Tiled thô (json: unknown), KHÔNG có bảng dữ liệu game thật để gọi; kiểm tệp Tiled ở server/scripts/map-build.ts + map-check.ts (lát cắt S2) và shared/src/tiled.ts",
  },
];

export interface CheckResult {
  /** Mã thoát: 0 = sạch, 1 = có lỗi. */
  code: number;
  /** Các dòng đã in (để test khẳng định đúng nhóm / tệp / id được báo). */
  lines: string[];
}

/**
 * Chạy mọi bộ kiểm trong `CHECKS`, thu kết quả. THUẦN (KHÔNG in, KHÔNG `process.exit`) để test mã thoát + dòng báo.
 * Một hàm kiểm ném (dữ liệu sai kiểu nghiêm trọng) cũng là lỗi: báo gọn, không đổ stack.
 */
export function runChecks(checks: readonly Check[] = CHECKS): CheckResult {
  const lines: string[] = [];
  let total = 0;
  const failed: string[] = [];
  for (const c of checks) {
    let errs: string[];
    try {
      errs = c.run();
    } catch (e) {
      errs = [`hàm kiểm BỊ NÉM: ${(e as Error).message}`];
    }
    if (errs.length === 0) continue;
    total += errs.length;
    failed.push(c.name);
    lines.push(`✗ ${c.name} — ${c.file} (${errs.length} lỗi):`);
    for (const line of errs) lines.push(`    · ${line}`);
  }
  if (total === 0) {
    lines.push(`✓ check:content: ${checks.length} bộ kiểm dữ liệu cấu trúc đều sạch.`);
    return { code: 0, lines };
  }
  lines.push(
    `\n✗ check:content: ${total} lỗi ở ${failed.length}/${checks.length} bộ kiểm (${failed.join(", ")}).`,
  );
  return { code: 1, lines };
}

function main(): number {
  const { code, lines } = runChecks();
  for (const line of lines) (code === 0 ? console.log : console.error)(line);
  return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
