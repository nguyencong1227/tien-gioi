import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_ID, MAPS, getMap, isDungeonMap } from "@tien-gioi/shared";
import { mockSpawnOf, mockStartMapId, mockSyncsState } from "./mock-map";

describe("mockStartMapId (?map=<id> của chế độ mock)", () => {
  it("không ghi gì thì dùng bản đồ mặc định", () => {
    expect(mockStartMapId("?dungeon=mock&debug=1", false)).toBe(DEFAULT_MAP_ID);
    expect(mockStartMapId("", true)).toBe(DEFAULT_MAP_ID);
  });

  it("chọn được mọi bản đồ NGOÀI (không phải bí cảnh) bằng id", () => {
    const outdoor = MAPS.filter((d) => !isDungeonMap(d.id));
    expect(outdoor.map((d) => d.id)).toContain("am_suong");
    for (const d of outdoor) {
      expect(mockStartMapId(`?crowd=5&debug=1&map=${d.id}`, false)).toBe(d.id);
    }
  });

  it("bản đồ bí cảnh / id lạ / id độc quay về bản đồ mặc định", () => {
    for (const d of MAPS.filter((x) => isDungeonMap(x.id))) {
      expect(mockStartMapId(`?debug=1&map=${d.id}`, false)).toBe(DEFAULT_MAP_ID);
    }
    for (const bad of ["", "khong_co", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(mockStartMapId(`?debug=1&map=${bad}`, false)).toBe(DEFAULT_MAP_ID);
    }
  });

  it("bản chạy thật (không DEV, không ?debug) bỏ qua ?map=", () => {
    expect(mockStartMapId("?map=am_suong", false)).toBe(DEFAULT_MAP_ID);
    expect(mockStartMapId("?map=am_suong", true)).toBe("am_suong");
  });
});

describe("mockSpawnOf (điểm đứng của người chơi mock)", () => {
  it("bản đồ mặc định giữ điểm cũ (512, 896) để ảnh / số đo cũ không đổi", () => {
    expect(mockSpawnOf(DEFAULT_MAP_ID)).toEqual({ x: 512, y: 896 });
  });

  it("bản đồ khác đứng giữa trấn an toàn và đi được", () => {
    for (const d of MAPS.filter((x) => !isDungeonMap(x.id) && x.id !== DEFAULT_MAP_ID)) {
      const map = getMap(d.id)!;
      const p = mockSpawnOf(d.id);
      expect(map.inTown(p.x, p.y)).toBe(true);
      expect(map.isBlockedPx(p.x, p.y)).toBe(false);
    }
  });

  it("id lạ dùng điểm của bản đồ mặc định thay vì ném lỗi", () => {
    expect(mockSpawnOf("khong_co")).toEqual({ x: 512, y: 896 });
    expect(mockSpawnOf("constructor")).toEqual({ x: 512, y: 896 });
  });
});

describe("mockSyncsState (phòng mock đồng bộ vị trí khi có ?map=)", () => {
  it("chỉ khi có ?map= (DEV hoặc ?debug); kịch bản mock cũ không có ?map= giữ nguyên", () => {
    expect(mockSyncsState("?dungeon=mock&debug=1", false)).toBe(false);
    expect(mockSyncsState("?crowd=30&debug=1", false)).toBe(false);
    expect(mockSyncsState("?crowd=20&debug=1&map=am_suong", false)).toBe(true);
    expect(mockSyncsState("?map=lac_ha", true)).toBe(true);
  });

  it("bản chạy thật (không DEV, không ?debug) không bao giờ bật", () => {
    expect(mockSyncsState("?map=am_suong", false)).toBe(false);
  });
});
