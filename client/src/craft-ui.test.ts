import { describe, expect, it } from "vitest";
import { CRAFT_STATIONS, CRAFT_STATION_IDS, NPCS, craftStationOf } from "@tien-gioi/shared";
import {
  CRAFT_SUBTITLES,
  FORGE_FALLBACK_TITLE,
  craftButtonText,
  craftFeeHint,
  craftSubtitle,
  craftTag,
  craftTitle,
} from "./craft-ui";
import { optionTag } from "./dialog-opt";

describe("craft-ui: chữ bảng chế tác theo trạm (#514, issue #769)", () => {
  it("mọi trạm có tiêu đề / nút / thẻ từ CRAFT_STATIONS và dòng phụ riêng", () => {
    for (const id of CRAFT_STATION_IDS) {
      const npc = { name: "Thử", station: id };
      expect(craftTitle(npc)).toBe(`${CRAFT_STATIONS[id].title} · Thử`);
      expect(craftButtonText(npc)).toBe(CRAFT_STATIONS[id].button);
      expect(craftTag(id)).toBe(CRAFT_STATIONS[id].tag);
      expect(CRAFT_SUBTITLES[id].length).toBeGreaterThan(5);
      expect(craftSubtitle(npc)).toBe(CRAFT_SUBTITLES[id]);
    }
  });

  it("ba trạm cho ba tiêu đề / nút KHÁC nhau (không còn cứng 'Lò Rèn' / 'Rèn')", () => {
    const titles = CRAFT_STATION_IDS.map((id) => craftTitle({ name: "X", station: id }));
    const buttons = CRAFT_STATION_IDS.map((id) => craftButtonText({ station: id }));
    expect(new Set(titles).size).toBe(CRAFT_STATION_IDS.length);
    expect(new Set(buttons).size).toBe(CRAFT_STATION_IDS.length);
    expect(craftTitle({ name: "Lão Đan", station: "alchemy" })).toBe("Lò Đan · Lão Đan");
    expect(craftButtonText({ station: "talisman" })).toBe("Chế");
  });

  it("NPC thiếu trạm / trạm lạ / không có NPC: giữ chữ Lò Rèn cũ", () => {
    expect(craftTitle({ name: "Thiết Ngưu" })).toBe("Lò Rèn · Thiết Ngưu");
    expect(craftTitle({ name: "Thiết Ngưu", station: "bay_ba" })).toBe("Lò Rèn · Thiết Ngưu");
    expect(craftTitle(undefined)).toBe(FORGE_FALLBACK_TITLE);
    expect(craftTitle(null)).toBe(FORGE_FALLBACK_TITLE);
    expect(craftButtonText(undefined)).toBe("Rèn");
    expect(craftButtonText({ station: 7 })).toBe("Rèn");
    expect(craftSubtitle(undefined)).toBe(CRAFT_SUBTITLES.forge);
    expect(craftTag(undefined)).toBe("Lò rèn");
    expect(craftTag("lạ")).toBe("Lò rèn");
  });

  it("thợ rèn thật của game (chưa có station) vẫn ra đúng chữ cũ", () => {
    const smith = NPCS.find((n) => n.id === "tho_ren");
    expect(smith).toBeDefined();
    expect(craftStationOf(smith)).toBe("forge");
    expect(craftTitle(smith)).toBe(`Lò Rèn · ${smith!.name}`);
    expect(craftButtonText(smith)).toBe("Rèn");
  });

  it("gợi ý nút khi có phí đi theo động từ của trạm", () => {
    expect(craftFeeHint({ station: "alchemy" }, "700 Linh thạch")).toBe(
      "Luyện: tốn 700 Linh thạch",
    );
    expect(craftFeeHint(undefined, "50 Linh thạch")).toBe("Rèn: tốn 50 Linh thạch");
  });
});

describe("optionTag: thẻ phụ của lựa chọn forge theo trạm", () => {
  it("lựa chọn forge: Lò rèn mặc định; Lò đan / Bàn phù khi action.station đi kèm", () => {
    expect(optionTag("forge", "Rèn đồ")?.text).toBe("Lò rèn");
    expect(optionTag("forge", "Rèn đồ", false, "forge")?.text).toBe("Lò rèn");
    expect(optionTag("forge", "Luyện đan", false, "alchemy")?.text).toBe("Lò đan");
    expect(optionTag("forge", "Chế phù", false, "talisman")?.text).toBe("Bàn phù");
  });
  it("station lạ (máy chủ mới hơn client) không làm hỏng: coi như Lò rèn", () => {
    expect(optionTag("forge", "Gì đó", false, "tram_moi")?.text).toBe("Lò rèn");
  });
  it("thẻ trùng nhãn vẫn bị bỏ (kể cả với trạm mới) và kind khác không bị station ảnh hưởng", () => {
    expect(optionTag("forge", "Lò đan", false, "alchemy")).toBeNull();
    expect(optionTag("shop", "Xem hàng", false, "alchemy")?.text).toBe("Cửa hàng");
  });
});
