// Đo thời gian TÌM quái bằng mã server thật (#406 mục 7): tìm đường, thợ săn, bảng đối chiếu, độ nhạy.
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID, TILE, getMap } from "@tien-gioi/shared";
import { ASSUME } from "./simulate";
import {
  SEARCH_KILLS,
  SEARCH_KILLS_BOSS,
  SEARCH_OPTIMISM_LIMIT,
  SEARCH_SEEDS,
  SEARCH_VIEWS,
  gridOf,
  newGrid,
  planPath,
  searchCases,
  searchCheck,
  searchRun,
  searchSensitivity,
  type SearchRow,
} from "./search-check";

/** Lưới từ hình vẽ: '#' chặn, '.' đi được. */
function grid(rows: string[]) {
  const h = rows.length,
    w = rows[0].length;
  const free = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (free[y * w + x] = c === "#" ? 0 : 1)));
  return newGrid(w, h, free);
}
const centre = (g: { w: number }, cell: number) => ({
  x: ((cell % g.w) + 0.5) * TILE,
  y: (Math.floor(cell / g.w) + 0.5) * TILE,
});

describe("planPath: đường đi ngắn nhất trên lưới ô", () => {
  it("đi vòng qua tường, không bao giờ bước lên ô chặn, mỗi bước sang ô kề", () => {
    const g = grid(["..#..", "..#..", "..#..", "..#..", "....."]);
    const goal = 0 * g.w + 4;
    const r = planPath(g, 0.5 * TILE, 0.5 * TILE, new Set([goal]))!;
    expect(r).not.toBeNull();
    expect(r.cells[0]).toBe(0);
    expect(r.cells.at(-1)).toBe(goal);
    for (const c of r.cells) expect(g.free[c]).toBe(1);
    for (let i = 1; i < r.cells.length; i++) {
      const a = centre(g, r.cells[i - 1]),
        b = centre(g, r.cells[i]);
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(TILE);
    }
    // 8 bước thẳng + 2 bước chéo: xuống cột 0, chéo qua khe, dọc đáy, chéo lên cột 4 rồi lên hàng 0 (đường chim bay chỉ 4 ô)
    expect(r.length).toBeCloseTo(8 + 2 * Math.SQRT2, 9);
  });

  it("đường thẳng thì độ dài đúng bằng số ô; đi chéo tính căn 2", () => {
    const g = grid(["......", "......", "......"]);
    expect(planPath(g, 0.5 * TILE, 0.5 * TILE, new Set([5]))!.length).toBe(5);
    const diag = planPath(g, 0.5 * TILE, 0.5 * TILE, new Set([2 * g.w + 2]))!;
    expect(diag.length).toBeCloseTo(2 * Math.SQRT2, 9);
  });

  it("không cắt góc tường: hai ô chéo mà hai ô kề theo trục bị chặn thì không đi được", () => {
    const g = grid([".#", "#."]);
    expect(planPath(g, 0.5 * TILE, 0.5 * TILE, new Set([1 * g.w + 1]))).toBeNull();
  });

  it("không tới được thì trả null; ô xuất phát cũng là đích thì độ dài 0", () => {
    const g = grid([".#.", ".#.", ".#."]);
    expect(planPath(g, 0.5 * TILE, 0.5 * TILE, new Set([2]))).toBeNull();
    expect(planPath(g, 0.5 * TILE, 0.5 * TILE, new Set([0]))!.length).toBe(0);
  });

  it("gọi nhiều lần liên tiếp trên cùng lưới cho cùng kết quả (bộ nhớ nháp được tái dùng đúng)", () => {
    const g = grid(["..#..", "..#..", "..#..", "..#..", "....."]);
    const a = planPath(g, 0.5 * TILE, 0.5 * TILE, new Set([4]))!;
    planPath(g, 4.5 * TILE, 4.5 * TILE, new Set([0]));
    const b = planPath(g, 0.5 * TILE, 0.5 * TILE, new Set([4]))!;
    expect(b).toEqual(a);
  });

  it("trên bản đồ thật: từ trấn tới một ô trống xa, đường đi hợp lệ và không dài quá 2,5 lần đường chim bay", () => {
    for (const id of ["lac_ha", "hac_phong", "am_suong"]) {
      const map = getMap(id)!;
      const g = gridOf(map);
      const sx = map.townPx.x,
        sy = map.townPx.y;
      // ô trống đầu tiên cách trấn >= 1000 px theo hàng ngang
      let goal = -1;
      for (let c = 0; c < g.free.length && goal < 0; c++) {
        if (!g.free[c]) continue;
        const p = centre(g, c);
        if (Math.hypot(p.x - sx, p.y - sy) >= 1000) goal = c;
      }
      const r = planPath(g, sx, sy, new Set([goal]))!;
      expect(r, id).not.toBeNull();
      for (const c of r.cells) expect(g.free[c], id).toBe(1);
      const straight = Math.hypot(centre(g, goal).x - sx, centre(g, goal).y - sy) / TILE;
      expect(r.length, id).toBeGreaterThanOrEqual(straight - 1);
      expect(r.length, id).toBeLessThan(straight * 2.5);
    }
  });
});

describe("searchRun: thợ săn bất tử trong World thật", () => {
  it("cùng hạt giống cho đúng cùng kết quả; hạt giống khác cho kết quả khác", () => {
    const a = searchRun("am_suong", "suong_ho", 3, 0, 6, 1);
    const b = searchRun("am_suong", "suong_ho", 3, 0, 6, 1);
    const c = searchRun("am_suong", "suong_ho", 3, 0, 6, 2);
    expect(b).toEqual(a);
    expect(c.searches).not.toEqual(a.searches);
    expect(a.searches).toHaveLength(6);
    for (const x of a.searches) {
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
    }
  });

  it("hạ đủ số lần yêu cầu ở mọi mức nhìn, kể cả quái thưa (trùm 2 con) và nhìn hẹp", () => {
    for (const view of Object.values(SEARCH_VIEWS)) {
      const r = searchRun("am_suong", "hac_giao", 3, 0, 3, 1, view);
      expect(r.searches).toHaveLength(3);
      expect(r.simSeconds).toBeLessThan(3 * 3600);
    }
  });

  it("biết hết bản đồ không bao giờ chậm hơn nhìn hẹp ở loài thưa (cùng hạt giống)", () => {
    const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
    const all = mean(searchRun("lac_ha", "mang", 3, 0, 6, 1, SEARCH_VIEWS.all).searches);
    const pc = mean(searchRun("lac_ha", "mang", 3, 0, 6, 1, SEARCH_VIEWS.pc).searches);
    const phone = mean(searchRun("lac_ha", "mang", 3, 0, 6, 1, SEARCH_VIEWS.phone).searches);
    expect(all).toBeLessThan(pc);
    expect(pc).toBeLessThan(phone);
  });
});

describe("bảng đối chiếu thời gian tìm quái", () => {
  const cases = searchCases();
  let rows: SearchRow[] | null = null;
  const getRows = () => (rows ??= cases.map((c) => searchCheck(c)));

  it("có đủ 11 dòng: mọi loài có giả định ở mọi bản đồ thường có quái đó, kể cả Kim Đan", () => {
    expect(cases).toHaveLength(11);
    const key = (c: { mapId: string; monsterId: string }) => `${c.mapId}/${c.monsterId}`;
    for (const k of [
      "lac_ha/tho",
      "lac_ha/lang",
      "lac_ha/ho",
      "lac_ha/mang",
      "hac_phong/lang",
      "hac_phong/ho",
      "hac_phong/mang",
      "am_suong/suong_ho",
      "am_suong/thach_quy",
      "am_suong/doc_thiem",
      "am_suong/hac_giao",
    ])
      expect(cases.map(key), k).toContain(k);
  });

  it("mô hình KHÔNG lạc quan: thợ săn biết hết bản đồ (cận dưới) không đo quá 1,25x giả định ở dòng nào", () => {
    for (const r of getRows()) {
      expect(r.ratio, `${r.mapId} ${r.monsterId}`).toBeLessThanOrEqual(SEARCH_OPTIMISM_LIMIT);
      expect(r.mean, `${r.mapId} ${r.monsterId}`).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.mean)).toBe(true);
      expect(r.n).toBe(
        SEARCH_SEEDS * (MONSTER_BY_ID[r.monsterId].boss ? SEARCH_KILLS_BOSS : SEARCH_KILLS),
      );
      expect(r.assumed).toBe(ASSUME.searchSec[r.monsterId]);
    }
  }, 60_000);

  it("độ nhạy: thay giả định bằng số đo rồi KHÔI PHỤC ASSUME.searchSec; số đo nhanh hơn thì nhịp nhanh hơn", () => {
    const before = { ...ASSUME.searchSec };
    const s = searchSensitivity(getRows());
    expect({ ...ASSUME.searchSec }).toEqual(before);
    // số liệu mô hình khớp bảng Kim Đan sau nội dung (5,2 giờ tối ưu, 5,7 giờ bãi mới): chặn trôi mà không ai hay
    expect(s.model.kimDan / 60).toBeGreaterThan(4.5);
    expect(s.model.kimDan / 60).toBeLessThan(6);
    expect(s.model.kimDanNoMang).toBeGreaterThanOrEqual(s.model.kimDan);
    expect(s.measured.luyenKhi).toBeLessThan(s.model.luyenKhi);
    expect(s.measured.trucCo).toBeLessThan(s.model.trucCo);
    expect(s.measured.kimDan).toBeLessThan(s.model.kimDan);
    expect(s.model.mangRatio).toHaveLength(3);
    for (const r of [...s.model.mangRatio, ...s.measured.mangRatio]) {
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  }, 60_000);
});
