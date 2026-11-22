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
//                   tệp đó vào main; khung gọi sẵn bằng `try` để không chặn nếu chưa có.
//   Các bộ kiểm chạy dưới dạng test (KHÔNG phải hàm thuần), vẫn chạy trong `npm test`, được GỌI GIÁN TIẾP ở đây:
//     - Ngôn ngữ hiển thị: `shared/src/ngon-ngu.test.ts` (CJK / khoảng trắng / NFC / "Linh thạch" / lộ id / dấu
//       câu lời thoại) và `server/scripts/no-cjk.test.ts` (CJK trong toàn mã nguồn).
//     - `check:credits` (client/scripts/check-credits.mjs) — ghi nguồn tài nguyên.
//     - Cân bằng dữ liệu: `server/src/balance/*.test.ts` (bossBalanceViolations, sectBalanceViolations,
//       ambushBalanceViolations / ambushSensitivityViolations, worldBossBalanceViolations).
//     - Độ phủ chặn đường (`ambushCoverageViolations`): KHÔNG bắt buộc từng PR (tài liệu thiết kế: hộp thoại có
//       nơi chưa dựng được chỉ là lỗ hổng nội dung, KHÔNG phải lỗi dữ liệu); dữ liệu hiện còn `lac_ha/leader` chưa
//       phủ. GIỮ trong `shared/src/ambush-data.test.ts` (chạy trong `npm test`), KHÔNG đưa vào `check:content`.
//     - Gói tài nguyên riêng: manifest KHÔNG ở trong repo (nằm ngoài ở `/mnt/data/assets-private/`, đọc từ đĩa lúc
//       chạy), nên kiểm ở server runtime (`server/src/private-packs.ts` gọi `privatePackViolations`); KHÔNG gom vào
//       đây vì không có bản manifest tĩnh để kiểm.
//   Liệt kê đầy đủ ở docs/RA_SOAT_NOI_DUNG.md.

import process from "node:process";
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
  /** Tên nhóm in ra (để biết lỗi thuộc bảng nào). */
  name: string;
  /** Tệp nguồn của hàm kiểm (in kèm lỗi). */
  file: string;
  /** Hàm kiểm; trả danh sách chuỗi lỗi (rỗng = sạch). Không được ném. */
  run: () => string[];
}

const CHECKS: readonly Check[] = [
  {
    name: "chiêu thức (LEARNABLE_SKILLS)",
    file: "shared/src/skill-violations.ts",
    run: () => skillViolations(),
  },
  { name: "trùm (BOSSES)", file: "shared/src/bosses.ts", run: () => bossViolations() },
  {
    name: "chặn đường cảnh + bầy (AMBUSH_SCENES / AMBUSH_FOES)",
    file: "shared/src/ambush-data.ts",
    run: () => ambushViolations(),
  },
  {
    name: "nhiệm vụ tông (SECT_QUESTS)",
    file: "shared/src/sect-depth.ts",
    run: () => sectQuestViolations(),
  },
  {
    name: "cửa hàng tông môn (SECT_SHOP)",
    file: "shared/src/sect-depth.ts",
    run: () => sectShopViolations(),
  },
  {
    name: "cổng giữa các bản đồ (MAPS)",
    file: "shared/src/map-checks.ts",
    run: () => portalLinkViolations(MAPS),
  },
  {
    name: "trùm thế giới (WORLD_BOSS_SCHEDULE)",
    file: "shared/src/social.ts",
    run: () => worldBossViolations(),
  },
  {
    name: "thành tựu (ACHIEVEMENTS)",
    file: "shared/src/social.ts",
    run: () => achievementViolations(),
  },
  { name: "danh hiệu (TITLES)", file: "shared/src/social.ts", run: () => titleViolations() },
];

function main(): number {
  let total = 0;
  const failed: string[] = [];
  for (const c of CHECKS) {
    let errs: string[];
    try {
      errs = c.run();
    } catch (e) {
      // Một hàm kiểm ném (vd dữ liệu sai kiểu nghiêm trọng) cũng là lỗi: báo gọn, không đổ stack.
      errs = [`hàm kiểm BỊ NÉM: ${(e as Error).message}`];
    }
    if (errs.length === 0) continue;
    total += errs.length;
    failed.push(c.name);
    console.error(`✗ ${c.name} — ${c.file} (${errs.length} lỗi):`);
    for (const line of errs) console.error(`    · ${line}`);
  }
  if (total === 0) {
    console.log(`✓ check:content: ${CHECKS.length} bộ kiểm dữ liệu cấu trúc đều sạch.`);
    return 0;
  }
  console.error(
    `\n✗ check:content: ${total} lỗi ở ${failed.length}/${CHECKS.length} bộ kiểm (${failed.join(", ")}).`,
  );
  return 1;
}

process.exit(main());
