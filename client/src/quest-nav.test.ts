import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP_ID,
  MAPS,
  MONSTER_BY_ID,
  QUESTS,
  QUEST_BY_ID,
  emptyInventory,
  getMap,
  addToInventory,
  type QuestCtx,
  type QuestProgress,
} from "@tien-gioi/shared";
import {
  dropMaps,
  dropSourceIn,
  hopLabel,
  mapsSpawning,
  nextHop,
  npcMapId,
  questGoal,
} from "./quest-nav";

const ALL = MAPS.map((d) => d.id);
const ctx = (): QuestCtx => ({ realm: 3, tier: 0, inv: emptyInventory() });
const at = (step: number): QuestProgress => ({ id: "x", step, count: 0 });
const portalTo = (from: string, to: string) =>
  getMap(from)!.def.portals!.find((p) => p.toMap === to)!;

describe("dữ liệu nền của chỉ đường", () => {
  it("có ba bản đồ ngoài hoang nối thành một chuỗi Lạc Hà - Hắc Phong - Âm Sương", () => {
    expect(ALL).toEqual(expect.arrayContaining([DEFAULT_MAP_ID, "hac_phong", "am_suong"]));
    expect(portalTo(DEFAULT_MAP_ID, "hac_phong")).toBeDefined();
    expect(portalTo("hac_phong", DEFAULT_MAP_ID)).toBeDefined();
    expect(portalTo("hac_phong", "am_suong")).toBeDefined();
    expect(portalTo("am_suong", "hac_phong")).toBeDefined();
  });

  it("npcMapId: NPC không khai báo mapId ở bản đồ mặc định; NPC Hắc Phong / Âm Sương đúng bản đồ; id lạ -> undefined", () => {
    expect(npcMapId("truong_tran")).toBe(DEFAULT_MAP_ID);
    expect(npcMapId("lai_buon")).toBe("hac_phong");
    expect(npcMapId("tram_truong")).toBe("am_suong");
    expect(npcMapId("khong_co")).toBeUndefined();
    expect(npcMapId("constructor")).toBeUndefined();
  });

  it("mapsSpawning: Sương Hồ chỉ ở Âm Sương, Thỏ chỉ ở Lạc Hà, Xích Mãng ở hai bản đồ cũ; trùm bí cảnh không bản đồ nào", () => {
    expect(mapsSpawning("suong_ho")).toEqual(["am_suong"]);
    expect(mapsSpawning("tho")).toEqual([DEFAULT_MAP_ID]);
    expect(mapsSpawning("mang")).toEqual(expect.arrayContaining([DEFAULT_MAP_ID, "hac_phong"]));
    expect(mapsSpawning("mang")).not.toContain("am_suong");
    expect(mapsSpawning("yeu_vuong")).toEqual([]);
    expect(mapsSpawning("constructor")).toEqual([]);
  });

  it("dropMaps / dropSourceIn: nguyên liệu Kim Đan chỉ có ở Âm Sương; ưu tiên quái thường hơn trùm", () => {
    expect(dropMaps("suong_mao")).toEqual(["am_suong"]);
    expect(dropMaps("giao_lan")).toEqual(["am_suong"]);
    expect(dropMaps("vay_mang")).toEqual(expect.arrayContaining([DEFAULT_MAP_ID, "hac_phong"]));
    expect(dropMaps("khong_co")).toEqual([]);
    // Độc nang rơi từ Độc Thiềm (thường) và Hắc Giao (trùm, tỉ lệ cao hơn): nhắm Độc Thiềm
    expect(dropSourceIn("doc_nang", "am_suong")).toBe("doc_thiem");
    expect(MONSTER_BY_ID[dropSourceIn("doc_nang", "am_suong")!].boss).not.toBe(true);
    // Giao lân chỉ trùm rơi: nhắm trùm
    expect(dropSourceIn("giao_lan", "am_suong")).toBe("hac_giao");
    // bản đồ không sinh quái nào rơi nó
    expect(dropSourceIn("suong_mao", DEFAULT_MAP_ID)).toBeUndefined();
  });
});

describe("nextHop: cổng kế tiếp trên đường tới bản đồ đích", () => {
  it("đã ở bản đồ đích -> null (không cần qua cổng)", () => {
    for (const id of ALL) expect(nextHop(id, [id])).toBeNull();
    expect(nextHop("hac_phong", ["hac_phong", "am_suong"])).toBeNull();
  });

  it("Lạc Hà -> Âm Sương: phải qua cổng sang Hắc Phong trước (2 cổng)", () => {
    const h = nextHop(DEFAULT_MAP_ID, ["am_suong"])!;
    expect(h.portal.id).toBe(portalTo(DEFAULT_MAP_ID, "hac_phong").id);
    expect(h.toMapId).toBe("hac_phong");
    expect(h.hops).toBe(2);
  });

  it("Hắc Phong -> Âm Sương dùng Vọng Trạch Quan (1 cổng); Âm Sương -> Lạc Hà dùng Hồi Phong Quan (2 cổng)", () => {
    const a = nextHop("hac_phong", ["am_suong"])!;
    expect(a.portal.name).toBe("Vọng Trạch Quan");
    expect(a.hops).toBe(1);
    expect(hopLabel(a)).toBe("Qua Vọng Trạch Quan");
    const b = nextHop("am_suong", [DEFAULT_MAP_ID])!;
    expect(b.portal.name).toBe("Hồi Phong Quan");
    expect(b.toMapId).toBe("hac_phong");
    expect(b.hops).toBe(2);
  });

  it("nhiều bản đồ đích: chọn bản đồ GẦN nhất (từ Âm Sương, Xích Mãng ở Hắc Phong gần hơn Lạc Hà)", () => {
    const h = nextHop("am_suong", mapsSpawning("mang"))!;
    expect(h.toMapId).toBe("hac_phong");
    expect(h.hops).toBe(1);
  });

  it("bí cảnh (không có cổng ra), bản đồ lạ, đích rỗng hoặc đích không tồn tại -> null, không ném lỗi", () => {
    expect(nextHop("bi_canh_linh_hu", ["am_suong"])).toBeNull();
    expect(nextHop("khong_co", ["am_suong"])).toBeNull();
    expect(nextHop(DEFAULT_MAP_ID, [])).toBeNull();
    expect(nextHop(DEFAULT_MAP_ID, ["khong_co"])).toBeNull();
    expect(nextHop(DEFAULT_MAP_ID, ["bi_canh_linh_hu"])).toBeNull();
  });
});

describe("questGoal: đích của bước hiện tại", () => {
  it("talk: bản đồ của NPC (thanh_lo_tram -> Hắc Phong)", () => {
    const q = QUEST_BY_ID.thanh_lo_tram;
    expect(questGoal(q, at(0), ctx())).toEqual({ kind: "maps", mapIds: ["hac_phong"] });
  });

  it("kill: các bản đồ có sinh quái (suong_ho_hoan -> Âm Sương)", () => {
    const q = QUEST_BY_ID.suong_ho_hoan;
    expect(questGoal(q, at(0), ctx())).toEqual({ kind: "maps", mapIds: ["am_suong"] });
  });

  it("collect: các bản đồ có quái rơi vật phẩm (bước 2 của suong_ho_hoan: sương mao -> Âm Sương)", () => {
    const q = QUEST_BY_ID.suong_ho_hoan;
    expect(questGoal(q, at(1), ctx())).toEqual({ kind: "maps", mapIds: ["am_suong"] });
  });

  it("reachRealm: đứng ở đâu cũng được", () => {
    expect(questGoal(QUEST_BY_ID.vong_suong, at(0), ctx())).toEqual({ kind: "anywhere" });
  });

  it("xong hết bước: về người giao ở bản đồ của họ (trả suong_ho_hoan ở Vọng Sương)", () => {
    const q = QUEST_BY_ID.suong_ho_hoan;
    const inv = emptyInventory();
    addToInventory(inv, "suong_mao", 12);
    expect(questGoal(q, at(q.steps.length), { realm: 3, tier: 0, inv })).toEqual({
      kind: "maps",
      mapIds: ["am_suong"],
    });
  });

  it("dữ liệu hỏng: người giao / NPC không có -> null (không ném lỗi); quái không sinh ở bản đồ nào -> null", () => {
    const base = QUEST_BY_ID.thanh_lo_tram;
    expect(questGoal({ ...base, giver: "khong_co" }, at(base.steps.length), ctx())).toBeNull();
    expect(
      questGoal({ ...base, steps: [{ kind: "talk", npcId: "khong_co" }] }, at(0), ctx()),
    ).toBeNull();
    expect(
      questGoal(
        { ...base, steps: [{ kind: "kill", monster: "yeu_vuong", count: 1 }] },
        at(0),
        ctx(),
      ),
    ).toBeNull();
    expect(
      questGoal(
        { ...base, steps: [{ kind: "collect", itemId: "khong_co", count: 1 }] },
        at(0),
        ctx(),
      ),
    ).toBeNull();
  });
});

describe("MỌI nhiệm vụ x MỌI bản đồ xuất phát: luôn có đường chỉ, đi theo cổng tới đúng bản đồ đích", () => {
  it("không bước nào cho mũi tên 'mất phương hướng' (null) và đường đi dài <= số bản đồ, không vòng lặp", () => {
    const problems: string[] = [];
    for (const q of QUESTS) {
      // thử từng bước, cộng thêm trạng thái "xong, chờ trả" (step = steps.length với túi đủ đồ)
      for (let s = 0; s <= q.steps.length; s++) {
        const inv = emptyInventory();
        if (s === q.steps.length)
          for (const st of q.steps)
            if (st.kind === "collect") addToInventory(inv, st.itemId, st.count);
        const prog = at(s);
        const g = questGoal(q, prog, { realm: 3, tier: 2, inv });
        if (!g) {
          problems.push(`${q.id} bước ${s}: không có đích`);
          continue;
        }
        if (g.kind === "anywhere") continue;
        for (const start of ALL) {
          let cur = start;
          let steps = 0;
          while (!g.mapIds.includes(cur)) {
            const hop = nextHop(cur, g.mapIds);
            if (!hop) {
              problems.push(`${q.id} bước ${s} từ ${start}: hết đường ở ${cur}`);
              break;
            }
            const next = getMap(cur)!.def.portals!.find((p) => p.id === hop.portal.id);
            if (!next) {
              problems.push(
                `${q.id} bước ${s} từ ${start}: cổng ${hop.portal.id} không thuộc ${cur}`,
              );
              break;
            }
            cur = hop.toMapId;
            if (++steps > ALL.length) {
              problems.push(`${q.id} bước ${s} từ ${start}: vòng lặp`);
              break;
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("có ít nhất một nhiệm vụ cần qua bản đồ khác (nếu không, test trên rỗng nghĩa)", () => {
    let cross = 0;
    for (const q of QUESTS)
      for (let s = 0; s < q.steps.length; s++) {
        const g = questGoal(q, at(s), ctx());
        if (g?.kind === "maps" && !g.mapIds.includes(DEFAULT_MAP_ID)) cross++;
      }
    expect(cross).toBeGreaterThanOrEqual(8);
  });
});

describe("WorldScene dùng quest-nav (không chép lại logic chỉ đường theo toạ độ một bản đồ)", () => {
  it("resolveQuestTarget gọi questGoal / nextHop / dropSourceIn và không còn tự duyệt DROP_TABLES", () => {
    const scene = readFileSync(new URL("./scenes/WorldScene.ts", import.meta.url), "utf-8");
    expect(scene).toContain("questGoal(def, prog, ctx)");
    expect(scene).toContain("nextHop(this.map.def.id, goal.mapIds)");
    expect(scene).toContain("dropSourceIn(step.itemId, this.map.def.id)");
    expect(scene).not.toMatch(/Object\.entries\(DROP_TABLES\)/);
  });
});
