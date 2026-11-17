// Bảng xếp hạng (M9.3 #1022): bốn bảng từ kho, loại TEST_EXP_MULT khỏi `tuvi`, `mine` có lý do, làm mới an toàn, không rò id.
import { describe, expect, it } from "vitest";
import {
  BOARD_PK_MIN_GAMES,
  BOARD_SIZE,
  newSoul,
  newSocial,
  stepOf,
  type Soul,
} from "@tien-gioi/shared";
import { LeaderboardService, type LeaderboardDeps } from "./leaderboard";
import type { ProfileRow } from "./player-store";
import type { Sect } from "./sect-store";
import type { AccountRecord } from "./account-store";
import { soulIdOf } from "./soul";

const prof = (
  name: string,
  realm: number,
  tier: number,
  exp: number,
  limbo = false,
): ProfileRow => ({
  name,
  realm,
  tier,
  exp,
  limbo,
});
const soul = (
  id: string,
  o: Partial<Soul> & { won?: number; lost?: number; title?: string } = {},
): Soul => {
  const s = newSoul(id, "t");
  s.kiep = o.kiep ?? 1;
  s.best = o.best ?? { step: 0, realm: 0, tier: 0 };
  if (o.won !== undefined || o.lost !== undefined || o.title !== undefined)
    s.social = {
      ...newSocial(),
      pk: { won: o.won ?? 0, lost: o.lost ?? 0 },
      title: o.title ?? null,
    };
  return s;
};
const sect = (name: string, points: number, members: number): Sect =>
  ({
    v: 1,
    id: `id-${name}`,
    name,
    tag: "T",
    leader: "x",
    motd: "",
    members: Array.from({ length: members }, (_, i) => ({ key: `m${i}` })) as never,
    coin: 0,
    log: [],
    vault: {} as never,
    points,
    createdAt: "t",
    updatedAt: "t",
  }) as unknown as Sect;

interface Data {
  souls: Soul[];
  profiles: ProfileRow[];
  sects: Sect[];
  accounts?: AccountRecord[];
  testExp?: Map<string, number>;
}
function make(data: Data, now = { t: 1_000_000 }) {
  const calls = { souls: 0 };
  const deps: LeaderboardDeps = {
    souls: {
      all: async () => {
        calls.souls++;
        return data.souls;
      },
    } as never,
    players: { listProfiles: async () => data.profiles } as never,
    sects: { all: async () => data.sects } as never,
    accounts: data.accounts ? ({ all: async () => data.accounts! } as never) : null,
    testExp: () => data.testExp ?? new Map(),
    now: () => now.t,
  };
  return { svc: new LeaderboardService(deps), calls, now };
}

describe("LeaderboardService: bốn bảng (chế độ cũ: khoá chân linh = đạo hiệu chuẩn hoá)", () => {
  const base = (): Data => ({
    profiles: [
      prof("An Nhiên", 2, 1, 50),
      prof("Bảo Thanh", 3, 0, 5),
      prof("Châu Hương", 2, 1, 90),
      prof("Đã Chết", 4, 0, 1, true),
    ],
    souls: [
      soul(soulIdOf("An Nhiên"), {
        kiep: 4,
        best: { step: stepOf(3, 0), realm: 3, tier: 0 },
        won: 12,
        lost: 3,
        title: "kp1",
      }),
      soul(soulIdOf("Bảo Thanh"), {
        kiep: 2,
        best: { step: 5, realm: 1, tier: 0 },
        won: 2,
        lost: 1,
      }),
      soul(soulIdOf("Châu Hương"), { kiep: 9, best: { step: 20, realm: 2, tier: 0 } }),
      soul("khong-ten-hien-thi", { kiep: 99 }), // không có đạo hiệu: không hiện
    ],
    sects: [sect("Thanh Vân", 9000, 5), sect("Bạch Liên", 100, 2), sect("Trống", 99999, 0)],
  });

  it("tuvi: cảnh giới > bậc > tu vi; loại nhân vật Hoàng Tuyền; kèm danh hiệu; không có id / khoá chân linh", async () => {
    const { svc } = make(base());
    await svc.refresh();
    const v = svc.view("tuvi", null);
    expect(v.rows.map((r) => [r.rank, r.name])).toEqual([
      [1, "Bảo Thanh"],
      [2, "Châu Hương"],
      [3, "An Nhiên"],
    ]);
    expect(v.rows[2]).toEqual({
      rank: 3,
      name: "An Nhiên",
      realm: 2,
      tier: 1,
      exp: 50,
      titleId: "kp1",
    });
    for (const r of v.rows) expect(Object.keys(r).sort()).not.toContain("id");
    expect(JSON.stringify(v)).not.toContain(soulIdOf("An Nhiên") + '"'); // khoá chân linh không lộ (chỉ đạo hiệu hiển thị)
  });

  it("linhhon: bậc cao nhất rồi kiếp; chân linh không có đạo hiệu bị bỏ; pk: cần đủ trận, theo thắng; tongmon: tông còn người, theo cấp rồi cống hiến", async () => {
    const { svc } = make(base());
    await svc.refresh();
    expect(svc.view("linhhon", null).rows.map((r) => [r.name, r.step, r.kiep])).toEqual([
      ["Châu Hương", 20, 9],
      ["An Nhiên", stepOf(3, 0), 4],
      ["Bảo Thanh", 5, 2],
    ]);
    // An Nhiên: 15 trận (đủ), Bảo Thanh: 3 trận (thiếu), Châu Hương: 0 trận
    expect(svc.view("pk", null).rows.map((r) => [r.name, r.won, r.lost])).toEqual([
      ["An Nhiên", 12, 3],
    ]);
    const t = svc.view("tongmon", null).rows;
    expect(t.map((r) => r.name)).toEqual(["Thanh Vân", "Bạch Liên"]);
    expect(t[0]).toMatchObject({ name: "Thanh Vân", points: 9000, members: 5 });
    expect(t[0].level).toBeGreaterThan(t[1].level!);
  });

  it("mine: trong top có hạng + dòng; PK chưa đủ trận -> min_games + need; chưa có dữ liệu -> none; người lạ / null -> none; tongmon luôn none", async () => {
    const { svc } = make(base());
    await svc.refresh();
    expect(svc.view("tuvi", "an nhiên").mine).toMatchObject({ rank: 3, row: { name: "An Nhiên" } }); // không phân biệt hoa thường
    expect(svc.view("pk", "Bảo Thanh").mine).toEqual({
      rank: null,
      reason: "min_games",
      need: BOARD_PK_MIN_GAMES - 3,
    });
    expect(svc.view("pk", "Châu Hương").mine).toEqual({ rank: null, reason: "none" });
    expect(svc.view("tuvi", "Người Lạ").mine).toEqual({ rank: null, reason: "none" });
    expect(svc.view("tuvi", null).mine).toEqual({ rank: null, reason: "none" });
    expect(svc.view("tongmon", "Thanh Vân").mine).toEqual({ rank: null, reason: "none" });
  });

  it("TEST_EXP_MULT: không vào tuvi (mine.reason test), vào các bảng khác kèm test: true", async () => {
    const data = base();
    data.testExp = new Map([[soulIdOf("An Nhiên"), 3]]);
    const { svc } = make(data);
    await svc.refresh();
    expect(svc.view("tuvi", null).rows.map((r) => r.name)).toEqual(["Bảo Thanh", "Châu Hương"]);
    expect(svc.view("tuvi", "An Nhiên").mine).toEqual({ rank: null, reason: "test" });
    const lh = svc.view("linhhon", null).rows;
    expect(lh.find((r) => r.name === "An Nhiên")).toMatchObject({ test: true });
    expect(lh.filter((r) => r.test).length).toBe(1); // chỉ đúng tài khoản thử nghiệm
    expect(svc.view("pk", null).rows[0]).toMatchObject({ name: "An Nhiên", test: true });
  });

  it("chế độ tài khoản: chân linh khoá theo id tài khoản, đạo hiệu lấy từ tài khoản", async () => {
    const data: Data = {
      profiles: [prof("Hạ Thanh", 1, 0, 7)],
      souls: [
        soul("acc-1", { kiep: 3, best: { step: 9, realm: 1, tier: 3 }, title: "lh2" }),
        soul("acc-2", { kiep: 1 }),
      ],
      sects: [],
      accounts: [
        {
          id: "acc-1",
          username: "u1",
          passHash: "",
          recoveryHash: "",
          createdAt: "",
          lastLoginAt: "",
          disabled: false,
          name: "Hạ Thanh",
        },
        {
          id: "acc-2",
          username: "u2",
          passHash: "",
          recoveryHash: "",
          createdAt: "",
          lastLoginAt: "",
          disabled: false,
        }, // chưa có đạo hiệu
      ],
    };
    const { svc } = make(data);
    await svc.refresh();
    expect(svc.view("linhhon", null).rows).toEqual([
      { rank: 1, name: "Hạ Thanh", step: 9, kiep: 3, titleId: "lh2" },
    ]);
    expect(svc.view("tuvi", null).rows[0]).toMatchObject({ name: "Hạ Thanh", titleId: "lh2" });
    expect(JSON.stringify(svc.view("linhhon", null))).not.toContain("acc-1");
  });
});

describe("LeaderboardService: top 20, hạng ngoài top, làm mới", () => {
  it("view cắt BOARD_SIZE dòng; người ở hạng 47 có mine.rank = 47 và row dù không nằm trong rows", async () => {
    const profiles = Array.from({ length: 60 }, (_, i) => prof(`Tu Si ${i}`, 1, 0, 1000 - i));
    const { svc } = make({ profiles, souls: [], sects: [] });
    await svc.refresh();
    const v = svc.view("tuvi", "Tu Si 46");
    expect(v.rows.length).toBe(BOARD_SIZE);
    expect(v.mine.rank).toBe(47);
    expect(v.mine.row).toMatchObject({ name: "Tu Si 46", rank: 47 });
    expect(v.rows.some((r) => r.name === "Tu Si 46")).toBe(false);
  });

  it("chưa làm mới lần nào: bảng trống + none, ageMs 0; sau đó ageMs là tuổi bản chụp (tương đối)", async () => {
    const { svc, now } = make({ profiles: [prof("A", 1, 0, 1)], souls: [], sects: [] });
    expect(svc.ready).toBe(false);
    expect(svc.view("tuvi", "A")).toEqual({
      board: "tuvi",
      rows: [],
      mine: { rank: null, reason: "none" },
      ageMs: 0,
    });
    await svc.refresh();
    expect(svc.ready).toBe(true);
    expect(svc.view("tuvi", "A").ageMs).toBe(0);
    now.t += 90_000;
    expect(svc.view("tuvi", "A").ageMs).toBe(90_000);
  });

  it("gọi refresh chồng nhau dùng chung MỘT lần đọc kho", async () => {
    const { svc, calls } = make({ profiles: [], souls: [], sects: [] });
    await Promise.all([svc.refresh(), svc.refresh(), svc.refresh()]);
    expect(calls.souls).toBe(1);
    await svc.refresh();
    expect(calls.souls).toBe(2);
  });

  it("đọc kho hỏng: GIỮ bản chụp cũ (không xoá bảng, không ném); lần đầu hỏng thì vẫn chưa có bảng", async () => {
    let fail = false;
    const data: Data = { profiles: [prof("A", 1, 0, 1)], souls: [], sects: [] };
    const deps: LeaderboardDeps = {
      souls: { all: async () => [] } as never,
      players: {
        listProfiles: async () => {
          if (fail) throw new Error("kho hỏng");
          return data.profiles;
        },
      } as never,
      sects: { all: async () => [] } as never,
      testExp: () => new Map(),
    };
    const svc = new LeaderboardService(deps);
    fail = true;
    await expect(svc.refresh()).resolves.toBeUndefined();
    expect(svc.ready).toBe(false);
    fail = false;
    await svc.refresh();
    expect(svc.view("tuvi", null).rows.length).toBe(1);
    fail = true;
    await svc.refresh();
    expect(svc.view("tuvi", null).rows.length).toBe(1); // vẫn là bản cũ
  });

  it("kho giả không có all / listProfiles (stub test): không ném, bảng trống", async () => {
    const svc = new LeaderboardService({
      souls: {} as never,
      players: {} as never,
      sects: { all: async () => [] } as never,
      testExp: () => new Map(),
    });
    await svc.refresh();
    expect(svc.view("tuvi", null).rows).toEqual([]);
  });
});
