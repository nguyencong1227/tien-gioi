// Lời chào NPC: dòng đầu + MỘT dòng biến thể ngẫu nhiên (để thêm lời thoại cho NPC mà không kéo dài hộp thoại, #725).
import { describe, expect, it } from "vitest";
import { DEFAULT_MAP, NPCS } from "@tien-gioi/shared";
import { greetingLines, talk } from "./npc";
import { addPlayer, makeWorld } from "./test-helpers";

const FIVE = ["giới thiệu", "biến thể 1", "biến thể 2", "biến thể 3", "biến thể 4"];

describe("greetingLines", () => {
  it("NPC có từ 2 dòng trở xuống: hiện nguyên như cũ (không đổi hành vi hiện tại)", () => {
    expect(greetingLines(["a", "b"], () => 0.99)).toEqual(["a", "b"]);
    expect(greetingLines(["a"])).toEqual(["a"]);
    expect(greetingLines([])).toEqual([]);
  });

  it("NPC nhiều dòng: luôn hiện dòng ĐẦU rồi đúng MỘT biến thể, không bao giờ hai biến thể hay lặp dòng đầu", () => {
    for (let k = 0; k < 100; k++) {
      const r = greetingLines(FIVE, () => k / 100);
      expect(r).toHaveLength(2);
      expect(r[0]).toBe("giới thiệu");
      expect(FIVE.slice(1)).toContain(r[1]);
    }
  });

  it("mỗi biến thể đều có thể xuất hiện (rnd quét hết [0, 1)); rnd ngoài khoảng bị kẹp, không ra undefined", () => {
    const seen = new Set<string>();
    for (let k = 0; k < 40; k++) seen.add(greetingLines(FIVE, () => k / 40)[1]);
    expect([...seen].sort()).toEqual(FIVE.slice(1).sort());
    expect(greetingLines(FIVE, () => 1)[1]).toBe("biến thể 4");
    expect(greetingLines(FIVE, () => 5)[1]).toBe("biến thể 4");
    expect(greetingLines(FIVE, () => -1)[1]).toBe("biến thể 1");
  });

  it("không đổi mảng gốc", () => {
    const src = [...FIVE];
    greetingLines(src, () => 0.5);
    expect(src).toEqual(FIVE);
  });

  it("mọi NPC hiện có: lời chào chỉ gồm dòng của chính NPC đó và dòng đầu luôn có mặt", () => {
    for (const n of NPCS) {
      const r = greetingLines(n.dialog);
      expect(r[0], n.id).toBe(n.dialog[0]);
      for (const line of r) expect(n.dialog, n.id).toContain(line);
    }
  });
});

describe("nối vào hộp thoại thật (talk)", () => {
  it("NPC nhiều dòng: bấm nói chuyện (không có nhiệm vụ) chỉ gửi dòng đầu + MỘT biến thể, không gửi cả năm dòng", () => {
    // Thợ rèn Lạc Hà không có nhiệm vụ nào để giao cho người mới: chỉ có lời chào
    const npc = NPCS.find((n) => n.id === "tho_ren")!;
    const cu = npc.dialog;
    npc.dialog = FIVE;
    try {
      const { w, dialogs } = makeWorld(DEFAULT_MAP);
      const { p: me } = addPlayer(w, "a");
      me.x = npc.x + 10;
      me.y = npc.y;
      for (let k = 0; k < 20; k++) talk(w, "a", "tho_ren");
      expect(dialogs.length).toBe(20);
      for (const d of dialogs) {
        expect(d.msg.lines, "chỉ hai dòng").toHaveLength(2);
        expect(d.msg.lines[0]).toBe("giới thiệu");
        expect(FIVE.slice(1)).toContain(d.msg.lines[1]);
      }
    } finally {
      npc.dialog = cu;
    }
  });
});
