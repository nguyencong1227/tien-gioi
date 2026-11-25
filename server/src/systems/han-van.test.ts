// Hàn Vân Lĩnh (M7.5, #506): bản đồ thứ tư, đi qua cổng hai chiều với Âm Sương Trạch; quái Nguyên Anh sinh đúng chỗ / đúng số (M7.5b).
import { describe, expect, it } from "vitest";
import {
  AM_SUONG_ID,
  HAN_VAN_ID,
  MAPS,
  MONSTER_BY_ID,
  getMap,
  roomNameOf,
} from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { spawnInitial } from "./monsters";
import { planTravel } from "./travel";

const AM_SUONG = getMap(AM_SUONG_ID)!;
const HAN_VAN = getMap(HAN_VAN_ID)!;

describe("Hàn Vân Lĩnh: cổng với Âm Sương Trạch (M7.5)", () => {
  it("cổng bắc Âm Sương dẫn tới chỗ xuất hiện của cổng nam Hàn Vân, và ngược lại", () => {
    const bac = AM_SUONG.portals.find((p) => p.id === "am_suong_bac")!;
    const nam = HAN_VAN.portals.find((p) => p.id === "han_van_nam")!;
    {
      const t = makeWorld(AM_SUONG);
      const { p } = addPlayer(t.w, "a", 4, 0);
      p.x = bac.x;
      p.y = bac.y;
      expect(planTravel(t.w, "a", bac.id)).toEqual({
        mapId: HAN_VAN_ID,
        x: nam.spawn.x,
        y: nam.spawn.y,
        portalName: bac.name,
      });
    }
    {
      const t = makeWorld(HAN_VAN);
      const { p } = addPlayer(t.w, "a", 4, 0);
      p.x = nam.x;
      p.y = nam.y;
      expect(planTravel(t.w, "a", nam.id)).toEqual({
        mapId: AM_SUONG_ID,
        x: bac.spawn.x,
        y: bac.spawn.y,
        portalName: nam.name,
      });
    }
  });

  it("xa cổng thì không qua được; cổng của bản đồ khác thì bị từ chối", () => {
    const t = makeWorld(HAN_VAN);
    const { p } = addPlayer(t.w, "a", 4, 0);
    p.x = HAN_VAN.townPx.x;
    p.y = HAN_VAN.townPx.y - 600; // ngoài tầm cổng
    expect(planTravel(t.w, "a", "han_van_nam")).toBeNull();
    const nam = HAN_VAN.portals[0];
    p.x = nam.x;
    p.y = nam.y;
    expect(planTravel(t.w, "a", "am_suong_bac")).toBeNull(); // cổng ở bản đồ khác
    expect(planTravel(t.w, "a", "hac_phong_bac")).toBeNull();
  });

  it("cổng Âm Sương cũ không đổi (`am_suong_nam` vẫn ở đầu mảng) và vẫn qua được Hắc Phong", () => {
    expect(AM_SUONG.portals.map((p) => p.id)).toEqual(["am_suong_nam", "am_suong_bac"]);
    const nam = AM_SUONG.portals[0];
    const t = makeWorld(AM_SUONG);
    const { p } = addPlayer(t.w, "a", 3, 0);
    p.x = nam.x;
    p.y = nam.y;
    expect(planTravel(t.w, "a", "am_suong_nam")?.mapId).toBe("hac_phong");
  });

  it("chỗ xuất hiện của người vừa qua cổng nằm trong khu an toàn của cổng, không đứng được ngoài trạm bị quái đánh", () => {
    for (const [map, id] of [
      [AM_SUONG, "am_suong_bac"],
      [HAN_VAN, "han_van_nam"],
    ] as const) {
      const portal = map.portal(id)!;
      expect(map.inSafe(portal.spawn.x, portal.spawn.y), id).toBe(true);
      expect(map.circleBlocked(portal.spawn.x, portal.spawn.y, 14), id).toBe(false);
    }
  });
});

describe("Hàn Vân Lĩnh: phòng riêng và quái Nguyên Anh (M7.5)", () => {
  it("có phòng Colyseus riêng (`world_han_van`), tên khác các phòng kia", () => {
    expect(roomNameOf(HAN_VAN_ID)).toBe("world_han_van");
    expect(MAPS.map((m) => roomNameOf(m.id))).toEqual([
      "world",
      "world_hac_phong",
      "world_am_suong",
      "world_han_van",
      "world_lang_hoang",
      "world_uy_van",
    ]);
  });

  it("sinh quái ban đầu đúng `monsterCap` (20 / 16 / 12 / 12 / trùm 2), toàn loài Nguyên Anh, không con nào trong khu an toàn, không loài Kim Đan hay cũ", () => {
    const t = makeWorld(HAN_VAN);
    spawnInitial(t.w);
    const count: Record<string, number> = {};
    t.w.state.monsters.forEach((m) => {
      count[m.kind] = (count[m.kind] ?? 0) + 1;
      expect(HAN_VAN.inSafe(m.x, m.y, 0), `${m.kind} trong khu an toàn`).toBe(false);
      expect(HAN_VAN.circleBlocked(m.x, m.y, MONSTER_BY_ID[m.kind].radius), m.kind).toBe(false);
    });
    expect(count).toEqual({
      han_lang: 20,
      phong_nha: 16,
      cot_tuong: 12,
      doc_tuoc: 12,
      thien_han_vuong: 2,
    });
    expect(t.w.state.monsters.size).toBe(62);
  });

  it("quái sinh đúng vùng nguy hiểm của loài (minDanger): Hàn Lang gần trạm, trùm xa nhất; không loài nào sinh sát trạm", () => {
    const t = makeWorld(HAN_VAN);
    spawnInitial(t.w);
    t.w.state.monsters.forEach((m) => {
      const def = MONSTER_BY_ID[m.kind];
      expect(HAN_VAN.dangerAt(m.x, m.y), m.kind).toBeGreaterThanOrEqual(def.minDanger);
    });
  });
});
