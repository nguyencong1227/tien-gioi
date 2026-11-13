import { describe, expect, it } from "vitest";
import { NPCS, RECIPES, SHOP_BY_NPC } from "@tien-gioi/shared";
import { MIN_TAP_PX, VIEWPORTS, judgeForgeShop } from "./check-forge-shop.mjs";

const good = (over: Record<string, unknown> = {}) => ({
  expectedCards: 9,
  cards: 9,
  tapHeights: Array.from({ length: 9 }, () => 44),
  tapWidths: Array.from({ length: 9 }, () => 72),
  overflowX: 0,
  clipped: 0,
  outsideCard: 0,
  enabled: 9,
  disabled: 0,
  missingChips: 0,
  feeChips: 9,
  lastReachable: true,
  touch: true,
  state: "du" as const,
  expectFee: true,
  ...over,
});
const poor = (over: Record<string, unknown> = {}) =>
  good({ enabled: 0, disabled: 9, missingChips: 27, ...over, state: "thieu" });

describe("judgeForgeShop (kiểm bảng Lò Rèn / Cửa hàng, #409)", () => {
  it("số đo tốt ở cả hai ca (đủ / thiếu) thì không lỗi", () => {
    expect(judgeForgeShop("x", good())).toEqual([]);
    expect(judgeForgeShop("x", poor())).toEqual([]);
  });

  it("đúng năm khung nhìn như snap-sheet, máy tính đứng đầu", () => {
    expect(VIEWPORTS.map((v) => v.name)).toEqual([
      "1280x720",
      "768x1024",
      "844x390",
      "390x844",
      "360x640",
    ]);
    const firstTouch = VIEWPORTS.findIndex((v) => v.mobile);
    expect(firstTouch).toBeGreaterThan(0);
    expect(VIEWPORTS.slice(firstTouch).every((v) => v.mobile)).toBe(true);
  });

  it("ĐỘT BIẾN: thiếu thẻ, dữ liệu rỗng, nút thấp / hẹp (chỉ cảm ứng), tràn, cắt chữ, chip ra ngoài thẻ, không cuộn tới thẻ cuối -> đỏ", () => {
    const bad = (over: Record<string, unknown>) => judgeForgeShop("x", good(over)).join("|");
    expect(bad({ cards: 8 })).toContain("số thẻ 8 != 9");
    expect(bad({ expectedCards: 0, cards: 0, feeChips: 0 })).toContain("dữ liệu rỗng");
    const low = Array.from({ length: 9 }, () => MIN_TAP_PX - 10);
    expect(bad({ tapHeights: low })).toContain(`thấp hơn ${MIN_TAP_PX}px`);
    expect(bad({ tapWidths: low })).toContain(`hẹp hơn ${MIN_TAP_PX}px`);
    expect(bad({ tapHeights: low, tapWidths: low, touch: false })).toBe("");
    expect(bad({ overflowX: 9 })).toContain("tràn ngang");
    expect(bad({ clipped: 1 })).toContain("chữ bị cắt");
    expect(bad({ outsideCard: 2 })).toContain("ra ngoài thẻ");
    expect(bad({ lastReachable: false })).toContain("thẻ cuối");
  });

  it("ĐỘT BIẾN: ca thiếu mà còn nút bật / không chip thiếu; ca đủ mà còn nút tắt / chip thiếu -> đỏ", () => {
    expect(judgeForgeShop("x", poor({ enabled: 1, disabled: 8 })).join("|")).toContain("còn BẬT");
    expect(judgeForgeShop("x", poor({ missingChips: 0 })).join("|")).toContain(
      "không chip nào báo thiếu",
    );
    expect(judgeForgeShop("x", good({ enabled: 8, disabled: 1 })).join("|")).toContain("còn TẮT");
    expect(judgeForgeShop("x", good({ missingChips: 2 })).join("|")).toContain("chip báo thiếu");
  });

  it("ĐỘT BIẾN: phí Linh thạch: thiếu chip ở bảng có phí, có chip ở bảng miễn phí -> đỏ", () => {
    expect(judgeForgeShop("x", good({ feeChips: 8 })).join("|")).toContain(
      "chip phí Linh thạch 8 != 9",
    );
    expect(judgeForgeShop("x", good({ expectFee: false, feeChips: 3 })).join("|")).toContain(
      "chip phí ở bảng miễn phí",
    );
  });

  it("thông báo lỗi mang tên bảng + ca để biết đỏ ở đâu", () => {
    expect(judgeForgeShop("rèn tho_ren_suong / thieu", poor({ cards: 1 }))[0]).toMatch(
      /^rèn tho_ren_suong \/ thieu: /,
    );
  });
});

describe("dữ liệu thật mà check-forge-shop dựa vào", () => {
  it("18 công thức rèn = 9 của thợ rèn Thiết Ngưu + 9 Kim Đan của thợ rèn Vọng Sương (đổi số lượng thì cập nhật kiểm tra)", () => {
    expect(RECIPES.filter((r) => r.npcId === "tho_ren")).toHaveLength(9);
    expect(RECIPES.filter((r) => r.npcId === "tho_ren_suong")).toHaveLength(9);
    expect(RECIPES).toHaveLength(18);
    // bảng có phí = đúng bảng Kim Đan; bảng cũ miễn phí (script kỳ vọng như vậy)
    expect(RECIPES.filter((r) => r.npcId === "tho_ren_suong").every((r) => (r.coin ?? 0) > 0)).toBe(
      true,
    );
    expect(RECIPES.filter((r) => r.npcId === "tho_ren").every((r) => !r.coin)).toBe(true);
  });

  it("cửa hàng lai_buon_suong có đan cấp 2 (4 mặt hàng)", () => {
    expect(SHOP_BY_NPC.lai_buon_suong.itemIds).toHaveLength(4);
  });

  it("hai NPC mà script đứng cạnh (bảng tự đóng khi ngoài tầm) có thật và ở bản đồ Âm Sương, nơi `?map=am_suong` đặt người chơi", () => {
    for (const id of ["tho_ren_suong", "lai_buon_suong"]) {
      const n = NPCS.find((x) => x.id === id);
      expect(n, id).toBeDefined();
      expect(n!.mapId, id).toBe("am_suong");
      expect(Number.isFinite(n!.x) && Number.isFinite(n!.y), id).toBe(true);
    }
  });
});
