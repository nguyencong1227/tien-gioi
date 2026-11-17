import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_BY_ID, DEFAULT_KEYMAP } from "./keybinds";
import {
  DEFAULT_SOCIAL_TAB,
  SOCIAL_TABS,
  asSocialTab,
  socialEnabled,
  socialTabByKey,
  type SocialTabId,
} from "./social-tabs";

describe("SOCIAL_TABS", () => {
  it("ba tab đúng thứ tự Xếp hạng / Thành tựu / Sự kiện, id duy nhất, không chữ Hán", () => {
    expect(SOCIAL_TABS.map((t) => t.id)).toEqual(["rank", "ach", "event"]);
    expect(SOCIAL_TABS.map((t) => t.label)).toEqual(["Xếp hạng", "Thành tựu", "Sự kiện"]);
    expect(new Set(SOCIAL_TABS.map((t) => t.id)).size).toBe(SOCIAL_TABS.length);
    for (const t of SOCIAL_TABS) expect(t.label).not.toMatch(/\p{Script=Han}/u);
  });

  it("tab mặc định là tab đầu", () => {
    expect(DEFAULT_SOCIAL_TAB).toBe("rank");
  });
});

describe("asSocialTab", () => {
  it("id hợp lệ giữ nguyên; lạ / rỗng / không phải chuỗi / khoá nguyên mẫu về tab mặc định", () => {
    for (const t of SOCIAL_TABS) expect(asSocialTab(t.id)).toBe(t.id);
    for (const bad of ["", "boards", "constructor", "__proto__", null, undefined, 3, {}]) {
      expect(asSocialTab(bad)).toBe(DEFAULT_SOCIAL_TAB);
    }
  });
});

describe("socialTabByKey (mũi tên trên thanh tab)", () => {
  it("Phải / Xuống tiến, vòng từ tab cuối về tab đầu", () => {
    expect(socialTabByKey("rank", "ArrowRight")).toBe("ach");
    expect(socialTabByKey("ach", "ArrowDown")).toBe("event");
    expect(socialTabByKey("event", "ArrowRight")).toBe("rank");
  });

  it("Trái / Lên lùi, vòng từ tab đầu về tab cuối", () => {
    expect(socialTabByKey("event", "ArrowLeft")).toBe("ach");
    expect(socialTabByKey("ach", "ArrowUp")).toBe("rank");
    expect(socialTabByKey("rank", "ArrowLeft")).toBe("event");
  });

  it("Home / End nhảy về đầu / cuối từ mọi tab", () => {
    for (const t of SOCIAL_TABS) {
      expect(socialTabByKey(t.id, "Home")).toBe("rank");
      expect(socialTabByKey(t.id, "End")).toBe("event");
    }
  });

  it("phím khác trả null để phím đi tiếp như thường (Tab, Enter, chữ cái)", () => {
    for (const code of ["Tab", "Enter", "Space", "KeyA", "Escape", ""]) {
      expect(socialTabByKey("rank", code)).toBeNull();
    }
  });

  it("tab hiện tại lạ không làm hỏng chỉ số (coi như tab đầu)", () => {
    expect(socialTabByKey("zzz" as SocialTabId, "ArrowRight")).toBe("ach");
  });
});

describe("socialEnabled (cờ ?social=)", () => {
  it("chỉ bật khi ?social=1 hoặc ?social=on; mặc định TẮT", () => {
    expect(socialEnabled("")).toBe(false);
    expect(socialEnabled("?debug=1")).toBe(false);
    expect(socialEnabled("?social=0")).toBe(false);
    expect(socialEnabled("?social=")).toBe(false);
    expect(socialEnabled("?social=yes")).toBe(false);
    expect(socialEnabled("?social=1")).toBe(true);
    expect(socialEnabled("?debug=1&social=on")).toBe(true);
  });
});

describe("khớp index.html (bảng Xã hội)", () => {
  const html = readFileSync(path.resolve(__dirname, "../index.html"), "utf-8");
  const tagOf = (id: string): string => {
    const m = html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`, "s"));
    expect(m, `thiếu thẻ id="${id}"`).toBeTruthy();
    return m![0];
  };

  it("mỗi tab trong SOCIAL_TABS có đủ nút role=tab + thân role=tabpanel nối aria-controls / aria-labelledby", () => {
    for (const t of SOCIAL_TABS) {
      const btn = tagOf(`social-tab-btn-${t.id}`);
      expect(btn).toContain('role="tab"');
      expect(btn).toContain(`aria-controls="social-tab-${t.id}"`);
      expect(btn).toMatch(/aria-selected="(true|false)"/);
      const pane = tagOf(`social-tab-${t.id}`);
      expect(pane).toContain('role="tabpanel"');
      expect(pane).toContain(`aria-labelledby="social-tab-btn-${t.id}"`);
    }
  });

  it("chỉ tab mặc định mở sẵn (aria-selected=true, tabindex=0); các tab còn lại tabindex=-1 và thân ẩn", () => {
    for (const t of SOCIAL_TABS) {
      const on = t.id === DEFAULT_SOCIAL_TAB;
      const btn = tagOf(`social-tab-btn-${t.id}`);
      expect(btn).toContain(`aria-selected="${on}"`);
      expect(btn).toContain(`tabindex="${on ? 0 : -1}"`);
      expect(/\shidden[\s>]/.test(tagOf(`social-tab-${t.id}`))).toBe(!on);
    }
  });

  it("chữ trên nút tab trong HTML đúng bằng nhãn trong SOCIAL_TABS", () => {
    for (const t of SOCIAL_TABS) {
      const re = new RegExp(`id="social-tab-btn-${t.id}"[^>]*>\\s*([^<]*?)\\s*</button>`, "s");
      expect(html.match(re)?.[1], t.id).toBe(t.label);
    }
  });

  it("tab Thành tựu có đủ chỗ đổ dữ liệu: tóm tắt + trạng thái (role=status), nút Tải lại ẩn sẵn, danh hiệu là radiogroup có nhãn, nhóm thành tựu", () => {
    for (const id of [
      "ach-summary",
      "ach-status",
      "ach-retry",
      "ach-body",
      "ach-worn",
      "ach-titles",
      "ach-groups",
    ])
      tagOf(id);
    expect(tagOf("ach-summary")).toContain('aria-live="polite"');
    expect(tagOf("ach-status")).toContain('role="status"');
    expect(tagOf("ach-titles")).toContain('role="radiogroup"');
    expect(tagOf("ach-titles")).toContain("aria-label=");
    expect(/\shidden[\s>]/.test(tagOf("ach-retry"))).toBe(true);
    expect(/\shidden[\s>]/.test(tagOf("ach-body"))).toBe(true);
  });

  it("nút HUD Xã hội ẩn mặc định (bật bằng cờ ?social=1) và có aria-expanded", () => {
    const btn = tagOf("btn-social");
    expect(/\shidden[\s>]/.test(btn)).toBe(true);
    expect(btn).toContain('aria-expanded="false"');
  });
});

describe("phím tắt bảng Xã hội", () => {
  it("Shift+G (26 chữ cái đã hết chỗ), không phải phím của thế giới, không trùng phím nào khác", () => {
    expect(DEFAULT_KEYMAP["panel.social"]).toEqual(["Shift+KeyG"]);
    expect(ACTION_BY_ID["panel.social"].world).toBe(false);
    const owners = Object.entries(DEFAULT_KEYMAP)
      .filter(([, keys]) => keys.includes("Shift+KeyG"))
      .map(([id]) => id);
    expect(owners).toEqual(["panel.social"]);
  });
});
