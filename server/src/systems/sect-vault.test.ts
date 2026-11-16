// Kho đồ tông môn nối với phòng (mục 27 QUYET_DINH_M3, docs/THIET_KE_TONG_MON.md mục 11): góp / rút / chính sách, thứ tự "túi <-> hồ sơ <-> kho",
// hạn mức Đệ tử theo ngày, khoá kỳ vọng theo ô, đua rút, cờ kiếp mới, và KHÔNG BAO GIỜ nhân đôi đồ (kể cả khi lỗi chen giữa chừng).
// World giả, hai phòng dùng chung Hub, kho tệp thật (thư mục tạm) + `SectService` thật.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_MAP,
  HAC_PHONG_ID,
  ITEMS,
  SECT_VAULT_DENY_ITEMS,
  SECT_VAULT_DRAW_DEFAULT,
  SECT_VAULT_DRAW_QTY_DE_TU,
  SECT_VAULT_SLOTS,
  addToInventory,
  dayKey,
  getMap,
  type Inventory,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore, type Sect } from "../sect-store";
import { SectService } from "../sect-service";
import {
  sectAnswer,
  sectCreate,
  sectInvite,
  sectKick,
  sectRank,
  sectVaultDeposit,
  sectVaultPolicy,
  sectVaultWithdraw,
  sectWithdraw,
} from "./sect";
import { addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-vault-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

const A = "Alpha"; // Tông chủ, ở Lạc Hà
const B = "Bravo"; // Trưởng lão, ở Hắc Phong Cốc
const C = "Charlie"; // Đệ tử, ở Lạc Hà
const D = "Delta"; // Đệ tử, ở Hắc Phong Cốc
const key = (s: string) => s.toLowerCase();

/** Hai món xếp chồng được tới 99 (nguyên liệu quái rơi) dùng trong test. */
const BIG = ITEMS.filter((i) => i.stack >= 99);
const MAT = BIG[0];
const OTHER = BIG[1];

let now = 1_700_000_000_000;
let hub: Hub;
let lh: ReturnType<typeof makeWorld>;
let hp: ReturnType<typeof makeWorld>;
let store: FileSectStore;
let svc: SectService;
let order: string[];
let saveOk: boolean;

beforeEach(() => {
  now = 1_700_000_000_000;
  hub = new Hub();
  lh = makeWorld(DEFAULT_MAP, hub);
  hp = makeWorld(getMap(HAC_PHONG_ID)!, hub);
  store = new FileSectStore(path.join(root, `s${++n}`), () => now);
  let ids = 0;
  svc = new SectService(
    store,
    () => now,
    () => `sect${++ids}`,
  );
  order = [];
  saveOk = true;
  for (const r of [lh, hp]) {
    r.w.now = now;
    r.w.sectService = svc;
    r.w.onSaveNow = async (sid) => (order.push(`save:${sid}`), saveOk);
  }
  addPlayer(lh.w, A, 1, 8);
  addPlayer(hp.w, B, 1, 8);
  addPlayer(lh.w, C, 1, 8);
  addPlayer(hp.w, D, 1, 8);
  for (const [r, who] of [
    [lh, A],
    [hp, B],
    [lh, C],
    [hp, D],
  ] as const)
    r.w.ctrl.get(who)!.coin = 5000;
  for (const m of ["vaultDeposit", "vaultWithdraw", "vaultReturn"] as const) {
    const orig = svc[m].bind(svc) as (...a: unknown[]) => Promise<unknown>;
    (svc as unknown as Record<string, unknown>)[m] = async (...a: unknown[]) => {
      order.push(`service:${m}`);
      return orig(...a);
    };
  }
});

type Room = typeof lh;
const bag = (r: Room, who: string): Inventory => r.w.ctrl.get(who)!.inv;
const give = (r: Room, who: string, id: string, qty: number) =>
  addToInventory(bag(r, who), id, qty);
const held = (r: Room, who: string, id: string) =>
  bag(r, who).reduce((t, s) => t + (s?.itemId === id ? s.qty : 0), 0);
const lastToast = (r: Room, who: string) => r.toasts.filter((t) => t.sid === who).at(-1)?.msg.text;
const lastVault = (r: Room, who: string) => r.sectVaults.filter((s) => s.sid === who).at(-1)?.msg;
const slotOf = (r: Room, who: string, id: string) => bag(r, who).findIndex((s) => s?.itemId === id);
const loot = (r: Room, id: string) => {
  let t = 0;
  r.w.state.loot.forEach((l) => {
    if (l.itemId === id) t += l.qty;
  });
  return t;
};
const vaultOf = async (): Promise<Sect> => (await svc.sectOf(key(A)))!;
const vaultQty = async (id: string) =>
  (await vaultOf()).vault.slots.reduce((t, s) => t + (s?.itemId === id ? s.qty : 0), 0);
/** Tổng một món ở MỌI nơi: túi bốn người + kho + đồ rơi đất (bất biến: không bao giờ vượt tổng ban đầu). */
async function total(id: string): Promise<number> {
  let t = await vaultQty(id);
  for (const [r, who] of [
    [lh, A],
    [hp, B],
    [lh, C],
    [hp, D],
  ] as const)
    t += held(r, who, id);
  return t + loot(lh, id) + loot(hp, id);
}

/** A lập tông môn, B (Trưởng lão), C và D (Đệ tử) vào. */
async function setup() {
  await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
  for (const [r, who] of [
    [hp, B],
    [lh, C],
    [hp, D],
  ] as const) {
    await sectInvite(lh.w, A, { name: who });
    await sectAnswer(r.w, who, { from: A }, true);
  }
  await sectRank(lh.w, A, { name: B, rank: "truong_lao" });
  order.length = 0;
}

/** Ghi thẳng vào kho (bỏ qua luật) để dựng tình huống. */
async function seedVault(f: (s: Sect) => void) {
  await store.update("sect1", (s) => {
    f(s);
    return s;
  });
}

describe("góp đồ", () => {
  it("trừ túi -> LƯU hồ sơ -> cộng kho; mọi thành viên trực tuyến nhận ảnh chụp kho; sổ ghi người góp", async () => {
    await setup();
    give(lh, C, MAT.id, 30);
    await sectVaultDeposit(lh.w, C, { slot: slotOf(lh, C, MAT.id), qty: 12 });
    expect(order).toEqual([`save:${C}`, "service:vaultDeposit"]);
    expect(held(lh, C, MAT.id)).toBe(18);
    expect(await vaultQty(MAT.id)).toBe(12);
    const sect = await vaultOf();
    expect(sect.vault.log[0]).toMatchObject({ name: C, kind: "deposit", itemId: MAT.id, qty: 12 });
    for (const [r, who] of [
      [lh, A],
      [hp, B],
      [lh, C],
      [hp, D],
    ] as const) {
      const v = lastVault(r, who)?.vault;
      expect(v?.slots.reduce((t, s) => t + (s?.itemId === MAT.id ? s.qty : 0), 0)).toBe(12);
      expect(v?.log[0]).toMatchObject({ name: C, kind: "deposit", qty: 12 });
    }
    expect(lastToast(lh, C)).toMatch(/Đã góp 12 .* vào kho đồ tông môn/);
  });

  it("món chồng lên ô cũ trước rồi mới tới ô trống; góp thêm lần nữa cộng dồn đúng", async () => {
    await setup();
    give(lh, C, MAT.id, 40);
    await sectVaultDeposit(lh.w, C, { slot: slotOf(lh, C, MAT.id), qty: 5 });
    await sectVaultDeposit(lh.w, C, { slot: slotOf(lh, C, MAT.id), qty: 7 });
    expect(await vaultQty(MAT.id)).toBe(12);
    expect((await vaultOf()).vault.slots.filter((s) => s).length).toBe(1);
    expect(held(lh, C, MAT.id)).toBe(28);
  });

  it("tin rác / ô trống / số lượng vượt số đang giữ / không ở tông môn: từ chối, túi nguyên, không lưu, không đụng kho", async () => {
    await setup();
    give(lh, C, MAT.id, 10);
    const s = slotOf(lh, C, MAT.id);
    for (const bad of [
      null,
      {},
      { slot: s, qty: 0 },
      { slot: s, qty: 1.5 },
      { slot: 99, qty: 1 },
      { slot: s, qty: 11 }, // đang giữ 10
      { slot: s === 0 ? 1 : 0, qty: 1 }, // ô trống
    ]) {
      await sectVaultDeposit(lh.w, C, bad);
      expect(lastToast(lh, C)).toMatch(/không hợp lệ/);
    }
    expect(held(lh, C, MAT.id)).toBe(10);
    expect(order).toEqual([]);
    expect(await vaultQty(MAT.id)).toBe(0);
    // người ngoài tông môn
    const { c } = addPlayer(lh.w, "Ngoai", 1, 8);
    addToInventory(c.inv, MAT.id, 5);
    await sectVaultDeposit(lh.w, "Ngoai", { slot: slotOf(lh, "Ngoai", MAT.id), qty: 1 });
    expect(lastToast(lh, "Ngoai")).toMatch(/chưa thuộc tông môn/);
    expect(held(lh, "Ngoai", MAT.id)).toBe(5);
    expect(order).toEqual([]);
  });

  it("món trong danh sách chặn: từ chối vault_denied, túi nguyên", async () => {
    await setup();
    give(lh, C, MAT.id, 10);
    const deny = SECT_VAULT_DENY_ITEMS as string[];
    deny.push(MAT.id);
    try {
      await sectVaultDeposit(lh.w, C, { slot: slotOf(lh, C, MAT.id), qty: 1 });
    } finally {
      deny.pop();
    }
    expect(lastToast(lh, C)).toMatch(/không được góp/);
    expect(held(lh, C, MAT.id)).toBe(10);
    expect(order).toEqual([]);
  });

  it("kho đầy: từ chối SỚM (vault_full), túi nguyên, không lưu hồ sơ", async () => {
    await setup();
    await seedVault((s) => {
      for (let i = 0; i < SECT_VAULT_SLOTS; i++)
        s.vault.slots[i] = { itemId: MAT.id, qty: MAT.stack };
    });
    give(lh, C, MAT.id, 5);
    await sectVaultDeposit(lh.w, C, { slot: slotOf(lh, C, MAT.id), qty: 5 });
    expect(lastToast(lh, C)).toMatch(/Kho đồ tông môn đã đầy/);
    expect(held(lh, C, MAT.id)).toBe(5);
    expect(order).toEqual([]);
  });

  it("lưu hồ sơ KHÔNG được (đĩa lỗi / đang qua cổng): trả túi, kho chưa đụng tới, không nhân đôi", async () => {
    await setup();
    give(lh, C, MAT.id, 10);
    saveOk = false;
    await sectVaultDeposit(lh.w, C, { slot: slotOf(lh, C, MAT.id), qty: 10 });
    expect(order).toEqual([`save:${C}`]); // chưa tới dịch vụ
    expect(held(lh, C, MAT.id)).toBe(10);
    expect(await vaultQty(MAT.id)).toBe(0);
    expect(await total(MAT.id)).toBe(10);
    expect(lastToast(lh, C)).toMatch(/trục trặc/);
  });

  it("đang qua cổng hoặc ở Hoàng Tuyền: từ chối ngay, túi nguyên", async () => {
    await setup();
    give(lh, C, MAT.id, 10);
    const c = lh.w.ctrl.get(C)!;
    for (const f of [
      () => (c.travelling = true),
      () => ((c.travelling = false), (c.limbo = true)),
    ]) {
      f();
      await sectVaultDeposit(lh.w, C, { slot: slotOf(lh, C, MAT.id), qty: 1 });
      expect(held(lh, C, MAT.id)).toBe(10);
    }
    expect(order).toEqual([]);
  });

  it("kho đầy NGAY SAU kiểm sớm (người khác góp chen vào): đồ về túi; túi cũng đầy thì rơi đất tại chân; tổng không đổi", async () => {
    await setup();
    give(lh, C, MAT.id, 10);
    const real = svc.sectOf.bind(svc);
    let fake = true;
    // kiểm sớm thấy kho còn chỗ (bản cũ), nhưng khi ghi kho đã đầy
    svc.sectOf = async (k: string) => {
      const s = await real(k);
      if (fake && s) {
        fake = false;
        await seedVault((v) => {
          for (let i = 0; i < SECT_VAULT_SLOTS; i++)
            v.vault.slots[i] = { itemId: OTHER.id, qty: OTHER.stack };
        });
      }
      return s;
    };
    const before = 10 + (await total(OTHER.id));
    await sectVaultDeposit(lh.w, C, { slot: slotOf(lh, C, MAT.id), qty: 10 });
    expect(lastToast(lh, C)).toMatch(/Kho đồ tông môn đã đầy/);
    expect(held(lh, C, MAT.id)).toBe(10); // đã trả túi
    expect(await total(MAT.id)).toBe(10);
    expect(before).toBeGreaterThan(0);
  });

  it("trả túi khi túi đã đầy: phần thừa RƠI ĐẤT tại chân (chủ nhặt trước), không mất không nhân đôi", async () => {
    await setup();
    const c = lh.w.ctrl.get(C)!;
    give(lh, C, MAT.id, 10);
    saveOk = false;
    // làm đầy túi bằng thứ khác SAU khi đã trừ đồ: móc vào lưu hồ sơ
    lh.w.onSaveNow = async () => {
      for (let i = 0; i < c.inv.length; i++) if (!c.inv[i]) c.inv[i] = { itemId: OTHER.id, qty: 1 };
      return false;
    };
    await sectVaultDeposit(lh.w, C, { slot: slotOf(lh, C, MAT.id), qty: 10 });
    expect(held(lh, C, MAT.id)).toBe(0);
    expect(loot(lh, MAT.id)).toBe(10);
    expect(await total(MAT.id)).toBe(10);
    const l = [...lh.w.state.loot.values()].find((x) => x.itemId === MAT.id)!;
    expect(l.owner).toBe(C);
  });
});

describe("rút đồ", () => {
  async function stock(id = MAT.id, qty = 30) {
    await setup();
    await seedVault((s) => {
      s.vault.slots[0] = { itemId: id, qty };
    });
  }
  const slot0 = (qty: number, id = MAT.id) => ({ slot: 0, itemId: id, qty });

  it("Tông chủ và Trưởng lão rút TỰ DO (không hạn mức, không hạn số lượng): trừ kho -> cộng túi -> LƯU; sổ ghi", async () => {
    await stock();
    await sectVaultWithdraw(lh.w, A, slot0(20));
    expect(order).toEqual(["service:vaultWithdraw", `save:${A}`]);
    expect(held(lh, A, MAT.id)).toBe(20);
    await sectVaultWithdraw(hp.w, B, slot0(10));
    expect(held(hp, B, MAT.id)).toBe(10);
    expect(await vaultQty(MAT.id)).toBe(0);
    const log = (await vaultOf()).vault.log;
    expect(log[0]).toMatchObject({ name: B, kind: "withdraw", qty: 10 });
    expect(log[1]).toMatchObject({ name: A, kind: "withdraw", qty: 20 });
    expect(lastToast(lh, A)).toMatch(/Đã rút 20 .* từ kho đồ tông môn/);
    expect(await total(MAT.id)).toBe(30);
  });

  it("Đệ tử: tối đa drawPerDay lượt / ngày (mặc định 3), mỗi lượt tối đa SECT_VAULT_DRAW_QTY_DE_TU món; lượt còn lại giảm trong ảnh chụp", async () => {
    await stock();
    expect(SECT_VAULT_DRAW_DEFAULT).toBe(3);
    expect(lastVault(lh, C)?.vault?.myDrawsLeft).toBe(3);
    await sectVaultWithdraw(lh.w, C, slot0(SECT_VAULT_DRAW_QTY_DE_TU + 1)); // quá số món mỗi lượt
    expect(lastToast(lh, C)).toMatch(/lượt rút|vượt mức/);
    expect(held(lh, C, MAT.id)).toBe(0);
    for (let i = 0; i < 3; i++) await sectVaultWithdraw(lh.w, C, slot0(2));
    expect(held(lh, C, MAT.id)).toBe(6);
    expect(lastVault(lh, C)?.vault?.myDrawsLeft).toBe(0);
    await sectVaultWithdraw(lh.w, C, slot0(1)); // lượt thứ 4
    expect(held(lh, C, MAT.id)).toBe(6);
    expect(lastToast(lh, C)).toMatch(/hết lượt rút/);
    // người khác không bị ảnh hưởng (đếm riêng từng linh hồn)
    await sectVaultWithdraw(hp.w, D, slot0(1));
    expect(held(hp, D, MAT.id)).toBe(1);
    // qua ngày: đếm lại
    now += 24 * 3600_000;
    lh.w.now = hp.w.now = now;
    await sectVaultWithdraw(lh.w, C, slot0(1));
    expect(held(lh, C, MAT.id)).toBe(7);
    expect((await vaultOf()).members.find((m) => m.name === C)?.draw).toEqual({
      day: dayKey(now),
      n: 1,
    });
  });

  it("hạn mức theo LINH HỒN: nhân vật bị gỡ khỏi phòng rồi vào lại vẫn dùng đúng số lượt đã rút", async () => {
    await stock();
    for (let i = 0; i < 3; i++) await sectVaultWithdraw(lh.w, C, slot0(1));
    // "đầu thai": túi mới, cùng linh hồn
    const c = lh.w.ctrl.get(C)!;
    c.inv.fill(null);
    await sectVaultWithdraw(lh.w, C, slot0(1));
    expect(held(lh, C, MAT.id)).toBe(0);
  });

  it("Tông chủ đặt hạn mức (0..10); Trưởng lão / Đệ tử bị từ chối; 0 = Đệ tử không rút được; báo lại cho mọi thành viên", async () => {
    await stock();
    await sectVaultPolicy(lh.w, A, { drawPerDay: 1 });
    expect((await vaultOf()).vault.drawPerDay).toBe(1);
    expect(lastVault(lh, C)?.vault?.drawPerDay).toBe(1);
    expect(lastVault(lh, C)?.vault?.myDrawsLeft).toBe(1);
    await sectVaultWithdraw(lh.w, C, slot0(1));
    await sectVaultWithdraw(lh.w, C, slot0(1));
    expect(held(lh, C, MAT.id)).toBe(1);
    await sectVaultPolicy(hp.w, B, { drawPerDay: 9 }); // Trưởng lão: không có quyền
    expect(lastToast(hp, B)).toMatch(/chưa đủ quyền/);
    await sectVaultPolicy(lh.w, C, { drawPerDay: 9 });
    expect((await vaultOf()).vault.drawPerDay).toBe(1);
    for (const bad of [{ drawPerDay: 11 }, { drawPerDay: -1 }, { drawPerDay: 2.5 }, null])
      await sectVaultPolicy(lh.w, A, bad);
    expect((await vaultOf()).vault.drawPerDay).toBe(1);
    await sectVaultPolicy(lh.w, A, { drawPerDay: 0 });
    now += 24 * 3600_000;
    lh.w.now = hp.w.now = now;
    await sectVaultWithdraw(hp.w, D, slot0(1));
    expect(held(hp, D, MAT.id)).toBe(0);
    // Tông chủ / Trưởng lão vẫn rút được khi hạn mức 0
    await sectVaultWithdraw(hp.w, B, slot0(3));
    expect(held(hp, B, MAT.id)).toBe(3);
  });

  it("khoá kỳ vọng theo ô: ô đã đổi món / không đủ số lượng thì từ chối vault_changed, KHÔNG rút nhầm món khác, không tính lượt", async () => {
    await stock(MAT.id, 5);
    await sectVaultWithdraw(lh.w, A, slot0(1, OTHER.id)); // giao diện cũ: ô 0 nay là MAT
    expect(lastToast(lh, A)).toMatch(/vừa có người lấy hoặc thêm đồ/);
    await sectVaultWithdraw(lh.w, A, slot0(6)); // chỉ còn 5
    expect(lastToast(lh, A)).toMatch(/vừa có người lấy hoặc thêm đồ/);
    await sectVaultWithdraw(lh.w, A, { slot: 7, itemId: MAT.id, qty: 1 }); // ô trống
    expect(held(lh, A, MAT.id)).toBe(0);
    expect(await vaultQty(MAT.id)).toBe(5);
    await sectVaultWithdraw(lh.w, C, slot0(6));
    expect(lastVault(lh, C)?.vault?.myDrawsLeft).toBe(3); // chưa mất lượt nào
    expect((await vaultOf()).members.find((m) => m.name === C)?.draw).toBeUndefined();
  });

  it("túi không đủ chỗ: từ chối SỚM (bag_full), kho nguyên, không tính lượt", async () => {
    await stock();
    const c = lh.w.ctrl.get(C)!;
    for (let i = 0; i < c.inv.length; i++) c.inv[i] = { itemId: OTHER.id, qty: OTHER.stack };
    await sectVaultWithdraw(lh.w, C, slot0(2));
    expect(lastToast(lh, C)).toMatch(/Túi đồ của ngươi không đủ chỗ/);
    expect(await vaultQty(MAT.id)).toBe(30);
    expect((await vaultOf()).members.find((m) => m.name === C)?.draw).toBeUndefined();
    expect(order).toEqual([]);
  });

  it("túi vừa đầy GIỮA CHỪNG (kiểm sớm qua rồi người chơi nhặt đồ khác): phần chưa nhận được TRẢ vào kho, lượt rút hoàn lại, tổng không đổi", async () => {
    await stock();
    const c = lh.w.ctrl.get(C)!;
    const orig = svc.vaultWithdraw.bind(svc);
    svc.vaultWithdraw = async (...a: Parameters<typeof orig>) => {
      const r = await orig(...a);
      for (let i = 0; i < c.inv.length; i++) c.inv[i] = { itemId: OTHER.id, qty: OTHER.stack };
      return r;
    };
    await sectVaultWithdraw(lh.w, C, slot0(4));
    expect(held(lh, C, MAT.id)).toBe(0);
    expect(await vaultQty(MAT.id)).toBe(30); // đã trả đủ
    expect(await total(MAT.id)).toBe(30);
    expect(lastVault(lh, C)?.vault?.myDrawsLeft).toBe(3); // lượt hoàn lại
    expect(lastToast(lh, C)).toMatch(/Túi đồ của ngươi không đủ chỗ/);
  });

  it("người chơi RỜI phòng giữa lúc rút: đồ về kho, không biến mất cũng không nhân đôi", async () => {
    await stock();
    const orig = svc.vaultWithdraw.bind(svc);
    svc.vaultWithdraw = async (...a: Parameters<typeof orig>) => {
      const r = await orig(...a);
      lh.w.ctrl.delete(C);
      lh.w.state.players.delete(C);
      return r;
    };
    await sectVaultWithdraw(lh.w, C, slot0(4));
    expect(await vaultQty(MAT.id)).toBe(30);
  });

  it("đang qua cổng giữa lúc rút: không cộng vào túi (bản ghi cổng đã giữ túi cũ), đồ về kho", async () => {
    await stock();
    const c = lh.w.ctrl.get(C)!;
    const orig = svc.vaultWithdraw.bind(svc);
    svc.vaultWithdraw = async (...a: Parameters<typeof orig>) => {
      const r = await orig(...a);
      c.travelling = true;
      return r;
    };
    await sectVaultWithdraw(lh.w, C, slot0(4));
    expect(held(lh, C, MAT.id)).toBe(0);
    expect(await vaultQty(MAT.id)).toBe(30);
  });

  it("gục (Hoàng Tuyền) giữa lúc rút: không cộng vào túi của kiếp đã mất, đồ về kho", async () => {
    await stock();
    const c = lh.w.ctrl.get(C)!;
    const orig = svc.vaultWithdraw.bind(svc);
    svc.vaultWithdraw = async (...a: Parameters<typeof orig>) => {
      const r = await orig(...a);
      c.limbo = true;
      return r;
    };
    await sectVaultWithdraw(lh.w, C, slot0(4));
    expect(held(lh, C, MAT.id)).toBe(0);
    expect(await vaultQty(MAT.id)).toBe(30);
  });

  it("ĐUA: hai người cùng rút món cuối cùng: đúng MỘT người nhận, người kia vault_changed; tổng không đổi", async () => {
    await setup();
    await seedVault((s) => {
      s.vault.slots[0] = { itemId: MAT.id, qty: 5 };
    });
    await Promise.all([sectVaultWithdraw(lh.w, A, slot0(5)), sectVaultWithdraw(hp.w, B, slot0(5))]);
    expect(held(lh, A, MAT.id) + held(hp, B, MAT.id)).toBe(5);
    expect(await vaultQty(MAT.id)).toBe(0);
    expect(await total(MAT.id)).toBe(5);
    const toasts = [lastToast(lh, A), lastToast(hp, B)];
    expect(toasts.filter((t) => /vừa có người lấy/.test(t ?? ""))).toHaveLength(1);
  });

  it("ĐUA ở dịch vụ: 6 lần rút đồng thời của MỘT Đệ tử chỉ được đúng drawPerDay lượt (hạn mức đếm nguyên tử cùng lúc trừ kho)", async () => {
    await stock();
    const a = { soulKey: key(C), name: C };
    const today = dayKey(now);
    const rs = await Promise.all(
      Array.from({ length: 6 }, () => svc.vaultWithdraw(a, slot0(1), today)),
    );
    expect(rs.filter((r) => r.ok)).toHaveLength(3);
    expect(rs.filter((r) => !r.ok && r.reason === "vault_limit")).toHaveLength(3);
    expect(await vaultQty(MAT.id)).toBe(27);
  });

  it("hai thao tác kho đồ của CÙNG một người không chồng nhau: thao tác thứ hai bị từ chối trong lúc thao tác đầu còn dở", async () => {
    await stock();
    give(lh, A, MAT.id, 20);
    const s = slotOf(lh, A, MAT.id);
    const res = await Promise.all([
      sectVaultDeposit(lh.w, A, { slot: s, qty: 5 }),
      sectVaultDeposit(lh.w, A, { slot: s, qty: 5 }),
    ]);
    void res;
    // đúng một lần góp thành công (lần kia thấy "đang xử lý"); túi + kho vẫn đủ 20 + 30
    expect(await total(MAT.id)).toBe(50);
    expect(held(lh, A, MAT.id)).toBe(15);
  });

  it("không ở tông môn: từ chối, túi nguyên", async () => {
    await setup();
    addPlayer(lh.w, "Ngoai", 1, 8);
    await sectVaultWithdraw(lh.w, "Ngoai", slot0(1));
    expect(lastToast(lh, "Ngoai")).toMatch(/chưa thuộc tông môn/);
  });

  it("bị mời ra giữa chừng: không rút được nữa; người bị mời ra nhận kho null", async () => {
    await stock();
    await sectKick(lh.w, A, { name: C });
    expect(lastVault(lh, C)?.vault).toBeNull();
    await sectVaultWithdraw(lh.w, C, slot0(1));
    expect(held(lh, C, MAT.id)).toBe(0);
  });
});

describe("cờ kiếp mới chưa được rút (SECT_NEWLIFE_LOCK_HOURS, mặc định tắt)", () => {
  it("tắt (mặc định): đầu thai xong rút ngay theo luật chức vụ", async () => {
    await setup();
    await seedVault((s) => {
      s.vault.slots[0] = { itemId: MAT.id, qty: 5 };
    });
    expect(lh.w.sectNewLifeLockMs).toBe(0);
    lh.w.ctrl.get(A)!.life.playMs = 0; // kiếp mới tinh
    await sectVaultWithdraw(lh.w, A, { slot: 0, itemId: MAT.id, qty: 2 });
    expect(held(lh, A, MAT.id)).toBe(2);
  });

  it("bật: kiếp chưa chơi đủ giờ không rút được kho đồ VÀ kho Linh thạch; đủ giờ thì rút được; ảnh chụp báo lockMs", async () => {
    await setup();
    await seedVault((s) => {
      s.vault.slots[0] = { itemId: MAT.id, qty: 5 };
      s.coin = 500;
    });
    lh.w.sectNewLifeLockMs = 3600_000;
    const c = lh.w.ctrl.get(A)!;
    c.life.playMs = 600_000;
    await sectVaultWithdraw(lh.w, A, { slot: 0, itemId: MAT.id, qty: 2 });
    expect(lastToast(lh, A)).toMatch(/còn quá mới/);
    expect(held(lh, A, MAT.id)).toBe(0);
    const coin0 = c.coin;
    await sectWithdraw(lh.w, A, { amount: 100 });
    expect(lastToast(lh, A)).toMatch(/còn quá mới/);
    expect(c.coin).toBe(coin0);
    expect(order).toEqual([]);
    // ảnh chụp kho (gửi khi có đổi) cho thấy khoá còn lại 50 phút
    await sectVaultPolicy(lh.w, A, { drawPerDay: 4 });
    expect(lastVault(lh, A)?.vault?.lockMs).toBe(3000_000);
    c.life.playMs = 3600_000;
    await sectVaultWithdraw(lh.w, A, { slot: 0, itemId: MAT.id, qty: 2 });
    expect(held(lh, A, MAT.id)).toBe(2);
    await sectWithdraw(lh.w, A, { amount: 100 });
    expect(c.coin).toBe(coin0 + 100);
  });
});

describe("bảo toàn đồ: không bao giờ nhân đôi (đua ngẫu nhiên có seed)", () => {
  it("nhiều thành viên góp / rút / đổi hạn mức đồng thời + lỗi lưu chen vào: tổng mỗi món KHÔNG BAO GIỜ vượt tổng ban đầu", async () => {
    await setup();
    const players: [Room, string][] = [
      [lh, A],
      [hp, B],
      [lh, C],
      [hp, D],
    ];
    for (const [r, who] of players) {
      give(r, who, MAT.id, 40);
      give(r, who, OTHER.id, 40);
    }
    const start = { [MAT.id]: 160, [OTHER.id]: 160 };
    let seed = 20261116;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let round = 0; round < 60; round++) {
      saveOk = rnd() > 0.15; // 15% lần lưu thất bại
      const batch: Promise<unknown>[] = [];
      for (const [r, who] of players) {
        const id = rnd() < 0.5 ? MAT.id : OTHER.id;
        const roll = rnd();
        if (roll < 0.4) {
          const s = slotOf(r, who, id);
          if (s >= 0)
            batch.push(sectVaultDeposit(r.w, who, { slot: s, qty: 1 + Math.floor(rnd() * 8) }));
        } else if (roll < 0.9) {
          const v = (await vaultOf()).vault.slots;
          const i = Math.floor(rnd() * 6);
          const cell = v[i];
          batch.push(
            sectVaultWithdraw(r.w, who, {
              slot: i,
              itemId: cell?.itemId ?? id,
              qty: 1 + Math.floor(rnd() * 12),
            }),
          );
        } else if (who === A)
          batch.push(sectVaultPolicy(r.w, who, { drawPerDay: Math.floor(rnd() * 11) }));
      }
      await Promise.all(batch);
      if (round % 7 === 6) {
        now += 24 * 3600_000;
        lh.w.now = hp.w.now = now;
      }
      for (const id of [MAT.id, OTHER.id]) {
        expect(await total(id), `vòng ${round}, món ${id}`).toBeLessThanOrEqual(start[id]);
      }
    }
    // không có thao tác nào làm đồ biến mất ở các nhánh không lỗi: tổng còn lại khá sát ban đầu (mất tối đa phần đang chuyển lúc lưu lỗi: ở đây lưu lỗi
    // được trả lại túi nên không mất)
    for (const id of [MAT.id, OTHER.id]) expect(await total(id)).toBe(start[id]);
  });
});
