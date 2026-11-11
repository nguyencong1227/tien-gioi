import { describe, expect, it } from "vitest";
import { canReloadSafely, isNativeApp, type PwaGameState } from "./pwa";

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

describe("isNativeApp (phát hiện chế độ đóng gói native, M4.2a #300)", () => {
  it("trả về true khi VITE_NATIVE là '1', true hoặc 'true'", () => {
    expect(isNativeApp({ VITE_NATIVE: "1" })).toBe(true);
    expect(isNativeApp({ VITE_NATIVE: true })).toBe(true);
    expect(isNativeApp({ VITE_NATIVE: "true" })).toBe(true);
  });

  it("trả về false khi VITE_NATIVE là '0', false, undefined hoặc rỗng", () => {
    expect(isNativeApp({ VITE_NATIVE: "0" })).toBe(false);
    expect(isNativeApp({ VITE_NATIVE: false })).toBe(false);
    expect(isNativeApp({ VITE_NATIVE: "" })).toBe(false);
    expect(isNativeApp({})).toBe(false);
    expect(isNativeApp(undefined as any)).toBe(false);
  });

  it("nhánh quyết định kích hoạt PWA: bản native không bao giờ bật PWA", () => {
    const shouldEnablePwa = (env: Record<string, any>) =>
      !isNativeApp(env) && Boolean(env.PROD || env.pwa);

    // Ở web production hoặc test ?pwa: bật
    expect(shouldEnablePwa({ PROD: true })).toBe(true);
    expect(shouldEnablePwa({ pwa: "1" })).toBe(true);

    // Khi build native (VITE_NATIVE=1): KHÔNG BAO GIỜ bật kể cả khi PROD=true
    expect(shouldEnablePwa({ PROD: true, VITE_NATIVE: "1" })).toBe(false);
    expect(shouldEnablePwa({ PROD: true, VITE_NATIVE: true })).toBe(false);
    expect(shouldEnablePwa({ pwa: "1", VITE_NATIVE: "1" })).toBe(false);
  });
});
