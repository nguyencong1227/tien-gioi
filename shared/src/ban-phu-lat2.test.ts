// Nghề nhỏ lát 2 — dữ liệu mới (#514/#817, docs/THIET_KE_NGHE_NHO.md mục 3 "Phù" + 5): NPC Bàn phù + chín phù + công thức.
// Kiểm BẤT BIẾN dữ liệu (vị trí NPC, effect / ratio / ms / mô tả phù, phù không bán được, công thức hợp lệ). Hợp đồng chung
// (trạm hợp lệ, NPC tồn tại, `statusDescMatches` quét mọi vật phẩm, amp / cdr helpers) có `nghe-nho-contract.test.ts` /
// `nghe-nho-lat2-contract.test.ts`; đây tập trung vào chín phù + NPC Bàn phù + công thức.
import { describe, expect, it } from "vitest";
import { ITEM_VALUE } from "./currency";
import {
  AMP_ELEMENTS,
  COIN_CAP,
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  DROP_TABLES,
  ITEM_BY_ID,
  NPC_BY_ID,
  RECIPES,
  sellPrice,
  statusDescMatches,
  statusOf,
} from "./index";

/** Tám phù tăng sát thương hệ (`amp_<hệ>`), theo bậc tăng dần: LK / TC / KD / NA. */
const PHU_AMP_IDS = [
  "phu_hoa_dan",
  "phu_hoa_cuonghuyet",
  "phu_kim_phicham",
  "phu_kim_toagia",
  "phu_hoa_lieutiem",
  "phu_loi_loino",
  "phu_hoa_tammoi",
  "phu_moc_kimlan",
] as const;
/** Phù giảm hồi chiêu (`cdr_phu`): nội dung GỐC (không có phù nguồn), giữa Trúc Cơ - Kim Đan. */
const PHU_CDR_ID = "phu_tho_tocphong";
/** Chín phù Bàn phù chế. */
const PHU_IDS = [...PHU_AMP_IDS, PHU_CDR_ID];
const phuItems = PHU_IDS.map((id) => ITEM_BY_ID[id]!);

describe("NPC Bàn phù (lao_phu)", () => {
  const npc = NPC_BY_ID.lao_phu!;

  it("tồn tại, trạm `talisman`, GỐC (tên + danh xưng riêng)", () => {
    expect(npc).toBeDefined();
    expect(npc.station).toBe("talisman");
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

describe("chín phù (Bàn phù chế)", () => {
  it("mỗi phù: consumable, stack 9, effect kind `status`, ms 60 giây, KHÔNG có forRealm (phù không phân cảnh giới)", () => {
    for (const it of phuItems) {
      expect(it.type, it.id).toBe("consumable");
      expect(it.stack, it.id).toBe(9);
      const e = it.effect;
      expect(e?.kind, it.id).toBe("status");
      expect((e as { forRealm?: unknown })?.forRealm, it.id).toBeUndefined();
      expect((e as { ms: number }).ms, it.id).toBe(60_000);
      expect((e as { ms: number }).ms % 60_000, it.id).toBe(0); // chẵn phút -> mô tả nêu được "1 phút"
    }
  });

  it("id trạng thái hợp lệ: `amp_<hệ>` (hệ trong AMP_ELEMENTS) hoặc `cdr_phu`; khớp STATUSES, CÓ LỢI, trong khung maxMs / maxRatio", () => {
    for (const it of phuItems) {
      const e = it.effect as { id: string; ratio: number; ms: number };
      const def = statusOf(e.id);
      expect(def, `${it.id}: trạng thái "${e.id}" không tồn tại`).toBeDefined();
      expect(def!.harmful, it.id).toBe(false); // phù là buff, không có hại
      expect(e.ms, it.id).toBeLessThanOrEqual(def!.maxMs);
      expect(e.ratio, it.id).toBeGreaterThan(0);
      expect(e.ratio, it.id).toBeLessThanOrEqual(def!.maxRatio);
      const isAmp = e.id.startsWith("amp_");
      const isCdr = e.id === "cdr_phu";
      expect(isAmp || isCdr, it.id).toBe(true);
      if (isAmp) {
        expect(def!.kind, it.id).toBe("amp");
        expect((AMP_ELEMENTS as readonly string[]).includes(e.id.slice(4)), `${it.id}: hệ lạ`).toBe(
          true,
        );
      }
      if (isCdr) expect(def!.kind, it.id).toBe("cdr");
    }
  });

  it("mô tả nêu đúng % + thời gian (statusDescMatches) và điều kiện thách đấu / mất khi qua cổng", () => {
    for (const it of phuItems) {
      const e = it.effect as { ratio: number; ms: number };
      expect(
        statusDescMatches(it.desc, e),
        `${it.id}: desc "${it.desc}" lệch ${JSON.stringify(e)}`,
      ).toBe(true);
      expect(it.desc.toLowerCase(), it.id).toContain("thách đấu"); // không nhân khi PK
      expect(it.desc.toLowerCase(), it.id).toContain("cổng"); // qua cổng là mất
    }
  });

  it("KHÔNG có trong ITEM_VALUE và sellPrice === 0 (chốt chặn chống sinh Linh thạch)", () => {
    for (const id of PHU_IDS) {
      expect(Object.prototype.hasOwnProperty.call(ITEM_VALUE, id), id).toBe(false);
      expect(sellPrice(id), id).toBe(0);
    }
  });
});

describe("công thức Bàn phù (lao_phu)", () => {
  const recipes = RECIPES.filter((r) => r.npcId === "lao_phu");
  const droppable = new Set<string>();
  for (const entries of Object.values(DROP_TABLES))
    for (const e of entries) droppable.add(e.itemId);

  it("có đúng chín công thức, mỗi công thức đầu ra là MỘT trong chín phù", () => {
    expect(recipes, `số công thức=${recipes.length}`).toHaveLength(9);
    for (const r of recipes) expect(PHU_IDS).toContain(r.output.itemId);
  });

  it("mọi nguyên liệu tồn tại và có nguồn rơi từ quái; số lượng vừa một ô túi", () => {
    for (const r of recipes)
      for (const inp of r.inputs) {
        expect(ITEM_BY_ID[inp.itemId], `${r.id}: nguyên liệu ${inp.itemId}`).toBeDefined();
        expect(droppable.has(inp.itemId), `${r.id}: ${inp.itemId} không rơi từ quái nào`).toBe(
          true,
        );
        expect(inp.qty, `${r.id}:${inp.itemId}`).toBeGreaterThan(0);
        expect(inp.qty, `${r.id}:${inp.itemId}`).toBeLessThanOrEqual(ITEM_BY_ID[inp.itemId].stack);
      }
  });

  it("phí `coin` số nguyên dương <= COIN_CAP", () => {
    for (const r of recipes) {
      expect(Number.isInteger(r.coin), r.id).toBe(true);
      expect(r.coin, r.id).toBeGreaterThan(0);
      expect(r.coin, r.id).toBeLessThanOrEqual(COIN_CAP);
    }
  });
});

// ĐỘT BIẾN ĐỎ (issue #817 "Test cần có": >= 5): năm luật dưới đây KHÓA dữ liệu thật — Dã tự chạy đột biến
// (mutate dữ liệu -> test ĐỎ -> `git checkout --` phục hồi) trước khi commit, kết quả dán PR. Mỗi luật tương
// ứng một đột biến trong mục "Test cần có"; nếu ai sửa dữ liệu sai luật, test này sẽ đỏ.
describe("luật khoá dữ liệu phù (#817)", () => {
  it("(1) đột biến ĐỎ: thêm phù vào ITEM_VALUE (mở chốt chặn sinh Linh thạch) -> sellPrice > 0", () => {
    // Luật: phù (đồ tự chế) KHÔNG có giá, không bán được NPC.
    // Đột biến: ai thêm phù vào ITEM_VALUE -> sellPrice(phu) > 0 -> ĐỎ.
    for (const id of PHU_IDS) expect(sellPrice(id), id).toBe(0);
  });

  it("(2) đột biến ĐỎ: sửa số trong effect làm lệch desc (ratio/ms) -> mô tả sai số", () => {
    // Luật: desc phải nêu đúng % + thời gian khớp effect.
    // Đột biến: đổi ratio/ms trong effect mà KHÔNG sửa desc -> desc nêu số cũ, effect số mới -> ĐỎ.
    for (const it of phuItems) {
      const e = it.effect as { ratio: number; ms: number };
      expect(it.desc).toContain(`${Math.round(e.ratio * 100)}%`);
      expect(it.desc).toContain(`${Math.round(e.ms / 1000)} giây`);
    }
  });

  it("(3) đột biến ĐỎ: NPC Bàn phù ra ngoài trấn Lạc Hà -> inTown đỏ", () => {
    // Luật: NPC trạm talisman đứng trong trấn (khớp npc-multi-map / vị trí hợp lệ).
    // Đột biến: đổi x/y NPC ra rìa bản đồ -> inTown(x,y)=false -> ĐỎ.
    expect(DEFAULT_MAP.inTown(NPC_BY_ID.lao_phu!.x, NPC_BY_ID.lao_phu!.y)).toBe(true);
  });

  it("(4) đột biến ĐỎ: công thức Bàn phù dùng nguyên liệu không tồn tại / không có nguồn rơi -> Đỏ", () => {
    // Luật: mọi nguyên liệu công thức Bàn phù phải tồn tại và rơi từ quái (không thêm nguồn rơi mới lát 2).
    // Đột biến: thêm nguyên liệu lạ vào inputs -> ITEM_BY_ID[inp] undefined / không droppable -> ĐỎ.
    const droppable = new Set<string>();
    for (const entries of Object.values(DROP_TABLES))
      for (const e of entries) droppable.add(e.itemId);
    for (const r of RECIPES.filter((x) => x.npcId === "lao_phu"))
      for (const inp of r.inputs) {
        expect(ITEM_BY_ID[inp.itemId], `${r.id}:${inp.itemId}`).toBeDefined();
        expect(droppable.has(inp.itemId), `${r.id}:${inp.itemId} phải có nguồn rơi`).toBe(true);
      }
  });

  it("(5) đột biến ĐỎ: phù len lỏi thành TRANG BỊ (mặc vào ô trang bị) -> type !== consumable", () => {
    // Luật: phù là vật phẩm dùng một lần (consumable), KHÔNG phải trang bị.
    // Đột biến: đổi type phù thành "equip" -> ĐỎ.
    for (const id of PHU_IDS) expect(ITEM_BY_ID[id]!.type, id).toBe("consumable");
  });
});
