// Móc truyện chương 1-4 (issue #1464 [75-E1], mục 75, `docs/COT_TRUYEN.md` mục 4-5): lớp truyện GIEO bằng lời thoại NPC có sẵn
// (không NPC / việc phụ / vật phẩm mới, không đụng trần tu vi việc phụ). Bảng `HOOKS` là hợp đồng: mỗi móc nêu chương (bản đồ),
// NPC kể, các mẩu chữ BẮT BUỘC có trong MỘT dòng biến thể (không phải dòng giới thiệu đầu: dòng đó được `npc-dialogue.test.ts`
// khoá nguyên văn) và khoá nguồn ở `docs/NGUON_NOI_DUNG.md` mục 3. Sửa / xoá một dòng móc mà không đổi bảng này thì test đỏ;
// thêm móc mới thì thêm dòng vào bảng + một dòng nguồn.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_ID, MAPS, NPC_BY_ID } from "./index";

interface Hook {
  /** Bản đồ (chương) nơi người chơi nghe mẩu truyện này. */
  readonly mapId: string;
  /** NPC kể (phải đứng đúng bản đồ trên). */
  readonly npcId: string;
  /** Khoá nguồn trong bản sao Vạn Kiếp (`lore.*` / `npc.*`), phải có một dòng ở NGUON_NOI_DUNG mục 3. */
  readonly nguon: string;
  /** Mọi mẩu này phải nằm trong CÙNG một dòng lời thoại (không tính dòng đầu). */
  readonly co: readonly string[];
}

const HOOKS: readonly Hook[] = [
  // Chương 1 - Lạc Hà (chính sử)
  {
    mapId: "lac_ha",
    npcId: "truong_tran",
    nguon: "lore.thien_mon_loi_sam",
    co: ["Ba nghìn năm phong thiên, cửa trời tự hiện", "kỳ hạn"],
  },
  {
    mapId: "lac_ha",
    npcId: "duoc_su",
    nguon: "lore.thien_mon_bia_dem_nam",
    co: ["bia không chữ", "đếm năm"],
  },
  // Chương 2 - Hắc Phong
  {
    mapId: "hac_phong",
    npcId: "lai_buon",
    nguon: "lore.doan_thien_kiem_vu",
    co: ["mũi kiếm gãy", "Đoạn Thiên", "gãy ở mũi"],
  },
  {
    mapId: "hac_phong",
    npcId: "tran_uy",
    nguon: "npc.mo_dung_triet",
    co: ["Mộ Dung Triệt", "tỉ thí"],
  },
  // Chương 3 - Âm Sương (dã sử: Giao, Quy, triều rút)
  {
    mapId: "am_suong",
    npcId: "tram_truong",
    nguon: "lore.trung_chau_trieu_khu",
    co: ["nước rút", "không thả lưới"],
  },
  {
    mapId: "am_suong",
    npcId: "tram_truong",
    nguon: "npc.ninh_tam_sinh",
    co: ["Ninh Tam Sinh", "gốc hòe"],
  },
  {
    mapId: "am_suong",
    npcId: "lai_buon_suong",
    nguon: "npc.on_nhu_ngoc",
    co: ["Ôn Như Ngọc", "giữ lời"],
  },
  {
    mapId: "am_suong",
    npcId: "tho_ren_suong",
    nguon: "npc.minh_do",
    co: ["Minh Độ", "vảy rắn"],
  },
  // Chương 4 - Hàn Vân (dã sử: Bằng, Tầm Thiên Hội)
  {
    mapId: "han_van",
    npcId: "tram_truong_han",
    nguon: "npc.thac_bat_suong",
    co: ["Thác Bạt Sương", "Huyền Vũ Môn"],
  },
  {
    mapId: "han_van",
    npcId: "tram_truong_han",
    nguon: "lore.doan_thien_bang_ky",
    co: ["bằng già", "quay lại"],
  },
  {
    mapId: "han_van",
    npcId: "lai_buon_han",
    nguon: "lore.thien_mon_tam_thien",
    co: ["Tầm Thiên Hội", "cửa trời"],
  },
  {
    mapId: "han_van",
    npcId: "tho_ren_han",
    nguon: "npc.bang_that",
    co: ["Bằng Thất", "tộc hắn"],
  },
  {
    mapId: "han_van",
    npcId: "tho_ren_han",
    nguon: "npc.yen_bac_quy",
    co: ["Yến Bắc Quy", "tri kỷ"],
  },
];

/** Bốn chương đã có nội dung (`docs/COT_TRUYEN.md` mục 5): mỗi chương phải có >= 2 móc. */
const CHAPTER_MAPS = ["lac_ha", "hac_phong", "am_suong", "han_van"] as const;

const here = dirname(fileURLToPath(import.meta.url));
const NGUON_DOC = readFileSync(resolve(here, "../../docs/NGUON_NOI_DUNG.md"), "utf8");

/** Dòng của bảng nguồn nhắc tới khoá này (khoá nằm trong dấu huyền: `lore.x` hoặc `npc.x`). */
const nguonRows = (key: string): string[] =>
  NGUON_DOC.split("\n").filter((l) => l.startsWith("|") && l.includes(`\`${key}\``));

describe("móc truyện chương 1-4 (#1464): gieo bằng lời thoại NPC có sẵn", () => {
  it("mỗi chương đã có nội dung có >= 2 móc, mỗi móc trỏ đúng bản đồ có thật", () => {
    const mapIds = new Set(MAPS.map((m) => m.id));
    for (const c of CHAPTER_MAPS) {
      expect(mapIds.has(c), c).toBe(true);
      expect(HOOKS.filter((h) => h.mapId === c).length, `${c}: số móc`).toBeGreaterThanOrEqual(2);
    }
    for (const h of HOOKS) expect(mapIds.has(h.mapId), `${h.nguon}: ${h.mapId}`).toBe(true);
  });

  it("mỗi móc: NPC đứng đúng bản đồ chương, và có MỘT dòng biến thể (không phải dòng đầu) chứa đủ mọi mẩu bắt buộc", () => {
    for (const h of HOOKS) {
      const npc = NPC_BY_ID[h.npcId];
      expect(npc, `${h.nguon}: NPC ${h.npcId} không có`).toBeDefined();
      expect(npc.mapId ?? DEFAULT_MAP_ID, `${h.nguon}: ${h.npcId} đứng sai bản đồ`).toBe(h.mapId);
      const lines = npc.dialog.slice(1);
      const ok = lines.some((l) => h.co.every((c) => l.includes(c)));
      expect(ok, `${h.nguon}: ${h.npcId} thiếu dòng chứa ${JSON.stringify(h.co)}`).toBe(true);
    }
  });

  it("hai móc của cùng một NPC nằm ở HAI dòng khác nhau (không dồn một dòng kể hai chuyện)", () => {
    const byNpc = new Map<string, Hook[]>();
    for (const h of HOOKS) byNpc.set(h.npcId, [...(byNpc.get(h.npcId) ?? []), h]);
    for (const [npcId, hooks] of byNpc) {
      const lineOf = (h: Hook) =>
        NPC_BY_ID[npcId].dialog.findIndex((l, i) => i > 0 && h.co.every((c) => l.includes(c)));
      const idx = hooks.map(lineOf);
      expect(new Set(idx).size, `${npcId}: hai móc trùng một dòng (${idx.join(", ")})`).toBe(
        idx.length,
      );
    }
  });

  it("mỗi khoá nguồn có ĐÚNG MỘT dòng ở docs/NGUON_NOI_DUNG.md mục 3, loại su_kien (lore) hoặc du_lieu (nhân vật), ghi PR #1464", () => {
    const keys = [...new Set(HOOKS.map((h) => h.nguon))];
    expect(keys.length, "mỗi móc một khoá riêng").toBe(HOOKS.length);
    for (const k of keys) {
      const rows = nguonRows(k).filter((l) => l.includes("#1464"));
      expect(rows.length, `${k}: số dòng nguồn ghi #1464`).toBe(1);
      const cols = rows[0].split("|").map((c) => c.trim());
      // cols[0] rỗng (đầu dòng): cột 1 = Loại, 4 = Ngày, 5 = PR, 6 = Đã duyệt chữ Hán
      expect(cols[1], `${k}: loại`).toBe(k.startsWith("lore.") ? "su_kien" : "du_lieu");
      expect(cols[5], `${k}: PR`).toBe("#1464");
      expect(cols[6], `${k}: duyệt chữ Hán`).toBe("KHONG_AP_DUNG");
    }
  });
});
