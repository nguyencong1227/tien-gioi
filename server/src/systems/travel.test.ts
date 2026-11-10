// Đi qua cổng: kiểm hợp lệ và lập kế hoạch (WorldRoom.travel lo phần lưu / gửi tin: xem WorldRoom.test.ts).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  TRAVEL_COMBAT_LOCK_MS,
  TRAVEL_COOLDOWN_MS,
  getMap,
} from "@tien-gioi/shared";
import { PORTAL_SLACK, planTravel } from "./travel";
import { addPlayer, makeWorld } from "./test-helpers";

const HAC_PHONG = getMap(HAC_PHONG_ID)!;
const BAC = DEFAULT_MAP.portals[0];
const NAM = HAC_PHONG.portals[0];

function setup(map = DEFAULT_MAP) {
  const t = makeWorld(map);
  const a = addPlayer(t.w, "a");
  const portal = map.portals[0];
  a.p.x = portal.x;
  a.p.y = portal.y;
  return { ...t, ...a };
}

describe("planTravel", () => {
  it("đứng ở cổng: kế hoạch là bản đồ đích và chỗ xuất hiện của cổng đích, ở cả hai chiều", () => {
    const lh = setup();
    expect(planTravel(lh.w, "a", BAC.id)).toEqual({
      mapId: HAC_PHONG_ID,
      x: NAM.spawn.x,
      y: NAM.spawn.y,
      portalName: BAC.name,
    });
    const hp = setup(HAC_PHONG);
    expect(planTravel(hp.w, "a", NAM.id)).toEqual({
      mapId: DEFAULT_MAP_ID,
      x: BAC.spawn.x,
      y: BAC.spawn.y,
      portalName: NAM.name,
    });
    expect(lh.toasts).toHaveLength(0);
  });

  it("tầm cổng: trong r + sai số thì được, xa hơn thì bị từ chối kèm toast", () => {
    const t = setup();
    t.p.x = BAC.x + BAC.r + PORTAL_SLACK;
    expect(planTravel(t.w, "a", BAC.id)).not.toBeNull();
    t.p.x = BAC.x + BAC.r + PORTAL_SLACK + 1;
    expect(planTravel(t.w, "a", BAC.id)).toBeNull();
    expect(t.toasts.at(-1)?.msg.text).toMatch(/gần cổng/);
  });

  it("cổng của bản đồ khác không dùng được (id đúng nhưng không có ở bản đồ này)", () => {
    const t = setup();
    expect(planTravel(t.w, "a", NAM.id)).toBeNull();
    expect(t.toasts.at(-1)?.msg.text).toMatch(/Không có cổng/);
  });

  it("hồi chiêu tính theo lần qua cổng lưu trong file (qua cả các phòng)", () => {
    const t = setup();
    t.c.save.travelAt = t.w.now - (TRAVEL_COOLDOWN_MS - 100);
    expect(planTravel(t.w, "a", BAC.id)).toBeNull();
    expect(t.toasts.at(-1)?.msg.text).toMatch(/chờ/);
    t.c.save.travelAt = t.w.now - TRAVEL_COOLDOWN_MS;
    expect(planTravel(t.w, "a", BAC.id)).not.toBeNull();
    t.c.save.travelAt = undefined;
    expect(planTravel(t.w, "a", BAC.id)).not.toBeNull();
  });

  it("vừa bị đánh thì chưa qua cổng được; hết thời gian khoá thì được", () => {
    const t = setup();
    t.c.lastHitAt = t.w.now - (TRAVEL_COMBAT_LOCK_MS - 100);
    expect(planTravel(t.w, "a", BAC.id)).toBeNull();
    expect(t.toasts.at(-1)?.msg.text).toMatch(/giao chiến/);
    t.c.lastHitAt = t.w.now - TRAVEL_COMBAT_LOCK_MS;
    expect(planTravel(t.w, "a", BAC.id)).not.toBeNull();
  });

  it("người đã chết, đang qua cổng, hoặc không có trong phòng: im lặng, không kế hoạch", () => {
    const t = setup();
    t.c.travelling = true;
    expect(planTravel(t.w, "a", BAC.id)).toBeNull();
    t.c.travelling = false;
    t.p.dead = true;
    expect(planTravel(t.w, "a", BAC.id)).toBeNull();
    expect(planTravel(t.w, "khong_co", BAC.id)).toBeNull();
    expect(t.toasts).toHaveLength(0);
  });

  it("id cổng rác (kiểu sai, constructor, __proto__, rỗng): không bao giờ có kế hoạch, không ném lỗi", () => {
    const t = setup();
    for (const bad of [
      undefined,
      null,
      5,
      true,
      {},
      [],
      ["lac_ha_bac"],
      "",
      "constructor",
      "__proto__",
      "toString",
      "x".repeat(10_000),
    ])
      expect(planTravel(t.w, "a", bad), JSON.stringify(bad)).toBeNull();
  });
});
