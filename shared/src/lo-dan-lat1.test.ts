// Nghề nhỏ lát 1 — dữ liệu mới (#514/#763, docs/THIET_KE_NGHE_NHO.md mục 3, 5): NPC Lò đan + ba đan hộ đạo + công thức.
// Kiểm BẤT BIẾN dữ liệu (vị trí NPC, effect / forRealm / mô tả đan, đan không bán được, công thức hợp lệ). Hợp đồng chung
// (trạm hợp lệ, NPC tồn tại, `statusDescMatches` quét mọi vật phẩm) có `nghe-nho-contract.test.ts`; đây tập trung vào ba đan hộ đạo.
import { describe, expect, it } from "vitest";
import { ITEM_VALUE } from "./currency";
import {
  COIN_CAP,
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  DROP_TABLES,
  ITEM_BY_ID,
  NPC_BY_ID,
  RECIPES,
  sellPrice,
} from "./index";

/** Ba đan hộ đạo (đầu ra của Lò đan), theo bậc đột phá tăng dần: LK->TC, TC->KD, KD->NA. */
const DAO_HO_IDS = ["dot_pha_dan", "jinzhi_dan", "duyang_dan"] as const;
const DAO_HO_FOR_REALM = [1, 2, 3];
const daoHoItems = DAO_HO_IDS.map((id) => ITEM_BY_ID[id]!);

describe("NPC Lò đan (lao_dan)", () => {
  const npc = NPC_BY_ID.lao_dan!;

  it("tồn tại, trạm `alchemy`, GỐC (tên + danh xưng riêng)", () => {
    expect(npc).toBeDefined();
    expect(npc.station).toBe("alchemy");
    expect(npc.mapId ?? DEFAULT_MAP_ID).toBe(DEFAULT_MAP_ID); // ở Lạc Hà
    expect(npc.name.length).toBeGreaterThan(0);
    expect(npc.title.length).toBeGreaterThan(0);
  });

  it("đứng trong trấn Lạc Hà, không trên ô bị chặn, cách NPC khác > 64 px", () => {
    expect(DEFAULT_MAP.inTown(npc.x, npc.y), "trong trấn").toBe(true);
    expect(DEFAULT_MAP.isBlockedPx(npc.x, npc.y), "ô không chặn").toBe(false);
    const dist = Math.min(
      ...Object.values(NPC_BY_ID)
        .filter((o) => o.id !== npc.id)
        .map((o) => Math.hypot(npc.x - o.x, npc.y - o.y)),
    );
    expect(dist, `cách NPC gần nhất ${dist.toFixed(1)} px`).toBeGreaterThan(64);
  });
});

describe("ba đan hộ đạo (dot_pha_dan / jinzhi_dan / duyang_dan)", () => {
  it("mỗi đan: consumable, effect kind `status`, id `dao_ho`, forRealm đúng 1 / 2 / 3", () => {
    DAO_HO_IDS.forEach((id, i) => {
      const it = ITEM_BY_ID[id]!;
      expect(it.type, id).toBe("consumable");
      const e = it.effect;
      expect(e?.kind, id).toBe("status");
      expect((e as { id?: unknown })?.id, id).toBe("dao_ho");
      expect((e as { forRealm?: unknown })?.forRealm, id).toBe(DAO_HO_FOR_REALM[i]);
    });
  });

  it("ratio / ms trong khung STATUSES (ratio <= 0,2; ms <= 900000), ms chẵn phút", () => {
    for (const it of daoHoItems) {
      const e = it.effect as { ratio: number; ms: number };
      expect(e.ratio, it.id).toBeGreaterThan(0);
      expect(e.ratio, it.id).toBeLessThanOrEqual(0.2);
      expect(e.ms, it.id).toBeLessThanOrEqual(900_000);
      expect(e.ms % 60_000, it.id).toBe(0); // chẵn phút -> mô tả nêu được "N phút"
    }
  });

  it("mô tả nêu đúng % + thời gian (statusDescMatches) và điều kiện dùng / mất hiệu lực", () => {
    for (const it of daoHoItems) {
      // statusDescMatches (hợp đồng) quét mọi vật phẩm status; ở đây chốt thêm điều kiện dùng + mất khi qua cổng
      expect(it.desc).toContain("đạt đỉnh");
      expect(it.desc).toContain("tu vi");
      expect(it.desc.toLowerCase()).toContain("cổng");
    }
  });

  it("KHÔNG có trong ITEM_VALUE và sellPrice === 0 (chốt chặn chống sinh Linh thạch)", () => {
    for (const id of DAO_HO_IDS) {
      expect(Object.prototype.hasOwnProperty.call(ITEM_VALUE, id), id).toBe(false);
      expect(sellPrice(id), id).toBe(0);
    }
  });
});

describe("công thức Lò đan (lao_dan)", () => {
  const recipes = RECIPES.filter((r) => r.npcId === "lao_dan");

  it("có đúng ba công thức, mỗi công thức đầu ra là MỘT trong ba đan hộ đạo", () => {
    expect(recipes, `số công thức=${recipes.length}`).toHaveLength(3);
    for (const r of recipes) expect(DAO_HO_IDS).toContain(r.output.itemId);
  });

  it("mọi nguyên liệu tồn tại và có nguồn rơi từ quái (không thêm nguồn rơi mới ở lát 1)", () => {
    const droppable = new Set<string>();
    for (const entries of Object.values(DROP_TABLES))
      for (const e of entries) droppable.add(e.itemId);
    for (const r of recipes)
      for (const inp of r.inputs) {
        expect(ITEM_BY_ID[inp.itemId], `${r.id}: nguyên liệu ${inp.itemId}`).toBeDefined();
        expect(droppable.has(inp.itemId), `${r.id}: ${inp.itemId} không rơi từ quái nào`).toBe(
          true,
        );
        expect(inp.qty, `${r.id}:${inp.itemId}`).toBeGreaterThan(0);
      }
  });

  it("phí `coin` số nguyên dương <= COIN_CAP; forRealm tăng dần theo coin", () => {
    const sorted = [...recipes].sort((a, b) => a.coin! - b.coin!);
    for (const r of recipes) {
      expect(Number.isInteger(r.coin), r.id).toBe(true);
      expect(r.coin, r.id).toBeGreaterThan(0);
      expect(r.coin, r.id).toBeLessThanOrEqual(COIN_CAP);
    }
    const realms = sorted.map(
      (r) => (ITEM_BY_ID[r.output.itemId]!.effect as { forRealm?: number })!.forRealm,
    );
    for (let i = 1; i < realms.length; i++)
      expect(realms[i]!, "forRealm tăng dần theo coin").toBeGreaterThan(realms[i - 1]!);
  });
});

// ĐỘT BIẾN ĐỎ (issue #763 "Test cần có": >= 5): năm luật dưới đây KHÓA dữ liệu thật — Dã tự chạy đột biến
// (mutate dữ liệu -> test ĐỎ -> `git checkout --` phục hồi) trước khi commit, kết quả dán PR. Mỗi luật tương
// ứng một đột biến trong mục "Test cần có"; nếu ai sửa dữ liệu sai luật, test này sẽ đỏ.
describe("đột biến đỏ — năm luật khoá dữ liệu đan hộ đạo (#763)", () => {
  it("(1) đột biến ĐỎ: thêm đan hộ đạo vào ITEM_VALUE (mở chốt chặn sinh Linh thạch) -> sellPrice > 0", () => {
    // Luật: mọi vật phẩm đều có giá TRỪ ba đan hộ đạo (khóa ở currency.test.ts / data-integrity.test.ts).
    // Đột biến: ai bỏ ba đan ra khỏi danh sách miễn giá -> sellPrice(dan) > 0 -> ĐỎ.
    for (const id of DAO_HO_IDS) expect(sellPrice(id), id).toBe(0);
  });

  it("(2) đột biến ĐỎ: sửa số trong effect làm lệch desc (ratio/ms) -> statusDescMatches đỏ", () => {
    // Luật: desc phải nêu đúng % + thời gian khớp effect (statusDescMatches quét mọi vật phẩm status).
    // Đột biến: đổi ratio/ms trong effect mà KHÔNG sửa desc -> desc nêu số cũ, effect số mới -> ĐỎ.
    for (const itm of daoHoItems) {
      const e = itm.effect as { ratio: number; ms: number };
      expect(itm.desc).toContain(`${Math.round(e.ratio * 100)}%`);
      expect(itm.desc).toContain(`${Math.round(e.ms / 60_000)} phút`);
    }
  });

  it("(3) đột biến ĐỎ: forRealm sai bậc (vd jinzhi_dan -> 1) -> không khớp thứ tự LK/TC/KD", () => {
    // Luật: dot_pha=1 (LK->TC), jinzhi=2 (TC->KD), duyang=3 (KD->NA).
    // Đột biến: đổi forRealm của jinzhi_dan -> 1 -> mảng [1,1,3] -> ĐỎ.
    expect(daoHoItems.map((it) => (it.effect as { forRealm: number }).forRealm)).toEqual([1, 2, 3]);
  });

  it("(4) đột biến ĐỎ: NPC Lò đan ra ngoài trấn Lạc Hà -> inTown đỏ", () => {
    // Luật: NPC trạm alchemy đứng trong trấn (khớp npc-multi-map / vị trí hợp lệ).
    // Đột biến: đổi x/y NPC ra rìa bản đồ -> inTown(x,y)=false -> ĐỎ.
    expect(DEFAULT_MAP.inTown(NPC_BY_ID.lao_dan!.x, NPC_BY_ID.lao_dan!.y)).toBe(true);
  });

  it("(5) đột biến ĐỎ: công thức dùng nguyên liệu không tồn tại / không có nguồn rơi -> Đỏ", () => {
    // Luật: mọi nguyên liệu công thức Lò đan phải tồn tại và rơi từ quái (không thêm nguồn rơi mới lát 1).
    // Đột biến: thêm nguyên liệu lạ vào inputs -> ITEM_BY_ID[inp] undefined -> ĐỎ.
    const droppable = new Set<string>();
    for (const entries of Object.values(DROP_TABLES))
      for (const e of entries) droppable.add(e.itemId);
    for (const r of RECIPES.filter((x) => x.npcId === "lao_dan"))
      for (const inp of r.inputs) {
        expect(ITEM_BY_ID[inp.itemId], `${r.id}:${inp.itemId}`).toBeDefined();
        expect(droppable.has(inp.itemId), `${r.id}:${inp.itemId} phải có nguồn rơi`).toBe(true);
      }
  });
});
