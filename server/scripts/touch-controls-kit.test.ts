// Hàm thuần của bộ kiểm điều khiển cảm ứng (issue #727): bắt chồng lấn, chạm trượt, tràn khung; bỏ qua quan hệ chứa nhau và ngoại lệ khai báo.
import { describe, expect, it } from "vitest";
import {
  LANDSCAPE_PHONES,
  TOUCH_CONTROLS_SCRIPT,
  findTouchConflicts,
  type TouchControl,
} from "./touch-controls-kit";

/** Điều khiển giả: hộp (l, t, w, h), mặc định chạm giữa trúng chính nó và không chứa gì. */
const ctl = (
  key: string,
  l: number,
  t: number,
  w: number,
  h: number,
  over: Partial<TouchControl> = {},
): TouchControl => ({
  key,
  l,
  t,
  r: l + w,
  b: t + h,
  hit: key,
  hitInside: true,
  contains: [],
  ...over,
});

describe("findTouchConflicts", () => {
  it("các điều khiển rời nhau (kể cả chạm cạnh nhau): không có gì", () => {
    const r = findTouchConflicts(
      [ctl("a", 0, 0, 50, 50), ctl("b", 50, 0, 50, 50), ctl("c", 0, 58, 50, 50)],
      200,
      200,
    );
    expect(r).toEqual({ overlaps: [], tapMisses: [], offscreen: [] });
  });

  it("nút Mục tiêu 58 px chồng thanh menu 7 nút ở 812 x 375: báo cặp và kích thước giao (ca gốc của #727)", () => {
    const menu = ctl("hud-menu", 464, 129, 338, 50);
    const target = ctl("btn-target", 740, 137, 58, 58);
    const r = findTouchConflicts([menu, target], 812, 375);
    expect(r.overlaps).toEqual([{ a: "hud-menu", b: "btn-target", w: 58, h: 42 }]);
  });

  it("chồng 1 px hoặc ít hơn không tính (làm tròn khi vẽ), chồng 2 px thì tính", () => {
    expect(
      findTouchConflicts([ctl("a", 0, 0, 50, 50), ctl("b", 49, 0, 50, 50)], 200, 200).overlaps,
    ).toHaveLength(0);
    expect(
      findTouchConflicts([ctl("a", 0, 0, 50, 50), ctl("b", 48, 0, 50, 50)], 200, 200).overlaps,
    ).toHaveLength(1);
  });

  it("quan hệ chứa nhau (ở hai chiều) không phải chồng lấn", () => {
    const outer = ctl("minimap-wrap", 0, 0, 100, 100, { contains: ["inner"] });
    const inner = ctl("inner", 10, 10, 30, 30);
    expect(findTouchConflicts([outer, inner], 200, 200).overlaps).toEqual([]);
    expect(findTouchConflicts([inner, outer], 200, 200).overlaps).toEqual([]);
  });

  it("ngoại lệ khai báo được bỏ qua ở cả hai thứ tự, cặp khác vẫn bị bắt", () => {
    const a = ctl("a", 0, 0, 50, 50);
    const b = ctl("b", 10, 10, 50, 50);
    const c = ctl("c", 20, 20, 50, 50);
    expect(findTouchConflicts([a, b], 200, 200, [["b", "a", "có chủ ý"]]).overlaps).toEqual([]);
    expect(findTouchConflicts([a, b], 200, 200, [["a", "b", "có chủ ý"]]).overlaps).toEqual([]);
    expect(
      findTouchConflicts([a, b, c], 200, 200, [["a", "b", "có chủ ý"]]).overlaps.map(
        (o) => `${o.a}|${o.b}`,
      ),
    ).toEqual(["a|c", "b|c"]);
  });

  it("chạm giữa trúng phần tử khác: báo chạm trượt kèm phần tử trúng; ngoại lệ cùng cặp thì không báo", () => {
    const target = ctl("btn-target", 0, 0, 58, 58, { hit: "btn-settings", hitInside: false });
    const settings = ctl("btn-settings", 0, 0, 44, 44);
    expect(findTouchConflicts([target, settings], 200, 200).tapMisses).toEqual([
      { key: "btn-target", hit: "btn-settings" },
    ]);
    expect(
      findTouchConflicts([target, settings], 200, 200, [["btn-target", "btn-settings", "có chủ ý"]])
        .tapMisses,
    ).toEqual([]);
  });

  it("chạm giữa không trúng gì (hit null) vẫn là chạm trượt", () => {
    const r = findTouchConflicts(
      [ctl("a", 0, 0, 50, 50, { hit: null, hitInside: false })],
      200,
      200,
    );
    expect(r.tapMisses).toEqual([{ key: "a", hit: null }]);
  });

  it("điều khiển ra ngoài khung nhìn (một phần) bị báo, sai số 0,5 px thì bỏ qua", () => {
    const r = findTouchConflicts(
      [
        ctl("ra-phai", 180, 0, 58, 58),
        ctl("sat-mep", 142, 142, 58.4, 58),
        ctl("trai", -3, 0, 40, 40),
      ],
      200,
      200,
    );
    expect(r.offscreen.map((o) => o.key)).toEqual(["ra-phai", "trai"]);
  });
});

describe("LANDSCAPE_PHONES", () => {
  it("đủ bảy khung ngang theo yêu cầu của #727, đều >= 568 x 320 và ngang (rộng hơn cao), không trùng", () => {
    const sizes = LANDSCAPE_PHONES.map((p) => `${p.w}x${p.h}`);
    expect(sizes).toEqual([
      "915x412",
      "896x414",
      "844x390",
      "812x375",
      "740x360",
      "667x375",
      "568x320",
    ]);
    for (const p of LANDSCAPE_PHONES) {
      expect(p.w).toBeGreaterThanOrEqual(568);
      expect(p.h).toBeGreaterThanOrEqual(320);
      expect(p.w).toBeGreaterThan(p.h);
    }
  });
});

describe("TOUCH_CONTROLS_SCRIPT", () => {
  it("là một biểu thức hàm gọi ngay, liệt kê bằng bộ chọn tổng quát (nút, ô nhập, mục nhiệm vụ, bản đồ nhỏ), không theo danh sách id", () => {
    expect(TOUCH_CONTROLS_SCRIPT.startsWith("(() => {")).toBe(true);
    expect(TOUCH_CONTROLS_SCRIPT.endsWith("})()")).toBe(true);
    for (const part of ["button", "input", ".qt-item", "#minimap-wrap", "elementFromPoint"])
      expect(TOUCH_CONTROLS_SCRIPT).toContain(part);
    // không được chép tay id từng nút (nút mới thêm vào HUD phải tự bị kiểm)
    expect(TOUCH_CONTROLS_SCRIPT).not.toContain("btn-target");
  });
});
