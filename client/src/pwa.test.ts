import { describe, expect, it } from "vitest";
import { canReloadSafely, type PwaGameState } from "./pwa";

describe("canReloadSafely (logic cập nhật an toàn, #251)", () => {
  it("trả về true khi trạng thái an toàn (ở trấn, không PK, không bí cảnh, không giao chiến)", () => {
    const safeState: PwaGameState = {
      inDuel: false,
      inDungeon: false,
      isDungeonMap: false,
      inLimbo: false,
      isDead: false,
      isTravelling: false,
      inCombat: false,
    };
    expect(canReloadSafely(safeState)).toBe(true);
    expect(canReloadSafely({})).toBe(true);
  });

  it("trả về false khi đang thách đấu PK (inDuel)", () => {
    expect(canReloadSafely({ inDuel: true })).toBe(false);
  });

  it("trả về false khi đang ở trong bí cảnh (inDungeon hoặc isDungeonMap)", () => {
    expect(canReloadSafely({ inDungeon: true })).toBe(false);
    expect(canReloadSafely({ isDungeonMap: true })).toBe(false);
  });

  it("trả về false khi đang ở Hoàng Tuyền / chọn Tam Sinh Thạch (inLimbo)", () => {
    expect(canReloadSafely({ inLimbo: true })).toBe(false);
  });

  it("trả về false khi đang gục ngã (isDead)", () => {
    expect(canReloadSafely({ isDead: true })).toBe(false);
  });

  it("trả về false khi đang chuyển bản đồ qua cổng truyền tống (isTravelling)", () => {
    expect(canReloadSafely({ isTravelling: true })).toBe(false);
  });

  it("trả về false khi đang giao chiến (inCombat)", () => {
    expect(canReloadSafely({ inCombat: true })).toBe(false);
  });

  it("ưu tiên chặn tải lại khi kết hợp nhiều trạng thái căng thẳng", () => {
    expect(
      canReloadSafely({
        inDuel: true,
        inCombat: true,
        isDead: true,
      }),
    ).toBe(false);
  });
});
