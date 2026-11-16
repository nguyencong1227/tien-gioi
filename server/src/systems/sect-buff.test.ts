// Buff tông môn (M8.3b, docs/THIET_KE_TONG_MON.md mục 12.5) và thưởng bí cảnh cho đồng môn (mục 12.3): `PlayerCtrl.sectBuff` đặt / xoá theo cấp tông, ba điểm gắn mỗi loại ĐÚNG MỘT chỗ
// (`gainExp` sau `scale` trước `testExpMult`; `dropLoot` theo CHỦ ĐỒ; `tickRecovery` ngoài đả tọa), thưởng bí cảnh >= 2 đồng môn một lần / ngày. World giả + kho tệp thật.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DROP_TABLES,
  SECT_BUFF_DROP_MAX,
  SECT_DUNGEON_CH,
  SECT_LEVELS,
  sectBuffOf,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { makeSect } from "../store-contract";
import { dropLoot } from "./loot";
import { gainExp, tickRecovery } from "./progression";
import { sectDeposit, sectDungeonBonus, sectLeave, sectOnJoin } from "./sect";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-buff-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const DAY = 86_400_000;
const A = "Alpha";
const B = "Bravo";
const C = "Charlie";
const keyOf = (s: string) => s.toLowerCase();

let now = 1_700_000_000_000;
let lh: ReturnType<typeof makeWorld>;
let store: FileSectStore;
let svc: SectService;

/** Dựng tông môn "t1" (A Tông chủ, B Đệ tử; C ngoài tông) ở điểm tông `points`, thành viên vào từ 2 ngày trước. */
async function seed(points: number, members: string[] = [A, B]) {
  await store.create(
    makeSect("t1", {
      name: "Thanh Van",
      tag: "TV",
      leader: keyOf(A),
      points,
      members: members.map((m, i) => ({
        soulKey: keyOf(m),
        name: m,
        rank: i === 0 ? ("chu" as const) : ("de_tu" as const),
        joinedAt: now - 2 * DAY,
      })),
    }),
  );
}
const buffOf = (who: string) => lh.w.ctrl.get(who)!.sectBuff;

beforeEach(() => {
  now = 1_700_000_000_000;
  lh = makeWorld(undefined, new Hub());
  store = new FileSectStore(path.join(root, `s${++n}`), () => now);
  svc = new SectService(store, () => now);
  lh.w.now = now;
  lh.w.sectService = svc;
  lh.w.onSaveNow = async () => true;
  for (const who of [A, B, C]) addPlayer(lh.w, who, 1, 8);
  for (const who of [A, B, C]) lh.w.ctrl.get(who)!.coin = 100_000;
});
afterEach(() => vi.restoreAllMocks());

describe("sectBuff theo cấp tông: đặt lúc vào phòng, lên cấp, mất khi rời", () => {
  it("cấp 1: KHÔNG buff (để trống, đường nóng không tốn); cấp 2-5: đúng bảng SECT_LEVELS; người ngoài tông không có", async () => {
    for (const [points, level] of [
      [0, 1],
      [1000, 2],
      [4000, 3],
      [12_000, 4],
      [30_000, 5],
    ] as const) {
      lh = makeWorld(undefined, new Hub());
      store = new FileSectStore(path.join(root, `s${++n}`), () => now);
      svc = new SectService(store, () => now);
      lh.w.sectService = svc;
      lh.w.onSaveNow = async () => true;
      addPlayer(lh.w, A, 1, 8);
      addPlayer(lh.w, C, 1, 8);
      await seed(points, [A]);
      await sectOnJoin(lh.w, A);
      await sectOnJoin(lh.w, C);
      if (level === 1) expect(buffOf(A)).toBeUndefined();
      else expect(buffOf(A)).toEqual(SECT_LEVELS[level - 1]!.buff);
      expect(buffOf(C)).toBeUndefined();
    }
  });

  it("LÊN CẤP trong phiên: mọi thành viên trực tuyến nhận buff mới ngay (không cần vào lại); buff là BẢN SAO (sửa không đụng bảng)", async () => {
    await seed(990);
    await sectOnJoin(lh.w, A);
    await sectOnJoin(lh.w, B);
    expect(buffOf(A)).toBeUndefined();
    await sectDeposit(lh.w, A, { amount: 1000 }); // +10 điểm -> 1000 = cấp 2
    for (const who of [A, B]) expect(buffOf(who)).toEqual(sectBuffOf(2));
    buffOf(A)!.exp = 99;
    expect(buffOf(B)!.exp).toBeCloseTo(1.02);
    expect(sectBuffOf(2).exp).toBeCloseTo(1.02);
  });

  it("rời / bị mời ra / giải tán: HẾT buff ngay", async () => {
    await seed(12_000);
    await sectOnJoin(lh.w, A);
    await sectOnJoin(lh.w, B);
    expect(buffOf(B)).toBeTruthy();
    await sectLeave(lh.w, B);
    expect(buffOf(B)).toBeUndefined();
    expect(buffOf(A)).toBeTruthy(); // người ở lại vẫn giữ
  });
});

describe("điểm gắn buff", () => {
  it("TU VI: gainExp nhân hệ số buff SAU scale và TRƯỚC testExpMult (thứ tự đúng); không buff thì y hệt cũ", () => {
    const { p, c } = (() => {
      const r = lh.w.ctrl.get(A)!;
      return { p: lh.w.state.players.get(A)!, c: r };
    })();
    p.exp = 0;
    p.expMax = 1_000_000;
    gainExp(lh.w, A, p, 100);
    expect(p.exp).toBeCloseTo(100);
    p.exp = 0;
    c.sectBuff = sectBuffOf(5); // exp 1,05
    gainExp(lh.w, A, p, 100, 2); // scale 2 -> 200 x 1,05
    expect(p.exp).toBeCloseTo(210);
    p.exp = 0;
    c.testExpMult = 3;
    gainExp(lh.w, A, p, 100, 2); // 100 x 2 x 1,05 x 3
    expect(p.exp).toBeCloseTo(630);
  });

  it("TU VI: hệ số hỏng / vượt trần (1,5; NaN; <= 1) bị coi là 1 (hàng rào thứ hai)", () => {
    const p = lh.w.state.players.get(A)!;
    const c = lh.w.ctrl.get(A)!;
    p.expMax = 1_000_000;
    for (const bad of [1.5, Number.NaN, 1, 0.5, -3]) {
      p.exp = 0;
      c.sectBuff = { exp: bad, drop: 1, regen: 1 };
      gainExp(lh.w, A, p, 100);
      expect(p.exp).toBeCloseTo(100);
    }
  });

  it("RƠI ĐỒ: cơ hội nhân hệ số của CHỦ ĐỒ: rng nằm giữa chance và chance x hệ số thì chỉ lúc có buff mới rơi; buff của người KHÁC (không phải chủ) không tính", () => {
    // chọn quái + món có cơ hội lớn nhất <= 0,9 để chance x 1,05 vẫn < 1
    let best: { kind: string; itemId: string; chance: number } | undefined;
    for (const [kind, table] of Object.entries(DROP_TABLES))
      for (const e of table)
        if (e.chance <= 0.9 && (!best || e.chance > best.chance))
          best = { kind, itemId: e.itemId, chance: e.chance };
    expect(best).toBeDefined();
    const v = best!.chance * 1.02; // giữa chance và chance x 1,05
    expect(v).toBeLessThan(Math.min(1, best!.chance * SECT_BUFF_DROP_MAX));
    const count = (w: typeof lh.w) =>
      [...w.state.loot.values()].filter((l) => l.itemId === best!.itemId).length;
    const kill = (ownerBuff: boolean, otherBuff: boolean) => {
      vi.spyOn(Math, "random").mockReturnValue(v);
      lh.w.ctrl.get(A)!.sectBuff = ownerBuff ? sectBuffOf(5) : undefined;
      lh.w.ctrl.get(B)!.sectBuff = otherBuff ? sectBuffOf(5) : undefined;
      for (const id of [...lh.w.state.loot.keys()]) lh.w.state.loot.delete(id);
      const m = addMonster(lh.w, best!.kind, 500, 500);
      m.mc.damageBy.clear();
      m.mc.damageBy.set(A, 100); // A là chủ đồ (đánh nhiều nhất)
      m.mc.damageBy.set(B, 10);
      dropLoot(lh.w, m.mc, 500, 500);
      return count(lh.w);
    };
    expect(kill(false, false)).toBe(0); // không buff: rng v > chance -> không rơi
    expect(kill(true, false)).toBeGreaterThan(0); // chủ đồ có buff -> rơi
    expect(kill(false, true)).toBe(0); // chỉ người không phải chủ có buff -> không
  });

  it("HỒI PHỤC: ngoài đả tọa hồi nhanh hơn đúng hệ số; ĐANG đả tọa thì KHÔNG buff (đả tọa vốn đã nhanh); không buff thì y hệt cũ", () => {
    const p = lh.w.state.players.get(A)!;
    const c = lh.w.ctrl.get(A)!;
    const gain = (buff: boolean, meditating: boolean) => {
      p.hp = 1;
      p.mp = 0;
      p.maxHp = 100_000;
      p.maxMp = 100_000;
      p.meditating = meditating;
      c.lastHitAt = -1e9;
      c.frac = { hp: 0, mp: 0, exp: 0, expAt: 1e18 };
      c.sectBuff = buff ? sectBuffOf(5) : undefined; // regen 1,15
      for (let i = 0; i < 20; i++) tickRecovery(lh.w, A, p, c, 0.05);
      return { hp: p.hp - 1, mp: p.mp };
    };
    const base = gain(false, false);
    const buffed = gain(true, false);
    expect(base.hp).toBeGreaterThan(0);
    expect(buffed.hp / base.hp).toBeGreaterThan(1.1);
    expect(buffed.hp / base.hp).toBeLessThan(1.2);
    expect(buffed.mp / base.mp).toBeGreaterThan(1.1);
    expect(gain(true, true)).toEqual(gain(false, true)); // đả tọa: không khác
  });
});

describe("thưởng bí cảnh cho đồng môn (mục 12.3)", () => {
  it("2 đồng môn cùng nhận thưởng: MỖI người +SECT_DUNGEON_CH cống hiến; lần thứ hai cùng ngày: 0 (một lần / ngày); toast nêu số", async () => {
    await seed(0);
    await sectOnJoin(lh.w, A);
    await sectOnJoin(lh.w, B);
    await sectDungeonBonus(lh.w, [A, B]);
    for (const who of [A, B]) {
      const m = (await store.get("t1"))!.members.find((x) => x.soulKey === keyOf(who))!;
      expect(m.contrib).toBe(SECT_DUNGEON_CH);
      expect(m.today!.dungeon).toBe(true);
      expect(
        lh.toasts.some(
          (t) => t.sid === who && t.msg.text.includes(`+${SECT_DUNGEON_CH} cống hiến`),
        ),
      ).toBe(true);
    }
    await sectDungeonBonus(lh.w, [A, B]);
    expect((await store.get("t1"))!.members.find((x) => x.soulKey === keyOf(A))!.contrib).toBe(
      SECT_DUNGEON_CH,
    );
    now += DAY;
    lh.w.now = now;
    await sectDungeonBonus(lh.w, [A, B]);
    expect((await store.get("t1"))!.members.find((x) => x.soulKey === keyOf(A))!.contrib).toBe(
      2 * SECT_DUNGEON_CH,
    );
  });

  it("đi MỘT MÌNH, hoặc mỗi tông chỉ MỘT người, hoặc người ngoài tông: KHÔNG có cống hiến", async () => {
    await seed(0);
    await sectOnJoin(lh.w, A);
    await sectOnJoin(lh.w, B);
    await sectDungeonBonus(lh.w, [A]); // một mình
    await sectDungeonBonus(lh.w, [A, C]); // C ngoài tông: chỉ có 1 đồng môn
    await sectDungeonBonus(lh.w, [C]);
    await sectDungeonBonus(lh.w, []);
    const t = (await store.get("t1"))!;
    expect(t.members.every((m) => m.contrib === undefined)).toBe(true);
    expect(t.points ?? 0).toBe(0);
  });

  it("vẫn CHỜ SANG NGÀY (vào tông cùng ngày thì không có) và người đã chết không kiếm", async () => {
    await store.create(
      makeSect("t1", {
        name: "Thanh Van",
        tag: "TV",
        leader: keyOf(A),
        members: [
          { soulKey: keyOf(A), name: A, rank: "chu", joinedAt: now - 1000 },
          { soulKey: keyOf(B), name: B, rank: "de_tu", joinedAt: now - 1000 },
        ],
      }),
    );
    await sectOnJoin(lh.w, A);
    await sectOnJoin(lh.w, B);
    await sectDungeonBonus(lh.w, [A, B]);
    expect((await store.get("t1"))!.points ?? 0).toBe(0); // chưa tới ngày
    lh.w.sectEarnWarmup = false;
    lh.w.state.players.get(B)!.dead = true;
    await sectDungeonBonus(lh.w, [A, B]);
    const t = (await store.get("t1"))!;
    expect(t.members.find((m) => m.soulKey === keyOf(A))!.contrib).toBe(SECT_DUNGEON_CH);
    expect(t.members.find((m) => m.soulKey === keyOf(B))!.contrib).toBeUndefined(); // đã chết
  });
});
