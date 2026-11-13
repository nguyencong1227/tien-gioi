// Ba hàm của `ui` đặt nhãn / title / aria-label cho nút ngữ cảnh (#438, #443): kiểm hành vi THẬT trên phần tử giả (không cần trình duyệt).
// `snap-touch.mjs` kiểm cùng việc trong Chrome thật nhưng không chạy ở CI; `ctx-btn.test.ts` chỉ kiểm hàm thuần và chữ trong mã nguồn.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ui } from "./ui";

interface FakeBtn {
  hidden: boolean;
  title: string;
  attrs: Record<string, string>;
  setAttribute: (k: string, v: string) => void;
}
const fakeBtn = (): FakeBtn => {
  const b: FakeBtn = {
    hidden: true,
    title: "mặc định",
    attrs: {},
    setAttribute: (k, v) => {
      b.attrs[k] = v;
    },
  };
  return b;
};

let els: Record<string, any>;
beforeEach(() => {
  els = {
    "btn-talk": fakeBtn(),
    "talk-label": { textContent: "" },
    "btn-pickup": fakeBtn(),
    "pickup-label": { textContent: "" },
    "btn-portal": fakeBtn(),
    "portal-label": { textContent: "" },
  };
  vi.stubGlobal("document", { getElementById: (id: string) => els[id] ?? null });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const CASES = [
  {
    name: "talkPrompt",
    btn: "btn-talk",
    label: "talk-label",
    short: "Nói",
    call: (n: string | null) => ui.talkPrompt(n),
    title: (n: string) => `Nói chuyện với ${n} (F)`,
    generic: "Nói chuyện (F)",
  },
  {
    name: "pickupPrompt",
    btn: "btn-pickup",
    label: "pickup-label",
    short: "Nhặt",
    call: (n: string | null) => ui.pickupPrompt(n),
    title: (n: string) => `Nhặt ${n} (F)`,
    generic: "Nhặt vật phẩm rơi (F)",
  },
  {
    name: "portalPrompt",
    btn: "btn-portal",
    label: "portal-label",
    short: "Cổng",
    call: (n: string | null) => ui.portalPrompt(n),
    title: (n: string) => `Đi qua ${n} (F)`,
    generic: "Đi qua cổng truyền tống (F)",
  },
] as const;

describe.each(CASES)("ui.$name: nhãn cố định, tên vào title / aria-label", (c) => {
  it("có tên: hiện nút, nhãn ngắn cố định, title và aria-label chứa tên (kèm phím F)", () => {
    c.call("Tên Rất Dài Của Một Đối Tượng");
    const b = els[c.btn] as FakeBtn;
    expect(b.hidden).toBe(false);
    expect(els[c.label].textContent).toBe(c.short);
    expect(b.title).toBe(c.title("Tên Rất Dài Của Một Đối Tượng"));
    expect(b.attrs["aria-label"]).toBe(
      c.title("Tên Rất Dài Của Một Đối Tượng").replace("(F)", "(Phím F)"),
    );
  });

  it("đổi sang tên khác: title / aria-label cập nhật theo (không giữ tên cũ), nhãn vẫn cố định", () => {
    c.call("Tên Một");
    c.call("Tên Hai");
    const b = els[c.btn] as FakeBtn;
    expect(b.title).toContain("Tên Hai");
    expect(b.title).not.toContain("Tên Một");
    expect(b.attrs["aria-label"]).toContain("Tên Hai");
    expect(els[c.label].textContent).toBe(c.short);
  });

  it("chuỗi rỗng = không rõ tên: vẫn hiện nút, dùng chữ chung", () => {
    c.call("");
    const b = els[c.btn] as FakeBtn;
    expect(b.hidden).toBe(false);
    expect(b.title).toBe(c.generic);
    expect(b.attrs["aria-label"]).toBe(c.generic.replace("(F)", "(Phím F)"));
    expect(els[c.label].textContent).toBe(c.short);
  });

  it("null: ẩn nút, KHÔNG đụng tới nhãn / title / aria-label đã có", () => {
    c.call("Tên Một");
    const b = els[c.btn] as FakeBtn;
    const before = JSON.stringify([els[c.label].textContent, b.title, b.attrs]);
    c.call(null);
    expect(b.hidden).toBe(true);
    expect(JSON.stringify([els[c.label].textContent, b.title, b.attrs])).toBe(before);
  });
});
