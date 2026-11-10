// Mô phỏng sập giữa góp / rút kho tông môn (M3.6, 6e; docs/THIET_KE_TONG_MON.md mục 4.4):
// TỔNG Linh thạch TRÊN ĐĨA (hồ sơ các người chơi + kho các tông môn) KHÔNG BAO GIỜ TĂNG, chỉ có thể GIẢM trong khoảng hở.
//
// Cách mô phỏng: server sập ở một thời điểm bất kỳ thì chỉ còn lại những gì ĐÃ NẰM TRÊN ĐĨA, mà mỗi lần ghi (hồ sơ, tệp tông
// môn) là nguyên tử (tệp tạm + rename). Nên "sập ở mọi điểm" = kiểm tổng trên đĩa SAU TỪNG lần ghi. Ở đây mọi lần ghi đều đi
// qua một mô hình đĩa (`Disk`) và kiểm ngay; mỗi bước ghi hồ sơ có hàng đợi theo người chơi và trễ ngẫu nhiên như đĩa thật.
// Chạy hàng loạt kịch bản đua ngẫu nhiên (hạt cố định), có và không có sự cố (lưu hồ sơ lỗi, đang qua cổng, kho tệp lỗi, rớt mạng).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_MAP, HAC_PHONG_ID, SECT_CREATE_COST, getMap } from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { sectAnswer, sectCreate, sectDeposit, sectDisband, sectInvite, sectWithdraw } from "./sect";
import { addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-crash-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

const A = "Alpha"; // Tông chủ, ở Lạc Hà
const B = "Bravo"; // Hắc Phong Cốc
const C = "Charlie"; // Lạc Hà
const WHO = [A, B, C];
const START = 5000; // ví mỗi người lúc đầu
const INITIAL = START * WHO.length; // tổng ban đầu (chưa có tông môn)

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

/** Mô hình đĩa: ví đã lưu của từng người + kho đã lưu của từng tông môn; kiểm tổng sau MỖI lần ghi. */
class Disk {
  wallet = new Map<string, number>();
  kho = new Map<string, number>();
  /** Trần tổng cho phép; hạ xuống khi phí lập đã chắc chắn trên đĩa. */
  limit = INITIAL;
  max = -Infinity;
  min = Infinity;
  writes = 0;
  violations: string[] = [];
  private queues = new Map<string, Promise<void>>();

  constructor(private rand: () => number) {
    for (const who of WHO) this.wallet.set(who, START);
  }

  total() {
    let t = 0;
    for (const v of this.wallet.values()) t += v;
    for (const v of this.kho.values()) t += v;
    return t;
  }

  check(what: string) {
    const t = this.total();
    this.writes++;
    this.max = Math.max(this.max, t);
    this.min = Math.min(this.min, t);
    if (t > this.limit) this.violations.push(`${what}: tổng ${t} > trần ${this.limit}`);
  }

  /** Ghi hồ sơ: chụp `coin` LÚC GỌI (như `persist` dựng bản ghi ngay), xuống đĩa sau một độ trễ, theo hàng đợi của người đó. */
  writeWallet(who: string, coin: number, what: string): Promise<void> {
    const prev = this.queues.get(who) ?? Promise.resolve();
    const job = prev.then(async () => {
      for (let i = this.rand() * 3; i > 0; i--) await yieldIO();
      this.wallet.set(who, coin);
      this.check(`${what}(${who}=${coin})`);
    });
    this.queues.set(who, job);
    return job;
  }

  settle() {
    return Promise.all(this.queues.values());
  }
}

interface Chaos {
  /** Lưu hồ sơ không ghi được (đĩa / DB lỗi). */
  failSave: () => boolean;
  /** Thao tác `update` của kho tệp ném lỗi (trước khi ghi). */
  failStore: () => boolean;
}
const noChaos: Chaos = { failSave: () => false, failStore: () => false };

let hub: Hub;
let lh: ReturnType<typeof makeWorld>;
let hp: ReturnType<typeof makeWorld>;
let store: FileSectStore;
let svc: SectService;
let disk: Disk;
let chaos: Chaos;
let now: number;
const key = (s: string) => s.toLowerCase();
const roomOf = (who: string) => (who === B ? hp : lh);
const coinOf = (who: string) => roomOf(who).w.ctrl.get(who)?.coin ?? 0;
const lastToast = (who: string) =>
  roomOf(who)
    .toasts.filter((t) => t.sid === who)
    .at(-1)?.msg.text;

function setup(seed: number, c: Chaos = noChaos) {
  now = 1_700_000_000_000;
  chaos = c;
  const rand = rng(seed);
  disk = new Disk(rand);
  hub = new Hub();
  lh = makeWorld(DEFAULT_MAP, hub);
  hp = makeWorld(getMap(HAC_PHONG_ID)!, hub);
  store = new FileSectStore(path.join(root, `s${++n}`), () => now);
  // Mọi lần ghi của kho tệp đi qua mô hình đĩa: chụp kho SAU khi tệp đã nằm trên đĩa, kiểm tổng ngay
  const create = store.create.bind(store);
  const update = store.update.bind(store);
  const del = store.delete.bind(store);
  store.create = async (s) => {
    const r = await create(s);
    disk.kho.set(r.id, r.coin);
    disk.check("kho.create");
    return r;
  };
  store.update = async (id, fn) => {
    if (chaos.failStore()) throw new Error("đĩa lỗi (mô phỏng)");
    const r = await update(id, fn);
    if (r) {
      disk.kho.set(r.id, r.coin);
      disk.check("kho.update");
    }
    return r;
  };
  store.delete = async (id, guard) => {
    const ok = await del(id, guard);
    if (ok) {
      disk.kho.delete(id);
      disk.check("kho.delete");
    }
    return ok;
  };
  let ids = 0;
  svc = new SectService(
    store,
    () => now,
    () => `sect${++ids}`,
  );
  for (const r of [lh, hp]) {
    r.w.now = now;
    r.w.sectService = svc;
    // Giống hook thật của WorldRoom: đang qua cổng hoặc lưu lỗi thì KHÔNG coi là đã lưu
    r.w.onSaveNow = async (sid) => {
      const ctrl = r.w.ctrl.get(sid);
      if (!ctrl || ctrl.travelling || chaos.failSave()) return false;
      await disk.writeWallet(sid, ctrl.coin, "lưu ngay");
      return true;
    };
  }
  addPlayer(lh.w, A, 1, 8);
  addPlayer(hp.w, B, 1, 8);
  addPlayer(lh.w, C, 1, 8);
  for (const who of WHO) roomOf(who).w.ctrl.get(who)!.coin = START;
  return rand;
}

/** Lưu định kỳ / lúc rời phòng: như `persist` thường (bỏ qua khi đang qua cổng). */
function autosave(who: string) {
  const c = roomOf(who).w.ctrl.get(who);
  if (!c || c.travelling) return Promise.resolve();
  return disk.writeWallet(who, c.coin, "lưu định kỳ");
}

async function join(who: string) {
  await sectInvite(lh.w, A, { name: who });
  await sectAnswer(roomOf(who).w, who, { from: A }, true);
}

/** Lập tông môn rồi đưa B và C vào; đĩa đã có đủ mọi thứ ở trạng thái yên (không còn ghi dở). */
async function makeSectWithMembers() {
  await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
  await disk.settle();
  const sect = (await svc.sectOf(key(A)))!;
  expect(sect).toBeTruthy();
  await join(B);
  await join(C);
  await disk.settle();
  disk.limit = INITIAL - SECT_CREATE_COST; // phí lập đã xuống đĩa: từ đây tổng không được vượt mức này
  return sect;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {}); // `SectService` ghi tên lỗi khi kho ném lỗi (cố ý trong kịch bản sự cố)
  setup(1);
});
afterEach(() => vi.restoreAllMocks());

describe("sập giữa lập tông môn", () => {
  it("sập ở bất kỳ điểm nào: phí đã trừ xuống đĩa TRƯỚC khi tông môn ra đời (không có tông môn miễn phí)", async () => {
    // mỗi lần ghi (hồ sơ / kho) là một điểm sập; kiểm trần tổng ở TỪNG điểm
    await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
    await disk.settle();
    expect(disk.violations).toEqual([]);
    expect(disk.total()).toBe(INITIAL - SECT_CREATE_COST);
    // thứ tự: hồ sơ (ví - phí) xuống đĩa rồi mới tới tệp tông môn
    const lap = disk.writes;
    expect(lap).toBeGreaterThanOrEqual(2);
  });

  it("lưu hồ sơ không được: KHÔNG lập tông môn, hoàn phí, đĩa không đổi", async () => {
    chaos = { ...noChaos, failSave: () => true };
    await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
    await disk.settle();
    expect(await svc.sectOf(key(A))).toBeNull();
    expect(coinOf(A)).toBe(START);
    expect(disk.total()).toBe(INITIAL);
    expect(lastToast(A)).toMatch(/trục trặc/);
  });

  it("đang qua cổng (hồ sơ không lưu được lúc này): không lập, hoàn phí", async () => {
    lh.w.ctrl.get(A)!.travelling = true;
    await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
    expect(await svc.sectOf(key(A))).toBeNull();
    expect(coinOf(A)).toBe(START);
    expect(disk.writes).toBe(0);
  });
});

describe("sập giữa góp / rút", () => {
  it("góp: sập giữa 'ví đã xuống đĩa' và 'kho đã cộng' chỉ làm MẤT (tổng đĩa thấp hơn), không bao giờ tăng", async () => {
    await makeSectWithMembers();
    const dips: number[] = [];
    const before = disk.total();
    const wrapped = disk.check.bind(disk);
    disk.check = (what) => {
      wrapped(what);
      dips.push(disk.total());
    };
    await sectDeposit(hp.w, B, { amount: 700 });
    await disk.settle();
    expect(disk.violations).toEqual([]);
    // khoảng hở có thật: có một điểm sập mà tổng thấp hơn đúng 700; xong xuôi thì về như cũ
    expect(Math.min(...dips)).toBe(before - 700);
    expect(Math.max(...dips)).toBeLessThanOrEqual(before);
    expect(disk.total()).toBe(before);
    expect(coinOf(B)).toBe(START - 700);
  });

  it("rút: sập giữa 'kho đã trừ' và 'ví đã xuống đĩa' chỉ làm MẤT, không bao giờ tăng", async () => {
    await makeSectWithMembers();
    await sectDeposit(hp.w, B, { amount: 1000 });
    await disk.settle();
    const before = disk.total();
    const seen: number[] = [];
    const wrapped = disk.check.bind(disk);
    disk.check = (what) => {
      wrapped(what);
      seen.push(disk.total());
    };
    await sectWithdraw(lh.w, A, { amount: 400 });
    await disk.settle();
    expect(disk.violations).toEqual([]);
    expect(Math.min(...seen)).toBe(before - 400); // kho đã trừ, ví chưa xuống đĩa
    expect(Math.max(...seen)).toBeLessThanOrEqual(before);
    expect(disk.total()).toBe(before);
  });

  it("lưu hồ sơ không được: GÓP bị huỷ, ví hoàn, kho nguyên, đĩa không đổi (không nhân đôi)", async () => {
    await makeSectWithMembers();
    const before = disk.total();
    chaos = { ...noChaos, failSave: () => true };
    await sectDeposit(hp.w, B, { amount: 300 });
    await disk.settle();
    expect(coinOf(B)).toBe(START); // hoàn
    expect((await svc.sectOf(key(A)))?.coin).toBe(0); // kho chưa đụng tới
    expect(disk.total()).toBe(before);
    expect(lastToast(B)).toMatch(/trục trặc/);
    expect(disk.violations).toEqual([]);
  });

  it("đang qua cổng: GÓP bị huỷ và hoàn ví, RÚT bị từ chối sớm (kho nguyên); hết qua cổng thì làm được", async () => {
    await makeSectWithMembers();
    await sectDeposit(lh.w, A, { amount: 500 });
    await disk.settle();
    const before = disk.total();
    const a = lh.w.ctrl.get(A)!;
    a.travelling = true;
    const coinA = a.coin;
    await sectDeposit(lh.w, A, { amount: 100 });
    expect(a.coin).toBe(coinA); // hoàn
    await sectWithdraw(lh.w, A, { amount: 100 });
    expect(a.coin).toBe(coinA);
    expect((await svc.sectOf(key(A)))?.coin).toBe(500); // kho nguyên: không rút dở
    await disk.settle();
    expect(disk.total()).toBe(before);
    a.travelling = false;
    await sectWithdraw(lh.w, A, { amount: 100 });
    await disk.settle();
    expect(a.coin).toBe(coinA + 100);
    expect(disk.total()).toBe(before);
    expect(disk.violations).toEqual([]);
  });

  it("rớt mạng ngay sau khi kho đã trừ (rút): góp lại kho, đĩa không bao giờ vượt trần", async () => {
    await makeSectWithMembers();
    await sectDeposit(lh.w, A, { amount: 1000 });
    await disk.settle();
    const real = svc.withdraw.bind(svc);
    svc.withdraw = async (...args) => {
      const r = await real(...args);
      await autosave(A); // lưu lúc rời phòng
      lh.w.ctrl.delete(A);
      return r;
    };
    await sectWithdraw(lh.w, A, { amount: 300 });
    await disk.settle();
    expect(disk.violations).toEqual([]);
    expect((await svc.sectOf(key(A)))?.coin).toBe(1000); // đã góp lại
  });

  it("rớt mạng giữa lúc góp (sau khi ví đã trừ và lưu): kho vẫn được cộng, không mất, không nhân đôi", async () => {
    await makeSectWithMembers();
    const before = disk.total();
    const real = svc.deposit.bind(svc);
    svc.deposit = async (...args) => {
      await autosave(C);
      lh.w.ctrl.delete(C); // C rớt mạng giữa lúc góp
      return real(...args);
    };
    await sectDeposit(lh.w, C, { amount: 250 });
    await disk.settle();
    expect(disk.violations).toEqual([]);
    expect(disk.total()).toBe(before);
    expect((await svc.sectOf(key(A)))?.coin).toBe(250);
  });
});

/** Một vòng đua ngẫu nhiên: nhiều thao tác cùng lúc + lưu định kỳ chen vào + (có sự cố) qua cổng, rớt mạng. */
async function soak(rand: () => number, rounds: number, hostile: boolean) {
  const rejected: unknown[] = [];
  const run = (p: Promise<unknown>) => p.then(undefined, (e) => void rejected.push(e));
  const alive = new Set(WHO);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  for (let r = 0; r < rounds; r++) {
    const jobs: Promise<unknown>[] = [];
    for (let k = 1 + Math.floor(rand() * 5); k > 0; k--) {
      const who = pick([...alive]);
      const x = rand();
      const room = roomOf(who);
      if (x < 0.42)
        jobs.push(run(sectDeposit(room.w, who, { amount: 1 + Math.floor(rand() * 300) })));
      else if (x < 0.62 && alive.has(A))
        jobs.push(run(sectWithdraw(lh.w, A, { amount: 1 + Math.floor(rand() * 400) })));
      else if (x < 0.82) jobs.push(run(autosave(who)));
      else if (hostile && x < 0.92) {
        // đi qua cổng rồi huỷ: lưu bản ghi cổng (ví lúc đó), hết qua cổng thì lưu lại
        const c = room.w.ctrl.get(who);
        if (c && !c.travelling) {
          c.travelling = true;
          void disk.writeWallet(who, c.coin, "bản ghi cổng");
          jobs.push(
            run(
              (async () => {
                for (let i = rand() * 4; i > 0; i--) await yieldIO();
                c.travelling = false;
                await autosave(who);
              })(),
            ),
          );
        }
      } else if (hostile && alive.size > 1) {
        // rớt mạng: lưu lúc rời rồi biến mất (các thao tác đang dở của người đó vẫn chạy tiếp)
        const c = room.w.ctrl.get(who);
        if (c) {
          alive.delete(who);
          void disk.writeWallet(who, c.coin, "lưu lúc rời");
          jobs.push(
            run(
              (async () => {
                await yieldIO();
                room.w.ctrl.delete(who);
              })(),
            ),
          );
        }
      }
    }
    await Promise.all(jobs);
  }
  await disk.settle();
  return { rejected, alive };
}

describe("đua ngẫu nhiên: tổng trên đĩa không bao giờ tăng", () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  it.each(SEEDS)(
    "không sự cố, hạt %i: đĩa không vượt trần ở MỌI điểm sập; xong thì bảo toàn đúng",
    async (seed) => {
      const rand = setup(seed);
      await makeSectWithMembers();
      const w0 = disk.writes;
      const { rejected } = await soak(rand, 25, false);
      for (const who of WHO) await autosave(who); // chốt ví cuối cùng
      await disk.settle();
      expect(rejected).toEqual([]);
      expect(disk.violations).toEqual([]);
      expect(disk.writes - w0).toBeGreaterThan(40); // thật sự có nhiều điểm sập được kiểm
      expect(disk.min).toBeLessThan(INITIAL - SECT_CREATE_COST); // khoảng hở có thật (kiểm tra không rỗng)
      // không sự cố: không đồng nào biến mất hay xuất hiện ngoài phí lập
      expect(disk.total()).toBe(INITIAL - SECT_CREATE_COST);
      const kho = (await svc.sectOf(key(A)))!.coin;
      expect(WHO.reduce((s, who) => s + coinOf(who), 0) + kho).toBe(INITIAL - SECT_CREATE_COST);
    },
  );

  it.each(SEEDS)(
    "có sự cố (lưu lỗi, qua cổng, kho lỗi, rớt mạng), hạt %i: vẫn không bao giờ vượt trần",
    async (seed) => {
      const rand = setup(seed);
      await makeSectWithMembers(); // dựng tông môn khi đĩa còn lành, rồi mới bật sự cố
      chaos = { failSave: () => rand() < 0.25, failStore: () => rand() < 0.1 };
      const { rejected } = await soak(rand, 25, true);
      await disk.settle();
      expect(rejected).toEqual([]); // thao tác không bao giờ reject (nếu không là unhandled rejection làm sập server)
      expect(disk.violations).toEqual([]);
      expect(disk.total()).toBeLessThanOrEqual(INITIAL - SECT_CREATE_COST);
    },
  );

  it("đua với giải tán (kho rỗng mới giải tán được) cũng không làm tổng đĩa vượt trần", async () => {
    const rand = setup(99);
    await makeSectWithMembers();
    for (let i = 0; i < 12; i++) {
      await Promise.all([
        sectDeposit(hp.w, B, { amount: 1 + Math.floor(rand() * 50) }),
        sectDisband(lh.w, A),
        autosave(B),
      ]);
      await disk.settle();
      if (!(await svc.sectOf(key(A)))) break;
    }
    expect(disk.violations).toEqual([]);
  });
});
