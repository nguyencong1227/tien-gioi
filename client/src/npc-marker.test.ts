import { describe, expect, it } from "vitest";
import { NPC_MARKER_STYLE, npcMarkerStyle } from "./npc-marker";

/** Độ sáng tương đối (0..255) của màu 0xRRGGBB hoặc "#rrggbb": đủ để kiểm "vàng" (R, G cao, B thấp). */
const rgb = (c: number | string): [number, number, number] => {
  const n = typeof c === "number" ? c : parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const isYellow = ([r, g, b]: [number, number, number]) => r >= 200 && g >= 170 && b <= 110;

describe("dấu nhiệm vụ trên NPC / bản đồ (mục 66)", () => {
  it("'?' (đã đủ, về trả) là VÀNG ở mọi chỗ vẽ: vòng sáng, chữ, màu bản đồ — không còn xanh lá", () => {
    const q = NPC_MARKER_STYLE["?"];
    expect(isYellow(rgb(q.aura))).toBe(true);
    expect(isYellow(rgb(q.text))).toBe(true);
    expect(isYellow(rgb(q.mapColor))).toBe(true);
  });

  it("'?' to hơn và đặc hơn '!' (việc quan trọng nhất phải nổi nhất)", () => {
    expect(NPC_MARKER_STYLE["?"].scale).toBeGreaterThan(NPC_MARKER_STYLE["!"].scale);
    expect(NPC_MARKER_STYLE["?"].auraAlpha).toBeGreaterThan(NPC_MARKER_STYLE["!"].auraAlpha);
  });

  it("'!' giữ nguyên kiểu cũ (vàng, cỡ mặc định, nhãn bản đồ hồng như trước)", () => {
    const b = NPC_MARKER_STYLE["!"];
    expect(b.aura).toBe(0xffd700);
    expect(b.text).toBe("#ffe08a");
    expect(b.scale).toBe(1);
    expect(b.mapColor).toBe("#ff8a8a");
  });

  it("npcMarkerStyle: chỉ '!' / '?' có kiểu; chuỗi lạ, rỗng, null, tên độc -> undefined", () => {
    expect(npcMarkerStyle("?")).toBe(NPC_MARKER_STYLE["?"]);
    expect(npcMarkerStyle("!")).toBe(NPC_MARKER_STYLE["!"]);
    for (const bad of ["", "x", "??", null, undefined, "constructor", "__proto__"]) {
      expect(npcMarkerStyle(bad as string | null | undefined)).toBeUndefined();
    }
  });
});
