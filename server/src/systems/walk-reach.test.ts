// Mặt nạ đi bộ DỰNG SẴN lúc tạo phòng (`warmWalkReach`) phải giống hệt mặt nạ dựng lười ở lần gọi đầu của `reachableFromTown`: nếu dựng sẵn lưu sai (ví dụ `null` = "mọi chỗ đều tới được")
// thì mọi phòng thật (đều được dựng sẵn ở `onCreate`) sẽ không bao giờ dời vị trí lưu nằm trong túi kín, mà test "đã dựng chưa" (`isWalkReachWarm`) vẫn xanh. (Bản vá test của B, review #1223.)
import { describe, expect, it } from "vitest";
import { GameMap, MAPS } from "@tien-gioi/shared";
import { isWalkReachWarm, reachableFromTown, warmWalkReach } from "./walk-reach";

describe("warmWalkReach: mặt nạ dựng sẵn giống mặt nạ dựng lười", () => {
  for (const def of MAPS)
    it(`${def.id}: mọi điểm lấy mẫu (bước 24 px, cả chỗ bao kín) cho cùng kết quả`, () => {
      // hai đối tượng GameMap riêng cho cùng định nghĩa: bộ nhớ đệm khoá theo đối tượng nên hai mặt nạ độc lập
      const warm = new GameMap(def);
      const cold = new GameMap(def);
      warmWalkReach(warm);
      expect(isWalkReachWarm(warm)).toBe(true);
      expect(isWalkReachWarm(cold)).toBe(false);
      let yes = 0;
      let no = 0;
      let mismatch = 0;
      for (let y = 8; y < warm.worldH; y += 24)
        for (let x = 8; x < warm.worldW; x += 24) {
          const a = reachableFromTown(warm, x, y);
          if (a !== reachableFromTown(cold, x, y)) mismatch++;
          if (a) yes++;
          else no++;
        }
      expect(mismatch).toBe(0);
      // không tầm thường: có cả chỗ tới được và chỗ bao kín (nếu không thì test này không phân biệt được mặt nạ thật với "mọi chỗ đều tới được")
      expect(yes).toBeGreaterThan(1000);
      expect(no).toBeGreaterThan(50);
    });

  it("gọi `warmWalkReach` hai lần giữ nguyên kết quả (idempotent; việc không dựng lại chỉ là tối ưu, test không đo được)", () => {
    const m = new GameMap(MAPS[0]!);
    warmWalkReach(m);
    const probe = reachableFromTown(m, m.townPx.x, m.townPx.y);
    warmWalkReach(m);
    expect(isWalkReachWarm(m)).toBe(true);
    expect(reachableFromTown(m, m.townPx.x, m.townPx.y)).toBe(probe);
  });
});
