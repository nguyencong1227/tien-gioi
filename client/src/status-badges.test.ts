import { describe, expect, it } from "vitest";
import { MAX_STATUSES, STATUSES, type StatusEntry } from "@tien-gioi/shared";
import { contrast, parseHex } from "./contrast";
import { StatusTracker } from "./status-track";
import {
  BADGE_COLORS,
  BADGE_URGENT_SECS,
  StatusBadgesDom,
  badgeSignature,
  badgeViews,
  effectText,
  formatRemain,
  parseMockStatus,
  remainWords,
  type BadgeChild,
} from "./status-badges";

describe("status-badges: badgeViews", () => {
  it("một ô cho mỗi trạng thái: tên, số giây làm tròn LÊN, câu đọc cho trình đọc màn hình", () => {
    const v = badgeViews([["poison", 6200]]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ id: "poison", name: "Độc", harmful: true, secs: 7 });
    expect(v[0].label).toBe("Độc 7");
    expect(v[0].aria).toBe("Độc: mất khí huyết mỗi giây, còn 7 giây");
  });

  it("làm tròn lên: còn 1 ms vẫn hiện 1 giây, không bao giờ 0", () => {
    expect(badgeViews([["stun", 1]])[0].secs).toBe(1);
    expect(badgeViews([["stun", 1000]])[0].secs).toBe(1);
    expect(badgeViews([["stun", 1001]])[0].secs).toBe(2);
  });

  it("tăng tốc / tê cóng ghi cường độ (làm tròn %), loại khác không ghi số vì máy chủ không gửi", () => {
    expect(badgeViews([["haste", 5000, 0.3]])[0].label).toBe("Tăng tốc +30% 5");
    expect(badgeViews([["chill", 4000, 0.45]])[0].label).toBe("Tê cóng −45% 4");
    expect(badgeViews([["chill", 4000, 0.45]])[0].aria).toContain("giảm 45% tốc độ di chuyển");
    // chưa biết cường độ (ratio 0 / thiếu): không bịa số
    expect(badgeViews([["haste", 5000, 0]])[0].label).toBe("Tăng tốc 5");
    expect(badgeViews([["chill", 4000]])[0].aria).toContain("giảm tốc độ di chuyển");
    // loại khác: dù lỡ có phần tử thứ ba cũng không ghi số
    expect(badgeViews([["burn", 3000, 0.5]])[0].label).toBe("Bỏng 3");
  });

  it("thứ tự cố định: có hại trước, có lợi sau, theo bảng; làm mới một cái không làm ô nhảy chỗ", () => {
    const a = badgeViews([
      ["haste", 4000, 0.3],
      ["burn", 2000],
      ["shield", 5000],
      ["stun", 1000],
    ]).map((v) => v.id);
    const b = badgeViews([
      ["stun", 900],
      ["shield", 4500],
      ["burn", 1500],
      ["haste", 3500, 0.3],
    ]).map((v) => v.id);
    expect(a).toEqual(b);
    const harmfulCount = a.filter((id) => STATUSES.find((s) => s.id === id)!.harmful).length;
    expect(a.slice(0, harmfulCount).every((id) => STATUSES.find((s) => s.id === id)!.harmful)).toBe(
      true,
    );
    expect(a.slice(harmfulCount).every((id) => !STATUSES.find((s) => s.id === id)!.harmful)).toBe(
      true,
    );
  });

  it("sắp hết (<= BADGE_URGENT_SECS giây) thì urgent", () => {
    expect(badgeViews([["burn", BADGE_URGENT_SECS * 1000]])[0].urgent).toBe(true);
    expect(badgeViews([["burn", BADGE_URGENT_SECS * 1000 + 1]])[0].urgent).toBe(false);
  });

  it("bỏ mục lạ / hết hạn / số hỏng, không ném lỗi", () => {
    const junk = [
      ["constructor", 3000],
      ["__proto__", 3000],
      ["burn", 0],
      ["burn", -5],
      ["burn", NaN],
      ["burn", Infinity],
    ] as unknown as StatusEntry[];
    expect(badgeViews(junk)).toEqual([]);
    expect(badgeViews([])).toEqual([]);
  });

  it("ăn khớp StatusTracker: đếm lùi theo đồng hồ, hết hạn thì mất ô", () => {
    const t = new StatusTracker();
    t.set(
      [
        ["burn", 3000],
        ["haste", 8000, 0.3],
      ],
      1000,
    );
    expect(badgeViews(t.active(1000)).map((v) => `${v.id}:${v.secs}`)).toEqual([
      "burn:3",
      "haste:8",
    ]);
    expect(badgeViews(t.active(2500)).map((v) => `${v.id}:${v.secs}`)).toEqual([
      "burn:2",
      "haste:7",
    ]);
    expect(badgeViews(t.active(4000)).map((v) => `${v.id}:${v.secs}`)).toEqual(["haste:5"]);
    expect(badgeViews(t.active(9000))).toEqual([]);
  });

  it("tối đa MAX_STATUSES ô (danh sách đã được làm sạch ở StatusTracker)", () => {
    const t = new StatusTracker();
    t.set(
      STATUSES.map((s) => [s.id, 3000, 0.1]),
      0,
    );
    // `windup` (vận khí) NGOÀI trần MAX_STATUSES (mục 51): MAX_STATUSES ô đếm được + ô vận khí
    expect(badgeViews(t.active(0)).length).toBe(MAX_STATUSES + 1);
  });

  it("effectText: mọi loại trạng thái trong bảng đều có câu (không để trống)", () => {
    for (const def of STATUSES) expect(effectText(def, 0.2).length).toBeGreaterThan(5);
  });
});

describe("status-badges: màu đủ tương phản", () => {
  it("chữ >= 4,5:1 trên nền ô, cả ô có hại và có lợi", () => {
    for (const c of Object.values(BADGE_COLORS))
      expect(contrast(parseHex(c.fg), parseHex(c.bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("status-badges: parseMockStatus", () => {
  it("đọc id:giây[:cường độ], bỏ id lạ / số hỏng, tối đa 4 mục", () => {
    expect(parseMockStatus("?status=burn:5,haste:8:0.3")).toEqual([
      ["burn", 5000],
      ["haste", 8000, 0.3],
    ]);
    expect(parseMockStatus("?status=constructor:5,burn:abc,burn:-1,stun:1.2")).toEqual([
      ["stun", 1200],
    ]);
    expect(parseMockStatus("?status=burn:1,poison:1,bleed:1,chill:1,stun:1")).toHaveLength(4);
    expect(parseMockStatus("")).toEqual([]);
    expect(parseMockStatus("?skills=mock")).toEqual([]);
  });
});

class FakeEl implements BadgeChild {
  className = "";
  textContent: string | null = "";
  attrs: Record<string, string> = {};
  vars: Record<string, string> = {};
  setAttribute(n: string, v: string) {
    this.attrs[n] = v;
  }
  style = { setProperty: (k: string, v: string) => void (this.vars[k] = v) };
}
function setup() {
  const box = {
    hidden: true,
    children: [] as FakeEl[],
    replaceChildren(...n: FakeEl[]) {
      box.children = n;
    },
  };
  const doc = { createElement: () => new FakeEl() };
  return { box, dom: new StatusBadgesDom<FakeEl>(box, doc) };
}

describe("status-badges: StatusBadgesDom", () => {
  it("rỗng thì ẩn cả hàng; có trạng thái thì hiện đủ ô với lớp, nhãn, màu", () => {
    const { box, dom } = setup();
    dom.render([]);
    expect(box.hidden).toBe(true);
    dom.render(
      badgeViews([
        ["burn", 1500],
        ["haste", 6000, 0.3],
      ]),
    );
    expect(box.hidden).toBe(false);
    expect(box.children).toHaveLength(2);
    const [burn, haste] = box.children;
    expect(burn.textContent).toBe("Bỏng 2");
    expect(burn.className).toBe("st-badge harmful urgent");
    expect(burn.attrs["data-status"]).toBe("burn");
    expect(burn.attrs["aria-label"]).toContain("Bỏng");
    expect(burn.attrs.role).toBe("img"); // ô là chữ trang trí có nhãn đọc riêng: không để trình đọc đọc cả chữ lẫn nhãn
    expect(burn.attrs.title).toBe(burn.attrs["aria-label"]);
    expect(burn.vars["--st-fg"]).toBe(BADGE_COLORS.harmful.fg);
    expect(haste.className).toBe("st-badge helpful");
    expect(haste.vars["--st-bg"]).toBe(BADGE_COLORS.helpful.bg);
  });

  it("chỉ dựng lại khi dấu hiệu đổi: gọi mỗi khung với cùng danh sách không đụng DOM", () => {
    const { dom } = setup();
    const v = badgeViews([["poison", 5500]]);
    dom.render(v);
    expect(dom.rebuilds).toBe(1);
    for (let i = 0; i < 100; i++) dom.render(badgeViews([["poison", 5500 - i]])); // còn 6 giây suốt
    expect(dom.rebuilds).toBe(1);
    dom.render(badgeViews([["poison", 4500]])); // 5 giây
    expect(dom.rebuilds).toBe(2);
    dom.render([]);
    expect(dom.rebuilds).toBe(3);
    dom.render([]);
    expect(dom.rebuilds).toBe(3);
  });

  it("hết hết trạng thái thì ẩn lại", () => {
    const { box, dom } = setup();
    dom.render(badgeViews([["stun", 1000]]));
    expect(box.hidden).toBe(false);
    dom.render([]);
    expect(box.hidden).toBe(true);
    expect(box.children).toHaveLength(0);
  });

  it("badgeSignature đổi theo id và số giây", () => {
    const a = badgeSignature(badgeViews([["burn", 5000]]));
    expect(badgeSignature(badgeViews([["burn", 4500]]))).toBe(a); // vẫn 5 giây
    expect(badgeSignature(badgeViews([["burn", 3500]]))).not.toBe(a);
    expect(badgeSignature(badgeViews([["poison", 5000]]))).not.toBe(a);
  });
});

describe("status-badges: thời gian còn lại dạng m:ss (#514, issue #769)", () => {
  it("formatRemain: dưới 60 giây là số giây thuần, từ 60 giây là phút:giây (giây 2 chữ số)", () => {
    expect(formatRemain(1)).toBe("1");
    expect(formatRemain(59)).toBe("59");
    expect(formatRemain(60)).toBe("1:00");
    expect(formatRemain(61)).toBe("1:01");
    expect(formatRemain(599)).toBe("9:59");
    expect(formatRemain(899)).toBe("14:59");
    expect(formatRemain(900)).toBe("15:00");
  });

  it("remainWords: bằng chữ, không ghi '0 giây' khi chẵn phút", () => {
    expect(remainWords(1)).toBe("1 giây");
    expect(remainWords(59)).toBe("59 giây");
    expect(remainWords(60)).toBe("1 phút");
    expect(remainWords(61)).toBe("1 phút 1 giây");
    expect(remainWords(899)).toBe("14 phút 59 giây");
    expect(remainWords(900)).toBe("15 phút");
  });

  it("số hỏng (NaN, âm, vô hạn) không ném lỗi và không in 'NaN'", () => {
    for (const bad of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      expect(formatRemain(bad)).not.toMatch(/NaN|Infinity|-/);
      expect(remainWords(bad)).not.toMatch(/NaN|Infinity|-/);
    }
  });

  it("chip Hộ đạo: tên, màu có lợi, +15%, đếm ngược m:ss; aria đủ chữ", () => {
    const [v] = badgeViews([["dao_ho", 899_000, 0.15]]);
    expect(v).toMatchObject({ id: "dao_ho", name: "Hộ đạo", harmful: false, secs: 899 });
    expect(v.label).toBe("Hộ đạo +15% 14:59");
    expect(v.aria).toBe("Hộ đạo: cộng 15% xác suất đột phá lần kế, còn 14 phút 59 giây");
    expect(badgeViews([["dao_ho", 900_000, 0.15]])[0].label).toBe("Hộ đạo +15% 15:00");
    expect(badgeViews([["dao_ho", 59_000, 0.15]])[0].label).toBe("Hộ đạo +15% 59");
    expect(badgeViews([["dao_ho", 60_000, 0.15]])[0].label).toBe("Hộ đạo +15% 1:00");
  });

  it("phù 60 giây: đếm ngược m:ss từ lúc tròn 60 giây, dưới đó số giây thuần (khớp ví dụ 'Phù Hỏa +20% 59' của hợp đồng lát 2)", () => {
    expect(badgeViews([["amp_hoa", 60_000, 0.2]])[0].label).toBe("Phù Hỏa +20% 1:00");
    expect(badgeViews([["amp_hoa", 59_000, 0.2]])[0].label).toBe("Phù Hỏa +20% 59");
    expect(badgeViews([["amp_hoa", 60_000, 0.2]])[0].aria).toBe(
      "Phù Hỏa: tăng 20% sát thương chiêu hệ Hỏa, còn 1 phút",
    );
  });

  it("hiệu ứng ngắn (dưới 60 giây) giữ nguyên số giây thuần như trước", () => {
    expect(badgeViews([["poison", 6200]])[0].label).toBe("Độc 7");
    expect(badgeViews([["haste", 5000, 0.3]])[0].label).toBe("Tăng tốc +30% 5");
  });

  it("dấu hiệu đổi theo từng giây (ô được vẽ lại khi đồng hồ nhích), không đổi trong cùng một giây", () => {
    const a = badgeSignature(badgeViews([["dao_ho", 899_500, 0.15]])); // 900 giây
    const b = badgeSignature(badgeViews([["dao_ho", 899_001, 0.15]])); // 900 giây
    const c = badgeSignature(badgeViews([["dao_ho", 898_900, 0.15]])); // 899 giây
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("status-badges: phù (nghề nhỏ lát 2, #514)", () => {
  it("phù tăng sát thương: tên + dấu +X% + hệ trong câu đọc; phù tốc chiêu: dấu −X%", () => {
    const [a, c] = badgeViews([
      ["amp_hoa", 59_000, 0.2],
      ["cdr_phu", 30_000, 0.15],
    ]);
    expect(a).toMatchObject({ id: "amp_hoa", name: "Phù Hỏa", harmful: false, secs: 59 });
    expect(a.label).toBe("Phù Hỏa +20% 59");
    expect(a.aria).toBe("Phù Hỏa: tăng 20% sát thương chiêu hệ Hỏa, còn 59 giây");
    expect(c.label).toBe("Phù Tốc Chiêu −15% 30");
    expect(c.aria).toBe("Phù Tốc Chiêu: giảm 15% hồi chiêu, còn 30 giây");
  });

  it("thiếu ratio: không nêu số nhưng vẫn có câu tác dụng", () => {
    const [a] = badgeViews([["amp_kim", 10_000]]);
    expect(a.label).toBe("Phù Kim 10");
    expect(a.aria).toBe("Phù Kim: tăng sát thương chiêu hệ Kim, còn 10 giây");
  });
});
