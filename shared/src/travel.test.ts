import { describe, expect, it } from "vitest";
import {
  JOIN_WRONG_MAP,
  TRAVEL_COMBAT_LOCK_MS,
  TRAVEL_COOLDOWN_MS,
  TRAVEL_JOIN_TIMEOUT_MS,
  parseWrongMap,
  roomNameOf,
  wrongMapMessage,
} from "./travel";
import { AM_SUONG_ID, DEFAULT_MAP_ID, HAC_PHONG_ID, MAPS } from "./map";
import { ROOM_NAME } from "./game";
import { NPCS, npcsOfMap } from "./npcs";

describe("chuyển bản đồ: hợp đồng (M3 bước 1)", () => {
  it("wrongMapMessage và parseWrongMap khứ hồi; chỉ nhận đúng mã lỗi và đúng tiền tố", () => {
    expect(wrongMapMessage(HAC_PHONG_ID)).toBe("wrong_map:hac_phong");
    expect(parseWrongMap(JOIN_WRONG_MAP, wrongMapMessage(HAC_PHONG_ID))).toBe(HAC_PHONG_ID);
    expect(parseWrongMap(JOIN_WRONG_MAP, wrongMapMessage(DEFAULT_MAP_ID))).toBe(DEFAULT_MAP_ID);
  });

  it("parseWrongMap: lỗi khác, thông điệp rác, id rỗng đều là undefined (không ném)", () => {
    expect(parseWrongMap(409, wrongMapMessage(HAC_PHONG_ID))).toBeUndefined();
    expect(parseWrongMap(JOIN_WRONG_MAP, "Nhân vật này đang ở trong game.")).toBeUndefined();
    expect(parseWrongMap(JOIN_WRONG_MAP, "wrong_map:")).toBeUndefined();
    expect(parseWrongMap(JOIN_WRONG_MAP, "xwrong_map:hac_phong")).toBeUndefined();
    for (const bad of [undefined, null, 5, {}, [], Symbol.iterator])
      expect(parseWrongMap(JOIN_WRONG_MAP, bad)).toBeUndefined();
    for (const bad of [undefined, null, "421", {}, Number.NaN])
      expect(parseWrongMap(bad, wrongMapMessage(HAC_PHONG_ID))).toBeUndefined();
  });

  it("mã lỗi không trùng các mã cũ của server (400, 403, 409)", () => {
    expect(new Set([JOIN_WRONG_MAP, 400, 403, 409]).size).toBe(4);
  });

  it("roomNameOf: bản đồ mặc định giữ ROOM_NAME; mỗi bản đồ một tên khác nhau, chỉ gồm chữ thường, số, gạch dưới", () => {
    expect(roomNameOf(DEFAULT_MAP_ID)).toBe(ROOM_NAME);
    expect(roomNameOf(HAC_PHONG_ID)).toBe("world_hac_phong");
    const names = MAPS.map((m) => roomNameOf(m.id));
    expect(new Set(names).size).toBe(MAPS.length);
    for (const n of names) expect(n).toMatch(/^[a-z0-9_]+$/);
    // Id bản đồ không được làm tên phòng của bản đồ này trùng tên phòng bản đồ kia
    for (const a of MAPS)
      for (const b of MAPS) if (a !== b) expect(roomNameOf(a.id)).not.toBe(roomNameOf(b.id));
  });

  it("hằng số hợp lý: hồi chiêu và khoá giao chiến dương, chờ vào phòng đích đủ lâu hơn hồi chiêu", () => {
    for (const v of [TRAVEL_COOLDOWN_MS, TRAVEL_COMBAT_LOCK_MS, TRAVEL_JOIN_TIMEOUT_MS])
      expect(Number.isFinite(v) && v > 0).toBe(true);
    expect(TRAVEL_JOIN_TIMEOUT_MS).toBeGreaterThan(TRAVEL_COOLDOWN_MS);
  });

  it("npcsOfMap: NPC không ghi mapId thuộc Lạc Hà; Hắc Phong Cốc có đúng lái buôn Thanh Lộ; Âm Sương Trạch có ba NPC Vọng Sương; id lạ rỗng", () => {
    expect(npcsOfMap(DEFAULT_MAP_ID)).toEqual(NPCS.filter((n) => n.mapId === undefined));
    expect(npcsOfMap(DEFAULT_MAP_ID).map((n) => n.id)).toEqual([
      "truong_tran",
      "duoc_su",
      "tho_ren",
      "cao_thi",
      "thu_mon",
    ]);
    expect(npcsOfMap(HAC_PHONG_ID).map((n) => n.id)).toEqual(["lai_buon"]);
    expect(npcsOfMap(AM_SUONG_ID).map((n) => n.id)).toEqual([
      "tram_truong",
      "lai_buon_suong",
      "tho_ren_suong",
    ]);
    // mọi NPC thuộc đúng một bản đồ có thật
    expect(
      npcsOfMap(DEFAULT_MAP_ID).length +
        npcsOfMap(HAC_PHONG_ID).length +
        npcsOfMap(AM_SUONG_ID).length,
    ).toBe(NPCS.length);
    expect(npcsOfMap("constructor")).toEqual([]);
  });
});
