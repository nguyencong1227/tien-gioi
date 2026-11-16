// Nguồn kiếm cống hiến + ảnh chụp "Nội vụ" nối với phòng (M8.3, docs/THIET_KE_TONG_MON.md mục 12.3 / 12.9): góp Linh thạch / đồ -> cống hiến qua MỘT cổng (`SectService.award`),
// chờ sang ngày mới kiếm được (cờ `World.sectEarnWarmup`), trần góp 30 / ngày, lên cấp báo cả tông môn, audit, `sectHallGet`. World giả + kho tệp thật + `SectService` thật.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ITEM_BY_ID,
  SECT_DEPOSIT_DAY_CAP,
  SECT_EARN_DAY_CAP,
  addToInventory,
  sectFailMessage,
  sectLevelOf,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { makeSect } from "../store-contract";
import { sectDeposit, sectHallGet, sectOnJoin, sectVaultDeposit } from "./sect";
import { addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-earn-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const DAY = 86_400_000;
const A = "Alpha";
const B = "Bravo";
const keyOf = (s: string) => s.toLowerCase();

let now = 1_700_000_000_000;
let lh: ReturnType<typeof makeWorld>;
let store: FileSectStore;
let svc: SectService;
let audit: { ev: string; f: Record<string, unknown> }[];

/** Dựng tông môn "t1" (A Tông chủ, B Đệ tử) vào từ `joinedAgo` ms trước; trả bản ghi. */
async function seed(joinedAgo: number, over: Record<string, unknown> = {}) {
  const joined = now - joinedAgo;
  return store.create(
    makeSect("t1", {
      name: "Thanh Van",
      tag: "TV",
      leader: keyOf(A),
      members: [
        { soulKey: keyOf(A), name: A, rank: "chu", joinedAt: joined },
        { soulKey: keyOf(B), name: B, rank: "de_tu", joinedAt: joined },
      ],
      ...over,
    }),
  );
}
const join = async (who: string) => sectOnJoin(lh.w, who);
const meOf = async (who: string) =>
  (await store.get("t1"))!.members.find((m) => m.soulKey === keyOf(who))!;
const lastHall = (who: string) => lh.sectHalls.filter((h) => h.sid === who).at(-1)?.msg.hall;
const lastToast = (who: string) => lh.toasts.filter((t) => t.sid === who).at(-1)?.msg.text;
const earnEvents = () => audit.filter((e) => e.ev === "sect.earn");

beforeEach(async () => {
  now = 1_700_000_000_000;
  lh = makeWorld(undefined, new Hub());
  store = new FileSectStore(path.join(root, `s${++n}`), () => now);
  svc = new SectService(store, () => now);
  lh.w.now = now;
  lh.w.sectService = svc;
  lh.w.onSaveNow = async () => true;
  audit = [];
  lh.w.audit = (ev, f) => void audit.push({ ev, f: f ?? {} });
  addPlayer(lh.w, A, 1, 8);
  addPlayer(lh.w, B, 1, 8);
  lh.w.ctrl.get(A)!.coin = 100_000;
  lh.w.ctrl.get(B)!.coin = 100_000;
});

describe("góp Linh thạch / đồ -> cống hiến (mục 12.3)", () => {
  it("góp 1.000 Linh thạch (vào tông từ TRƯỚC hôm nay): +10 cống hiến qua award, toast nêu số, audit sect.earn, ảnh chụp Nội vụ cập nhật cho NGƯỜI KIẾM", async () => {
    await seed(2 * DAY);
    await join(A);
    await sectDeposit(lh.w, A, { amount: 1000 });
    const a = await meOf(A);
    expect(a.contrib).toBe(10);
    expect(a.merit).toBe(10);
    expect((await store.get("t1"))!.points).toBe(10);
    expect(lastToast(A)).toContain("(+10 cống hiến)");
    expect(earnEvents()).toEqual([
      {
        ev: "sect.earn",
        f: expect.objectContaining({ name: A, source: "deposit", amount: 10, level: 1 }),
      },
    ]);
    const hall = lastHall(A)!;
    expect(hall.me.contrib).toBe(10);
    expect(hall.me.earnedToday).toBe(10);
    expect(hall.me.depositLeft).toBe(SECT_DEPOSIT_DAY_CAP - 10);
    expect(hall.me.earnFromAt).toBe(0);
    expect(hall.level).toBe(1);
  });

  it("góp đồ: giá trị theo ITEM_VALUE (Tụ Khí Đan 90 x 3 = 270 -> 2 cống hiến, làm tròn xuống); đồ vẫn vào kho kể cả khi cống hiến 0", async () => {
    await seed(2 * DAY);
    await join(A);
    const item = ITEM_BY_ID["tu_khi_dan"]!;
    addToInventory(lh.w.ctrl.get(A)!.inv, item.id, 3);
    const slot = lh.w.ctrl.get(A)!.inv.findIndex((s) => s?.itemId === item.id);
    await sectVaultDeposit(lh.w, A, { slot, qty: 3 });
    expect((await meOf(A)).contrib).toBe(2);
    expect(lastToast(A)).toContain("(+2 cống hiến)");
    // món rẻ: 5 lông thỏ x 2 = 10 < 100: góp được, 0 cống hiến, KHÔNG toast cống hiến
    addToInventory(lh.w.ctrl.get(A)!.inv, "long_tho", 5);
    const s2 = lh.w.ctrl.get(A)!.inv.findIndex((s) => s?.itemId === "long_tho");
    await sectVaultDeposit(lh.w, A, { slot: s2, qty: 5 });
    expect((await meOf(A)).contrib).toBe(2);
    expect(lastToast(A)).not.toContain("cống hiến");
    const vault = (await store.get("t1"))!.vault.slots.filter((s) => s);
    expect(vault.map((s) => s!.itemId).sort()).toEqual(["long_tho", "tu_khi_dan"]);
  });

  it("CHỜ SANG NGÀY: vào tông CÙNG ngày thì góp được nhưng KHÔNG có cống hiến, ảnh chụp báo earnFromAt (00:00 VN kế tiếp); cờ tắt (dev / E2E) thì kiếm ngay", async () => {
    await seed(1000); // vừa vào
    await join(A);
    await sectDeposit(lh.w, A, { amount: 1000 });
    expect((await store.get("t1"))!.coin).toBe(1000); // góp vẫn thành công
    expect((await meOf(A)).contrib).toBeUndefined();
    expect(earnEvents()).toHaveLength(0);
    expect(lastToast(A)).not.toContain("cống hiến");
    await sectHallGet(lh.w, A, {});
    expect(lastHall(A)!.me.earnFromAt).toBeGreaterThan(now);
    lh.w.sectEarnWarmup = false;
    await sectDeposit(lh.w, A, { amount: 1000 });
    expect((await meOf(A)).contrib).toBe(10);
    await sectHallGet(lh.w, A, {});
    expect(lastHall(A)!.me.earnFromAt).toBe(0);
  });

  it("TRẦN góp kho 30 / ngày: nhiều lần góp lớn chỉ cộng tổng 30, lần sau 0 (vòng góp - rút không sinh thêm); sang ngày mới được lại", async () => {
    await seed(2 * DAY);
    await join(A);
    for (let i = 0; i < 5; i++) await sectDeposit(lh.w, A, { amount: 2000 }); // mỗi lần 20 cống hiến
    expect((await meOf(A)).contrib).toBe(SECT_DEPOSIT_DAY_CAP);
    expect(earnEvents().map((e) => e.f.amount)).toEqual([20, 10]);
    expect((await meOf(A)).today!.earned).toBeLessThanOrEqual(SECT_EARN_DAY_CAP);
    now += DAY; // sang ngày mới
    lh.w.now = now;
    await sectDeposit(lh.w, A, { amount: 500 });
    expect((await meOf(A)).contrib).toBe(SECT_DEPOSIT_DAY_CAP + 5);
  });

  it("LÊN CẤP: vượt 1.000 điểm tông thì báo CẢ tông môn (toast + ảnh chụp mới có cấp 2 và giới hạn mới), audit sect.level_up", async () => {
    await seed(2 * DAY, { points: 990 });
    await join(A);
    await join(B);
    await sectDeposit(lh.w, A, { amount: 1000 }); // +10 -> 1000 điểm = cấp 2
    expect((await store.get("t1"))!.points).toBe(1000);
    expect(sectLevelOf(1000)).toBe(2);
    for (const who of [A, B]) {
      expect(
        lh.toasts.some((t) => t.sid === who && t.msg.text.includes("lên cấp 2")),
        `${who} nhận toast lên cấp`,
      ).toBe(true);
      const hall = lastHall(who)!;
      expect(hall.level).toBe(2);
      expect(hall.caps.members).toBe(35);
      expect(hall.buff.exp).toBeCloseTo(1.02);
    }
    expect(audit.filter((e) => e.ev === "sect.level_up")).toEqual([
      { ev: "sect.level_up", f: { sect: "Thanh Van", level: 2 } },
    ]);
    // người B (không kiếm) cũng thấy điểm tông mới ở ảnh chụp, công tích của B vẫn 0
    expect(lastHall(B)!.points).toBe(1000);
    expect(lastHall(B)!.me.merit).toBe(0);
  });

  it("chết GIỮA LÚC góp (sau khi kho đã cộng, trước khi cộng cống hiến): kho giữ phần đã góp (góp trước khi chết), nhưng KHÔNG có cống hiến cho người đã chết", async () => {
    await seed(2 * DAY);
    await join(A);
    const orig = svc.deposit.bind(svc);
    svc.deposit = async (...args: Parameters<typeof orig>) => {
      const r = await orig(...args);
      lh.w.state.players.get(A)!.dead = true; // bị hạ ngay sau khi kho đã ghi
      return r;
    };
    await sectDeposit(lh.w, A, { amount: 1000 });
    expect((await store.get("t1"))!.coin).toBe(1000);
    expect((await meOf(A)).contrib).toBeUndefined();
    expect(earnEvents()).toHaveLength(0);
  });

  it("người ĐÃ CHẾT không góp được (mục 38) nên không có cống hiến; người khác vẫn kiếm bình thường", async () => {
    await seed(2 * DAY);
    await join(A);
    lh.w.state.players.get(A)!.dead = true;
    await sectDeposit(lh.w, A, { amount: 1000 });
    expect((await store.get("t1"))!.coin).toBe(0);
    expect((await meOf(A)).contrib).toBeUndefined();
    expect(lastToast(A)).toBe(sectFailMessage("down")); // chuỗi CHUNG cho nhận / trả / mua / góp
    await sectDeposit(lh.w, B, { amount: 1000 });
    expect((await meOf(B)).contrib).toBe(10);
  });
});

describe("sectHallGet / sectHall (chỉ đọc, không tự đẩy lúc nửa đêm)", () => {
  it("vào phòng gửi ảnh chụp; sectHallGet gửi lại ảnh chụp MỚI (sang ngày thì earnedToday về 0, resetAt dời); người ngoài tông môn nhận hall null; tin rác bị bỏ", async () => {
    await seed(2 * DAY);
    await join(A);
    expect(lastHall(A)).toBeTruthy();
    await sectDeposit(lh.w, A, { amount: 1000 });
    await sectHallGet(lh.w, A, undefined);
    const before = lastHall(A)!;
    expect(before.me.earnedToday).toBe(10);
    expect(before.resetAt).toBeGreaterThan(before.now);
    now += DAY;
    lh.w.now = now;
    await sectHallGet(lh.w, A, {});
    const after = lastHall(A)!;
    expect(after.me.earnedToday).toBe(0); // sổ ngày đặt lại
    expect(after.resetAt).toBeGreaterThan(before.resetAt);
    expect(after.me.contrib).toBe(10); // cống hiến CÒN (không mất theo ngày)
    const count = lh.sectHalls.length;
    addPlayer(lh.w, "Charlie", 1, 8);
    await sectHallGet(lh.w, "Charlie", {});
    expect(lh.sectHalls.at(-1)).toEqual({ sid: "Charlie", msg: { hall: null } });
    for (const junk of [5, "x", [], true]) await sectHallGet(lh.w, A, junk);
    expect(lh.sectHalls.length).toBe(count + 1); // chỉ ca Charlie
  });

  it("ảnh chụp có 3 nhiệm vụ hôm nay (M8.4, chi tiết ở sect-quest.test.ts); cửa hàng còn RỖNG (M8.5 điền); khớp kiểu thật của hợp đồng M8.1", async () => {
    await seed(2 * DAY);
    await join(A);
    const hall = lastHall(A)!;
    expect(hall.quests).toHaveLength(3);
    expect(hall.shop).toEqual([]);
    expect(hall.pointsNext).toBe(1000);
    expect(hall.pointsFrom).toBe(0);
    expect(hall.caps).toEqual({ members: 30, elders: 3, vaultSlots: 40 });
  });
});
