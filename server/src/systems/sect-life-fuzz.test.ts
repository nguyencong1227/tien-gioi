// Thử nghiệm thuộc tính (fuzz) cho Linh thạch với tông môn + vòng đời nhân vật (M4-sớm, #253 giai đoạn 2; docs/PHAN_CONG_M4.md 2.2).
// Bổ sung cho `sect-crash.test.ts` (sập giữa góp / rút, kiểm trên ĐĨA) và `economy-fuzz.test.ts` (cửa hàng / túi đồ, đồng bộ): ở đây là
// chuỗi ĐUA NGẪU NHIÊN (hạt cố định) của lập / mời / nhận / rời / mời ra / nhường / chức vụ / góp / rút / giải tán tông môn XEN VỚI
// chết (Hoàng Tuyền) và đầu thai, ở HAI phòng, nhiều thao tác cùng lúc, có và không có sự cố (lưu hồ sơ lỗi, kho tệp lỗi).
//
// "Sổ cái" Linh thạch của cả hệ thống T = Σ ví (kể cả `coinAtDeath` của người đang ở Hoàng Tuyền) + Σ kho tông môn.
//   - MỌI lúc quan sát (sau mỗi lần ghi kho, mỗi lần lưu hồ sơ, mỗi vòng): T <= INITIAL - phí lập đã chốt - phần mất khi đầu thai
//     (luật "chỉ được MẤT, không bao giờ tăng").
//   - Không sự cố: khi yên (mọi thao tác xong) T == INITIAL - phí lập - phần mất khi đầu thai CHÍNH XÁC: không đồng nào biến mất
//     ngoài hai cống hợp lệ đó (bắt được lỗi "rút khi đang ở Hoàng Tuyền thì ví bị ghi đè lúc đầu thai").
//   - Bất biến cấu trúc của kho tông môn sau mỗi vòng (tên / biệt hiệu duy nhất, một linh hồn một tông môn, một Tông chủ...).
// Chạy sâu: `FUZZ_SEEDS=200 FUZZ_ROUNDS=80 npx vitest run server/src/systems/sect-life-fuzz.test.ts`.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  COIN_CAP,
  DEFAULT_MAP,
  HAC_PHONG_ID,
  SECT_COIN_CAP,
  SECT_CREATE_COST,
  SECT_MAX_MEMBERS,
  coinCarryCap,
  getMap,
  sectKey,
  validateRebirth,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore, type Sect } from "../sect-store";
import { SectService } from "../sect-service";
import { applyRebirth, beginLimbo } from "./reincarnation";
import {
  sectAnswer,
  sectCreate,
  sectDeposit,
  sectDisband,
  sectInvite,
  sectKick,
  sectLeave,
  sectRank,
  sectTransfer,
  sectWithdraw,
} from "./sect";
import { addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-life-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let dirSeq = 0;

const WHO = ["Alpha", "Bravo", "Charlie", "Delta"];
const HP = new Set(["Bravo", "Delta"]); // ở Hắc Phong Cốc, còn lại ở Lạc Hà
const START = 5000;
const INITIAL = START * WHO.length;
const SEEDS = Number(process.env.FUZZ_SEEDS) || 12;
const ROUNDS = Number(process.env.FUZZ_ROUNDS) || 35;

/** Bộ sinh số ngẫu nhiên có hạt (mulberry32): kịch bản lặp lại được. */
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
const yieldIO = () => new Promise<void>((r) => setImmediate(r));
const key = (s: string) => s.toLowerCase();

interface Chaos {
  failSave: () => boolean;
  failStore: () => boolean;
}
const noChaos: Chaos = { failSave: () => false, failStore: () => false };

/** Thế giới thử: hai phòng dùng chung Hub + một kho tông môn thật (tệp), mọi quan sát đi qua `observe`. */
function build(seed: number, chaos: Chaos = noChaos) {
  const rand = rng(seed);
  let now = 1_700_000_000_000;
  const hub = new Hub();
  const lh = makeWorld(DEFAULT_MAP, hub);
  const hp = makeWorld(getMap(HAC_PHONG_ID)!, hub);
  const roomOf = (who: string) => (HP.has(who) ? hp : lh);
  const store = new FileSectStore(path.join(root, `s${++dirSeq}`), () => now);
  const kho = new Map<string, number>();
  const state = {
    fees: 0,
    penalty: 0,
    violations: [] as string[],
    observations: 0,
    rebirths: 0,
    khoWrites: 0,
  };

  /** T hiện tại: ví (+ Linh thạch mang theo của người ở Hoàng Tuyền) + kho. */
  const total = () => {
    let t = 0;
    for (const who of WHO) {
      const c = roomOf(who).w.ctrl.get(who);
      if (c) t += c.coin + (c.limbo?.coinAtDeath ?? 0);
    }
    for (const v of kho.values()) t += v;
    return t;
  };
  const observe = (what: string) => {
    state.observations++;
    const t = total();
    const cap = INITIAL - state.fees * SECT_CREATE_COST - state.penalty;
    if (t > cap) state.violations.push(`${what}: T=${t} > ${cap}`);
  };

  const create = store.create.bind(store);
  const update = store.update.bind(store);
  const del = store.delete.bind(store);
  store.create = async (s) => {
    const r = await create(s);
    kho.set(r.id, r.coin);
    state.fees++; // phí đã trừ khỏi ví TRƯỚC khi tông môn ra đời
    observe("kho.create");
    return r;
  };
  store.update = async (id, fn) => {
    state.khoWrites++;
    if (chaos.failStore()) throw new Error("kho lỗi (mô phỏng)");
    const r = await update(id, fn);
    if (r) {
      kho.set(r.id, r.coin);
      observe("kho.update");
    }
    return r;
  };
  store.delete = async (id, guard) => {
    const ok = await del(id, guard);
    if (ok) {
      kho.delete(id);
      observe("kho.delete");
    }
    return ok;
  };
  let ids = 0;
  const svc = new SectService(
    store,
    () => now,
    () => `sect${++ids}`,
  );

  for (const r of [lh, hp]) {
    r.w.now = now;
    r.w.sectService = svc;
    // Giống hook thật: đang qua cổng hoặc lưu lỗi thì KHÔNG coi là đã lưu; có độ trễ để các thao tác đua nhau
    r.w.onSaveNow = async (sid) => {
      for (let i = rand() * 3; i > 0; i--) await yieldIO();
      const ctrl = r.w.ctrl.get(sid);
      const ok = !!ctrl && !ctrl.travelling && !chaos.failSave();
      observe("lưu ngay");
      return ok;
    };
  }
  for (const who of WHO) {
    const { c } = addPlayer(roomOf(who).w, who, 1, 8);
    c.coin = START;
    // Một nửa số người đã mở "Kim nang" (mang được một phần Linh thạch qua kiếp), nửa kia thì không
    if (WHO.indexOf(who) % 2 === 0) c.soul = { ...c.soul, unlocks: { kim_nang: 2 } };
  }
  return {
    rand,
    hub,
    lh,
    hp,
    roomOf,
    store,
    svc,
    kho,
    state,
    total,
    observe,
    advance: (ms: number) => {
      now += ms;
      lh.w.now = now;
      hp.w.now = now;
    },
  };
}
type Rig = ReturnType<typeof build>;

/** Chết (như `hurtPlayer`): chỉ khi còn sống và chưa ở Hoàng Tuyền. */
function die(rig: Rig, who: string) {
  const w = rig.roomOf(who).w;
  const p = w.state.players.get(who);
  const c = w.ctrl.get(who);
  if (!p || !c || c.limbo || c.travelling) return false;
  beginLimbo(w, who, p, c);
  rig.observe("chết");
  return true;
}

/** Đầu thai bằng lựa chọn hợp lệ; ghi nhận phần Linh thạch mất theo luật (vượt `coinCarryCap`). */
function rebirth(rig: Rig, who: string) {
  const w = rig.roomOf(who).w;
  const p = w.state.players.get(who);
  const c = w.ctrl.get(who);
  const limbo = c?.limbo;
  if (!p || !c || !limbo) return false;
  const choice = validateRebirth(c.soul, { keep: [] }, limbo.keepable);
  if (!choice) throw new Error("lựa chọn đầu thai hợp lệ bị từ chối");
  const carried = Math.min(limbo.coinAtDeath, coinCarryCap(c.soul.unlocks));
  const penalty = limbo.coinAtDeath - carried;
  applyRebirth(w, who, p, c, choice);
  rig.state.penalty += penalty;
  rig.state.rebirths++;
  rig.observe("đầu thai");
  return true;
}

/** Bất biến cấu trúc của mọi tông môn trong kho (không đọc từ cache). */
function checkSects(sects: Sect[], where: string) {
  const names = new Set<string>();
  const tags = new Set<string>();
  const souls = new Set<string>();
  for (const s of sects) {
    const at = `${where} [${s.id}]`;
    expect(names.has(sectKey(s.name)), `${at}: tên trùng`).toBe(false);
    expect(tags.has(sectKey(s.tag)), `${at}: biệt hiệu trùng`).toBe(false);
    names.add(sectKey(s.name));
    tags.add(sectKey(s.tag));
    expect(
      Number.isInteger(s.coin) && s.coin >= 0 && s.coin <= SECT_COIN_CAP,
      `${at}: kho ${s.coin}`,
    ).toBe(true);
    expect(s.members.length, `${at}: số thành viên`).toBeGreaterThanOrEqual(1);
    expect(s.members.length, `${at}: quá đông`).toBeLessThanOrEqual(SECT_MAX_MEMBERS);
    const leaders = s.members.filter((m) => m.rank === "chu");
    expect(leaders.length, `${at}: số Tông chủ`).toBe(1);
    expect(leaders[0]!.soulKey, `${at}: leader lệch`).toBe(s.leader);
    const own = new Set<string>();
    for (const m of s.members) {
      expect(own.has(m.soulKey), `${at}: thành viên trùng`).toBe(false);
      own.add(m.soulKey);
      expect(souls.has(m.soulKey), `${at}: linh hồn ở hai tông môn`).toBe(false);
      souls.add(m.soulKey);
    }
  }
}

interface Mix {
  deaths: number;
  rebirths: number;
  withdrawsInLimbo: number;
  creates: number;
  /** Số lần quan sát sổ cái (chỉ dùng ở bộ tổng gộp) */
  observations: number;
}

/** Dựng sẵn một tông môn đủ bốn người (kho còn trống) để chuỗi ngẫu nhiên có chỗ để góp / rút ngay từ đầu. */
async function bootstrap(rig: Rig) {
  const lh = rig.lh.w;
  await sectCreate(lh, "Alpha", { name: "Thanh Van", tag: "TV" });
  for (const who of WHO.slice(1)) {
    await sectInvite(lh, "Alpha", { name: who });
    await sectAnswer(rig.roomOf(who).w, who, { from: "Alpha" }, true);
  }
  const sect = await rig.svc.sectOf(key("Alpha"));
  expect(sect?.members.length).toBe(WHO.length);
}

/**
 * Một vòng đua: vài thao tác ngẫu nhiên chạy CÙNG LÚC, chọn người theo trạng thái thật (thao tác cần quyền thì ưu tiên Tông chủ, góp
 * thì ưu tiên thành viên) để đa số đều chạm tới kho. Thao tác tông môn được phép cả khi đang ở Hoàng Tuyền (máy chủ không chặn tin này
 * ở cổng WorldRoom), nên fuzz cũng gửi cả lúc đó.
 */
async function round(rig: Rig, rand: () => number, mix: Mix, hostile: boolean) {
  const rejected: unknown[] = [];
  const run = (p: Promise<unknown>) => p.then(undefined, (e) => void rejected.push(e));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const nameOf = (soulKey: string) => WHO.find((n) => key(n) === soulKey)!;
  const sects = await rig.store.all();
  const leaders = sects.map((s) => nameOf(s.leader));
  const members = sects.flatMap((s) => s.members.map((m) => nameOf(m.soulKey)));
  const khoOfLeader = (who: string) => sects.find((s) => s.leader === key(who))?.coin ?? 0;
  const anyLeader = () => (leaders.length && rand() < 0.85 ? pick(leaders) : pick(WHO));
  const anyMember = () => (members.length && rand() < 0.85 ? pick(members) : pick(WHO));
  const others = (who: string) => WHO.filter((n) => n !== who);
  const jobs: Promise<unknown>[] = [];
  for (let k = 1 + Math.floor(rand() * 4); k > 0; k--) {
    const x = rand();
    if (x < 0.08) {
      const who = pick(WHO);
      mix.creates++;
      const tag = pick(["AA", "BB", "CC"]);
      jobs.push(
        run(sectCreate(rig.roomOf(who).w, who, { name: `Tong ${Math.floor(rand() * 3)}`, tag })),
      );
    } else if (x < 0.18) {
      const who = anyLeader();
      jobs.push(run(sectInvite(rig.roomOf(who).w, who, { name: pick(others(who)) })));
    } else if (x < 0.3) {
      const who = pick(WHO);
      const from = rand() < 0.7 && leaders.length ? pick(leaders) : pick(others(who));
      jobs.push(run(sectAnswer(rig.roomOf(who).w, who, { from }, rand() < 0.9)));
    } else if (x < 0.46) {
      const who = anyMember();
      const amount = 1 + Math.floor(rand() * 600);
      jobs.push(run(sectDeposit(rig.roomOf(who).w, who, { amount })));
    } else if (x < 0.6) {
      const who = anyLeader();
      if (rig.roomOf(who).w.ctrl.get(who)!.limbo && khoOfLeader(who) > 0) mix.withdrawsInLimbo++;
      const amount = 1 + Math.floor(rand() * 700);
      jobs.push(run(sectWithdraw(rig.roomOf(who).w, who, { amount })));
    } else if (x < 0.64) {
      const who = anyMember();
      jobs.push(run(sectLeave(rig.roomOf(who).w, who)));
    } else if (x < 0.68) {
      const who = anyLeader();
      jobs.push(run(sectKick(rig.roomOf(who).w, who, { name: pick(others(who)) })));
    } else if (x < 0.72) {
      const who = anyLeader();
      jobs.push(run(sectTransfer(rig.roomOf(who).w, who, { name: pick(others(who)) })));
    } else if (x < 0.75) {
      const who = anyLeader();
      const rank = pick(["truong_lao", "de_tu"]);
      jobs.push(run(sectRank(rig.roomOf(who).w, who, { name: pick(others(who)), rank })));
    } else if (x < 0.77) {
      const who = anyLeader();
      jobs.push(run(sectDisband(rig.roomOf(who).w, who)));
    } else if (x < 0.88) {
      if (die(rig, rand() < 0.5 ? anyLeader() : pick(WHO))) mix.deaths++;
    } else if (x < 0.98) {
      const inLimbo = WHO.filter((n) => rig.roomOf(n).w.ctrl.get(n)?.limbo);
      if (inLimbo.length && rebirth(rig, pick(inLimbo))) mix.rebirths++;
    } else if (hostile) {
      // đi qua cổng rồi huỷ: trong lúc đó hồ sơ không lưu được
      const who = pick(WHO);
      const c = rig.roomOf(who).w.ctrl.get(who)!;
      if (!c.travelling) {
        c.travelling = true;
        jobs.push(
          run(
            (async () => {
              for (let i = rand() * 4; i > 0; i--) await yieldIO();
              c.travelling = false;
            })(),
          ),
        );
      }
    }
    if (rand() < 0.2) rig.advance(2_000); // lời mời có hạn, hồi chiêu lập tông môn
  }
  await Promise.all(jobs);
  return rejected;
}

beforeEach(() => {
  // `SectService` ghi tên lỗi khi kho ném lỗi (cố ý trong kịch bản sự cố)
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("tông môn + Hoàng Tuyền: rút kho khi đang ở Hoàng Tuyền (lỗi tìm ra bằng fuzz)", () => {
  async function leaderWithTreasury(deposit: number) {
    const rig = build(1);
    const w = rig.lh.w;
    await sectCreate(w, "Alpha", { name: "Thanh Van", tag: "TV" });
    await sectDeposit(w, "Alpha", { amount: deposit });
    const c = w.ctrl.get("Alpha")!;
    const p = w.state.players.get("Alpha")!;
    expect(c.coin).toBe(START - SECT_CREATE_COST - deposit);
    expect((await rig.svc.sectOf(key("Alpha")))?.coin).toBe(deposit);
    return { rig, w, c, p };
  }

  it("Tông chủ đang ở Hoàng Tuyền: RÚT bị từ chối, kho nguyên, không đồng nào biến mất sau đầu thai", async () => {
    const { rig, w, c } = await leaderWithTreasury(2000);
    expect(die(rig, "Alpha")).toBe(true);
    const writes = rig.state.khoWrites;
    await sectWithdraw(w, "Alpha", { amount: 1500 });
    expect(rig.state.khoWrites).toBe(writes); // từ chối TỪ ĐẦU: không trừ rồi góp lại (khỏi khoảng hở sập giữa hai lần ghi)
    expect((await rig.svc.sectOf(key("Alpha")))?.coin).toBe(2000); // kho không bị trừ
    expect(c.coin).toBe(0); // ví không bị cộng vào kiếp đã mất
    expect(rig.lh.toasts.filter((t) => t.sid === "Alpha").at(-1)?.msg.tone).toBe("bad");
    expect(rebirth(rig, "Alpha")).toBe(true);
    // đầu thai xong rút được bình thường
    await sectWithdraw(w, "Alpha", { amount: 1500 });
    expect((await rig.svc.sectOf(key("Alpha")))?.coin).toBe(500);
    expect(c.coin).toBe(
      Math.min(START - SECT_CREATE_COST - 2000, coinCarryCap(c.soul.unlocks)) + 1500,
    );
  });

  it("chết GIỮA lúc đang rút (sau khi kho đã trừ): phần chưa cộng được vào ví được góp lại kho, không biến mất", async () => {
    const { rig, w, c } = await leaderWithTreasury(2000);
    // chết ngay sau khi kho đã trừ: chen vào `store.update` của lần rút
    const upd = rig.store.update.bind(rig.store);
    let done = false;
    rig.store.update = async (id, fn) => {
      const r = await upd(id, fn);
      if (!done && r && r.coin === 500) {
        done = true;
        die(rig, "Alpha");
      }
      return r;
    };
    await sectWithdraw(w, "Alpha", { amount: 1500 });
    expect(done).toBe(true);
    expect(c.limbo).toBeTruthy();
    expect(c.coin).toBe(0); // không cộng vào ví của kiếp đã mất (đầu thai sẽ ghi đè)
    expect((await rig.svc.sectOf(key("Alpha")))?.coin).toBe(2000); // góp lại đủ
    expect(rig.state.violations).toEqual([]);
  });

  it("ví người mới đầu thai không bị cộng nhầm: tổng hệ thống khớp sổ cái", async () => {
    const { rig, w } = await leaderWithTreasury(2000);
    die(rig, "Alpha");
    await sectWithdraw(w, "Alpha", { amount: 700 });
    rebirth(rig, "Alpha");
    expect(rig.total()).toBe(INITIAL - SECT_CREATE_COST - rig.state.penalty);
    expect(rig.state.violations).toEqual([]);
  });
});

describe("tông môn + vòng đời: đua ngẫu nhiên, sổ cái Linh thạch", () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
  const total: Mix = { deaths: 0, rebirths: 0, withdrawsInLimbo: 0, creates: 0, observations: 0 };

  it.each(seeds)(
    "không sự cố, hạt %i: T luôn <= trần; khi yên T == INITIAL - phí lập - phần mất khi đầu thai CHÍNH XÁC",
    async (seed) => {
      const rig = build(seed);
      const rand = rig.rand;
      await bootstrap(rig);
      for (let r = 0; r < ROUNDS; r++) {
        const rejected = await round(rig, rand, total, false);
        expect(rejected, `hạt ${seed}, vòng ${r}`).toEqual([]); // không thao tác nào reject (unhandled rejection làm sập server)
        expect(rig.state.violations, `hạt ${seed}, vòng ${r}`).toEqual([]);
        expect(rig.total(), `hạt ${seed}, vòng ${r}: sổ cái khi yên`).toBe(
          INITIAL - rig.state.fees * SECT_CREATE_COST - rig.state.penalty,
        );
        for (const who of WHO) {
          const c = rig.roomOf(who).w.ctrl.get(who)!;
          expect(Number.isInteger(c.coin) && c.coin >= 0 && c.coin <= COIN_CAP, `ví ${who}`).toBe(
            true,
          );
        }
        checkSects(await rig.store.all(), `hạt ${seed}, vòng ${r}`);
      }
      total.observations += rig.state.observations;
    },
  );

  it.each(seeds)(
    "có sự cố (lưu lỗi, kho lỗi, qua cổng), hạt %i: T không bao giờ vượt trần, cấu trúc kho vẫn nguyên vẹn",
    async (seed) => {
      // hạt riêng cho sự cố; dựng tông môn khi đĩa còn lành rồi mới bật sự cố
      const crand = rng(seed * 7919 + 13);
      let armed = false;
      const rig = build(seed + 1000, {
        failSave: () => armed && crand() < 0.2,
        failStore: () => armed && crand() < 0.1,
      });
      const rand = rig.rand;
      await bootstrap(rig);
      armed = true;
      const mix: Mix = { deaths: 0, rebirths: 0, withdrawsInLimbo: 0, creates: 0, observations: 0 };
      for (let r = 0; r < ROUNDS; r++) {
        const rejected = await round(rig, rand, mix, true);
        expect(rejected, `hạt ${seed}, vòng ${r}`).toEqual([]);
        expect(rig.state.violations, `hạt ${seed}, vòng ${r}`).toEqual([]);
        expect(rig.total(), `hạt ${seed}, vòng ${r}`).toBeLessThanOrEqual(
          INITIAL - rig.state.fees * SECT_CREATE_COST - rig.state.penalty,
        );
        checkSects(await rig.store.all(), `hạt ${seed}, vòng ${r}`);
      }
    },
  );

  it("bộ thao tác thật sự chạm tới các nhánh quan trọng (chết, đầu thai, lập, rút khi đang ở Hoàng Tuyền)", () => {
    // chạy sau các ca `it.each` ở trên (vitest chạy tuần tự trong một file)
    expect(total.deaths).toBeGreaterThan(10);
    expect(total.rebirths).toBeGreaterThan(5);
    expect(total.creates).toBeGreaterThan(10);
    expect(total.observations).toBeGreaterThan((SEEDS * ROUNDS) / 2); // trung bình nhiều lần quan sát sổ cái mỗi hai vòng
    expect(total.withdrawsInLimbo).toBeGreaterThan(0);
  });
});
