import { describe, expect, it } from "vitest";
import { ACTION_BY_ID, DEFAULT_KEYMAP, buildLookup, actionOfEvent } from "./keybinds";
import { LEAVE_BUTTONS, PROMPT_BUTTONS, pickPromptButton, pickVisible } from "./prompts";

const shown = (...ids: string[]) => {
  const set = new Set(ids);
  return (id: string) => set.has(id);
};

describe("pickPromptButton: Y / X trả lời hộp đang hiện (#463)", () => {
  it("không hộp nào hiện thì không có gì để trả lời", () => {
    expect(pickPromptButton("yes", shown())).toBeNull();
    expect(pickPromptButton("no", shown())).toBeNull();
  });
  it("mỗi loại lời mời: Y nhận, X từ chối đúng nút của hộp đó", () => {
    expect(pickPromptButton("yes", shown("pib-btn-accept", "pib-btn-decline"))).toBe(
      "pib-btn-accept",
    );
    expect(pickPromptButton("no", shown("pib-btn-accept", "pib-btn-decline"))).toBe(
      "pib-btn-decline",
    );
    expect(pickPromptButton("yes", shown("dib-btn-enter", "dib-btn-decline"))).toBe(
      "dib-btn-enter",
    );
    expect(pickPromptButton("yes", shown("duib-btn-accept"))).toBe("duib-btn-accept");
    expect(pickPromptButton("yes", shown("sib-btn-accept"))).toBe("sib-btn-accept");
    expect(pickPromptButton("no", shown("sib-btn-decline"))).toBe("sib-btn-decline");
  });
  it("nhiều hộp cùng hiện: xác nhận rời / đầu hàng trước, rồi thách đấu, bí cảnh, tổ đội, tông môn", () => {
    const all = [...PROMPT_BUTTONS.yes];
    const order: string[] = [];
    let left = all.slice();
    while (left.length > 0) {
      const id = pickPromptButton("yes", shown(...left));
      expect(id).not.toBeNull();
      order.push(id!);
      left = left.filter((x) => x !== id);
    }
    expect(order).toEqual([
      "dhud-btn-leave-yes",
      "duel-btn-yield-yes",
      "duib-btn-accept",
      "dib-btn-enter",
      "pib-btn-accept",
      "sib-btn-accept",
    ]);
  });
  it("hai danh sách Y và X song song: cùng hộp ở cùng vị trí", () => {
    expect(PROMPT_BUTTONS.yes).toHaveLength(PROMPT_BUTTONS.no.length);
    const stem = (id: string) => id.replace(/-(yes|no|accept|decline|enter)$/, "");
    PROMPT_BUTTONS.yes.forEach((y, i) => {
      const n = PROMPT_BUTTONS.no[i];
      // cùng tiền tố hộp (pib / dib / duib / sib / dhud-btn-leave / duel-btn-yield)
      expect(stem(y).slice(0, 3)).toBe(stem(n).slice(0, 3));
    });
  });
  it("pickVisible giữ thứ tự danh sách; nút mở xác nhận: rời bí cảnh trước đầu hàng", () => {
    expect(pickVisible(LEAVE_BUTTONS, shown("duel-btn-yield"))).toBe("duel-btn-yield");
    expect(pickVisible(LEAVE_BUTTONS, shown("duel-btn-yield", "dhud-btn-leave"))).toBe(
      "dhud-btn-leave",
    );
    expect(pickVisible(LEAVE_BUTTONS, shown())).toBeNull();
  });
});

describe("phím mặc định của lời mời / rời trận", () => {
  const lookup = buildLookup(DEFAULT_KEYMAP);
  it("Y = nhận, X = từ chối, R = rời / đầu hàng; 0 là tắt tiếng (N nay là Sổ nhiệm vụ, không đè lời mời)", () => {
    expect(actionOfEvent({ code: "KeyY" }, lookup)).toBe("prompt.yes");
    expect(actionOfEvent({ code: "KeyX" }, lookup)).toBe("prompt.no");
    expect(actionOfEvent({ code: "KeyR" }, lookup)).toBe("exit.fight");
    expect(actionOfEvent({ code: "Digit0" }, lookup)).toBe("sound.mute");
    expect(actionOfEvent({ code: "KeyP" }, lookup)).toBe("player.menu");
  });
  it("trả lời lời mời chạy được cả khi bảng đang mở (hộp lời mời không chặn điều khiển); mở xác nhận rời thì là của thế giới", () => {
    expect(ACTION_BY_ID["prompt.yes"].world).toBe(false);
    expect(ACTION_BY_ID["prompt.no"].world).toBe(false);
    expect(ACTION_BY_ID["exit.fight"].world).toBe(true);
  });
});
