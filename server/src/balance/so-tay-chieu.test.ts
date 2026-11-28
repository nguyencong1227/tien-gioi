// Test ĐỘC LẬP với `docs/SO_TAY_CHIEU_THUC.md` (không đọc tệp tài liệu): `so-tay-chieu-sync.test.ts` chỉ buộc tài liệu khớp bản sinh, nên một lỗi ở CÔNG CỤ
// (bỏ sót chiêu, mất một nguồn "Cách có được") rồi sinh lại tài liệu vẫn xanh ở đó. Ở đây mọi khẳng định tính thẳng từ dữ liệu `shared/` hoặc từ nguồn giả.
import {
  DROP_TABLES,
  LEARNABLE_SKILLS,
  MONSTER_BY_ID,
  QUESTS,
  SECT_SHOP,
  SHOPS,
  SKILL_SHAPES,
  STATUSES,
  bookIdOf,
  buyPrice,
  type SkillDef,
} from "@tien-gioi/shared";
import { describe, expect, it } from "vitest";
import {
  NGUON_MAC_DINH,
  SHAPE_NHAN,
  effectsSummary,
  howToGet,
  renderSoTayChieuMarkdown,
  type NguonCoDuoc,
} from "./so-tay-chieu";

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

/** Id chiêu -> các ô của dòng của nó ở mục 1 (dòng chiêu bắt đầu bằng `| **`). */
function dongChieuMuc1(md: string): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of mucCuaTaiLieu(md).m1.filter((l) => l.startsWith("| **"))) {
    const cells = cacO(line);
    const id = cells[1].replace(/`/g, "");
    expect(rows.has(id), `id ${id} xuất hiện hai lần ở mục 1`).toBe(false);
    rows.set(id, cells);
  }
  return rows;
}

/** Bản sao một chiêu thật với id / tên mới (chiêu GIẢ không có sách ở bất kỳ nguồn thật nào). */
const chieuGia = (id: string, name: string): SkillDef => ({ ...LEARNABLE_SKILLS[0], id, name });

const NGUON_RONG: NguonCoDuoc = { shops: [], drops: {}, sectShop: [], quests: [] };

describe("Sổ tay chiêu thức: đủ mọi chiêu (không đọc tài liệu đã commit)", () => {
  const md = renderSoTayChieuMarkdown();

  it("mục 1 có ĐÚNG MỘT dòng cho mỗi chiêu của LEARNABLE_SKILLS, không thừa không thiếu", () => {
    const rows = dongChieuMuc1(md);
    expect(rows.size).toBe(LEARNABLE_SKILLS.length);
    for (const s of LEARNABLE_SKILLS) {
      expect(rows.has(s.id), `thiếu ${s.id} ở mục 1`).toBe(true);
      expect(rows.get(s.id)![0]).toBe(`**${s.name}**`);
    }
  });

  it("ma trận mục 2: ô cuối của hàng Tổng = số chiêu; tổng từng hệ khớp số chiêu thật của hệ", () => {
    const { m2 } = mucCuaTaiLieu(md);
    const tong = m2.find((l) => l.startsWith("| **Tổng**"))!;
    const cells = cacO(tong);
    expect(Number(cells[cells.length - 1])).toBe(LEARNABLE_SKILLS.length);
    // các cột cảnh giới cộng lại cũng đúng bằng tổng
    const theoCot = cells.slice(1, -1).reduce((s, c) => s + Number(c), 0);
    expect(theoCot).toBe(LEARNABLE_SKILLS.length);
    // mỗi hàng hệ: tổng cuối hàng = số chiêu thật của hệ đó
    const rows = m2.filter(
      (l) => l.startsWith("| ") && !l.startsWith("| **") && !l.startsWith("| Hệ"),
    );
    expect(rows.length).toBeGreaterThan(0);
    let cong = 0;
    for (const r of rows) {
      const c = cacO(r);
      cong += Number(c[c.length - 1]);
    }
    expect(cong).toBe(LEARNABLE_SKILLS.length);
  });

  it("dòng trạng thái ở đầu ghi đúng số chiêu; bản sinh tất định (hai lần cùng nội dung)", () => {
    expect(md).toContain(`**${LEARNABLE_SKILLS.length} chiêu**`);
    expect(renderSoTayChieuMarkdown()).toBe(md);
  });

  it("danh sách rút gọn: bỏ chiêu nào là mất đúng dòng đó và số chiêu ở đầu đổi theo (công cụ không tự lọc)", () => {
    const bot = LEARNABLE_SKILLS.filter((s) => s.id !== "ung_trao");
    const nho = renderSoTayChieuMarkdown(bot);
    expect(dongChieuMuc1(nho).has("ung_trao")).toBe(false);
    expect(dongChieuMuc1(nho).size).toBe(LEARNABLE_SKILLS.length - 1);
    expect(nho).toContain(`**${LEARNABLE_SKILLS.length - 1} chiêu**`);
  });
});

describe("Sổ tay chiêu thức: ma trận mở rộng theo cảnh giới cao nhất (B ở #1550)", () => {
  /** Hàng tiêu đề và hàng Tổng của ma trận mục 2. */
  const matran = (md: string) => {
    const m2 = mucCuaTaiLieu(md).m2;
    return {
      dau: cacO(m2.find((l) => l.startsWith("| Hệ"))!),
      tong: cacO(m2.find((l) => l.startsWith("| **Tổng**"))!),
      chuThich: m2.filter((l) => l.startsWith("> Cột")).join("\n"),
    };
  };

  it("dữ liệu hiện có (tới Nguyên Anh): đúng năm cột cảnh giới, như trước", () => {
    const { dau } = matran(renderSoTayChieuMarkdown());
    expect(dau.slice(1, -1)).toEqual([
      "Phàm Nhân",
      "Luyện Khí",
      "Trúc Cơ",
      "Kim Đan",
      "Nguyên Anh",
    ]);
  });

  it("chiêu Hóa Thần (reqRealm 5) và Độ Kiếp (9) hiện thành cột riêng, vào tổng, không ra NaN", () => {
    const hoaThan: SkillDef = {
      ...chieuGia("chieu_gia_hoa_than", "Chiêu Giả Hóa Thần"),
      reqRealm: 5,
    };
    const doKiep: SkillDef = { ...chieuGia("chieu_gia_do_kiep", "Chiêu Giả Độ Kiếp"), reqRealm: 9 };
    const md = renderSoTayChieuMarkdown([...LEARNABLE_SKILLS, hoaThan, doKiep], NGUON_RONG);
    expect(md).not.toContain("NaN");
    const { dau, tong, chuThich } = matran(md);
    expect(dau.slice(1, -1)).toHaveLength(10); // Phàm Nhân .. Độ Kiếp
    expect(dau).toContain("Hóa Thần");
    expect(dau).toContain("Độ Kiếp");
    const cot = (ten: string) => Number(tong[dau.indexOf(ten)]);
    expect(cot("Hóa Thần")).toBe(1);
    expect(cot("Độ Kiếp")).toBe(1);
    expect(Number(tong[tong.length - 1])).toBe(LEARNABLE_SKILLS.length + 2);
    // cột trống (Luyện Hư, Hợp Thể, Đại Thừa) nằm ở dòng chú thích gộp, cột có chiêu thì không
    expect(chuThich).toContain("Luyện Hư");
    expect(chuThich).not.toContain("Hóa Thần");
  });
});

describe("Sổ tay chiêu thức: Cách có được khớp bốn nguồn tính độc lập từ dữ liệu", () => {
  const rows = dongChieuMuc1(renderSoTayChieuMarkdown());
  const oCoDuoc = (id: string): string => {
    const c = rows.get(id)!;
    return c[c.length - 1];
  };

  it("mỗi chiêu: có 'Bán ở' / 'Rơi từ' / 'Đổi ở' / 'Thưởng nhiệm vụ' khi và chỉ khi nguồn tương ứng có sách của nó", () => {
    const dem = { shop: 0, drop: 0, sect: 0, quest: 0 };
    for (const s of LEARNABLE_SKILLS) {
      const book = bookIdOf(s.id);
      const o = oCoDuoc(s.id);
      const shop = SHOPS.some((sh) => sh.itemIds.includes(book));
      const rot = Object.entries(DROP_TABLES).filter(([, t]) => t.some((e) => e.itemId === book));
      const tong = SECT_SHOP.filter((e) => e.itemId === book);
      const nv = QUESTS.filter((q) => q.rewards.items?.some((it) => it.itemId === book));
      expect(o.includes("Bán ở "), `${s.id}: Bán ở`).toBe(shop);
      expect(o.includes("Rơi từ "), `${s.id}: Rơi từ`).toBe(rot.length > 0);
      expect(o.includes("Đổi ở "), `${s.id}: Đổi ở`).toBe(tong.length > 0);
      expect(o.includes("Thưởng nhiệm vụ "), `${s.id}: Thưởng nhiệm vụ`).toBe(nv.length > 0);
      if (shop) expect(o).toContain(`(${buyPrice(book)} Linh thạch)`);
      for (const [monsterId] of rot) expect(o).toContain(MONSTER_BY_ID[monsterId].name);
      for (const e of tong) expect(o).toContain(`${e.cost} cống hiến, từ cấp tông ${e.minLevel}`);
      for (const q of nv) expect(o).toContain(`"${q.title}"`);
      // không nguồn nào <=> dòng ghi "—" (mồ côi)
      expect(o === "—", `${s.id}: "—" chỉ khi mồ côi`).toBe(
        !shop && rot.length === 0 && tong.length === 0 && nv.length === 0,
      );
      dem.shop += shop ? 1 : 0;
      dem.drop += rot.length > 0 ? 1 : 0;
      dem.sect += tong.length > 0 ? 1 : 0;
      dem.quest += nv.length > 0 ? 1 : 0;
    }
    // chống rỗng: dữ liệu thật phải có chiêu ở cả bốn nguồn, không thì vòng trên không kiểm gì
    expect(dem.shop).toBeGreaterThan(0);
    expect(dem.drop).toBeGreaterThan(0);
    expect(dem.sect).toBeGreaterThan(0);
    expect(dem.quest).toBeGreaterThan(0);
  });

  it("hai ca rõ ràng: chiêu bán ở cửa hàng ghi giá Linh thạch; chiêu chỉ rơi từ quái ghi tỉ lệ %", () => {
    const ban = howToGet(LEARNABLE_SKILLS.find((s) => s.id === "ung_trao")!);
    expect(ban.orphan).toBe(false);
    expect(ban.text).toMatch(/^Bán ở .+ \(\d+ Linh thạch\)/);
    const roi = howToGet(LEARNABLE_SKILLS.find((s) => s.id === "thanh_van_kiem_khi")!);
    expect(roi.orphan).toBe(false);
    expect(roi.text).toMatch(/Rơi từ .+ \d+(,\d+)?%/);
    expect(roi.text).not.toContain("Bán ở");
  });

  it("chiêu chỉ có ở tông môn hoặc chỉ là thưởng nhiệm vụ KHÔNG bị báo mồ côi (nguồn giả)", () => {
    const tongMon = chieuGia("chieu_chi_o_tong", "Chiêu Chỉ Ở Tông");
    const nhiemVu = chieuGia("chieu_chi_qua_nv", "Chiêu Chỉ Qua Nhiệm Vụ");
    const nguon: NguonCoDuoc = {
      shops: [],
      drops: {},
      sectShop: [
        { itemId: bookIdOf(tongMon.id), cost: 77, minLevel: 3, limitDay: 1, hall: "tangKinh" },
      ],
      quests: [
        {
          ...QUESTS[0],
          title: "Nhiệm Vụ Giả",
          rewards: { items: [{ itemId: bookIdOf(nhiemVu.id), qty: 1 }] },
        },
      ],
    };
    const t = howToGet(tongMon, nguon);
    expect(t.orphan).toBe(false);
    expect(t.text).toBe("Đổi ở Tàng Kinh Các tông môn (77 cống hiến, từ cấp tông 3)");
    const n = howToGet(nhiemVu, nguon);
    expect(n.orphan).toBe(false);
    expect(n.text).toBe('Thưởng nhiệm vụ "Nhiệm Vụ Giả"');
    const md = renderSoTayChieuMarkdown([tongMon, nhiemVu], nguon);
    expect(mucCuaTaiLieu(md).m3.join("\n")).toContain("KHÔNG có");
  });
});

describe("Sổ tay chiêu thức: mục 3 THẬT SỰ bắt chiêu mồ côi", () => {
  it("chiêu giả không có sách ở nguồn nào hiện ở mục 3 (mục 3 của dữ liệu thật rỗng nên nhánh này cần ca giả)", () => {
    const moCoi = chieuGia("chieu_gia_mo_coi", "Chiêu Giả Mồ Côi");
    const md = renderSoTayChieuMarkdown([...LEARNABLE_SKILLS.slice(0, 3), moCoi]);
    const m3 = mucCuaTaiLieu(md).m3.join("\n");
    expect(m3).toContain("**Chiêu Giả Mồ Côi**");
    expect(m3).toContain("`chieu_gia_mo_coi`");
    expect(m3).not.toContain("KHÔNG có");
    // ba chiêu thật còn lại không bị báo oan
    for (const s of LEARNABLE_SKILLS.slice(0, 3)) expect(m3).not.toContain(`\`${s.id}\``);
    expect(howToGet(moCoi)).toEqual({ text: "—", orphan: true });
  });

  it("bỏ hết nguồn thì MỌI chiêu đều mồ côi; bỏ riêng một nguồn thì chiêu mồ côi đúng khi không còn nguồn nào khác", () => {
    const md = renderSoTayChieuMarkdown(LEARNABLE_SKILLS, NGUON_RONG);
    const m3 = mucCuaTaiLieu(md).m3.filter((l) => l.startsWith("| **"));
    expect(m3.length).toBe(LEARNABLE_SKILLS.length);
    // có sách ở từng nguồn, tính thẳng từ dữ liệu (không qua công cụ)
    const coSach = (s: SkillDef): Record<keyof NguonCoDuoc, boolean> => {
      const book = bookIdOf(s.id);
      return {
        shops: SHOPS.some((sh) => sh.itemIds.includes(book)),
        drops: Object.values(DROP_TABLES).some((t) => t.some((e) => e.itemId === book)),
        sectShop: SECT_SHOP.some((e) => e.itemId === book),
        quests: QUESTS.some((q) => q.rewards.items?.some((it) => it.itemId === book)),
      };
    };
    const nguonTen = ["shops", "drops", "sectShop", "quests"] as const;
    for (const bo of nguonTen) {
      const khac: NguonCoDuoc = { ...NGUON_MAC_DINH, [bo]: NGUON_RONG[bo] };
      for (const s of LEARNABLE_SKILLS) {
        const has = coSach(s);
        const conLai = nguonTen.some((n) => n !== bo && has[n]);
        expect(howToGet(s, khac).orphan, `${s.id} khi bỏ ${bo}`).toBe(!conLai);
      }
    }
  });
});

describe("Sổ tay chiêu thức: cột Hình và cột Hiệu ứng đọc được", () => {
  it("mọi hình đòn có nhãn tiếng Việt khác id; cột Hình ở mục 1 in nhãn, không in id tiếng Anh", () => {
    for (const shape of SKILL_SHAPES) {
      expect(SHAPE_NHAN[shape], shape).toBeTruthy();
      expect(SHAPE_NHAN[shape]).not.toBe(shape);
    }
    for (const s of LEARNABLE_SKILLS) {
      const cells = dongChieuMuc1(renderSoTayChieuMarkdown()).get(s.id)!;
      expect(cells[4], s.id).toBe(SHAPE_NHAN[s.shape]);
    }
  });

  it("hiệu ứng: xác suất có dấu %, cường độ nghĩa theo loại (không còn số trần), xác suất 100% không in", () => {
    const base = LEARNABLE_SKILLS[0];
    const mot = (status: SkillDef["effects"][number]["status"], ratio: number, chance: number) =>
      effectsSummary({ ...base, effects: [{ status, ms: 3000, ratio, chance }] });
    expect(mot("bleed", 0.2, 0.5)).toBe("Chảy máu 3s (20% sát thương gốc mỗi giây), xác suất 50%");
    expect(mot("bleed", 0.2, 1)).toBe("Chảy máu 3s (20% sát thương gốc mỗi giây)");
    expect(mot("shield", 0.2, 1)).toBe("Hộ thể 3s (chắn 20% khí huyết tối đa), cho bản thân");
    expect(effectsSummary({ ...base, effects: [] })).toBe("—");
  });

  it("mọi trạng thái trong STATUSES in được: có tên; loại có ratio thì ghi %, không in chuỗi 'undefined'", () => {
    const base = LEARNABLE_SKILLS[0];
    for (const st of STATUSES) {
      const t = effectsSummary({
        ...base,
        effects: [{ status: st.id, ms: 2000, ratio: 0.25, chance: 0.4 }],
      });
      expect(t, st.id).toContain(st.name);
      expect(t, st.id).toContain("xác suất 40%");
      expect(t, st.id).not.toContain("undefined");
      expect(t, st.id).not.toContain("NaN");
      if (st.kind !== "stun" && st.kind !== "mark") expect(t, st.id).toContain("25%");
    }
  });
});
