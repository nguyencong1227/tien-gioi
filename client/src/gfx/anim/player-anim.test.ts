import { describe, it, expect } from "vitest";
import {
  PLAYER_DIE_FRAMES,
  markPlayerHurt,
  newPlayerAnimClock,
  playerAnimKey,
  playerAnimMs,
  playerAnimState,
  type PlayerAnimInput,
} from "./player-anim";

const input = (o: Partial<PlayerAnimInput> = {}): PlayerAnimInput => ({
  dead: false,
  slashUntil: 0,
  moving: false,
  ...o,
});

describe("gfx/anim/player-anim: máy trạng thái hoạt ảnh người chơi", () => {
  it("mặc định đứng; đang đi thì đi", () => {
    const c = newPlayerAnimClock();
    expect(playerAnimState(c, 100, input())).toBe("idle");
    expect(playerAnimState(c, 100, input({ moving: true }))).toBe("walk");
  });

  it("đánh (slashUntil còn hạn) thắng đi / đứng, hết hạn thì quay lại", () => {
    const c = newPlayerAnimClock();
    expect(playerAnimState(c, 100, input({ slashUntil: 320, moving: true }))).toBe("slash");
    expect(playerAnimState(c, 319, input({ slashUntil: 320 }))).toBe("slash");
    expect(playerAnimState(c, 320, input({ slashUntil: 320, moving: true }))).toBe("walk");
  });

  it("bị đánh: đúng trong thời lượng rồi thôi; thắng đánh / đi", () => {
    const c = newPlayerAnimClock();
    markPlayerHurt(c, 1000);
    expect(playerAnimState(c, 1000, input({ slashUntil: 5000, moving: true }))).toBe("hurt");
    expect(playerAnimState(c, 1000 + playerAnimMs("hurt") - 1, input())).toBe("hurt");
    expect(playerAnimState(c, 1000 + playerAnimMs("hurt"), input())).toBe("idle");
  });

  it("gục thắng tất cả, kể cả khi vừa bị đánh / đang đánh; hồi sinh thì quay về đứng", () => {
    const c = newPlayerAnimClock();
    markPlayerHurt(c, 0);
    expect(playerAnimState(c, 10, input({ dead: true, slashUntil: 999, moving: true }))).toBe(
      "die",
    );
    expect(playerAnimState(c, 10_000_000, input({ dead: true }))).toBe("die");
    expect(playerAnimState(c, 10_000_000, input({ dead: false }))).toBe("idle");
  });

  it("khoá hoạt ảnh: gục không có hướng, còn lại theo hướng; bộ đồ robe có tiền tố riêng", () => {
    expect(playerAnimKey("me", "die", "left")).toBe("me-die");
    expect(playerAnimKey("me", "die", "up")).toBe("me-die");
    expect(playerAnimKey("me", "hurt", "left")).toBe("me-hurt-left");
    expect(playerAnimKey("robe-hac_ho_bao", "walk", "down")).toBe("robe-hac_ho_bao-walk-down");
    expect(playerAnimKey("other", "slash", "right")).toBe("other-slash-right");
    expect(playerAnimKey("other", "idle", "up")).toBe("other-idle-up");
  });

  it("thời lượng = số khung / tốc độ (gục 4 khung)", () => {
    expect(PLAYER_DIE_FRAMES).toBe(4);
    expect(playerAnimMs("die")).toBe(400);
    expect(playerAnimMs("hurt")).toBe(167);
  });
});
