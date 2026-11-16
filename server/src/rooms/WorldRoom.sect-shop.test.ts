// Test tích hợp Cửa hàng tông môn qua phòng Colyseus THẬT (M8.5, issue #846):
// Client colyseus.js gửi tin sectShopBuy qua mạng WebSocket thật.
// Phủ các trường hợp của handler:
// 1. Mua thành công: cống hiến trừ, túi nhận đồ, hồ sơ người chơi và tệp tông môn được lưu đồng bộ.
// 2. Đua mua cùng lúc: khoá busy chặn lượt mua thứ hai khi lượt đầu đang lưu (gateSave), đồ không nhân đôi.
// 3. Túi đầy giữa lúc chờ: phát hiện túi không nhét vừa sau await svc.shopBuy -> tự động hoàn cống hiến bằng shopRefund.
// 4. Người chơi gục (isDown) trước hoặc giữa lúc mua: từ chối / hoàn cống hiến an toàn, không bị mất cống hiến vô cớ.
// 5. Rời phòng giữa lúc đang lưu: giải phóng khoá busy, bảo toàn tính toàn vẹn của hồ sơ.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  INVENTORY_SLOTS,
  SECT_MSG,
  roomNameOf,
  type SectHallMsg,
  type SectMsg,
  type ToastMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";
import { listenWithRetry } from "../test-port";
import { gateSave, restoreSaves } from "./test-save-hooks";
import { installSectShopFixture } from "../systems/sect-fixtures";
import { makeSect } from "../store-contract";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-shop-room-"));
let PORT = 0;
let server: Server;
const rooms: Room[] = [];
let restoreFixture: () => void;
const DAY = 86_400_000;
const now = Date.now();

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  restoreFixture = installSectShopFixture();
  const wrMod = await import("./WorldRoom");
  // Reset singleton để trỏ về dataDir của test này
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
  restoreFixture();
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
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const worldOf = (room: Room) => (serverRoom(room) as any).world;
const ctrlOf = (h: Hero) => worldOf(h.room).ctrl.get(h.room.sessionId);
const playerOf = (h: Hero) => serverState(h.room).players.get(h.room.sessionId)!;

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
  const h: Hero = {
    name,
    room,
    snaps: [],
    halls: [],
    toasts: [],
  };
  listen(room, h);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "vào phòng");
  const w = worldOf(room);
  w.state.monsters.clear(); // không để quái hoang làm phiền
  w.mctrl.clear();
  return h;
}

const lastHall = (h: Hero) => h.halls.at(-1)?.hall;
const saveOf = (name: string) => {
  const f = readdirSync(dataDir)
    .filter((x) => x.endsWith(".json"))
    .find((x) => {
      try {
        return JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name;
      } catch {
        return false;
      }
    });
  return f ? JSON.parse(readFileSync(path.join(dataDir, f), "utf8")) : undefined;
};

/** Dựng trước tông môn qua SectStore của chính server: điểm tông 4000 (cấp 3), thành viên gia nhập từ 2 ngày trước, có sẵn contrib cống hiến. */
async function seedSect(sectId: string, leaderName: string, contrib = 200, points = 4000) {
  const wrMod = await import("./WorldRoom");
  const svc = wrMod.WorldRoom.sectService()!;
  const soulKey = leaderName.toLowerCase().trim();
  const joinedAt = now - 2 * DAY;
  const tag = `M${seq < 10 ? "0" + seq : seq}`;
  return svc.store.create(
    makeSect(sectId, {
      name: `Mon ${seq}`,
      tag,
      leader: soulKey,
      points: Math.max(points, contrib + 500),
      members: [
        {
          soulKey,
          name: leaderName,
          rank: "chu",
          joinedAt,
          contrib,
          merit: contrib,
        },
      ],
    }),
  );
}

describe("Cửa hàng tông môn (sectShopBuy handler trên Colyseus thật)", () => {
  it("1. Mua thành công: cống hiến trừ, túi nhận đồ, ảnh chụp sectHall cập nhật và hồ sơ đĩa đồng bộ", async () => {
    const leaderName = `ShopHero${++seq}`;
    const sectId = `s${seq}`;
    await seedSect(sectId, leaderName, 200, 4000);

    const H = await join(leaderName);
    // Nhận ảnh chụp ban đầu
    const h0 = await waitFor(() => lastHall(H), 4000, "ảnh chụp sectHall lúc vào");
    expect(h0?.me?.contrib).toBe(200);

    // Gửi tin mua 2 Đan Hồi Huyết (cost 5/viên = 10 cống hiến)
    H.room.send(SECT_MSG.shopBuy, { itemId: "hoi_huyet_dan", qty: 2 });

    // Toast thành công
    await waitFor(
      () => H.toasts.some((t) => t.includes("Đã đổi 2") && t.includes("-10 cống hiến")),
      4000,
      "toast mua thành công",
    );

    // sectHall cập nhật cống hiến còn 190, món hoi_huyet_dan còn 8 lượt hôm nay
    await waitFor(() => lastHall(H)?.me?.contrib === 190, 4000, "sectHall cống hiến cập nhật");
    const itemRow = lastHall(H)?.shop.find((r) => r.itemId === "hoi_huyet_dan");
    expect(itemRow?.left).toBe(8);

    // Túi nhận đúng 2 đan
    const countInBag = ctrlOf(H).inv.reduce(
      (s: number, x: any) => s + (x?.itemId === "hoi_huyet_dan" ? x.qty : 0),
      0,
    );
    expect(countInBag).toBe(2);

    // Đĩa phản ánh hồ sơ người chơi
    await waitFor(
      () =>
        saveOf(leaderName)?.inventory?.some(
          (s: any) => s?.itemId === "hoi_huyet_dan" && s.qty === 2,
        ),
      4000,
      "hồ sơ người chơi trên đĩa có đồ",
    );

    // Tệp tông môn phản ánh cống hiến và số lượt mua
    const sectData = JSON.parse(
      readFileSync(path.join(dataDir, "sects", `${sectId}.json`), "utf8"),
    );
    const m = sectData.members.find((x: any) => x.name === leaderName);
    expect(m.contrib).toBe(190);
    expect(m.today?.buys?.["hoi_huyet_dan"]).toBe(2);
  });

  it("2. Đua mua cùng lúc: khoá busy chặn lượt mua thứ hai khi lượt đầu đang lưu (gateSave), không trừ 2 lần", async () => {
    const leaderName = `ShopHero${++seq}`;
    const sectId = `s${seq}`;
    await seedSect(sectId, leaderName, 200, 4000);

    const H = await join(leaderName);
    await waitFor(() => lastHall(H), 4000, "ảnh chụp sectHall lúc vào");

    // Chặn lưu hồ sơ của H
    const nha = gateSave(H.room);

    // Gửi lượt 1: mua 1 viên Đan Hồi Huyết
    H.room.send(SECT_MSG.shopBuy, { itemId: "hoi_huyet_dan", qty: 1 });

    // Chờ lượt 1 trừ cống hiến và cộng vào túi (đang đứng ở saveNow)
    await waitFor(
      () => ctrlOf(H).inv.some((s: any) => s?.itemId === "hoi_huyet_dan" && s.qty === 1),
      4000,
      "lượt 1 đã cộng túi",
    );

    // Gửi lượt 2 ngay lập tức khi lượt 1 chưa lưu xong
    H.room.send(SECT_MSG.shopBuy, { itemId: "hoi_huyet_dan", qty: 1 });

    // Lượt 2 bị từ chối ngay vì busy
    await waitFor(
      () => H.toasts.some((t) => t.includes("trục trặc")),
      4000,
      "lượt 2 bị từ chối trục trặc do busy",
    );

    // Nhả cổng lưu cho lượt 1 hoàn thành
    nha();

    await waitFor(
      () => H.toasts.some((t) => t.includes("Đã đổi 1")),
      4000,
      "lượt 1 hoàn tất toast",
    );

    // Kiểm tra túi chỉ có đúng 1 viên
    const countInBag = ctrlOf(H).inv.reduce(
      (s: number, x: any) => s + (x?.itemId === "hoi_huyet_dan" ? x.qty : 0),
      0,
    );
    expect(countInBag).toBe(1);

    // Cống hiến chỉ trừ đúng 5
    const sectData = JSON.parse(
      readFileSync(path.join(dataDir, "sects", `${sectId}.json`), "utf8"),
    );
    const m = sectData.members.find((x: any) => x.name === leaderName);
    expect(m.contrib).toBe(195);
  });

  it("3. Túi đầy giữa lúc chờ: tự động hoàn cống hiến bằng shopRefund, không mất điểm", async () => {
    const leaderName = `ShopHero${++seq}`;
    const sectId = `s${seq}`;
    await seedSect(sectId, leaderName, 200, 4000);

    const H = await join(leaderName);
    await waitFor(() => lastHall(H), 4000, "ảnh chụp sectHall lúc vào");

    const svc = worldOf(H.room).sectService!;
    const store = svc.store as any;
    const realUpdate = store.update.bind(store);
    const ctrl = ctrlOf(H);

    try {
      // Giả lập giữa lúc shopBuy cập nhật store (trừ cống hiến xong), túi người chơi bị lấp kín hoàn toàn
      store.update = async (...args: any[]) => {
        const res = await realUpdate(...args);
        for (let i = 0; i < INVENTORY_SLOTS; i++) {
          ctrl.inv[i] = { itemId: "rac_go", qty: 99 };
        }
        return res;
      };

      // Gửi mua Đan Hồi Huyết
      H.room.send(SECT_MSG.shopBuy, { itemId: "hoi_huyet_dan", qty: 1 });

      // Toast báo túi không đủ chỗ (bag_full)
      await waitFor(
        () => H.toasts.some((t) => t.includes("không đủ chỗ")),
        4000,
        "nhận toast túi đồ không đủ chỗ",
      );
    } finally {
      store.update = realUpdate;
    }

    // Cống hiến trong kho phải được hoàn nguyên vẹn về 200
    const sectData = JSON.parse(
      readFileSync(path.join(dataDir, "sects", `${sectId}.json`), "utf8"),
    );
    const m = sectData.members.find((x: any) => x.name === leaderName);
    expect(m.contrib).toBe(200);
    // buys không ghi nhận lượt mua
    expect(m.today?.buys?.["hoi_huyet_dan"]).toBeUndefined();
  });

  it("4. Người chơi đã gục (isDown): từ chối ngay lập tức, không trừ cống hiến", async () => {
    const leaderName = `ShopHero${++seq}`;
    const sectId = `s${seq}`;
    await seedSect(sectId, leaderName, 200, 4000);

    const H = await join(leaderName);
    await waitFor(() => lastHall(H), 4000, "ảnh chụp sectHall lúc vào");

    // Đánh gục người chơi (dead = true) VÀ đặt mốc chết = bây giờ: nếu để `deadAt` = 0 thì `tickRespawn` thấy đã quá `RESPAWN_MS` và hồi sinh ở tick kế tiếp; khi máy tải
    // tin `shopBuy` tới sau tick đó, máy chủ thấy người đã sống và cho mua (CI 17/11 04:42: 'Hết thời gian chờ toast từ chối do gục')
    playerOf(H).dead = true;
    ctrlOf(H).deadAt = worldOf(H.room).now;

    H.room.send(SECT_MSG.shopBuy, { itemId: "hoi_huyet_dan", qty: 1 });

    await waitFor(
      () => H.toasts.some((t) => t.includes("Ngươi đã gục")),
      4000,
      "toast từ chối do gục",
    );

    // Cống hiến giữ nguyên 200
    const sectData = JSON.parse(
      readFileSync(path.join(dataDir, "sects", `${sectId}.json`), "utf8"),
    );
    const m = sectData.members.find((x: any) => x.name === leaderName);
    expect(m.contrib).toBe(200);
  });

  it("5. Rời phòng giữa lúc đang lưu: giải phóng khoá busy, bảo toàn dữ liệu", async () => {
    const leaderName = `ShopHero${++seq}`;
    const sectId = `s${seq}`;
    await seedSect(sectId, leaderName, 200, 4000);

    const H = await join(leaderName);
    await waitFor(() => lastHall(H), 4000, "ảnh chụp sectHall lúc vào");

    const nha = gateSave(H.room);

    // Gửi mua 1 đan
    H.room.send(SECT_MSG.shopBuy, { itemId: "hoi_huyet_dan", qty: 1 });

    // Chờ đồ đã vào túi trong bộ nhớ
    await waitFor(
      () => ctrlOf(H).inv.some((s: any) => s?.itemId === "hoi_huyet_dan"),
      4000,
      "đồ vào túi bộ nhớ",
    );

    // Người chơi bất ngờ rời phòng giữa lúc việc lưu của shopBuy đang bị chặn
    const leaving = H.room.leave(true);
    // Nhả cổng lưu cho cả lượt lưu của shopBuy và lượt lưu khi leave
    nha();
    await leaving;
    await sleep(200);

    // Khoá busy trong hub phải được dọn sạch
    const hub = worldOf(H.room).hub;
    const soulKey = leaderName.toLowerCase().trim();
    expect(hub.sects.busy.has(soulKey)).toBe(false);

    // Tông môn lưu đúng trừ 5 cống hiến
    const sectData = JSON.parse(
      readFileSync(path.join(dataDir, "sects", `${sectId}.json`), "utf8"),
    );
    const m = sectData.members.find((x: any) => x.name === leaderName);
    expect(m.contrib).toBe(195);
  });
});
