// In Sổ tay chiêu thức ra docs/SO_TAY_CHIEU_THUC.md (hoặc stdout với --stdout, --out <đường dẫn>).
// Công cụ DỮ LIỆU thuần (KHÔNG mô phỏng): đọc dữ liệu thật ở `shared/` (`LEARNABLE_SKILLS`, `DROP_TABLES`, `SHOPS`, `MONSTER_BY_ID`, ...)
// và in ba mục — (1) bảng chiêu theo hệ, (2) ma trận độ phủ hệ × cảnh giới, (3) chiêu "mồ côi" (không có nơi nào để có được).
// "Cách có được" gom BỐN nguồn thật: cửa hàng NPC (`SHOPS`), rơi từ quái (`DROP_TABLES`), Tàng Kinh Các / Bảo khố tông môn (`SECT_SHOP`), thưởng nhiệm vụ (`QUESTS`).
// `NGUON_MAC_DINH` là dữ liệu thật; test truyền nguồn giả để kiểm từng nhánh (xem `so-tay-chieu.test.ts`, độc lập với tệp tài liệu đã commit).
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
  QUESTS,
  SECT_SHOP,
  SECT_TERMS,
  buyPrice,
  bookIdOf,
  skillGradeOf,
  SKILL_GRADE_NAMES,
  type SkillDef,
  type SkillShape,
  type StatusKind,
} from "@tien-gioi/shared";

/**
 * Cảnh giới hiển thị ở cột ma trận: LUÔN từ 0 Phàm Nhân tới 4 Nguyên Anh (bộ chiêu hiện có), và mở rộng tới `reqRealm` cao nhất của danh sách chiêu
 * (`skillViolations` cho tới bậc 9 Độ Kiếp từ #1472): thêm chiêu Hóa Thần trở lên thì cột mới tự hiện, không rơi khỏi tổng.
 */
const MATRIX_MIN_REALM = 4;
function matrixRealms(defs: readonly SkillDef[]): number[] {
  const top = defs.reduce((m, s) => Math.max(m, s.reqRealm), MATRIX_MIN_REALM);
  return Array.from({ length: Math.min(top, REALMS.length - 1) + 1 }, (_, i) => i);
}

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

/**
 * Nhãn hình đòn bằng tiếng Việt (chép từ `SHAPE_LABEL` ở `client/src/skills-panel.ts`: server không import được client). `Record<SkillShape, ...>` buộc thêm hình mới
 * là phải thêm nhãn ở đây (tsc đỏ), test `so-tay-chieu.test.ts` kiểm thêm không nhãn nào trống / trùng id.
 */
export const SHAPE_NHAN: Readonly<Record<SkillShape, string>> = {
  cone: "Quạt trước mặt",
  line: "Tia thẳng",
  fan: "Toả nhiều tia",
  nova: "Vòng nổ quanh mình",
  ground: "Vùng đặt xuống đất",
  dash: "Lao tới, né đòn",
  self: "Hộ thể quanh mình",
  chain: "Sét lan sang mục tiêu gần",
  bolt: "Đạn bay",
  zone: "Vùng duy trì",
  trap: "Bẫy",
  aura: "Hào quang quanh thân",
  totem: "Tượng triệu hồi",
};

/**
 * Cường độ (`SkillEffect.ratio`) NGHĨA THEO LOẠI trạng thái (`StatusKind`, `shared/src/skills.ts`), cùng cách nói với `effectText` ở `client/src/skills-panel.ts`.
 * `r` là số phần trăm đã định dạng ("20"); loại không dùng `ratio` (choáng, dấu) trả chuỗi cố định.
 */
const CUONG_DO: Readonly<Record<StatusKind, (r: string) => string>> = {
  dot: (r) => `${r}% sát thương gốc mỗi giây`,
  slow: (r) => `giảm tốc ${r}%`,
  vuln: (r) => `nhận thêm ${r}% sát thương`,
  shield: (r) => `chắn ${r}% khí huyết tối đa`,
  haste: (r) => `tăng tốc ${r}%`,
  regen: (r) => `hồi ${r}% khí huyết tối đa mỗi giây`,
  breakAid: (r) => `cộng ${r}% xác suất đột phá lần kế`,
  amp: (r) => `tăng ${r}% sát thương chiêu cùng hệ`,
  cdr: (r) => `giảm ${r}% hồi chiêu`,
  stun: () => "",
  empower: (r) => `tăng ${r}% sát thương mọi chiêu`,
  weaken: (r) => `gây ít hơn ${r}% sát thương, trùm chỉ chịu một nửa`,
  mark: () => "chiêu cùng hệ đánh vào sẽ ăn combo",
};

/**
 * Tóm tắt hiệu ứng trạng thái của chiêu: `Chảy máu 3s (20% sát thương gốc mỗi giây), xác suất 50%`; hiệu ứng có lợi thêm `, cho bản thân`; chiêu không hiệu ứng -> "—".
 * Xác suất chỉ in khi dưới 100%.
 */
export function effectsSummary(def: SkillDef): string {
  if (def.effects.length === 0) return "—";
  return def.effects
    .map((e) => {
      const st = STATUS_BY_ID[e.status];
      const name = st?.name ?? e.status;
      const detail = st ? CUONG_DO[st.kind](pct(e.ratio)) : "";
      const who = st && !st.harmful ? ", cho bản thân" : "";
      const chance = e.chance < 1 ? `, xác suất ${pct(e.chance)}%` : "";
      return `${name} ${secs(e.ms)}s${detail ? ` (${detail})` : ""}${who}${chance}`;
    })
    .join("; ");
}

/** Các nguồn dữ liệu của "Cách có được" (mặc định là dữ liệu thật; test truyền nguồn giả để kiểm từng nhánh mà không đụng `shared/`). */
export interface NguonCoDuoc {
  shops: typeof SHOPS;
  drops: typeof DROP_TABLES;
  sectShop: typeof SECT_SHOP;
  quests: typeof QUESTS;
}
export const NGUON_MAC_DINH: NguonCoDuoc = {
  shops: SHOPS,
  drops: DROP_TABLES,
  sectShop: SECT_SHOP,
  quests: QUESTS,
};

/**
 * Cách có được của chiêu, theo thứ tự: bán ở cửa hàng NPC (giá Linh thạch) / rơi từ quái (tỉ lệ) / đổi ở tông môn (cống hiến, cấp tông) / thưởng nhiệm vụ.
 * Trả `orphan = true` khi KHÔNG có nguồn nào — kỳ vọng rỗng (mọi chiêu cơ bản bán ở trấn, mọi chiêu cao cấp rơi từ ít nhất một quái).
 */
export function howToGet(
  def: SkillDef,
  nguon: NguonCoDuoc = NGUON_MAC_DINH,
): { text: string; orphan: boolean } {
  const bookId = bookIdOf(def.id);
  const parts: string[] = [];
  const shopNames: string[] = [];
  for (const shop of nguon.shops) {
    if (shop.itemIds.includes(bookId)) {
      const npc = NPC_BY_ID[shop.npcId];
      if (npc) shopNames.push(npc.name);
    }
  }
  if (shopNames.length > 0)
    parts.push(`Bán ở ${shopNames.join(", ")} (${buyPrice(bookId)} Linh thạch)`);
  const drops: string[] = [];
  for (const [monsterId, table] of Object.entries(nguon.drops)) {
    for (const e of table) {
      if (e.itemId === bookId) {
        const m = MONSTER_BY_ID[monsterId];
        drops.push(`${m?.name ?? monsterId} ${pct(e.chance)}%`);
      }
    }
  }
  if (drops.length > 0) parts.push(`Rơi từ ${drops.join(", ")}`);
  const sect = nguon.sectShop
    .filter((e) => e.itemId === bookId)
    .map((e) => `${SECT_TERMS[e.hall]} tông môn (${e.cost} cống hiến, từ cấp tông ${e.minLevel})`);
  if (sect.length > 0) parts.push(`Đổi ở ${sect.join(", ")}`);
  const quests = nguon.quests
    .filter((q) => q.rewards.items?.some((it) => it.itemId === bookId))
    .map((q) => `"${q.title}"`);
  if (quests.length > 0) parts.push(`Thưởng nhiệm vụ ${quests.join(", ")}`);
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
  const MATRIX_REALMS = matrixRealms(defs);
  const count: Record<string, Record<number, number>> = {};
  for (const el of ELEMENTS) count[el.id] = Object.fromEntries(MATRIX_REALMS.map((r) => [r, 0]));
  for (const s of defs) {
    if (count[s.element] && s.reqRealm in count[s.element]) count[s.element][s.reqRealm]++;
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
    "> Số chiêu của mỗi hệ ở mỗi cảnh giới yêu cầu. Ô trống (–) là hệ chưa có chiêu nào đòi cảnh giới đó — dùng để chọn lô chiêu kế tiếp.",
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
  const empty = MATRIX_REALMS.filter((r) => colTotals[r] === 0).map((r) => REALMS[r].name);
  if (empty.length > 0)
    L.push("", `> Cột ${empty.join(", ")}: chưa có chiêu nào đòi cảnh giới này.`);
  return L;
}

/** Mục 3: chiêu "mồ côi" (không có nguồn nào trong bốn nguồn của "Cách có được"). */
function renderOrphans(defs: readonly SkillDef[], nguon: NguonCoDuoc): string[] {
  const orphans = defs.filter((s) => howToGet(s, nguon).orphan);
  const L = [
    "",
    '## Mục 3 — Chiêu "mồ côi" (không bán, không rơi, không đổi ở tông môn, không là thưởng nhiệm vụ)',
    "",
  ];
  if (orphans.length === 0) {
    L.push(
      "Hiện **KHÔNG có**: mọi chiêu đều có ít nhất một nguồn (cửa hàng, quái rơi, tông môn hoặc thưởng nhiệm vụ). Thêm chiêu mà không gắn nơi có được thì dòng sẽ hiện ở đây.",
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
    "> `SHOPS`, `SECT_SHOP`, `QUESTS`, ...). Sau khi sửa số liệu chiêu / rơi đồ / cửa hàng / tông môn / nhiệm vụ, chạy `npm run so-tay-chieu -w server` để cập nhật;",
    `> test \`server/src/balance/so-tay-chieu-sync.test.ts\` bắt tài liệu lệch bản sinh. Trạng thái: **${total} chiêu** trên ${ELEMENTS.length} hệ.`,
    "",
    "---",
    "",
    "## Mục 1 — Bảng chiêu theo hệ",
    "",
    "> Mỗi chiêu một dòng: tên, id, cảnh giới yêu cầu, phẩm, hình đòn, hồi chiêu, hiệu ứng tóm tắt, và cách có được.",
    ">",
    "> - **Hiệu ứng** = tên trạng thái, thời gian, (cường độ: nghĩa ghi ngay trong ngoặc theo loại trạng thái), rồi xác suất gắn khi dưới 100%.",
    "> - **Cách có được** gồm bốn nguồn: _Bán ở_ (cửa hàng NPC, giá bằng Linh thạch), _Rơi từ_ (quái, tỉ lệ %), _Đổi ở_ (Tàng Kinh Các / Bảo khố tông môn, giá bằng cống hiến và cấp tông tối thiểu), _Thưởng nhiệm vụ_.",
    "",
  ];
}

/** Toàn bộ nội dung Sổ tay chiêu thức (ba mục). */
export function renderSoTayChieuMarkdown(
  defs: readonly SkillDef[] = LEARNABLE_SKILLS,
  nguon: NguonCoDuoc = NGUON_MAC_DINH,
): string {
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
        `| **${s.name}** | \`${s.id}\` | ${REALMS[s.reqRealm].name} | ${gradeName(s)} | ${SHAPE_NHAN[s.shape]} | ${secs(s.cooldown)}s | ${effectsSummary(s)} | ${howToGet(s, nguon).text} |`,
      );
    }
    L.push("");
  }

  L.push(...renderCoverageMatrix(defs));
  L.push(...renderOrphans(defs, nguon));
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
