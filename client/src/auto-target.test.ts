import { describe, expect, it } from "vitest";
import {
  AIM_MODE_STORAGE_KEY,
  DEFAULT_AIM_MODE,
  ENGAGED_FACTOR,
  NO_TARGET,
  SWITCH_MARGIN_PX,
  autoPickTarget,
  cycleTarget,
  escapeTarget,
  otherAimMode,
  parseAimMode,
  stepTarget,
  switchMargin,
  type AutoCandidate,
  type TargetState,
} from "./auto-target";

const c = (id: string, dist: number, engaged?: boolean): AutoCandidate => ({ id, dist, engaged });

describe("chế độ nhắm: mặc định và đọc từ nơi lưu", () => {
  it("mặc định là Tự động, kể cả người chơi cũ chưa từng đổi (khoá chưa có) hoặc giá trị hỏng", () => {
    expect(DEFAULT_AIM_MODE).toBe("auto");
    expect(parseAimMode(null)).toBe("auto");
    expect(parseAimMode(undefined)).toBe("auto");
    expect(parseAimMode("")).toBe("auto");
    expect(parseAimMode("auto")).toBe("auto");
    expect(parseAimMode("AUTO")).toBe("auto");
    expect(parseAimMode(1)).toBe("auto");
    expect(parseAimMode({})).toBe("auto");
  });

  it("chỉ đúng chữ 'manual' mới là Thủ công; đổi chế độ là chế độ kia", () => {
    expect(parseAimMode("manual")).toBe("manual");
    expect(otherAimMode("auto")).toBe("manual");
    expect(otherAimMode("manual")).toBe("auto");
    expect(AIM_MODE_STORAGE_KEY).toBe("tg_aim_mode");
  });
});

describe("autoPickTarget: chọn gần nhất", () => {
  it("không ứng viên: null; chưa có mục tiêu: lấy con gần nhất", () => {
    expect(autoPickTarget([], null)).toBeNull();
    expect(autoPickTarget([c("a", 300), c("b", 100), c("c", 200)], null)).toBe("b");
  });

  it("bỏ ứng viên ngoài tầm, khoảng cách hỏng (NaN / Infinity / âm)", () => {
    expect(
      autoPickTarget([c("a", 600), c("b", NaN), c("c", Infinity), c("d", -5)], null),
    ).toBeNull();
    expect(autoPickTarget([c("a", 600), c("b", 300)], null)).toBe("b");
    expect(autoPickTarget([c("a", 600), c("b", 300)], null, 700)).toBe("b");
    expect(autoPickTarget([c("a", 600), c("b", 650)], null, 700)).toBe("a");
  });

  it("hoà khoảng cách thì theo id (tất định, không nhấp nháy theo thứ tự duyệt)", () => {
    expect(autoPickTarget([c("b", 100), c("a", 100)], null)).toBe("a");
    expect(autoPickTarget([c("a", 100), c("b", 100)], null)).toBe("a");
  });

  it("mục tiêu cũ chết / ra khỏi tầm / ra khỏi màn hình (không còn trong ứng viên): chọn lại ngay con gần nhất, không chờ độ trễ", () => {
    expect(autoPickTarget([c("b", 300), c("c", 120)], "a")).toBe("c");
    // ra khỏi tầm
    expect(autoPickTarget([c("a", 540), c("b", 300)], "a")).toBe("b");
  });
});

describe("autoPickTarget: độ trễ chống nhảy", () => {
  it("ngưỡng = max(24 px, 15% khoảng cách hiện tại)", () => {
    expect(switchMargin(60)).toBe(SWITCH_MARGIN_PX); // sát người: sàn 24 px
    expect(switchMargin(160)).toBe(SWITCH_MARGIN_PX); // 15% = 24
    expect(switchMargin(400)).toBeCloseTo(60, 5); // xa: 15%
  });

  it("con mới gần hơn ít hơn ngưỡng: GIỮ mục tiêu cũ (hai con đứng sát nhau không làm vòng nhấp nháy)", () => {
    expect(autoPickTarget([c("a", 100), c("b", 90)], "a")).toBe("a"); // hơn 10 px < 24
    expect(autoPickTarget([c("a", 100), c("b", 77)], "a")).toBe("a"); // hơn 23 px < 24
    expect(autoPickTarget([c("a", 400), c("b", 345)], "a")).toBe("a"); // hơn 55 px < 60 (15% của 400)
  });

  it("con mới gần hơn từ ngưỡng trở lên: ĐỔI", () => {
    expect(autoPickTarget([c("a", 100), c("b", 76)], "a")).toBe("b"); // hơn đúng 24 px
    expect(autoPickTarget([c("a", 400), c("b", 340)], "a")).toBe("b"); // hơn đúng 60 px
    expect(autoPickTarget([c("a", 300), c("b", 50)], "a")).toBe("b");
  });

  it("hai quái đi qua lại sát nhau (khoảng cách dao động ±10 px quanh nhau): không đổi mục tiêu lần nào", () => {
    let cur: string | null = null;
    let switches = 0;
    for (let i = 0; i < 400; i++) {
      const a = 200 + 10 * Math.sin(i / 3);
      const b = 200 - 10 * Math.sin(i / 3 + 1);
      const next = autoPickTarget([c("a", a), c("b", b)], cur);
      if (cur !== null && next !== cur) switches++;
      cur = next;
    }
    expect(switches).toBe(0);
  });

  it("một con thật sự đi xa dần còn con kia tiến lại: đổi ĐÚNG MỘT lần, không dao động", () => {
    let cur: string | null = null;
    const seq: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const a = 100 + i * 2; // đi xa
      const b = 300 - i * 1.5; // tiến lại (cắt nhau quanh i ~ 57)
      const next = autoPickTarget([c("a", a), c("b", b)], cur);
      if (next !== cur) seq.push(next ?? "-");
      cur = next;
    }
    expect(seq).toEqual(["a", "b"]);
  });
});

describe("autoPickTarget: ưu tiên mục tiêu đang bị đánh dở khi khoảng cách gần bằng nhau", () => {
  it("chọn mới: đang bị đánh dở được tính gần hơn", () => {
    expect(ENGAGED_FACTOR).toBeLessThan(1);
    expect(autoPickTarget([c("a", 100), c("b", 110, true)], null)).toBe("b");
    expect(autoPickTarget([c("a", 100), c("b", 130, true)], null)).toBe("a"); // chênh quá nhiều: vẫn con gần nhất
  });

  it("đang giữ con bị đánh dở: con khác chỉ nhỉnh hơn một chút không giành được", () => {
    expect(autoPickTarget([c("a", 100, true), c("b", 80)], "a")).toBe("a");
    expect(autoPickTarget([c("a", 100, true), c("b", 40)], "a")).toBe("b"); // gần hơn hẳn thì vẫn đổi
  });
});

describe("stepTarget: nhịp cập nhật", () => {
  const near = [c("a", 100), c("b", 200)];

  it("Tự động: chưa có thì chọn gần nhất; có rồi thì chống nhảy; mất thì chọn lại", () => {
    let s = stepTarget("auto", NO_TARGET, near);
    expect(s).toEqual({ id: "a", pinned: false });
    s = stepTarget("auto", s, [c("a", 100), c("b", 90)]);
    expect(s.id).toBe("a");
    s = stepTarget("auto", s, [c("b", 90)]); // a chết
    expect(s).toEqual({ id: "b", pinned: false });
    s = stepTarget("auto", s, []);
    expect(s).toEqual(NO_TARGET);
  });

  it("Tự động + chọn tay: giữ mục tiêu đã ghim dù có con gần hơn, tới khi nó mất rồi quay lại tự động", () => {
    const pinned: TargetState = { id: "b", pinned: true };
    expect(stepTarget("auto", pinned, [c("a", 30), c("b", 300)])).toEqual(pinned);
    expect(stepTarget("auto", pinned, [c("a", 30), c("b", 540)])).toEqual({
      id: "a",
      pinned: false,
    }); // b ra khỏi tầm
    expect(stepTarget("auto", pinned, [c("a", 30)])).toEqual({ id: "a", pinned: false }); // b chết
  });

  it("Thủ công: KHÔNG tự chọn / tự đổi; chỉ nhả khoá khi mục tiêu mất hoặc ra khỏi tầm", () => {
    expect(stepTarget("manual", NO_TARGET, near)).toEqual(NO_TARGET);
    const locked: TargetState = { id: "b", pinned: false };
    expect(stepTarget("manual", locked, [c("a", 10), c("b", 300)])).toEqual(locked);
    expect(stepTarget("manual", locked, [c("a", 10)])).toEqual(NO_TARGET);
    expect(stepTarget("manual", locked, [c("a", 10), c("b", 560)])).toEqual(NO_TARGET);
  });
});

describe("cycleTarget (Tab / Shift+Tab / nút Mục tiêu)", () => {
  const three = [c("a", 100), c("b", 200), c("c", 300)];

  it("Thủ công: xoay vòng gần -> xa, hết vòng thì nhả khoá (như cũ)", () => {
    let s = cycleTarget("manual", NO_TARGET, three);
    expect(s).toEqual({ id: "a", pinned: false });
    s = cycleTarget("manual", s, three);
    expect(s.id).toBe("b");
    s = cycleTarget("manual", s, [c("b", 200)]);
    expect(s).toEqual(NO_TARGET);
    expect(cycleTarget("manual", { id: "a", pinned: false }, three, -1).id).toBe("c");
  });

  it("Tự động: Tab chọn tay TẠM THỜI (ghim); đã tự chọn con gần nhất thì Tab sang con kế; Shift+Tab đi ngược", () => {
    const auto = stepTarget("auto", NO_TARGET, three); // a
    const s = cycleTarget("auto", auto, three);
    expect(s).toEqual({ id: "b", pinned: true });
    expect(stepTarget("auto", s, [c("a", 30), c("b", 250), c("c", 300)])).toEqual(s); // giữ
    expect(cycleTarget("auto", auto, three, -1)).toEqual({ id: "c", pinned: true });
  });

  it("Tự động: chỉ còn đúng con đang chọn thì Tab bỏ ghim và quay lại tự động (không nhả hết như thủ công)", () => {
    const only = [c("a", 100)];
    expect(cycleTarget("auto", { id: "a", pinned: true }, only)).toEqual({
      id: "a",
      pinned: false,
    });
  });

  it("Tự động: không có quái trong tầm thì không có mục tiêu", () => {
    expect(cycleTarget("auto", NO_TARGET, [])).toEqual(NO_TARGET);
  });
});

describe("escapeTarget (Esc khi không còn bảng nào)", () => {
  it("Thủ công: bỏ khoá nếu đang khoá, không có gì thì không xử lý (Esc đi tiếp)", () => {
    expect(escapeTarget("manual", { id: "a", pinned: false })).toEqual({
      state: NO_TARGET,
      handled: true,
    });
    expect(escapeTarget("manual", NO_TARGET)).toEqual({ state: NO_TARGET, handled: false });
  });

  it("Tự động: chỉ bỏ được mục tiêu chọn tay (quay lại tự động); mục tiêu tự chọn thì Esc không xử lý", () => {
    expect(escapeTarget("auto", { id: "a", pinned: true })).toEqual({
      state: NO_TARGET,
      handled: true,
    });
    const auto: TargetState = { id: "a", pinned: false };
    expect(escapeTarget("auto", auto)).toEqual({ state: auto, handled: false });
  });
});
