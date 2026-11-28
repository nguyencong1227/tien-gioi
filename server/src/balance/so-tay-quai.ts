// In Sổ tay quái và bảng rơi đồ ra docs/SO_TAY_QUAI_VA_ROI.md (hoặc stdout với --stdout, --out <đường dẫn>), theo mẫu `so-tay-chieu.ts` (#1420).
// Công cụ DỮ LIỆU thuần (KHÔNG mô phỏng): đọc dữ liệu thật ở `shared/` (`MONSTERS`, `DROP_TABLES`, `COIN_DROPS`, `ITEMS`, `MONSTER_REALM`, `LEARNABLE_SKILLS`, bản đồ) và in ba mục:
// (1) quái theo bậc rồi cấp, (2) bảng ĐẢO "vật phẩm -> rơi từ quái nào", (3) sách chiêu rơi từ đâu kèm soát luật `book-drop-realm` (kỳ vọng KHÔNG có vi phạm).
// Cùng dữ liệu => cùng byte: KHÔNG ghi giờ; test `so-tay-quai-sync.test.ts` bắt tài liệu lệch bản sinh, `so-tay-quai.test.ts` kiểm công cụ ĐỘC LẬP với tài liệu (nguồn tiêm được).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COIN_DROPS,
  DROP_TABLES,
  DUNGEON_MAPS,
  ITEMS,
  LEARNABLE_SKILLS,
  MAPS,
  MONSTERS,
  RARITY_NAMES,
  REALMS,
  bookIdOf,
  getMap,
  monsterRealmOf,
  type ItemType,
} from "@tien-gioi/shared";
import { pct } from "./so-tay-chieu";

/** Các nguồn dữ liệu (mặc định là dữ liệu thật; test truyền nguồn giả để kiểm từng nhánh mà không đụng `shared/`). */
export interface NguonQuai {
  monsters: typeof MONSTERS;
  drops: typeof DROP_TABLES;
  coin: typeof COIN_DROPS;
  items: typeof ITEMS;
  skills: typeof LEARNABLE_SKILLS;
  /** Bậc khai tường minh của quái (`MONSTER_REALM`); `undefined` = chưa khai. */
  realmOf: (monsterId: string) => number | undefined;
  /** Tên các bản đồ nơi quái sinh ra (rỗng = không sinh ở bản đồ nào, vd quái phụ do trùm triệu hồi). */
  mapsOf: (monsterId: string) => string[];
}

/** Bản đồ thường + bí cảnh, theo thứ tự khai báo (cố định => cùng byte). */
const MAP_DEFS = [...MAPS, ...DUNGEON_MAPS];

export const NGUON_QUAI_MAC_DINH: NguonQuai = {
  monsters: MONSTERS,
  drops: DROP_TABLES,
  coin: COIN_DROPS,
  items: ITEMS,
  skills: LEARNABLE_SKILLS,
  realmOf: monsterRealmOf,
  mapsOf: (monsterId) =>
    MAP_DEFS.filter((d) => (getMap(d.id)?.monsterCapOf(monsterId) ?? 0) > 0).map((d) => d.name),
};

/** Tên loại vật phẩm; `Record<ItemType, ...>` buộc thêm loại mới là phải thêm nhãn (tsc đỏ). */
const LOAI_VAT_PHAM: Readonly<Record<ItemType, string>> = {
  consumable: "Đan dược",
  material: "Nguyên liệu",
  equip: "Trang bị",
  book: "Kinh quyển",
};

/** Tên cảnh giới theo chỉ số; ngoài thang thì in "bậc <số>" (không văng lỗi khi dữ liệu sai: test bắt). */
const tenBac = (r: number | undefined): string =>
  r === undefined ? "chưa khai" : (REALMS[r]?.name ?? `bậc ${r}`);

/** Một vi phạm luật `book-drop-realm` (AGENTS.md mục Chiêu thức; `shared/src/book-drop-realm.test.ts`). */
export interface DropViolation {
  monsterId: string;
  skillId: string;
  /** `chua_khai_bac`: quái rơi sách chiêu mà chưa có dòng ở `MONSTER_REALM`; `cao_hon_bac`: chiêu đòi cảnh giới CAO HƠN bậc quái;
   *  `khong_noi_cung_bac`: chiêu độ hiếm >= 2 không có nơi rơi cùng bậc hoặc hơn đúng một bậc (`monsterId` rỗng). */
  kind: "chua_khai_bac" | "cao_hon_bac" | "khong_noi_cung_bac";
  text: string;
}

/** Mọi (quái, chiêu) có sách chiêu trong bảng rơi, theo thứ tự `drops` (cố định). */
function bookDrops(nguon: NguonQuai) {
  const skillByBook = new Map(nguon.skills.map((s) => [bookIdOf(s.id), s]));
  const out: { monsterId: string; skill: (typeof nguon.skills)[number]; chance: number }[] = [];
  for (const [monsterId, table] of Object.entries(nguon.drops))
    for (const e of table) {
      const skill = skillByBook.get(e.itemId);
      if (skill) out.push({ monsterId, skill, chance: e.chance });
    }
  return out;
}

/** Soát luật `book-drop-realm` trên nguồn đã cho (kỳ vọng rỗng với dữ liệu thật). KHÔNG sửa dữ liệu: chỉ báo. */
export function bookDropViolations(nguon: NguonQuai = NGUON_QUAI_MAC_DINH): DropViolation[] {
  const drops = bookDrops(nguon);
  const out: DropViolation[] = [];
  for (const d of drops) {
    const realm = nguon.realmOf(d.monsterId);
    if (realm === undefined)
      out.push({
        monsterId: d.monsterId,
        skillId: d.skill.id,
        kind: "chua_khai_bac",
        text: `${d.monsterId} rơi sách chiêu ${d.skill.id} nhưng chưa khai bậc ở MONSTER_REALM`,
      });
    else if (d.skill.reqRealm > realm)
      out.push({
        monsterId: d.monsterId,
        skillId: d.skill.id,
        kind: "cao_hon_bac",
        text: `${d.monsterId} (bậc ${tenBac(realm)}) rơi ${d.skill.id} đòi cảnh giới ${tenBac(d.skill.reqRealm)}`,
      });
  }
  for (const s of nguon.skills.filter((x) => x.rarity >= 2)) {
    const near = drops.some((d) => {
      const r = nguon.realmOf(d.monsterId);
      return d.skill.id === s.id && r !== undefined && r >= s.reqRealm && r <= s.reqRealm + 1;
    });
    if (!near)
      out.push({
        monsterId: "",
        skillId: s.id,
        kind: "khong_noi_cung_bac",
        text: `${s.id} (độ hiếm ${s.rarity}, đòi ${tenBac(s.reqRealm)}) chưa có quái cùng bậc hoặc hơn một bậc rơi`,
      });
  }
  return out;
}

/** Mục 1: quái theo bậc khai rồi cấp (`level`) rồi id; quái chưa khai bậc xếp cuối. */
function renderQuai(nguon: NguonQuai): string[] {
  const rows = [...nguon.monsters].sort(
    (a, b) =>
      (nguon.realmOf(a.id) ?? 99) - (nguon.realmOf(b.id) ?? 99) ||
      a.level - b.level ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const L = [
    "## Mục 1 — Quái theo bậc",
    "",
    "> Sắp theo bậc (cảnh giới khai ở `MONSTER_REALM`), rồi cấp (`level`), rồi id. **Bậc** là bậc ĐÃ KHAI của bãi quái, KHÁC cấp suy từ `level` (vd Hắc Hổ cấp 7 = Luyện Khí tầng 7 nhưng thuộc bãi Trúc Cơ). **Tu vi** là tu vi gốc khi hạ cả con (chưa nhân hệ số). **Linh thạch** = xác suất rơi × khoảng số lượng.",
    "",
    "| Quái | ID | Loại | Bậc | Cấp | Máu | Công | Tu vi | Linh thạch rơi | Xuất hiện ở |",
    "|---|---|---|---|---:|---:|---:|---:|---|---|",
  ];
  for (const m of rows) {
    const c = Object.prototype.hasOwnProperty.call(nguon.coin, m.id) ? nguon.coin[m.id] : undefined;
    const coin = c ? `${pct(c.chance)}% × ${c.min}-${c.max}` : "—";
    const maps = nguon.mapsOf(m.id);
    L.push(
      `| **${m.name}** | \`${m.id}\` | ${m.boss ? "Trùm" : "Thường"} | ${tenBac(nguon.realmOf(m.id))} | ${m.level} | ${m.hp} | ${m.atk} | ${m.exp} | ${coin} | ${maps.length > 0 ? maps.join(", ") : "—"} |`,
    );
  }
  return L;
}

/** Mục 2: bảng đảo, mỗi vật phẩm có trong bảng rơi một dòng (theo thứ tự `ITEMS`), liệt kê quái rơi theo thứ tự `MONSTERS`. */
function renderVatPham(nguon: NguonQuai): string[] {
  const monsterOrder = new Map(nguon.monsters.map((m, i) => [m.id, i]));
  const nameOf = new Map(nguon.monsters.map((m) => [m.id, m.name]));
  const by = new Map<string, { monsterId: string; chance: number }[]>();
  for (const [monsterId, table] of Object.entries(nguon.drops))
    for (const e of table) {
      const arr = by.get(e.itemId) ?? [];
      arr.push({ monsterId, chance: e.chance });
      by.set(e.itemId, arr);
    }
  const L = [
    "",
    "## Mục 2 — Vật phẩm rơi từ quái nào",
    "",
    "> Bảng đảo của `DROP_TABLES`: mỗi vật phẩm có trong bảng rơi một dòng (theo thứ tự `ITEMS`), liệt kê quái rơi kèm xác suất mỗi lần hạ.",
    "",
    "| Vật phẩm | ID | Loại | Phẩm | Rơi từ |",
    "|---|---|---|---|---|",
  ];
  for (const it of nguon.items) {
    const from = by.get(it.id);
    if (!from) continue;
    from.sort(
      (a, b) =>
        (monsterOrder.get(a.monsterId) ?? 1e9) - (monsterOrder.get(b.monsterId) ?? 1e9) ||
        (a.monsterId < b.monsterId ? -1 : 1),
    );
    L.push(
      `| **${it.name}** | \`${it.id}\` | ${LOAI_VAT_PHAM[it.type]} | ${RARITY_NAMES[it.rarity]} | ${from.map((f) => `${nameOf.get(f.monsterId) ?? f.monsterId} ${pct(f.chance)}%`).join(", ")} |`,
    );
  }
  return L;
}

/** Mục 3: sách chiêu rơi từ đâu (mỗi chiêu có sách trong bảng rơi một dòng) và danh sách vi phạm luật `book-drop-realm`. */
function renderSach(nguon: NguonQuai): string[] {
  const drops = bookDrops(nguon);
  const items = new Map(nguon.items.map((i) => [i.id, i]));
  const skills = nguon.skills
    .filter((s) => drops.some((d) => d.skill.id === s.id))
    .sort(
      (a, b) =>
        a.reqRealm - b.reqRealm ||
        a.reqTier - b.reqTier ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const nameOf = new Map(nguon.monsters.map((m) => [m.id, m.name]));
  const L = [
    "",
    "## Mục 3 — Sách chiêu rơi từ đâu, và soát luật bậc quái",
    "",
    "> Luật (`AGENTS.md`, mục Chiêu thức; `shared/src/book-drop-realm.test.ts`): sách chiêu KHÔNG được rơi từ quái bậc THẤP hơn cảnh giới yêu cầu của chiêu; chiêu độ hiếm >= 2 cần ít nhất một nơi rơi cùng bậc hoặc hơn đúng một bậc. Mỗi nơi rơi ghi `quái [bậc quái] xác suất`.",
    "",
    "| Sách | Chiêu | Cảnh giới chiêu | Phẩm | Rơi từ |",
    "|---|---|---|---|---|",
  ];
  for (const s of skills) {
    const from = drops
      .filter((d) => d.skill.id === s.id)
      .map(
        (d) =>
          `${nameOf.get(d.monsterId) ?? d.monsterId} [${tenBac(nguon.realmOf(d.monsterId))}] ${pct(d.chance)}%`,
      );
    const book = items.get(bookIdOf(s.id));
    L.push(
      `| ${book ? `**${book.name}**` : `\`${bookIdOf(s.id)}\``} | ${s.name} (\`${s.id}\`) | ${tenBac(s.reqRealm)} | ${book ? RARITY_NAMES[book.rarity] : "—"} | ${from.join("; ")} |`,
    );
  }
  const bad = bookDropViolations(nguon);
  L.push("", "### Vi phạm luật bậc quái", "");
  if (bad.length === 0)
    L.push(
      "Hiện **KHÔNG có**: mọi sách chiêu rơi từ quái đủ bậc, và mọi chiêu độ hiếm >= 2 có nơi rơi cùng bậc.",
    );
  else {
    L.push(
      "**CÓ vi phạm** (KHÔNG sửa dữ liệu rơi ở đây: mở issue `dev-a` kèm danh sách này):",
      "",
      "| Loại | Quái | Chiêu | Mô tả |",
      "|---|---|---|---|",
    );
    for (const v of bad)
      L.push(`| ${v.kind} | ${v.monsterId || "—"} | \`${v.skillId}\` | ${v.text} |`);
  }
  return L;
}

/** Toàn bộ nội dung Sổ tay quái và bảng rơi đồ (ba mục). */
export function renderSoTayQuaiMarkdown(nguon: NguonQuai = NGUON_QUAI_MAC_DINH): string {
  const L = [
    "# Sổ tay quái và bảng rơi đồ",
    "",
    "> File này **SINH TỰ ĐỘNG** từ `server/src/balance/so-tay-quai.ts`, đọc dữ liệu thật ở `shared/` (`MONSTERS`, `DROP_TABLES`, `COIN_DROPS`, `ITEMS`, `MONSTER_REALM`, bản đồ).",
    "> Sau khi sửa số liệu quái / rơi đồ / bản đồ, chạy `npm run so-tay-quai -w server` để cập nhật; test `server/src/balance/so-tay-quai-sync.test.ts` bắt tài liệu lệch bản sinh.",
    `> Trạng thái: **${nguon.monsters.length} quái**, **${Object.values(nguon.drops).reduce((n, t) => n + t.length, 0)} dòng rơi đồ**.`,
    "",
    "---",
    "",
    ...renderQuai(nguon),
    ...renderVatPham(nguon),
    ...renderSach(nguon),
    "",
  ];
  return L.join("\n");
}

function main(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const argv = process.argv;
  const outArg = argv.indexOf("--out");
  const out =
    outArg >= 0 && argv[outArg + 1]
      ? path.resolve(argv[outArg + 1])
      : path.resolve(here, "../../../docs/SO_TAY_QUAI_VA_ROI.md");
  const md = renderSoTayQuaiMarkdown();
  if (argv.includes("--stdout")) {
    console.log(md);
    return;
  }
  writeFileSync(out, md.endsWith("\n") ? md : md + "\n");
  console.log(`Đã ghi ${out} (${MONSTERS.length} quái)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
