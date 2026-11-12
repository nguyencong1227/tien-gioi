import { describe, it, expect } from "vitest";
import {
  HURT_MAX_DEFER_MS,
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

describe("gfx/anim: bị đánh KHÔNG cắt ngang đòn đánh (nit của A ở #346)", () => {
  it("bị đánh giữa đòn: vẫn Chém tới hết đòn rồi mới giật lùi đủ thời lượng, rồi về đứng", () => {
    const c = newPlayerAnimClock();
    const hurtMs = playerAnimMs("hurt");
    markPlayerHurt(c, 1000, 1200); // đòn đánh còn tới 1200
    expect(playerAnimState(c, 1000, input({ slashUntil: 1200 }))).toBe("slash");
    expect(playerAnimState(c, 1199, input({ slashUntil: 1200 }))).toBe("slash");
    expect(playerAnimState(c, 1200, input({ slashUntil: 1200 }))).toBe("hurt");
    expect(playerAnimState(c, 1200 + hurtMs - 1, input())).toBe("hurt");
    expect(playerAnimState(c, 1200 + hurtMs, input())).toBe("idle");
  });

  it("không đang đánh (slashUntil 0 / đã qua): giật lùi ngay như cũ", () => {
    const c = newPlayerAnimClock();
    markPlayerHurt(c, 1000);
    expect(playerAnimState(c, 1000, input())).toBe("hurt");
    markPlayerHurt(c, 5000, 4000); // đòn đánh đã xong từ lâu
    expect(playerAnimState(c, 5000, input())).toBe("hurt");
  });

  it("chờ tối đa HURT_MAX_DEFER_MS dù slashUntil lạ (không kẹt tư thế đánh hoặc hoãn vô hạn)", () => {
    const c = newPlayerAnimClock();
    markPlayerHurt(c, 1000, 999_999);
    expect(c.hurtFrom).toBe(1000 + HURT_MAX_DEFER_MS);
    markPlayerHurt(c, 1000, Number.NaN);
    expect(c.hurtFrom).toBe(1000);
    markPlayerHurt(c, 1000, Number.POSITIVE_INFINITY);
    expect(c.hurtFrom).toBe(1000);
  });

  it("gục vẫn thắng cả lúc đang chờ giật lùi; bị đánh lần hai trong lúc chờ thì mốc bắt đầu tính lại", () => {
    const c = newPlayerAnimClock();
    markPlayerHurt(c, 1000, 1200);
    expect(playerAnimState(c, 1100, input({ dead: true, slashUntil: 1200 }))).toBe("die");
    markPlayerHurt(c, 1100, 1200); // đòn thứ hai khi vẫn đang chờ
    expect(c.hurtFrom).toBe(1200);
    expect(playerAnimState(c, 1250, input())).toBe("hurt");
  });
});
