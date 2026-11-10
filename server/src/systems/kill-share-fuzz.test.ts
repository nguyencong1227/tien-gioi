// Thử nghiệm thuộc tính cho CHIA THƯỞNG KHI HẠ QUÁI (M4-sớm, #253 giai đoạn 2; docs/PHAN_CONG_M4.md mục 2.2): thế giới ngẫu nhiên có hạt
// giống gồm nhiều người (người lẻ, đội 2-4 người, người ở xa, người đã ngã, người rớt khỏi phòng nhưng còn trong sổ sát thương) cùng
// đánh một con quái, rồi gọi `killMonster` THẬT. Kiểm:
//  1. **Linh thạch:** tổng Linh thạch cả phòng tăng đúng bằng số quái đã tung (không hơn: lập đội không sinh thêm tiền, đồng lẻ không
//     biến mất cũng không nhân đôi); từng người nhận đúng theo trọng số sát thương / chia đều trong đội, sai số dưới 1 đồng; người ngã,
//     thành viên đội ở xa, người không đánh và không cùng đội nhận 0. Không ai đủ điều kiện thì tiền mất, không ai nhận thay.
//  2. **Đồ rơi:** chỉ món có trong bảng rơi của quái, số lượng trong min..max, chủ đồ là người đủ điều kiện (còn trong phòng, sống, có
//     sát thương) hoặc trống.
//  3. **Tu vi:** hữu hạn, không giảm; người không đủ điều kiện không tăng.
// `Math.random` được thay bằng bộ sinh có hạt (và ghi lại dãy giá trị) để biết ĐÚNG số tiền đã tung và tái hiện được mọi lỗi.
import { afterEach, describe, expect, it, vi } from "vitest";
import { COIN_DROPS, DROP_TABLES, PARTY_MAX, PARTY_SHARE_RANGE, rollCoin } from "@tien-gioi/shared";
import { killMonster } from "./combat";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => vi.restoreAllMocks());

const KINDS = Object.keys(COIN_DROPS).filter((k) => DROP_TABLES[k] !== undefined);

interface Scenario {
  label: string;
  coinPaid: number;
  gain: Record<string, number>;
  weight: Record<string, number>;
  expGain: Record<string, number>;
  ground: { itemId: string; qty: number; owner: string }[];
  alive: Set<string>;
  damagers: Set<string>;
  /** Những người có thể là chủ đồ theo mô hình (nhóm đánh nhiều nhất trong số người còn sống, rồi người đánh nhiều nhất trong nhóm); rỗng = không ai */
  owners: Set<string>;
  kind: string;
}

function runScenario(seed: number): Scenario {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const { w } = makeWorld();
  w.now = 1_700_000_000_000;
  const kind = pick(KINDS);
  const mx = 600;
  const my = 600;
  const { id, mc } = addMonster(w, kind, mx, my);

  // 8 người: vị trí gần / xa quái, một số đã ngã; một số "đã rời phòng" nhưng còn trong sổ sát thương
  const sids = Array.from({ length: 8 }, (_, i) => `P${i + 1}`);
  const present = new Set<string>();
  const near = new Map<string, boolean>();
  for (const sid of sids) {
    if (r() < 0.15) continue; // rời phòng: không có trong state nhưng sổ sát thương còn ghi
    addPlayer(w, sid, 1, 3);
    const p = w.state.players.get(sid)!;
    const isNear = r() < 0.7;
    near.set(sid, isNear);
    p.x = mx + (isNear ? r() * 300 : PARTY_SHARE_RANGE + 50 + r() * 500);
    p.y = my + (isNear ? r() * 300 : r() * 300);
    p.dead = r() < 0.12;
    present.add(sid);
  }
  // chia đội ngẫu nhiên (khoá = đạo hiệu viết thường, như thật)
  const key = (sid: string) => sid.toLowerCase();
  const pool = sids.filter((s) => present.has(s));
  const partyOf = new Map<string, number>();
  while (pool.length >= 2 && r() < 0.7) {
    const size = Math.min(pool.length, 2 + Math.floor(r() * (PARTY_MAX - 1)));
    const members = pool.splice(0, size);
    const party = w.parties._create(key(members[0]!), key(members[1]!));
    for (const m of members.slice(2)) w.parties._join(party, key(m));
    for (const m of members) partyOf.set(m, party.id);
  }
  // sổ sát thương
  const damagers = new Set<string>();
  for (const sid of sids) {
    if (r() < 0.55) {
      mc.damageBy.set(sid, 1 + Math.floor(r() * 400));
      damagers.add(sid);
    }
  }
  if (damagers.size === 0 && r() < 0.8) {
    mc.damageBy.set("P1", 50);
    damagers.add("P1");
  }

  // Có lúc mọi người đánh đều đã ngã lúc quái chết (và không có ai cùng đội đứng gần): tiền không có người nhận thì mất
  if (r() < 0.25) {
    for (const sid of damagers) {
      const p = w.state.players.get(sid);
      if (p) p.dead = true;
    }
  }

  // Math.random có hạt, ghi lại dãy giá trị để dựng lại số tiền đã tung
  const calls: number[] = [];
  const g = rng(seed ^ 0x9e3779b9);
  vi.spyOn(Math, "random").mockImplementation(() => {
    const v = g();
    calls.push(v);
    return v;
  });

  const coinBefore = Object.fromEntries(sids.map((s) => [s, w.ctrl.get(s)?.coin ?? 0]));
  const expBefore = Object.fromEntries(sids.map((s) => [s, w.state.players.get(s)?.exp ?? 0]));
  killMonster(w, id, mc);
  const gain: Record<string, number> = {};
  const expGain: Record<string, number> = {};
  for (const sid of sids) {
    gain[sid] = (w.ctrl.get(sid)?.coin ?? 0) - coinBefore[sid]!;
    expGain[sid] = (w.state.players.get(sid)?.exp ?? 0) - expBefore[sid]!;
  }

  // Số tiền đã tung = `rollCoin` chạy lại trên chính dãy Math.random đã ghi (dropCoin tung trước mọi thứ khác dùng Math.random)
  let k = 0;
  const coinPaid = rollCoin(kind, () => calls[k++] ?? 0);

  // Mô hình độc lập của người nhận Linh thạch (không gọi killShares): người lẻ theo sát thương; đội chia đều giữa thành viên còn
  // sống và ở gần, phần của đội = tổng sát thương của các thành viên đã ra đòn
  let total = 0;
  for (const v of mc.damageBy.values()) total += v;
  if (total <= 0) total = 1;
  const weight: Record<string, number> = Object.fromEntries(sids.map((s) => [s, 0]));
  const partyDmg = new Map<number, number>();
  for (const [sid, dmg] of mc.damageBy) {
    const pid = partyOf.get(sid);
    if (pid === undefined) weight[sid] = (weight[sid] ?? 0) + dmg / total;
    else partyDmg.set(pid, (partyDmg.get(pid) ?? 0) + dmg);
  }
  for (const [pid, dmg] of partyDmg) {
    const eligible = sids.filter(
      (s) =>
        partyOf.get(s) === pid &&
        w.state.players.get(s) &&
        !w.state.players.get(s)!.dead &&
        near.get(s),
    );
    for (const s of eligible) weight[s] = dmg / total / eligible.length;
  }
  // chỉ người còn trong phòng và còn sống mới nhận tiền
  const alive = new Set(
    sids.filter((s) => w.state.players.get(s) && !w.state.players.get(s)!.dead),
  );
  for (const s of sids) if (!alive.has(s)) weight[s] = 0;

  // Chủ đồ theo mô hình: chỉ tính sát thương của người còn sống trong phòng; nhóm = đội hoặc người lẻ
  const groupDmg = new Map<string, number>();
  const groupOf = (sid: string) => (partyOf.has(sid) ? `party:${partyOf.get(sid)}` : sid);
  for (const [sid, dmg] of mc.damageBy)
    if (alive.has(sid)) groupDmg.set(groupOf(sid), (groupDmg.get(groupOf(sid)) ?? 0) + dmg);
  const bestGroup = Math.max(0, ...groupDmg.values());
  const owners = new Set<string>();
  if (bestGroup > 0) {
    for (const [grp, gd] of groupDmg) {
      if (gd !== bestGroup) continue;
      const members = [...mc.damageBy].filter(([sid]) => alive.has(sid) && groupOf(sid) === grp);
      const top = Math.max(...members.map(([, d]) => d));
      for (const [sid, d] of members) if (d === top) owners.add(sid);
    }
  }

  const ground: Scenario["ground"] = [];
  w.state.loot.forEach((l) => ground.push({ itemId: l.itemId, qty: l.qty, owner: l.owner }));
  const label = `seed ${seed}: ${kind}, ${present.size} người, ${[...new Set(partyOf.values())].length} đội, ${damagers.size} người đánh`;
  return { label, coinPaid, gain, weight, expGain, ground, alive, damagers, owners, kind };
}

const SEEDS = Array.from({ length: Number(process.env.FUZZ_SEEDS) || 600 }, (_, i) => i + 1);

describe("chia thưởng khi hạ quái: tổng Linh thạch đúng số tung, đúng người, đồ rơi trong bảng", () => {
  it.each(SEEDS)("hạt %i", (seed) => {
    const s = runScenario(seed);
    const sumW = Object.values(s.weight).reduce((a, b) => a + b, 0);
    const total = Object.values(s.gain).reduce((a, b) => a + b, 0);

    // 1. Linh thạch: tổng đúng số tung nếu có người đủ điều kiện, bằng 0 nếu không (không sinh thêm, không biến mất)
    expect(s.coinPaid, s.label).toBeGreaterThanOrEqual(0);
    expect(s.coinPaid, s.label).toBeLessThanOrEqual(COIN_DROPS[s.kind]!.max);
    expect(
      total,
      `${s.label}: tổng nhận ${total}, đã tung ${s.coinPaid}, tổng trọng số ${sumW}`,
    ).toBe(sumW > 0 ? s.coinPaid : 0);
    for (const [sid, g] of Object.entries(s.gain)) {
      expect(Number.isInteger(g) && g >= 0, `${s.label}: ${sid} nhận ${g}`).toBe(true);
      if (!(s.weight[sid]! > 0))
        expect(g, `${s.label}: ${sid} không đủ điều kiện mà nhận ${g}`).toBe(0);
      else
        expect(
          Math.abs(g - (s.coinPaid * s.weight[sid]!) / sumW),
          `${s.label}: ${sid} nhận ${g}`,
        ).toBeLessThan(1);
    }

    // 2. Đồ rơi: chỉ món trong bảng, số lượng trong min..max; chủ đồ hợp lệ
    const table = DROP_TABLES[s.kind]!;
    const perItem = new Map<string, number>();
    for (const d of s.ground) perItem.set(d.itemId, (perItem.get(d.itemId) ?? 0) + d.qty);
    for (const [itemId, qty] of perItem) {
      const e = table.find((x) => x.itemId === itemId);
      expect(e, `${s.label}: rơi món ngoài bảng ${itemId}`).toBeTruthy();
      expect(qty, `${s.label}: ${itemId} x${qty}`).toBeGreaterThanOrEqual(e!.min);
      expect(qty, `${s.label}: ${itemId} x${qty}`).toBeLessThanOrEqual(e!.max);
    }
    for (const d of s.ground) {
      if (s.owners.size === 0)
        expect(d.owner, `${s.label}: không ai đủ điều kiện mà đồ có chủ ${d.owner}`).toBe("");
      else
        expect(
          s.owners.has(d.owner),
          `${s.label}: chủ đồ ${JSON.stringify(d.owner)} không thuộc ${[...s.owners]}`,
        ).toBe(true);
      if (d.owner !== "") {
        expect(
          s.alive.has(d.owner),
          `${s.label}: chủ đồ ${d.owner} không còn sống trong phòng`,
        ).toBe(true);
        expect(s.damagers.has(d.owner), `${s.label}: chủ đồ ${d.owner} không đánh`).toBe(true);
      }
    }

    // 3. Tu vi: hữu hạn, không giảm; người không đủ điều kiện không tăng
    for (const [sid, e] of Object.entries(s.expGain)) {
      expect(Number.isFinite(e) && e >= 0, `${s.label}: tu vi ${sid} đổi ${e}`).toBe(true);
      if (!s.alive.has(sid)) expect(e, `${s.label}: ${sid} (ngã / rời phòng) tăng tu vi`).toBe(0);
    }
  });

  it("độ phủ: các nhánh quan trọng đều xảy ra (đội chia tiền, tiền mất vì không ai đủ điều kiện, người ngã bị bỏ qua, đồ có chủ)", () => {
    let partySplit = 0;
    let lost = 0;
    let fallenSkipped = 0;
    let owned = 0;
    for (const seed of SEEDS.slice(0, 300)) {
      const s = runScenario(seed);
      const sumW = Object.values(s.weight).reduce((a, b) => a + b, 0);
      const winners = Object.values(s.gain).filter((g) => g > 0).length;
      if (winners >= 2) partySplit++;
      if (sumW === 0 && s.coinPaid > 0) lost++;
      if ([...s.damagers].some((d) => !s.alive.has(d)) && s.coinPaid > 0) fallenSkipped++;
      if (s.ground.some((d) => d.owner !== "")) owned++;
    }
    expect(partySplit, "chưa lần nào tiền được chia cho từ 2 người").toBeGreaterThan(0);
    expect(lost, "chưa lần nào tiền mất vì không ai đủ điều kiện").toBeGreaterThan(0);
    expect(fallenSkipped, "chưa lần nào người ngã / rời phòng bị bỏ qua").toBeGreaterThan(0);
    expect(owned, "chưa lần nào đồ rơi có chủ").toBeGreaterThan(0);
  });
});
