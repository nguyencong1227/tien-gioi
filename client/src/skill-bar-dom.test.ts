import { describe, expect, it } from "vitest";
import { SKILLS_M7, type SkillSlot } from "@tien-gioi/shared";
import { ELEMENT_COLOR, SkillTracker, slotView, type SlotMe } from "./skill-bar";
import {
  SkillBarDom,
  groupLabel,
  pipsText,
  slotCaption,
  type BarChild,
  type BarEl,
} from "./skill-bar-dom";

class FakeChild implements BarChild {
  textContent: string | null = "";
  innerHTML = "";
  vars: Record<string, string> = {};
  writes = 0;
  style = {
    setProperty: (k: string, v: string) => {
      this.vars[k] = v;
      this.writes++;
    },
  };
}

class FakeEl implements BarEl {
  className = "sk slot";
  attrs: Record<string, string> = {};
  sets = 0;
  parts: Record<string, FakeChild> = {
    ".ico": new FakeChild(),
    ".nm": new FakeChild(),
    ".pips": new FakeChild(),
    ".cdv": new FakeChild(),
    ".cdn": new FakeChild(),
  };
  setAttribute(n: string, v: string) {
    this.attrs[n] = v;
    this.sets++;
  }
  querySelector(sel: string) {
    return this.parts[sel] ?? null;
  }
}

function setup() {
  const els = new Map<string, FakeEl>();
  for (const id of ["skill-slots", "sk-slot2", "sk-slot3", "sk-slot4", "sk-slot5"])
    els.set(id, new FakeEl());
  const dom = new SkillBarDom({ getElementById: (id) => els.get(id) ?? null });
  return { els, dom };
}

const ME: SlotMe = { realm: 3, tier: 0, mp: 1000, maxMp: 1000 };
const HOA = "hoa_van_kiem";
const BANG = "huyen_bang_chi";

function tracker(cd = 0, at = 0): SkillTracker {
  const t = new SkillTracker();
  t.set(
    {
      learned: { [HOA]: 2, [BANG]: 1 },
      slots: [HOA, BANG, "", ""],
      cd: [cd, 0, 0, 0],
      cdMax: [3000, 4000, 0, 0],
    },
    at,
  );
  return t;
}

describe("chữ phụ của ô", () => {
  it("chiêu: tên viết tắt; ô trống: số ô; ô khoá: cảnh giới mở", () => {
    const t = tracker();
    expect(slotCaption(slotView(2, t, ME, false, 0))).toBe("Hỏa Vân");
    expect(slotCaption(slotView(4, t, ME, false, 0))).toBe("4");
    expect(slotCaption(slotView(5, t, ME, false, 0))).toBe("Nguyên Anh");
    expect(slotCaption(slotView(3, t, { ...ME, realm: 1 }, false, 0))).toBe("Trúc Cơ");
  });
  it("chấm tầng và câu nhóm", () => {
    expect(pipsText(0)).toBe("");
    expect(pipsText(1)).toBe("●○○");
    expect(pipsText(3)).toBe("●●●");
    expect(groupLabel(0)).toBe("Ô chiêu thức 2 đến 5, chưa có chiêu");
    expect(groupLabel(3)).toBe("Ô chiêu thức 2 đến 5, đã gắn 3 chiêu");
  });
});

describe("SkillBarDom: vẽ ô, chỉ ghi khi đổi", () => {
  it("ô sẵn sàng: lớp k-ready, aria đủ, biểu tượng, chấm tầng, aria-disabled=false", () => {
    const { els, dom } = setup();
    const v = slotView(2, tracker(), ME, false, 0);
    expect(dom.render(v, ["L"])).toBe(true);
    const el = els.get("sk-slot2")!;
    expect(el.className).toBe("sk slot k-ready");
    expect(el.attrs["aria-label"]).toBe("Ô chiêu thức 2: Hỏa Vân Kiếm, tầng 2, sẵn sàng (Phím L)");
    expect(el.attrs.title).toBe(el.attrs["aria-label"]);
    expect(el.attrs["aria-disabled"]).toBe("false");
    expect(el.parts[".ico"].innerHTML).toContain("<svg");
    expect(el.parts[".ico"].vars["--si-c"]).toBe(ELEMENT_COLOR.hoa);
    expect(el.parts[".nm"].textContent).toBe("Hỏa Vân");
    expect(el.parts[".pips"].textContent).toBe("●●○");
    expect(el.parts[".cdn"].textContent).toBe("");
  });

  it("ô khoá / trống / thiếu cảnh giới: aria-disabled=true; khoá + thiếu cảnh giới dùng ổ khoá", () => {
    const { els, dom } = setup();
    const t = tracker();
    dom.render(slotView(5, t, ME, false, 0), ["O"]);
    expect(els.get("sk-slot5")!.className).toBe("sk slot k-locked");
    expect(els.get("sk-slot5")!.attrs["aria-disabled"]).toBe("true");
    expect(els.get("sk-slot5")!.parts[".ico"].innerHTML).toContain("<rect");
    expect(els.get("sk-slot5")!.parts[".ico"].vars["--si-c"]).toBe("");
    dom.render(slotView(4, t, ME, false, 0), ["I"]);
    expect(els.get("sk-slot4")!.className).toBe("sk slot k-empty");
    expect(els.get("sk-slot4")!.parts[".ico"].innerHTML).toBe("");
    const need = new SkillTracker();
    need.set(
      {
        learned: { thanh_tung_phi_cham: 1 },
        slots: ["thanh_tung_phi_cham", "", "", ""],
        cd: [0, 0, 0, 0],
        cdMax: [0, 0, 0, 0],
      },
      0,
    );
    dom.render(slotView(2, need, { realm: 1, tier: 0, mp: 9, maxMp: 9 }, false, 0), ["L"]);
    expect(els.get("sk-slot2")!.className).toBe("sk slot k-needRealm");
    expect(els.get("sk-slot2")!.attrs["aria-disabled"]).toBe("true");
    expect(els.get("sk-slot2")!.parts[".ico"].innerHTML).toContain("<rect");
  });

  it("không đổi gì thì KHÔNG ghi lại (gọi mỗi khung hình vẫn rẻ)", () => {
    const { els, dom } = setup();
    const t = tracker();
    const v = slotView(2, t, ME, false, 0);
    dom.render(v, ["L"]);
    const el = els.get("sk-slot2")!;
    const before = el.sets;
    for (let i = 0; i < 50; i++)
      expect(dom.render(slotView(2, t, ME, false, 0), ["L"])).toBe(false);
    expect(el.sets).toBe(before);
  });

  it("hồi chiêu: số giây đổi ghi lại aria + số; vòng quét chỉ ghi khi nhích >= 2%; biểu tượng KHÔNG dựng lại", () => {
    const { els, dom } = setup();
    const t = tracker(3000, 0);
    dom.render(slotView(2, t, ME, false, 0), ["L"]);
    const el = els.get("sk-slot2")!;
    expect(el.className).toBe("sk slot k-cooldown");
    expect(el.parts[".cdn"].textContent).toBe("3");
    expect(el.parts[".cdv"].vars["--cd"]).toBe("1");
    expect(el.attrs["aria-label"]).toContain("hồi chiêu 3 giây");
    const icoHtml = el.parts[".ico"].innerHTML;
    // 1 ms sau: cùng giây, vòng quét chưa nhích 2% -> không ghi gì
    const w = el.parts[".cdv"].writes;
    const s = el.sets;
    expect(dom.render(slotView(2, t, ME, false, 1), ["L"])).toBe(false);
    expect(el.parts[".cdv"].writes).toBe(w);
    expect(el.sets).toBe(s);
    // sau 1,2 s: còn 1,8 s -> 2 giây, vòng quét 0,6
    dom.render(slotView(2, t, ME, false, 1200), ["L"]);
    expect(el.parts[".cdn"].textContent).toBe("2");
    expect(el.parts[".cdv"].vars["--cd"]).toBe("0.6");
    expect(el.attrs["aria-label"]).toContain("hồi chiêu 2 giây");
    expect(el.parts[".ico"].innerHTML).toBe(icoHtml);
    // hết: sẵn sàng, vòng quét về 0, số giây rỗng
    dom.render(slotView(2, t, ME, false, 3000), ["L"]);
    expect(el.className).toBe("sk slot k-ready");
    expect(el.parts[".cdn"].textContent).toBe("");
    expect(el.parts[".cdv"].vars["--cd"]).toBe("0");
  });

  it("đổi phím (invalidate) vẽ lại nhãn; đổi chiêu dựng lại biểu tượng", () => {
    const { els, dom } = setup();
    const t = tracker();
    dom.render(slotView(2, t, ME, false, 0), ["L"]);
    const el = els.get("sk-slot2")!;
    dom.render(slotView(2, t, ME, false, 0), ["K"]);
    expect(el.attrs["aria-label"]).toContain("(Phím K)");
    const next = new SkillTracker();
    next.set(
      {
        learned: { [BANG]: 1 },
        slots: [BANG, "", "", ""],
        cd: [0, 0, 0, 0],
        cdMax: [4000, 0, 0, 0],
      },
      0,
    );
    const icoBefore = el.parts[".ico"].innerHTML;
    dom.render(slotView(2, next, ME, false, 0), ["K"]);
    expect(el.parts[".ico"].innerHTML).not.toBe(icoBefore);
    expect(el.parts[".nm"].textContent).toBe("Huyền Băng");
    dom.invalidate();
    const s = el.sets;
    dom.render(slotView(2, next, ME, false, 0), ["K"]);
    expect(el.sets).toBeGreaterThan(s);
  });

  it("nhóm: câu mô tả chỉ ghi khi số chiêu đổi", () => {
    const { els, dom } = setup();
    dom.renderGroup(2);
    expect(els.get("skill-slots")!.attrs["aria-label"]).toBe(
      "Ô chiêu thức 2 đến 5, đã gắn 2 chiêu",
    );
    expect(els.get("skill-slots")!.attrs["data-filled"]).toBe("2"); // CSS cảm ứng chọn bố cục theo số này
    const s = els.get("skill-slots")!.sets;
    dom.renderGroup(2);
    expect(els.get("skill-slots")!.sets).toBe(s);
    dom.renderGroup(0);
    expect(els.get("skill-slots")!.attrs["aria-label"]).toBe("Ô chiêu thức 2 đến 5, chưa có chiêu");
    expect(els.get("skill-slots")!.attrs["data-filled"]).toBe("0");
  });

  it("phần tử vắng thì bỏ qua, không ném lỗi", () => {
    const dom = new SkillBarDom({ getElementById: () => null });
    const v = slotView(2 as SkillSlot, tracker(), ME, false, 0);
    expect(dom.render(v, ["L"])).toBe(false);
    dom.renderGroup(1);
    expect(SKILLS_M7.length).toBeGreaterThan(0);
  });
});
