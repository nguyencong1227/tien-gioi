// In Sổ tay chiêu thức ra docs/SO_TAY_CHIEU_THUC.md (hoặc stdout với --stdout, --out <đường dẫn>).
// Công cụ DỮ LIỆU thuần (KHÔNG mô phỏng): đọc dữ liệu thật ở `shared/` (`LEARNABLE_SKILLS`, `DROP_TABLES`, `SHOPS`, `MONSTER_BY_ID`, ...)
// và in ba mục — (1) bảng chiêu theo hệ, (2) ma trận độ phủ hệ × cảnh giới, (3) chiêu "mồ côi" (không bán, không rơi).
// Cùng dữ liệu => cùng byte: KHÔNG ghi giờ, sắp xếp chiêu theo (reqRealm, reqTier, id); test `so-tay-chieu-sync.test.ts` bắt tài liệu lệch bản sinh.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEARNABLE_SKILLS,
  ELEMENTS,
  REALMS,
  STATUS_BY_ID,
  MONSTER_BY_ID,
  SHOPS,
  NPCS,
  DROP_TABLES,
  buyPrice,
  bookIdOf,
  skillGradeOf,
  SKILL_GRADE_NAMES,
  type SkillDef,
} from "@tien-gioi/shared";

/** Cảnh giới hiển thị ở cột ma trận: 0 Phàm Nhân .. 4 Nguyên Anh (`skillViolations` chặn reqRealm > 4). */
const MATRIX_REALMS = [0, 1, 2, 3, 4] as const;

const NPC_BY_ID = Object.fromEntries(NPCS.map((n) => [n.id, n]));

/** Số phần trăm từ tỉ lệ (0,12 -> "12"; 0,006 -> "0,6"; 0,0035 -> "0,35"): bỏ số không đuôi, dấu phẩy theo tiếng Việt. */
function pct(n: number): string {
  const v = Math.round(n * 100_000) / 1000;
  return String(v).replace(".", ",");
}

/** Số giây từ ms, bỏ số không đuôi (2000 -> "2"; 750 -> "0,75"). */
function secs(ms: number): string {
  const s = ms / 1000;
  return String(Math.round(s * 100) / 100).replace(".", ",");
}

/** Tên phẩm cấp chiêu (`SKILL_GRADE_NAMES`), dùng `grade` nếu có rồi suy theo `rarity` qua `skillGradeOf`. */
function gradeName(def: SkillDef): string {
  return SKILL_GRADE_NAMES[skillGradeOf(def)];
}

/** Tóm tắt hiệu ứng trạng thái của chiêu: "Bỏng 2s 12% (40%)"; chiêu không hiệu ứng -> "—". */
function effectsSummary(def: SkillDef): string {
  if (def.effects.length === 0) return "—";
  return def.effects
    .map((e) => {
      const st = STATUS_BY_ID[e.status];
      const name = st?.name ?? e.status;
      const ratio = e.ratio !== 0 ? ` ${pct(e.ratio)}` : "";
      const chance = e.chance < 1 ? ` (${pct(e.chance)})` : "";
      return `${name} ${secs(e.ms)}s${ratio}${chance}`;
    })
    .join("; ");
}

/**
 * Cách có được của chiêu: bán ở cửa hàng nào (giá) và / hoặc rơi từ quái nào (tỉ lệ). Trả `orphan = true` khi KHÔNG bán và KHÔNG rơi —
 * kỳ vọng rỗng (mọi chiêu cơ bản bán ở trấn, mọi chiêu cao cấp rơi từ ít nhất một quái).
 */
function howToGet(def: SkillDef): { text: string; orphan: boolean } {
  const bookId = bookIdOf(def.id);
  const parts: string[] = [];
  const shopNames: string[] = [];
  for (const shop of SHOPS) {
    if (shop.itemIds.includes(bookId)) {
      const npc = NPC_BY_ID[shop.npcId];
      if (npc) shopNames.push(npc.name);
    }
  }
  if (shopNames.length > 0) parts.push(`Bán ở ${shopNames.join(", ")} (${buyPrice(bookId)} LT)`);
  const drops: string[] = [];
  for (const [monsterId, table] of Object.entries(DROP_TABLES)) {
    for (const e of table) {
      if (e.itemId === bookId) {
        const m = MONSTER_BY_ID[monsterId];
        drops.push(`${m?.name ?? monsterId} ${pct(e.chance)}%`);
      }
    }
  }
  if (drops.length > 0) parts.push(`Rơi từ ${drops.join(", ")}`);
  return { text: parts.length > 0 ? parts.join("; ") : "—", orphan: parts.length === 0 };
}

/** Sắp xếp chiêu trong một hệ theo cảnh giới yêu cầu rồi id (đồng nhất => cùng byte). */
function byRealmThenId(a: SkillDef, b: SkillDef): number {
  return (
    a.reqRealm - b.reqRealm || a.reqTier - b.reqTier || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Mục 2: ma trận độ phủ hệ × cảnh giới (số chiêu mỗi ô; ô trống in "–") + tổng hàng / cột. */
function renderCoverageMatrix(defs: readonly SkillDef[]): string[] {
  const count: Record<string, Record<number, number>> = {};
  for (const el of ELEMENTS) count[el.id] = Object.fromEntries(MATRIX_REALMS.map((r) => [r, 0]));
  for (const s of defs) {
    if (count[s.element]) count[s.element][s.reqRealm] = count[s.element][s.reqRealm] + 1;
  }
  const colTotals = MATRIX_REALMS.map(() => 0);
  let grand = 0;
  for (const el of ELEMENTS)
    for (const r of MATRIX_REALMS) {
      colTotals[r] += count[el.id][r];
      grand += count[el.id][r];
    }
  const cell = (n: number) => (n > 0 ? ` ${n} |` : " – |");
  const L = [
    "",
    "## Mục 2 — Ma trận độ phủ: hệ × cảnh giới",
    "",
    "> Số chiêu của mỗi hệ ở mỗi cảnh giới yêu cầu (`reqRealm`). Ô trống (–) là hệ chưa có chiêu nào đòi cảnh giới đó — dùng để chọn lô chiêu kế tiếp.",
    "",
    `| Hệ \\ Cảnh giới |${MATRIX_REALMS.map((r) => ` ${REALMS[r].name} |`).join("")} Tổng |`,
    "|---" + MATRIX_REALMS.map(() => "|---:").join("") + "|---:|",
  ];
  for (const el of ELEMENTS) {
    const cells = MATRIX_REALMS.map((r) => cell(count[el.id][r]));
    const total = MATRIX_REALMS.reduce<number>((s, r) => s + count[el.id][r], 0);
    L.push(`| ${el.name} |${cells.join("")} ${total} |`);
  }
  L.push(`| **Tổng** |${colTotals.map((n) => ` ${n} |`).join("")} ${grand} |`);
  return L;
}

/** Mục 3: chiêu "mồ côi" (không bán, không rơi từ quái nào). */
function renderOrphans(defs: readonly SkillDef[]): string[] {
  const orphans = defs.filter((s) => howToGet(s).orphan);
  const L = ["", '## Mục 3 — Chiêu "mồ côi" (không bán, không rơi từ quái nào)', ""];
  if (orphans.length === 0) {
    L.push(
      "Hiện **KHÔNG có**: mọi chiêu đều bán ở cửa hàng (độ hiếm <= 1) hoặc rơi từ ít nhất một quái. Thêm chiêu mà không gắn nơi có được thì dòng sẽ hiện ở đây.",
    );
    return L;
  }
  L.push("| Chiêu | ID | Hệ | Cảnh giới |", "|---|---|---|---|");
  for (const s of orphans)
    L.push(`| **${s.name}** | \`${s.id}\` | ${s.element} | ${REALMS[s.reqRealm].name} |`);
  return L;
}

/** Dòng trạng thái + phần mở đầu của tài liệu (số chiêu / hệ). */
function renderIntro(total: number): string[] {
  return [
    "# Sổ tay chiêu thức",
    "",
    "> File này **SINH TỰ ĐỘNG** từ `server/src/balance/so-tay-chieu.ts`, đọc dữ liệu thật ở `shared/` (`LEARNABLE_SKILLS`, `DROP_TABLES`,",
    "> `SHOPS`, `MONSTER_BY_ID`, ...). Sau khi sửa số liệu chiêu / rơi đồ / cửa hàng, chạy `npm run so-tay-chieu -w server` để cập nhật;",
    `> test \`server/src/balance/so-tay-chieu-sync.test.ts\` bắt tài liệu lệch bản sinh. Trạng thái: **${total} chiêu** trên ${ELEMENTS.length} hệ.`,
    "",
    "---",
    "",
    "## Mục 1 — Bảng chiêu theo hệ",
    "",
    "> Mỗi chiêu một dòng: tên, id, cảnh giới yêu cầu (`reqRealm`), phẩm, hình, hồi chiêu, hiệu ứng tóm tắt, và cách có được (bán ở cửa hàng / rơi từ quái).",
    "",
  ];
}

/** Toàn bộ nội dung Sổ tay chiêu thức (ba mục). */
export function renderSoTayChieuMarkdown(defs: readonly SkillDef[] = LEARNABLE_SKILLS): string {
  const byElement: Record<string, SkillDef[]> = {};
  for (const el of ELEMENTS) byElement[el.id] = [];
  for (const s of defs) if (byElement[s.element]) byElement[s.element].push(s);
  for (const arr of Object.values(byElement)) arr.sort(byRealmThenId);

  const L = renderIntro(defs.length);
  for (const el of ELEMENTS) {
    const rows = byElement[el.id];
    L.push(`### ${el.name} (${rows.length} chiêu)`, "");
    if (rows.length === 0) {
      L.push("_Chưa có chiêu hệ này._", "");
      continue;
    }
    L.push(
      "| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |",
      "|---|---|---|---|---|---|---|---|",
    );
    for (const s of rows) {
      L.push(
        `| **${s.name}** | \`${s.id}\` | ${REALMS[s.reqRealm].name} | ${gradeName(s)} | ${s.shape} | ${secs(s.cooldown)}s | ${effectsSummary(s)} | ${howToGet(s).text} |`,
      );
    }
    L.push("");
  }

  L.push(...renderCoverageMatrix(defs));
  L.push(...renderOrphans(defs));
  L.push("");
  return L.join("\n");
}

function main(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const argv = process.argv;
  const outArg = argv.indexOf("--out");
  const out =
    outArg >= 0 && argv[outArg + 1]
      ? path.resolve(argv[outArg + 1])
      : path.resolve(here, "../../../docs/SO_TAY_CHIEU_THUC.md");
  const md = renderSoTayChieuMarkdown();
  if (argv.includes("--stdout")) {
    console.log(md);
    return;
  }
  writeFileSync(out, md.endsWith("\n") ? md : md + "\n");
  console.log(`Đã ghi ${out} (${LEARNABLE_SKILLS.length} chiêu)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
