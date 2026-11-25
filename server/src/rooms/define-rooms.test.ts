// `defineRooms` nhận TỆP Tiled của các bản đồ thường trước khi đăng ký phòng (docs/THIET_KE_BAN_DO_TILED.md lát cắt S2): máy chủ dựng bản đồ từ `shared/maps/<id>.logic.json`, không sinh theo seed.
import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_ID, MAPS, MAP_BY_ID, getMap, roomNameOf } from "@tien-gioi/shared";
import { defineRooms } from "./WorldRoom";

describe("defineRooms: bản đồ thường đọc từ tệp Tiled", () => {
  it("sau defineRooms, MAPS / MAP_BY_ID / getMap của sáu bản đồ thường là bản dựng từ tệp (có ô dựng sẵn) và phòng vẫn đăng ký đủ", () => {
    const defined: string[] = [];
    defineRooms({ define: (name: string) => defined.push(name) } as never);
    expect(MAPS.length).toBe(6);
    for (const m of MAPS) {
      expect(m.tiles, `${m.id}: MAPS`).toBeDefined();
      expect(MAP_BY_ID[m.id]!.tiles, `${m.id}: MAP_BY_ID`).toBeDefined();
      expect(getMap(m.id)!.def.tiles, `${m.id}: getMap`).toBeDefined();
      expect(defined).toContain(roomNameOf(m.id));
    }
    expect(getMap(DEFAULT_MAP_ID)!.worldW).toBe(96 * 32);
  });
});
