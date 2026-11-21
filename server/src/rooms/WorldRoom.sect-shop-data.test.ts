// Test tích hợp Cửa hàng tông môn trên PHÒNG COLYSEUS THẬT, chạy theo BẢNG THẬT `SECT_SHOP` (M8.7 #844; đếm theo `SECT_SHOP.length`, KHÔNG cứng số) — issue #969.
// KHÁC `WorldRoom.sect-shop.test.ts` (dùng `installSectShopFixture()` bảng khung 3 món): tệp này KHÔNG lắp fixture nên mọi hàm `shared/`
// (parseSectShopBuy, SECT_SHOP_BY_ITEM, sectShopLock...) và máy chủ đọc đúng bảng thật (số món theo `SECT_SHOP.length`). BẢNG-ĐIỀU-KHIỂN: thêm / bớt món thì test tự theo, KHÔNG cứng id.
//
// CHỈ thêm test (KHÔNG sửa mã trò chơi). Phủ theo từng dòng của bảng THẬT:
//   req 1 — MỖI món mua được ở ĐÚNG cấp mở (`minLevel`) với ĐÚNG mức cống hiến (`cost`): túi +1, contrib giảm đúng `cost`, buys = 1, sectHall `left = limitDay - 1`.
//   req 2 — Ở cấp dưới ngưỡng (`minLevel - 1`, nếu ≥ 1): bị từ chối lý do `level`, KHÔNG mất cống hiến, túi không đổi.
//   req 3 (hạn mức ngày) / req 4 (kinh quyển đã học) / req 5 (không đủ cống hiến, túi đầy) / req 6 (mua mọi món) / req 7 (đột biến ĐỎ): các lượt sau.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  SECT_LEVELS,
  SECT_MSG,
  SECT_SHOP,
  roomNameOf,
  sectFailMessage,
  type SectHallMsg,
  type SectMsg,
  type ToastMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import { listenWithRetry } from "../test-port";
import { restoreSaves } from "./test-save-hooks";
import { makeSect } from "../store-contract";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-shop-data-"));
let PORT = 0;
let server: Server;
const rooms: Room[] = [];
const DAY = 86_400_000;
const now = Date.now();

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const wrMod = await import("./WorldRoom");
  // Reset singleton để trỏ về dataDir của test này (KHÔNG lắp installSectShopFixture → giữ bảng SECT_SHOP THẬT)
  (wrMod.WorldRoom as any).sects = null;
  (wrMod.WorldRoom as any).defaultSects = undefined;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  wrMod.defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  restoreSaves();
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(
  fn: () => T | undefined | false,
  ms = 5000,
  what = "điều kiện",
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(20);
  }
}

let seq = 0;
const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const worldOf = (room: Room) => (serverRoom(room) as any).world;
const ctrlOf = (h: Hero) => worldOf(h.room).ctrl.get(h.room.sessionId);

interface Hero {
  name: string;
  room: Room;
  snaps: SectMsg[];
  halls: SectHallMsg[];
  toasts: string[];
}

function listen(room: Room, h: Hero) {
  room.onMessage(SECT_MSG.snapshot, (m: SectMsg) => h.snaps.push(m));
  room.onMessage(SECT_MSG.hall, (m: SectHallMsg) => h.halls.push(m));
  room.onMessage("toast", (m: ToastMsg) => h.toasts.push(m.text));
  for (const t of ["inv", "wallet", "quests", "dialog", "fx", "dmg", "soul", "party", "chat"])
    room.onMessage(t, () => {});
}

async function join(name: string): Promise<Hero> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    name,
    secret: secretOf(name),
  });
  rooms.push(room);
  const h: Hero = { name, room, snaps: [], halls: [], toasts: [] };
  listen(room, h);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "vào phòng");
  const w = worldOf(room);
  w.state.monsters.clear(); // không để quái hoang làm phiền
  w.mctrl.clear();
  return h;
}

const lastHall = (h: Hero) => h.halls.at(-1)?.hall;

/**
 * Dựng tông môn ở ĐÚNG cấp `level` để người chơi (Tông chủ = chính người mua) mua được ĐÚNG các món mở ở cấp đó và KHÔNG mua được món mở ở cấp cao hơn.
 * `contrib` = cống hiến ban đầu của thành viên (merit = contrib). ĐIỂM phải = `max(ngưỡng_cấp, contrib)`: sanitize / `assertWritableSect` đòi points >= tổng công tích
 * (meritSum = contrib), và muốn giữ đúng cấp thì points < ngưỡng cấp kế (contrib ≤ 92 < 1000 nên luôn thoả).
 */
async function mkSectAt(
  level: number,
  contrib: number,
): Promise<{
  H: Hero;
  sectId: string;
  soulKey: string;
}> {
  const name = `Buyer${++seq}`;
  const sectId = `s${seq}`;
  const points = Math.max(SECT_LEVELS[level - 1]!.points, contrib); // max(ngưỡng_cấp, contrib): >= tổng công tích (merit=contrib) và < ngưỡng cấp kế → sectLevelOf = level
  const soulKey = name.toLowerCase().trim();
  const joinedAt = now - 2 * DAY;
  const tag = `M${seq < 10 ? "0" + seq : seq}`;
  const wrMod = await import("./WorldRoom");
  const svc = wrMod.WorldRoom.sectService()!;
  await svc.store.create(
    makeSect(sectId, {
      name: `Mon ${seq}`,
      tag,
      leader: soulKey,
      points,
      members: [{ soulKey, name, rank: "chu", joinedAt, contrib, merit: contrib }],
    }),
  );
  const H = await join(name);
  await waitFor(() => lastHall(H)?.me?.contrib === contrib, 4000, "ảnh chụp sectHall có contrib");
  return { H, sectId, soulKey };
}

/** Đọc hồ sơ tông môn đã lưu trên đĩa. */
function sectDataOf(sectId: string) {
  return JSON.parse(readFileSync(path.join(dataDir, "sects", `${sectId}.json`), "utf8"));
}

/** Số lượng `itemId` trong túi người chơi (bộ nhớ). */
function bagCount(h: Hero, itemId: string): number {
  return ctrlOf(h).inv.reduce((s: number, x: any) => s + (x?.itemId === itemId ? x.qty : 0), 0);
}

describe(`Cửa hàng tông môn — bảng THẬT SECT_SHOP (${SECT_SHOP.length} món, #969)`, () => {
  it(`req1: MỌI món (${SECT_SHOP.length}) mua được ở ĐÚNG cấp mở với ĐÚNG mức cống hiến: túi +1, contrib giảm đúng cost, buys = 1, left = limitDay-1`, async () => {
    for (const e of SECT_SHOP) {
      const { H, sectId, soulKey } = await mkSectAt(e.minLevel, e.cost);
      const before = lastHall(H)?.me?.contrib;
      expect(before, `${e.itemId}: contrib ban đầu`).toBe(e.cost);

      H.room.send(SECT_MSG.shopBuy, { itemId: e.itemId, qty: 1 });

      // Toast thành công với đúng giá
      await waitFor(
        () => H.toasts.some((t) => t.includes("Đã đổi 1") && t.includes(`-${e.cost} cống hiến`)),
        4000,
        `${e.itemId}: toast mua thành công`,
      );
      // contrib giảm đúng cost → 0
      await waitFor(() => lastHall(H)?.me?.contrib === 0, 4000, `${e.itemId}: contrib về 0`);
      // sectHall `left` = limitDay - 1
      const row = lastHall(H)?.shop.find((r) => r.itemId === e.itemId);
      expect(row?.left, `${e.itemId}: lượt còn hôm nay`).toBe(e.limitDay - 1);
      // Túi nhận đúng 1
      expect(bagCount(H, e.itemId), `${e.itemId}: túi +1`).toBe(1);
      // Đĩa: contrib = 0, buys[itemId] = 1 (khớp theo soulKey: name giữ hoa thường, soulKey thường — cleanName KHÔNG thường hoá)
      const m = sectDataOf(sectId).members.find((x: any) => x.soulKey === soulKey);
      // contrib về 0 thì sanitize KHÔNG lưu trường (0 = vắng) → coi là 0
      expect(m.contrib ?? 0, `${e.itemId}: contrib trên đĩa`).toBe(0);
      expect(m.today?.buys?.[e.itemId], `${e.itemId}: buys`).toBe(1);
    }
  });

  it(`req2: MỌI món ở cấp DƯỚI ngưỡng (minLevel-1, nếu ≥ 1) bị khoá ` + "`level`", async () => {
    // contrib = giá cao nhất trong bảng: dư đủ mua MỌI món (nếu bỏ kiểm CẤP thì mua được → test đỏ), nhưng < 1000 (ngưỡng cấp 2)
    // nên sanitize giữ tông ở ĐÚNG cấpBelow (points = max(ngưỡng_cấp, contrib) vẫn < ngưỡng cấp kế). Kiểm CẤP chạy TRƯỚC kiểm cống hiến.
    const maxShopCost = Math.max(...SECT_SHOP.map((e) => e.cost));
    // Tái sử dụng ≤ 4 tông (cấp 1..4): mỗi món minLevel>1 mua từ người ở tông cấp minLevel-1 (dư contrib, vẫn bị khoá bởi cấp)
    const lockedMsg = sectFailMessage("shop_locked"); // "Tông môn chưa đủ cấp để mở món hàng này."
    const byBelow: Record<number, { H: Hero; sectId: string; soulKey: string }> = {};
    for (const e of SECT_SHOP) {
      if (e.minLevel <= 1) continue; // không có cấp dưới mức 1
      const below = e.minLevel - 1;
      let buyer = byBelow[below];
      if (!buyer) {
        buyer = await mkSectAt(below, maxShopCost);
        byBelow[below] = buyer;
      }
      const before = lastHall(buyer.H)?.me?.contrib;
      // CÁC MÓN CÙNG minLevel DÙNG CHUNG NGƯỜI MUA → phải đợi toast RIÊNG của món này (chỉ số `nToastBefore`), KHÔNG phải toast cũ của món trước
      const nToastBefore = buyer.H.toasts.length;
      buyer.H.room.send(SECT_MSG.shopBuy, { itemId: e.itemId, qty: 1 });
      // Chờ một toast MỚI về tới, rồi khẳng định ĐÚNG là tin khoá cấp (nit A: waitFor `.some(===lockedMsg)` trước đây chạm toast cũ -> báo giả dương)
      await waitFor(
        () => buyer.H.toasts.length > nToastBefore,
        4000,
        `${e.itemId}: toast khoá cấp về tới`,
      );
      expect(buyer.H.toasts[nToastBefore], `${e.itemId}: toast mới là khoá cấp`).toBe(lockedMsg);
      // contrib KHÔNG đổi, túi KHÔNG có món
      expect(lastHall(buyer.H)?.me?.contrib, `${e.itemId}: contrib giữ nguyên`).toBe(before);
      expect(bagCount(buyer.H, e.itemId), `${e.itemId}: túi không đổi`).toBe(0);
      // NGUOI CHOI THAY: hang của món này trong sectHall hiện khoá `level` (nit A: kiểm cả MÀN HÌNH, không chỉ kết quả mua).
      // `sectShopLock` CHỈ cấp dữ liệu hiển thị này (lỗi mua thật do `svc.shopBuy` tự kiểm riêng) -> mutation bỏ kiểm cấp trong `sectShopLock` sẽ làm dòng dưới ĐỎ.
      const row = lastHall(buyer.H)?.shop.find((r) => r.itemId === e.itemId);
      expect(row?.locked, `${e.itemId}: sectHall hiện khoá cấp (player-side)`).toBe("level");
      // Đĩa: contrib giữ nguyên, buys KHÔNG ghi (khớp theo soulKey: name giữ hoa thường, soulKey thường — cleanName KHÔNG thường hoá)
      const m = sectDataOf(buyer.sectId).members.find((x: any) => x.soulKey === buyer.soulKey);
      expect(m.contrib, `${e.itemId}: contrib đĩa`).toBe(before);
      expect(m.today?.buys?.[e.itemId], `${e.itemId}: buys không ghi`).toBeUndefined();
    }
  });
});
