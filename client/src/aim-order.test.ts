import { describe, expect, it } from "vitest";
import {
  PREFER_TARGET_STORAGE_KEY,
  chooseAim,
  cursorFromPointer,
  cursorOnScene,
  parsePreferTarget,
  type AimCandidates,
  type AimKind,
} from "./aim-order";

const CURSOR = 0.5;
const TARGET = 2.0;
const FACING = -1.0;
const MOVE = 3.0;

const cand = (over: Partial<AimCandidates> = {}): AimCandidates => ({
  move: null,
  cursor: null,
  target: null,
  facing: FACING,
  ...over,
});

const KINDS_WITH_DIRECTION: AimKind[] = ["target", "basic", "facing"];

describe("chooseAim: con trỏ chuột hợp lệ -> mục tiêu -> hướng nhìn (mục 29)", () => {
  it.each(KINDS_WITH_DIRECTION)(
    "%s: có chuột hợp lệ thì theo con trỏ, kể cả khi đang có mục tiêu",
    (kind) => {
      expect(chooseAim(kind, cand({ cursor: CURSOR, target: TARGET }))).toEqual({
        angle: CURSOR,
        source: "cursor",
      });
    },
  );

  it.each(KINDS_WITH_DIRECTION)(
    "%s: chuột KHÔNG hợp lệ (null: trên minimap / bản đồ lớn / chat / thanh chiêu, rời cửa sổ, chạm) thì về mục tiêu",
    (kind) => {
      expect(chooseAim(kind, cand({ cursor: null, target: TARGET }))).toEqual({
        angle: TARGET,
        source: "target",
      });
    },
  );

  it.each(KINDS_WITH_DIRECTION)("%s: không chuột, không mục tiêu thì hướng nhìn", (kind) => {
    expect(chooseAim(kind, cand())).toEqual({ angle: FACING, source: "facing" });
  });

  it.each(KINDS_WITH_DIRECTION)(
    "%s: chỉ có chuột hợp lệ (không mục tiêu) thì theo con trỏ",
    (kind) => {
      expect(chooseAim(kind, cand({ cursor: CURSOR }))).toEqual({
        angle: CURSOR,
        source: "cursor",
      });
    },
  );

  it("self / nova (facing) và chiêu có hướng (target) cùng một thứ tự", () => {
    const c = cand({ cursor: CURSOR, target: TARGET });
    expect(chooseAim("facing", c)).toEqual(chooseAim("target", c));
    expect(chooseAim("facing", cand({ target: TARGET }))).toEqual(
      chooseAim("target", cand({ target: TARGET })),
    );
  });

  it("phím hướng chỉ có nghĩa với dash: kind khác bỏ qua `move` dù được truyền", () => {
    for (const kind of KINDS_WITH_DIRECTION)
      expect(chooseAim(kind, cand({ move: MOVE, cursor: CURSOR })).source).toBe("cursor");
  });
});

describe("chooseAim: dash (phím hướng -> chuột hợp lệ -> mục tiêu -> hướng nhìn)", () => {
  it("đang giữ phím hướng: theo phím, bỏ qua cả con trỏ lẫn mục tiêu", () => {
    expect(chooseAim("move", cand({ move: MOVE, cursor: CURSOR, target: TARGET }))).toEqual({
      angle: MOVE,
      source: "move",
    });
  });

  it("không giữ phím: chuột hợp lệ -> mục tiêu -> hướng nhìn", () => {
    expect(chooseAim("move", cand({ cursor: CURSOR, target: TARGET })).source).toBe("cursor");
    expect(chooseAim("move", cand({ target: TARGET })).source).toBe("target");
    expect(chooseAim("move", cand())).toEqual({ angle: FACING, source: "facing" });
  });
});

describe("chooseAim: cài đặt 'Ưu tiên mục tiêu hơn chuột'", () => {
  it("bật: mục tiêu thắng con trỏ; không mục tiêu thì vẫn theo con trỏ; dash vẫn theo phím trước", () => {
    for (const kind of KINDS_WITH_DIRECTION) {
      expect(chooseAim(kind, cand({ cursor: CURSOR, target: TARGET }), true).source).toBe("target");
      expect(chooseAim(kind, cand({ cursor: CURSOR }), true).source).toBe("cursor");
      expect(chooseAim(kind, cand(), true).source).toBe("facing");
    }
    expect(
      chooseAim("move", cand({ move: MOVE, cursor: CURSOR, target: TARGET }), true).source,
    ).toBe("move");
    expect(chooseAim("move", cand({ cursor: CURSOR, target: TARGET }), true).source).toBe("target");
  });

  it("mặc định TẮT: con trỏ thắng", () => {
    expect(chooseAim("target", cand({ cursor: CURSOR, target: TARGET })).source).toBe("cursor");
  });
});

describe("chooseAim: dữ liệu hỏng", () => {
  it("ứng viên NaN / vô hạn bị bỏ qua như không có; hướng nhìn hỏng thì 0, không bao giờ trả NaN", () => {
    expect(chooseAim("target", cand({ cursor: NaN, target: TARGET })).source).toBe("target");
    expect(chooseAim("target", cand({ cursor: Infinity, target: NaN })).source).toBe("facing");
    expect(chooseAim("move", cand({ move: NaN, cursor: CURSOR })).source).toBe("cursor");
    expect(chooseAim("target", cand({ facing: NaN }))).toEqual({ angle: 0, source: "facing" });
    expect(Number.isFinite(chooseAim("basic", cand({ cursor: NaN, facing: Infinity })).angle)).toBe(
      true,
    );
  });
});

describe("cursorOnScene: phần tử dưới con trỏ phải CHÍNH LÀ canvas màn chơi", () => {
  const canvas = { id: "canvas" };
  const minimap = { id: "minimap-wrap" };
  const chat = { id: "chat" };
  const mapModal = { id: "map-modal" };
  const skillBar = { id: "skills" };

  it("trên canvas: hợp lệ", () => {
    expect(cursorOnScene(canvas, canvas)).toBe(true);
  });

  it.each([
    ["bản đồ nhỏ", minimap],
    ["khung chat", chat],
    ["bản đồ lớn (bảng đang mở)", mapModal],
    ["thanh chiêu", skillBar],
  ])("trên %s: KHÔNG hợp lệ (coi như không có chuột)", (_name, el) => {
    expect(cursorOnScene(el, canvas)).toBe(false);
  });

  it("ngoài cửa sổ (elementFromPoint trả null) hoặc dữ liệu thiếu: không hợp lệ", () => {
    expect(cursorOnScene(null, canvas)).toBe(false);
    expect(cursorOnScene(undefined, canvas)).toBe(false);
    expect(cursorOnScene(undefined, undefined)).toBe(false);
    expect(cursorOnScene(null, null)).toBe(false);
  });
});

describe("cursorFromPointer: chỉ CHUỘT THẬT được tính", () => {
  it("chuột: ghi toạ độ cửa sổ", () => {
    expect(cursorFromPointer({ pointerType: "mouse", clientX: 10, clientY: 20 })).toEqual({
      x: 10,
      y: 20,
    });
  });

  it("chạm / bút / kiểu lạ / thiếu kiểu: xoá (null), không còn nhắm theo con trỏ cũ", () => {
    expect(cursorFromPointer({ pointerType: "touch", clientX: 10, clientY: 20 })).toBeNull();
    expect(cursorFromPointer({ pointerType: "pen", clientX: 10, clientY: 20 })).toBeNull();
    expect(cursorFromPointer({ pointerType: "", clientX: 10, clientY: 20 })).toBeNull();
    expect(cursorFromPointer({ clientX: 10, clientY: 20 })).toBeNull();
  });

  it("toạ độ hỏng: null", () => {
    expect(cursorFromPointer({ pointerType: "mouse", clientX: NaN, clientY: 20 })).toBeNull();
    expect(cursorFromPointer({ pointerType: "mouse", clientX: 5, clientY: Infinity })).toBeNull();
  });
});

describe("cài đặt 'Ưu tiên mục tiêu hơn chuột' lưu theo thiết bị", () => {
  it("mặc định TẮT (chưa có khoá / giá trị hỏng); chỉ đúng '1' mới bật", () => {
    expect(PREFER_TARGET_STORAGE_KEY).toBe("tg_aim_prefer_target");
    expect(parsePreferTarget(null)).toBe(false);
    expect(parsePreferTarget(undefined)).toBe(false);
    expect(parsePreferTarget("")).toBe(false);
    expect(parsePreferTarget("0")).toBe(false);
    expect(parsePreferTarget("true")).toBe(false);
    expect(parsePreferTarget("1")).toBe(true);
  });
});
