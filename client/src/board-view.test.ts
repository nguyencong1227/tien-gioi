import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMNS,
  BOARD_IDS,
  BOARD_LABELS,
  BOARD_SIZE,
  REALMS,
  TITLES,
  realmLabel,
  sampleBoards,
  stepOf,
  type BoardsMsg,
} from "@tien-gioi/shared";
import {
  REFRESH_NOTE,
  ageText,
  asBoardId,
  boardView,
  fmtCount,
  mineLine,
  sanitizeBoardsMsg,
  stepLabel,
  titleText,
} from "./board-view";
import { tabByKey } from "./social-tabs";

describe("asBoardId", () => {
  it("bốn bảng có thật giữ nguyên; lạ / khoá nguyên mẫu / không phải chuỗi -> null", () => {
    for (const id of BOARD_IDS) expect(asBoardId(id)).toBe(id);
    for (const bad of ["", "tuVi", "constructor", "__proto__", "toString", null, undefined, 1, {}])
      expect(asBoardId(bad)).toBeNull();
  });
});

describe("fmtCount", () => {
  it("số nguyên không âm định dạng vi-VN; lẻ làm tròn xuống; âm về 0; không hữu hạn / không phải số -> —", () => {
    expect(fmtCount(0)).toBe("0");
    expect(fmtCount(90000)).toBe("90.000");
    expect(fmtCount(12.9)).toBe("12");
    expect(fmtCount(-5)).toBe("0");
    for (const bad of [NaN, Infinity, "12", null, undefined, {}]) expect(fmtCount(bad)).toBe("—");
  });
});

describe("stepLabel (đảo stepOf)", () => {
  it("MỌI (realm, tier) của thang: stepLabel(stepOf) đúng bằng realmLabel", () => {
    let n = 0;
    REALMS.forEach((r, ri) =>
      r.tiers.forEach((_, ti) => {
        expect(stepLabel(stepOf(ri, ti))).toBe(realmLabel(ri, ti));
        n++;
      }),
    );
    expect(n).toBe(stepOf(REALMS.length - 1, REALMS[REALMS.length - 1].tiers.length - 1) + 1);
  });

  it("bậc ngoài thang / không nguyên / không phải số -> —", () => {
    for (const bad of [-1, 9999, 1.5, NaN, "3", null, undefined]) expect(stepLabel(bad)).toBe("—");
  });
});

describe("titleText", () => {
  it("id có trong TITLES ra chữ; id lạ (máy chủ mới hơn) / khoá nguyên mẫu / không phải chuỗi -> rỗng", () => {
    for (const t of TITLES) expect(titleText(t.id)).toBe(t.text);
    for (const bad of ["zzzz", "", "constructor", "toString", "__proto__", null, undefined, 5])
      expect(titleText(bad)).toBe("");
  });
});

describe("ageText", () => {
  it("dưới 1 phút / phút / giờ; không hợp lệ -> rỗng", () => {
    expect(ageText(0)).toBe("vừa cập nhật");
    expect(ageText(59_999)).toBe("vừa cập nhật");
    expect(ageText(60_000)).toBe("cập nhật 1 phút trước");
    expect(ageText(90_000)).toBe("cập nhật 1 phút trước");
    expect(ageText(59 * 60_000 + 59_000)).toBe("cập nhật 59 phút trước");
    expect(ageText(60 * 60_000)).toBe("cập nhật 1 giờ trước");
    expect(ageText(5 * 3600_000)).toBe("cập nhật 5 giờ trước");
    for (const bad of [-1, NaN, Infinity, "5", null, undefined]) expect(ageText(bad)).toBe("");
  });

  it("ghi chú làm mới lấy từ hằng của shared (5 phút)", () => {
    expect(REFRESH_NOTE).toBe("Bảng làm mới mỗi 5 phút.");
  });
});

describe("mineLine", () => {
  it("có hạng -> số hạng", () => {
    expect(mineLine({ rank: 3 })).toBe("Hạng của bạn: 3");
    expect(mineLine({ rank: 47 })).toBe("Hạng của bạn: 47");
  });

  it("không hạng -> LÝ DO, không để trống", () => {
    expect(mineLine({ rank: null, reason: "test" })).toBe(
      "Tài khoản thử nghiệm không vào bảng này.",
    );
    expect(mineLine({ rank: null, reason: "min_games", need: 4 })).toBe(
      "Cần thêm 4 trận để lên bảng.",
    );
    expect(mineLine({ rank: null, reason: "min_games" })).toBe("Chưa đủ số trận để lên bảng.");
    expect(mineLine({ rank: null, reason: "min_games", need: 0 })).toBe(
      "Chưa đủ số trận để lên bảng.",
    );
    expect(mineLine({ rank: null, reason: "none" })).toBe("Chưa có hạng.");
    expect(mineLine({ rank: null })).toBe("Chưa có hạng.");
    expect(mineLine(undefined)).toBe("Chưa có hạng.");
  });

  it("hạng không hợp lệ (0, âm, lẻ) coi như không có hạng", () => {
    for (const rank of [0, -2, 1.5, NaN])
      expect(mineLine({ rank, reason: "test" })).toBe("Tài khoản thử nghiệm không vào bảng này.");
  });
});

describe("boardView trên sampleBoards của shared", () => {
  it("mỗi bảng: nhãn, tiêu đề cột đúng BOARD_COLUMNS, mỗi dòng đủ số ô, dòng của mình được đánh dấu", () => {
    for (const board of BOARD_IDS) {
      const v = boardView(sampleBoards(board, 5));
      expect(v.board).toBe(board);
      expect(v.label).toBe(BOARD_LABELS[board]);
      expect(v.columns).toEqual(BOARD_COLUMNS[board].map((c) => c.label));
      expect(v.rows).toHaveLength(5);
      for (const r of v.rows) expect(r.cells).toHaveLength(BOARD_COLUMNS[board].length);
      expect(v.rows.filter((r) => r.mine).map((r) => r.rank)).toEqual([3]);
      expect(v.mineText).toBe("Hạng của bạn: 3");
      expect(v.mineRow).toBeNull(); // nằm trong top nên không lặp
      expect(v.ageText).toBe("cập nhật 1 phút trước");
      expect(v.empty).toBe(false);
    }
  });

  it("bảng Tu vi: cột Cảnh giới ra tên đầy đủ từ realm + tier, tu vi có dấu chấm ngăn nghìn", () => {
    const v = boardView(sampleBoards("tuvi", 3));
    expect(v.rows[0].cells[0]).toBe(realmLabel(3, 2));
    expect(v.rows[0].cells[1]).toBe("90.000");
  });

  it("bảng Linh hồn: cột 'Cảnh giới cao nhất' đảo từ bậc (step), kiếp là số", () => {
    // `sampleBoards("linhhon")` của shared cho step 40, 38, ... NGOÀI thang (bậc cao nhất là 33) nên dùng bậc hợp lệ ở đây
    const m = sampleBoards("linhhon", 2);
    m.rows = m.rows.map((r, i) => ({ ...r, step: 30 - i }));
    const v = boardView(m);
    expect(v.rows[0].cells[0]).toBe(stepLabel(30));
    expect(v.rows[0].cells[0]).not.toBe("—");
    expect(v.rows[0].cells[1]).toBe("12");
    // bậc ngoài thang (dữ liệu hỏng) hiện — chứ không "undefined"
    m.rows[1] = { ...m.rows[1], step: 40 };
    expect(boardView(m).rows[1].cells[0]).toBe("—");
  });

  it("dòng tài khoản thử nghiệm được đánh dấu ở bảng KHÔNG phải tu vi; danh hiệu hiện chữ", () => {
    const v = boardView(sampleBoards("pk", 5));
    expect(v.rows[1].test).toBe(true);
    expect(v.rows.filter((r) => r.test)).toHaveLength(1);
    expect(v.rows[0].title).toBe(titleText("kp1"));
    expect(v.rows[0].title).not.toBe("");
    expect(boardView(sampleBoards("tuvi", 5)).rows.some((r) => r.test)).toBe(false);
  });

  it("thời gian đã trôi từ lúc nhận được cộng vào tuổi bản chụp", () => {
    const m = sampleBoards("pk", 3); // ageMs 90 000 ms
    expect(boardView(m, 0).ageText).toBe("cập nhật 1 phút trước");
    expect(boardView(m, 60_000).ageText).toBe("cập nhật 2 phút trước");
    expect(boardView(m, -5).ageText).toBe("cập nhật 1 phút trước"); // âm / lạ: bỏ qua
  });
});

describe("boardView: các trạng thái giao diện phải vẽ", () => {
  const base = (): BoardsMsg => sampleBoards("tuvi", 5);

  it("mình NGOÀI top: có mineRow (kèm số liệu), không lặp trong rows, đánh dấu mine", () => {
    const m = base();
    m.mine = { rank: 47, row: { rank: 47, name: "Tô Vân Hạc", realm: 1, tier: 4, exp: 1234 } };
    const v = boardView(m);
    expect(v.mineText).toBe("Hạng của bạn: 47");
    expect(v.rows.some((r) => r.mine)).toBe(false);
    expect(v.mineRow).not.toBeNull();
    expect(v.mineRow!.rank).toBe(47);
    expect(v.mineRow!.mine).toBe(true);
    expect(v.mineRow!.cells).toEqual([realmLabel(1, 4), "1.234"]);
  });

  it("không hạng vì tài khoản thử nghiệm / thiếu trận / chưa có: có lý do, không có mineRow", () => {
    for (const [mine, text] of [
      [{ rank: null, reason: "test" }, "Tài khoản thử nghiệm không vào bảng này."],
      [{ rank: null, reason: "min_games", need: 7 }, "Cần thêm 7 trận để lên bảng."],
      [{ rank: null, reason: "none" }, "Chưa có hạng."],
    ] as const) {
      const m = base();
      m.mine = { ...mine };
      const v = boardView(m);
      expect(v.mineText).toBe(text);
      expect(v.mineRank).toBeNull();
      expect(v.mineRow).toBeNull();
      expect(v.rows.some((r) => r.mine)).toBe(false);
    }
  });

  it("bảng rỗng: empty = true", () => {
    const m = base();
    m.rows = [];
    expect(boardView(m).empty).toBe(true);
  });

  it("quá BOARD_SIZE dòng thì cắt về BOARD_SIZE", () => {
    const m = base();
    m.rows = Array.from({ length: 50 }, (_, i) => ({ rank: i + 1, name: `N${i}`, realm: 1 }));
    expect(boardView(m).rows).toHaveLength(BOARD_SIZE);
  });

  it("số liệu thiếu / hỏng hiện — (không NaN / undefined); đạo hiệu có thẻ HTML giữ NGUYÊN chuỗi (ui đổ bằng textContent)", () => {
    const m = base();
    m.rows = [
      { rank: 1, name: "<img src=x onerror=alert(1)>" } as never,
      { rank: 2, name: "B", realm: 99, tier: 99, exp: Infinity } as never,
      { rank: 3, name: "C", realm: "x", exp: "9" } as never,
    ];
    const v = boardView(m);
    expect(v.rows[0].name).toBe("<img src=x onerror=alert(1)>");
    expect(v.rows[0].cells).toEqual(["—", "—"]);
    expect(v.rows[1].cells).toEqual(["—", "—"]);
    expect(v.rows[2].cells).toEqual(["—", "—"]);
    for (const r of v.rows) for (const c of r.cells) expect(c).not.toMatch(/NaN|undefined|null/);
  });

  it("danh hiệu lạ / khoá nguyên mẫu -> không hiện danh hiệu (client cũ gặp máy chủ mới)", () => {
    const m = base();
    m.rows = [
      { rank: 1, name: "A", titleId: "zz9" },
      { rank: 2, name: "B", titleId: "toString" },
    ] as never;
    expect(boardView(m).rows.map((r) => r.title)).toEqual(["", ""]);
  });
});

describe("sanitizeBoardsMsg (tin từ mạng)", () => {
  it("tin hợp lệ qua nguyên vẹn; cắt rows về BOARD_SIZE", () => {
    const m = sampleBoards("pk", 5);
    expect(sanitizeBoardsMsg(JSON.parse(JSON.stringify(m)))).toEqual(m);
    const big = { ...m, rows: Array.from({ length: 60 }, (_, i) => ({ rank: i + 1, name: "x" })) };
    expect(sanitizeBoardsMsg(big)!.rows).toHaveLength(BOARD_SIZE);
  });

  it("sai kiểu / bảng lạ / thiếu rows -> null; dòng hỏng bị bỏ riêng từng dòng", () => {
    for (const bad of [
      null,
      undefined,
      3,
      "x",
      [],
      {},
      { board: "tuvi" },
      { board: "zzz", rows: [] },
      { board: "constructor", rows: [] },
    ])
      expect(sanitizeBoardsMsg(bad)).toBeNull();
    const ok = sanitizeBoardsMsg({
      board: "tuvi",
      rows: [
        { rank: 1, name: "A" },
        null,
        5,
        { rank: "2", name: "B" },
        { rank: 2.5, name: "C" },
        { rank: 3 },
      ],
      mine: null,
      ageMs: -1,
    })!;
    expect(ok.rows.map((r) => r.name)).toEqual(["A"]);
    expect(ok.mine).toEqual({ rank: null });
    expect(ok.ageMs).toBe(0);
  });

  it("mine: hạng hợp lệ + lý do + need + row; hạng sai -> null; lý do lạ bị bỏ", () => {
    const row = { rank: 9, name: "Z", realm: 1 };
    const a = sanitizeBoardsMsg({
      board: "pk",
      rows: [],
      mine: { rank: 9, row, reason: "zzz", need: 3 },
    })!;
    expect(a.mine).toEqual({ rank: 9, need: 3, row });
    const b = sanitizeBoardsMsg({
      board: "pk",
      rows: [],
      mine: { rank: 0, reason: "min_games", need: 2 },
    })!;
    expect(b.mine).toEqual({ rank: null, reason: "min_games", need: 2 });
  });
});

describe("tabByKey (dùng chung cho tab phụ của bảng xếp hạng)", () => {
  it("bốn bảng: Phải / Trái vòng quanh, Home / End, phím khác null", () => {
    expect(tabByKey(BOARD_IDS, "tuvi", "ArrowRight")).toBe("linhhon");
    expect(tabByKey(BOARD_IDS, "pk", "ArrowRight")).toBe("tuvi");
    expect(tabByKey(BOARD_IDS, "tuvi", "ArrowLeft")).toBe("pk");
    expect(tabByKey(BOARD_IDS, "tongmon", "Home")).toBe("tuvi");
    expect(tabByKey(BOARD_IDS, "tuvi", "End")).toBe("pk");
    expect(tabByKey(BOARD_IDS, "tuvi", "KeyA")).toBeNull();
    expect(tabByKey([] as string[], "x", "ArrowRight")).toBeNull();
  });
});

describe("khớp index.html (tab phụ của bảng xếp hạng)", () => {
  const html = readFileSync(path.resolve(__dirname, "../index.html"), "utf-8");
  const tagOf = (id: string): string => {
    const m = html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`, "s"));
    expect(m, `thiếu thẻ id="${id}"`).toBeTruthy();
    return m![0];
  };

  it("mỗi bảng trong BOARD_IDS có nút role=tab nối thân dùng chung; nhãn đúng BOARD_LABELS", () => {
    for (const id of BOARD_IDS) {
      const btn = tagOf(`social-board-btn-${id}`);
      expect(btn).toContain('role="tab"');
      expect(btn).toContain('aria-controls="social-board-panel"');
      expect(btn).toMatch(/aria-selected="(true|false)"/);
      const re = new RegExp(`id="social-board-btn-${id}"[^>]*>\\s*([^<]*?)\\s*</button>`, "s");
      expect(html.match(re)?.[1], id).toBe(BOARD_LABELS[id]);
    }
    const panel = tagOf("social-board-panel");
    expect(panel).toContain('role="tabpanel"');
    expect(panel).toContain("aria-labelledby");
  });

  it("chỉ bảng đầu mở sẵn (aria-selected=true, tabindex=0), các bảng còn lại tabindex=-1", () => {
    BOARD_IDS.forEach((id, i) => {
      const btn = tagOf(`social-board-btn-${id}`);
      expect(btn).toContain(`aria-selected="${i === 0}"`);
      expect(btn).toContain(`tabindex="${i === 0 ? 0 : -1}"`);
    });
  });

  it("có đủ chỗ đổ dữ liệu: câu hạng của mình, trạng thái (role=status), bảng có caption + thead + tbody, tuổi bản chụp, nút tải lại ẩn sẵn", () => {
    for (const id of [
      "social-board-mine",
      "social-board-status",
      "social-board-wrap",
      "social-board-table",
      "social-board-caption",
      "social-board-head",
      "social-board-body",
      "social-board-age",
      "social-board-retry",
    ])
      tagOf(id);
    expect(tagOf("social-board-status")).toContain('role="status"');
    expect(tagOf("social-board-mine")).toContain('aria-live="polite"');
    expect(/\shidden[\s>]/.test(tagOf("social-board-retry"))).toBe(true);
    expect(/\shidden[\s>]/.test(tagOf("social-board-wrap"))).toBe(true);
  });
});
