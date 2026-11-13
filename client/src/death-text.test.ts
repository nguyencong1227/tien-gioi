import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAPS, getMap, isDungeonMap } from "@tien-gioi/shared";
import { respawnDeathText } from "./death-text";

describe("respawnDeathText", () => {
  it("nêu đúng trấn của bản đồ và số giây (làm tròn lên, không âm)", () => {
    expect(respawnDeathText("Thanh Lộ Trạm", 3)).toBe("Hồi sinh tại Thanh Lộ Trạm sau 3s");
    expect(respawnDeathText("Lạc Hà Trấn", 4.2)).toBe("Hồi sinh tại Lạc Hà Trấn sau 5s");
    expect(respawnDeathText("Lạc Hà Trấn", -1)).toBe("Hồi sinh tại Lạc Hà Trấn sau 0s");
  });

  it("mọi bản đồ ngoài hoang có trấn đều ra đúng tên trấn của chính nó (không dính tên bản đồ khác)", () => {
    const towns = MAPS.filter((d) => !isDungeonMap(d.id))
      .map((d) => getMap(d.id)!)
      .filter((m) => m.townPx.r > 0);
    expect(towns.length).toBeGreaterThanOrEqual(2);
    for (const m of towns) {
      const text = respawnDeathText(m.townName, 5);
      expect(text, m.def.id).toContain(m.townName);
      for (const other of towns.filter((o) => o.townName !== m.townName)) {
        expect(text, `${m.def.id} / ${other.def.id}`).not.toContain(other.townName);
      }
    }
  });
});

describe("không chép cứng nơi hồi sinh trong giao diện", () => {
  it("ui.ts không còn câu 'Hồi sinh tại <tên trấn>' cứng (WorldScene truyền tên trấn của bản đồ hiện tại)", () => {
    const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf-8");
    expect(ui).not.toMatch(/Hồi sinh tại/);
    const scene = readFileSync(new URL("./scenes/WorldScene.ts", import.meta.url), "utf-8");
    expect(scene).toContain("respawnDeathText(this.map.townName");
  });
});
