// Ảnh chụp tông môn phát KHÔNG được lùi (lỗi thật bắt được ở CI của #864): hai thao tác đua nhau cùng nhận bản ghi ngay sau `update` nhưng PHÁT sau khi lưu hồ sơ (chậm, khác nhau);
// bản cũ có thể phát SAU bản mới nên người chơi kẹt ở ảnh chụp kho CŨ (CI: "đua rút cùng 1 ô kho" hết giờ ở "tổng đồ = 25", từng thấy 35 = 20 đã rút + 15 là ảnh cũ).
// Test tất định: lưu hồ sơ của người rút trước CHẬM hơn người rút sau, nên bản của người rút trước phát sau cùng.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ITEMS } from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { emptySectVault } from "../sect-store";
import { makeSect } from "../store-contract";
import { sectOnJoin, sectVaultWithdraw } from "./sect";
import { addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-stale-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const A = "Alpha";
const B = "Bravo";
const keyOf = (s: string) => s.toLowerCase();
const MAT = ITEMS.find((i) => i.stack >= 99)!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lh: ReturnType<typeof makeWorld>;
let store: FileSectStore;
let svc: SectService;

beforeEach(async () => {
  lh = makeWorld(undefined, new Hub());
  const tick = 1_700_000_000_000;
  // đồng hồ KHÔNG tiến: hai cập nhật liên tiếp cùng một mili giây (ca xấu nhất cho việc so `updatedAt`)
  store = new FileSectStore(path.join(root, `s${++n}`), () => tick);
  svc = new SectService(store, () => tick);
  lh.w.now = tick;
  lh.w.sectService = svc;
  addPlayer(lh.w, A, 1, 8);
  addPlayer(lh.w, B, 1, 8);
  const vault = emptySectVault();
  vault.slots[0] = { itemId: MAT.id, qty: 25 };
  await store.create(
    makeSect("t1", {
      name: "Thanh Van",
      tag: "TV",
      leader: keyOf(A),
      vault,
      members: [
        { soulKey: keyOf(A), name: A, rank: "chu", joinedAt: 1 },
        { soulKey: keyOf(B), name: B, rank: "truong_lao", joinedAt: 1 },
      ],
    }),
  );
  await sectOnJoin(lh.w, A);
  await sectOnJoin(lh.w, B);
});

const lastVault = (who: string) => lh.sectVaults.filter((v) => v.sid === who).at(-1)?.msg.vault;
const inVault = (who: string) =>
  (lastVault(who)?.slots ?? []).reduce((t, s) => t + (s?.itemId === MAT.id ? s.qty : 0), 0);
const held = (who: string) =>
  lh.w.ctrl.get(who)!.inv.reduce((t, s) => t + (s?.itemId === MAT.id ? s.qty : 0), 0);

describe("ảnh chụp kho không lùi khi hai thao tác lưu xong theo thứ tự ngược", () => {
  it("A rút trước (lưu CHẬM 80 ms), B rút sau (lưu nhanh 5 ms): B phát xong trước, A phát sau; cả hai người PHẢI thấy kho còn 5 (không kẹt ở ảnh cũ 15); tổng đồ = 25", async () => {
    lh.w.onSaveNow = async (sid) => {
      await sleep(sid === A ? 80 : 5);
      return true;
    };
    // A gửi trước nên `vaultWithdraw` của A chạy trước (kho 25 -> 15), của B sau (15 -> 5)
    const pa = sectVaultWithdraw(lh.w, A, { slot: 0, itemId: MAT.id, qty: 10 });
    await sleep(1);
    const pb = sectVaultWithdraw(lh.w, B, { slot: 0, itemId: MAT.id, qty: 10 });
    await Promise.all([pa, pb]);
    expect(held(A)).toBe(10);
    expect(held(B)).toBe(10);
    expect(inVault(A)).toBe(5); // KHÔNG được là 15
    expect(inVault(B)).toBe(5);
    expect(held(A) + held(B) + inVault(A)).toBe(25);
    // bản ghi trong kho cũng đúng
    const s = (await store.get("t1"))!;
    expect(s.vault.slots[0]).toEqual({ itemId: MAT.id, qty: 5 });
  });

  it("`updatedAt` TĂNG NGHIÊM NGẶT qua mọi cập nhật (kể cả khi đồng hồ không tiến): nền để so bản mới / cũ", async () => {
    const t0 = (await store.get("t1"))!.updatedAt;
    const a = await store.update("t1", (s) => ({ ...s, motd: "mot" }));
    const b = await store.update("t1", (s) => ({ ...s, motd: "hai" }));
    expect(a!.updatedAt).toBeGreaterThan(t0);
    expect(b!.updatedAt).toBeGreaterThan(a!.updatedAt);
  });
});
