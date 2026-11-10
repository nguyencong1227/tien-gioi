import { describe, expect, it } from "vitest";
import {
  JOIN_BAD_MAP,
  JOIN_WRONG_MAP,
  TRAVEL_COMBAT_LOCK_MS,
  TRAVEL_COOLDOWN_MS,
  TRAVEL_JOIN_TIMEOUT_MS,
  parseWrongMap,
  wrongMapMessage,
} from "./travel";
import { DEFAULT_MAP_ID, HAC_PHONG_ID } from "./map";
import { NPCS, npcsOfMap } from "./npcs";

describe("chuyển bản đồ: hợp đồng (M3 bước 1)", () => {
  it("wrongMapMessage và parseWrongMap khứ hồi; chỉ nhận đúng mã lỗi và đúng tiền tố", () => {
    expect(wrongMapMessage(HAC_PHONG_ID)).toBe("wrong_map:hac_phong");
    expect(parseWrongMap(JOIN_WRONG_MAP, wrongMapMessage(HAC_PHONG_ID))).toBe(HAC_PHONG_ID);
    expect(parseWrongMap(JOIN_WRONG_MAP, wrongMapMessage(DEFAULT_MAP_ID))).toBe(DEFAULT_MAP_ID);
  });

  it("parseWrongMap: lỗi khác, thông điệp rác, id rỗng đều là undefined (không ném)", () => {
    expect(parseWrongMap(409, wrongMapMessage(HAC_PHONG_ID))).toBeUndefined();
    expect(parseWrongMap(JOIN_BAD_MAP, wrongMapMessage(HAC_PHONG_ID))).toBeUndefined();
    expect(parseWrongMap(JOIN_WRONG_MAP, "Nhân vật này đang ở trong game.")).toBeUndefined();
    expect(parseWrongMap(JOIN_WRONG_MAP, "wrong_map:")).toBeUndefined();
    expect(parseWrongMap(JOIN_WRONG_MAP, "xwrong_map:hac_phong")).toBeUndefined();
    for (const bad of [undefined, null, 5, {}, [], Symbol.iterator])
      expect(parseWrongMap(JOIN_WRONG_MAP, bad)).toBeUndefined();
    for (const bad of [undefined, null, "421", {}, Number.NaN])
      expect(parseWrongMap(bad, wrongMapMessage(HAC_PHONG_ID))).toBeUndefined();
  });

  it("mã lỗi không trùng các mã cũ của server (400, 403, 409) và khác nhau", () => {
    expect(new Set([JOIN_WRONG_MAP, JOIN_BAD_MAP, 400, 403, 409]).size).toBe(5);
  });

  it("hằng số hợp lý: hồi chiêu và khoá giao chiến dương, chờ vào phòng đích đủ lâu hơn hồi chiêu", () => {
    for (const v of [TRAVEL_COOLDOWN_MS, TRAVEL_COMBAT_LOCK_MS, TRAVEL_JOIN_TIMEOUT_MS])
      expect(Number.isFinite(v) && v > 0).toBe(true);
    expect(TRAVEL_JOIN_TIMEOUT_MS).toBeGreaterThan(TRAVEL_COOLDOWN_MS);
  });

  it("npcsOfMap: NPC không ghi mapId thuộc Lạc Hà; bản đồ khác chưa có NPC; id lạ rỗng", () => {
    expect(npcsOfMap(DEFAULT_MAP_ID)).toEqual(NPCS);
    expect(npcsOfMap(HAC_PHONG_ID)).toEqual([]);
    expect(npcsOfMap("constructor")).toEqual([]);
  });
});
