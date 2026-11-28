// Test ĐỘC LẬP với `docs/SO_TAY_QUAI_VA_ROI.md` (không đọc tệp tài liệu): `so-tay-quai-sync.test.ts` chỉ buộc tài liệu khớp bản sinh, nên lỗi ở CÔNG CỤ (bỏ sót quái,
// mất một nguồn rơi, soát luật sai) rồi sinh lại tài liệu vẫn xanh ở đó. Ở đây mọi khẳng định tính thẳng từ dữ liệu `shared/` hoặc từ nguồn giả (xem so-tay-chieu.test.ts).
import {
  COIN_DROPS,
  DROP_TABLES,
  ITEMS,
  ITEM_BY_ID,
  LEARNABLE_SKILLS,
  MONSTERS,
  MONSTER_BY_ID,
  MONSTER_REALM,
  REALMS,
  bookIdOf,
  monsterRealmOf,
  type SkillDef,
} from "@tien-gioi/shared";
import { describe, expect, it } from "vitest";
import {
  NGUON_QUAI_MAC_DINH,
  bookDropViolations,
  renderSoTayQuaiMarkdown,
  type NguonQuai,
} from "./so-tay-quai";
import { pct } from "./so-tay-chieu";

/** Cắt tài liệu thành ba mục theo đầu mục `## Mục N`. */
function mucCuaTaiLieu(md: string): { m1: string[]; m2: string[]; m3: string[] } {
  const lines = md.split("\n");
  const at = (n: number) => lines.findIndex((l) => l.startsWith(`## Mục ${n} `));
  const [i1, i2, i3] = [at(1), at(2), at(3)];
  expect(i1).toBeGreaterThan(-1);
  expect(i2).toBeGreaterThan(i1);
  expect(i3).toBeGreaterThan(i2);
  return { m1: lines.slice(i1, i2), m2: lines.slice(i2, i3), m3: lines.slice(i3) };
}

/** Các ô của một dòng bảng Markdown (bỏ ô rỗng hai đầu). */
const cacO = (line: string): string[] =>
  line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());

/** id (cột 2, bỏ dấu huyền) -> các ô của dòng, cho các dòng bảng bắt đầu bằng `| **`. */
function dongTheoId(lines: string[]): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of lines.filter((l) => l.startsWith("| **"))) {
    const cells = cacO(line);
    const id = cells[1].replace(/`/g, "");
    expect(rows.has(id), `id ${id} xuất hiện hai lần`).toBe(false);
    rows.set(id, cells);
  }
  return rows;
}

const md = renderSoTayQuaiMarkdown();
const bacTen = (id: string) => REALMS[MONSTER_REALM[id]].name;

describe("Sổ tay quái, mục 1: đủ mọi quái, số liệu đúng dữ liệu", () => {
  const rows = dongTheoId(mucCuaTaiLieu(md).m1);

  it("có ĐÚNG MỘT dòng cho mỗi quái của MONSTERS, không thừa không thiếu; đầu tài liệu ghi đúng số quái", () => {
    expect(rows.size).toBe(MONSTERS.length);
    for (const m of MONSTERS) {
      expect(rows.has(m.id), `thiếu ${m.id}`).toBe(true);
      expect(rows.get(m.id)![0]).toBe(`**${m.name}**`);
    }
    expect(md).toContain(`**${MONSTERS.length} quái**`);
  });

  it("mỗi dòng: loại (trùm / thường), bậc khai, cấp, máu, công, tu vi khớp dữ liệu; Linh thạch rơi khớp COIN_DROPS", () => {
    for (const m of MONSTERS) {
      const c = rows.get(m.id)!; // [tên, id, loại, bậc, cấp, máu, công, tu vi, linh thạch, bản đồ]
      expect(c[2], `${m.id}: loại`).toBe(m.boss ? "Trùm" : "Thường");
      expect(c[3], `${m.id}: bậc`).toBe(bacTen(m.id));
      expect([c[4], c[5], c[6], c[7]], `${m.id}: cấp/máu/công/tu vi`).toEqual(
        [m.level, m.hp, m.atk, m.exp].map(String),
      );
      const coin = Object.prototype.hasOwnProperty.call(COIN_DROPS, m.id)
        ? COIN_DROPS[m.id]
        : undefined;
      expect(c[8], `${m.id}: Linh thạch`).toBe(
        coin ? `${pct(coin.chance)}% × ${coin.min}-${coin.max}` : "—",
      );
    }
  });

  it("sắp theo bậc khai không giảm (quái cùng bậc nhóm lại với nhau)", () => {
    const order = mucCuaTaiLieu(md)
      .m1.filter((l) => l.startsWith("| **"))
      .map((l) => cacO(l)[1].replace(/`/g, ""));
    const bac = order.map((id) => MONSTER_REALM[id]);
    expect(bac).toEqual([...bac].sort((a, b) => a - b));
  });

  it("cột 'Xuất hiện ở': quái sinh ở bản đồ nào thì có tên bản đồ; quái phụ không sinh ở đâu in '—'", () => {
    for (const m of MONSTERS) {
      const where = NGUON_QUAI_MAC_DINH.mapsOf(m.id);
      expect(rows.get(m.id)![9], m.id).toBe(where.length > 0 ? where.join(", ") : "—");
    }
    expect(rows.get("ho")![9]).toContain("Hắc Phong Cốc");
    expect(rows.get("ran_con")![9]).toBe("—");
  });

  it("quái bỏ khỏi danh sách thì mất đúng dòng đó (công cụ không tự lọc)", () => {
    const nguon: NguonQuai = {
      ...NGUON_QUAI_MAC_DINH,
      monsters: MONSTERS.filter((m) => m.id !== "ho"),
    };
    const nho = dongTheoId(mucCuaTaiLieu(renderSoTayQuaiMarkdown(nguon)).m1);
    expect(nho.has("ho")).toBe(false);
    expect(nho.size).toBe(MONSTERS.length - 1);
  });
});

describe("Sổ tay quái, mục 2: bảng đảo khớp DROP_TABLES tính độc lập", () => {
  const rows = dongTheoId(mucCuaTaiLieu(md).m2);
  const roi = new Map<string, string[]>();
  for (const [monsterId, table] of Object.entries(DROP_TABLES))
    for (const e of table) roi.set(e.itemId, [...(roi.get(e.itemId) ?? []), monsterId]);

  it("có ĐÚNG MỘT dòng cho mỗi vật phẩm xuất hiện trong DROP_TABLES, không vật phẩm nào khác", () => {
    expect(rows.size).toBe(roi.size);
    for (const id of roi.keys()) expect(rows.has(id), `thiếu ${id}`).toBe(true);
    for (const id of rows.keys())
      expect(ITEM_BY_ID[id], `${id} không phải vật phẩm có thật`).toBeDefined();
  });

  it("mỗi dòng ghi đủ MỌI quái rơi món đó kèm xác suất đúng, và không ghi quái không rơi", () => {
    for (const [itemId, monsters] of roi) {
      const cell = rows.get(itemId)![4];
      for (const mid of monsters) {
        const e = DROP_TABLES[mid].find((x) => x.itemId === itemId)!;
        expect(cell, `${itemId}: thiếu ${MONSTER_BY_ID[mid].name}`).toContain(
          `${MONSTER_BY_ID[mid].name} ${pct(e.chance)}%`,
        );
      }
      const dem = cell.split(", ").length;
      expect(dem, `${itemId}: số quái trong ô`).toBe(monsters.length);
      // so từng MỤC của ô ("Tên 12%"), không so chuỗi con: tên "Lang Vương" nằm trong "Thiên Lang Vương" / "Cốt Lang Vương"
      const muc = cell.split(", ");
      for (const m of MONSTERS.filter((x) => !monsters.includes(x.id)))
        expect(
          muc.some((e) => e.startsWith(`${m.name} `)),
          `${itemId}: ghi nhầm ${m.name}`,
        ).toBe(false);
    }
  });

  it("thứ tự dòng theo ITEMS và có đủ loại / phẩm; bỏ một dòng rơi thì món đó mất khỏi bảng", () => {
    const thuTu = mucCuaTaiLieu(md)
      .m2.filter((l) => l.startsWith("| **"))
      .map((l) => cacO(l)[1].replace(/`/g, ""));
    expect(thuTu).toEqual(ITEMS.map((i) => i.id).filter((id) => roi.has(id)));
    const dropsBo: NguonQuai["drops"] = { ...DROP_TABLES };
    delete (dropsBo as Record<string, unknown>).lang;
    const nho = dongTheoId(
      mucCuaTaiLieu(renderSoTayQuaiMarkdown({ ...NGUON_QUAI_MAC_DINH, drops: dropsBo })).m2,
    );
    // nanh sói chỉ rơi từ Hôi Lang: bỏ bảng rơi của lang thì món đó mất hẳn khỏi bảng
    expect(roi.get("nanh_soi")).toEqual(["lang"]);
    expect(nho.has("nanh_soi")).toBe(false);
    expect(nho.size).toBeLessThan(rows.size);
  });
});

describe("Sổ tay quái, mục 3: sách chiêu rơi từ đâu và soát luật bậc quái", () => {
  const m3 = mucCuaTaiLieu(md).m3;

  it("dữ liệu thật KHÔNG có vi phạm (khớp book-drop-realm.test.ts) và mục 3 nói KHÔNG có", () => {
    expect(bookDropViolations()).toEqual([]);
    expect(m3.join("\n")).toContain("KHÔNG có");
  });

  it("mỗi chiêu có sách trong bảng rơi hiện ĐÚNG MỘT dòng, kèm mọi quái rơi và bậc của quái", () => {
    const rows = new Map<string, string[]>();
    for (const l of m3.filter((x) => x.startsWith("| ") && x.includes("`"))) {
      const c = cacO(l);
      const id = c[1].match(/\(`([^`]+)`\)/)![1];
      expect(rows.has(id), `${id} hai lần`).toBe(false);
      rows.set(id, c);
    }
    const coRoi = LEARNABLE_SKILLS.filter((s) =>
      Object.values(DROP_TABLES).some((t) => t.some((e) => e.itemId === bookIdOf(s.id))),
    );
    expect(rows.size).toBe(coRoi.length);
    for (const s of coRoi) {
      const cell = rows.get(s.id)![4];
      for (const [mid, table] of Object.entries(DROP_TABLES)) {
        const e = table.find((x) => x.itemId === bookIdOf(s.id));
        if (e)
          expect(cell, `${s.id} <- ${mid}`).toContain(
            `${MONSTER_BY_ID[mid].name} [${bacTen(mid)}] ${pct(e.chance)}%`,
          );
      }
      expect(rows.get(s.id)![2], `${s.id}: cảnh giới chiêu`).toBe(REALMS[s.reqRealm].name);
    }
  });

  /** Nguồn giả: bậc quái do tay khai (không đụng MONSTER_REALM thật). */
  const nguonVoiBac = (bac: Record<string, number>): NguonQuai => ({
    ...NGUON_QUAI_MAC_DINH,
    realmOf: (id) => (Object.prototype.hasOwnProperty.call(bac, id) ? bac[id] : undefined),
  });
  const bacThat = Object.fromEntries(Object.entries(MONSTER_REALM));

  it("hạ bậc một quái xuống thấp hơn chiêu nó rơi => báo cao_hon_bac đúng quái / chiêu và hiện ở mục 3", () => {
    // Hắc Hổ khai Trúc Cơ (2) rơi chiêu Trúc Cơ (reqRealm 2): hạ xuống Luyện Khí (1) là vi phạm
    const bad = bookDropViolations(nguonVoiBac({ ...bacThat, ho: 1 }));
    const caoHon = bad.filter((v) => v.kind === "cao_hon_bac");
    expect(caoHon.length).toBeGreaterThan(0);
    expect(new Set(caoHon.map((v) => v.monsterId))).toEqual(new Set(["ho"]));
    expect(caoHon.some((v) => v.skillId === "ban_thach_ho_the")).toBe(true);
    const m3Bad = mucCuaTaiLieu(
      renderSoTayQuaiMarkdown(nguonVoiBac({ ...bacThat, ho: 1 })),
    ).m3.join("\n");
    expect(m3Bad).toContain("CÓ vi phạm");
    expect(m3Bad).toContain("cao_hon_bac");
    expect(m3Bad).toContain("ban_thach_ho_the");
    expect(m3Bad).not.toContain("KHÔNG có");
  });

  it("quái rơi sách chiêu mà chưa khai bậc => báo chua_khai_bac; chiêu hiếm không còn nơi cùng bậc => khong_noi_cung_bac", () => {
    const conLai = Object.fromEntries(Object.entries(bacThat).filter(([id]) => id !== "ho"));
    const bad = bookDropViolations(nguonVoiBac(conLai));
    expect(bad.some((v) => v.kind === "chua_khai_bac" && v.monsterId === "ho")).toBe(true);
    // đẩy MỌI quái lên Hóa Thần (5): chiêu Trúc Cơ hiếm chỉ còn nơi rơi cao hơn một bậc trở lên
    const tatCaCao = Object.fromEntries(Object.keys(bacThat).map((k) => [k, 5]));
    const xa = bookDropViolations(nguonVoiBac(tatCaCao));
    expect(xa.some((v) => v.kind === "khong_noi_cung_bac")).toBe(true);
    for (const v of xa.filter((x) => x.kind === "khong_noi_cung_bac")) expect(v.monsterId).toBe("");
  });

  it("chiêu giả rơi từ quái giả đủ bậc thì KHÔNG báo; thêm vào bảng rơi của quái thấp bậc thì báo (soát từng dòng rơi)", () => {
    const gia: SkillDef = {
      ...LEARNABLE_SKILLS[0],
      id: "chieu_gia_quai",
      name: "Chiêu Giả",
      reqRealm: 3,
      rarity: 1,
    };
    const nguon: NguonQuai = {
      ...NGUON_QUAI_MAC_DINH,
      skills: [...LEARNABLE_SKILLS, gia],
      drops: {
        ...DROP_TABLES,
        suong_ho: [
          ...DROP_TABLES.suong_ho,
          { itemId: bookIdOf(gia.id), chance: 0.1, min: 1, max: 1 },
        ],
      },
    };
    expect(bookDropViolations(nguon)).toEqual([]);
    const sai: NguonQuai = {
      ...nguon,
      drops: {
        ...DROP_TABLES,
        tho: [...DROP_TABLES.tho, { itemId: bookIdOf(gia.id), chance: 0.1, min: 1, max: 1 }],
      },
    };
    const bad = bookDropViolations(sai);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({
      monsterId: "tho",
      skillId: "chieu_gia_quai",
      kind: "cao_hon_bac",
    });
  });

  it("monsterRealmOf là nguồn mặc định của công cụ (cùng bảng với book-drop-realm)", () => {
    for (const m of MONSTERS) expect(NGUON_QUAI_MAC_DINH.realmOf(m.id)).toBe(monsterRealmOf(m.id));
  });
});

describe("Sổ tay quái: bản sinh tất định", () => {
  it("hai lần sinh cùng nội dung", () => {
    expect(renderSoTayQuaiMarkdown()).toBe(md);
  });
});
