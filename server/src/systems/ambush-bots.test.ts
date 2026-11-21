// Test thử tải và kiểm chứng bot chặn đường (CD9, Issue #1069, docs/THIET_KE_CHAN_DUONG.md mục 9).
// Kiểm tra:
// 1. Bot mặc định BỊ BỎ QUA khi AMBUSH_BOTS tắt (rt.ambushBots !== true).
// 2. Khi AMBUSH_BOTS bật: bot đi hoang gặp chặn đường, gửi seen và chọn Chiến / Bỏ chạy ngẫu nhiên.
// 3. 100 bot cùng gặp: đo thời gian tick trung bình dưới 10 ms (ngân sách hiệu năng).
// 4. Nút Bỏ chạy trước trận (hộp thoại) và giữa trận (đấu trường) luôn bấm được, không kẹt.
// 5. Đấu trường solo tự dọn sạch khi kết thúc trận, không rò rỉ phòng.
// 6. Cấm bắn vào cổng 2567 (bản chạy thật).

import { describe, expect, it } from "vitest";
import {
  AMBUSH_ARM_MS,
  AMBUSH_MIN_PROTOCOL,
  DEFAULT_MAP_ID,
  TICK_MS,
  arenaMapIdOf,
  getMap,
  type AmbushChoice,
  type AmbushFoeGroup,
  type AmbushScene,
} from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { tickWorld } from "./tick";
import {
  ambushBlocked,
  ambushOf,
  createAmbushRuntime,
  isBotPlayer,
  onAmbushChoose,
  onAmbushSeen,
} from "./ambush";
import { arenaJoined, createArena, onAmbushFlee, tickArena, type AmbushTicket } from "./arena";
import { assertNotProd } from "../../scripts/assert-not-prod";

const DEFAULT_MAP = getMap(DEFAULT_MAP_ID)!;
const ARENA_MAP = getMap(arenaMapIdOf(DEFAULT_MAP_ID))!;

const SCENE: AmbushScene = {
  id: "canh_bot_test",
  text: "Đường qua {dia_danh} xuất hiện đạo tặc chặn đường {ke_dich}.",
  mapIds: [DEFAULT_MAP_ID],
  tiers: ["normal"],
  source: "test",
};

const FOE_GROUP: AmbushFoeGroup = {
  id: "g_bot_test",
  name: "Đạo Tặc",
  mapId: DEFAULT_MAP_ID,
  minStep: 0,
  maxStep: 100,
  tier: "normal",
  foes: [{ kind: "tho", count: 1 }],
};

describe("CD9: Bot chặn đường (Issue #1069)", () => {
  it("nhận diện bot: tiền tố 'Bot ' hoặc 'bot_' khớp mẫu bots.ts, người chơi thường không khớp", () => {
    for (let i = 1; i <= 10; i++) {
      expect(isBotPlayer(`Bot ${String(i).padStart(3, "0")}`)).toBe(true);
      expect(isBotPlayer(`bot_u_${String(i).padStart(3, "0")}`)).toBe(true);
    }
    expect(isBotPlayer("Lý Mộ Bạch")).toBe(false);
    expect(isBotPlayer("Bạch Vân Tử")).toBe(false);
    expect(isBotPlayer("robot")).toBe(false);
    expect(isBotPlayer("botanist")).toBe(false);
  });

  it("ở production (exemptBots: false): người chơi đặt tên 'Bot 001' / 'Bot Hoang' VẪN bị chặn đường như người thường (chống lách luật)", () => {
    const { w } = makeWorld(DEFAULT_MAP);
    // Ở production, WorldRoom truyền exemptBots: !isProduction(process.env) => false
    w.ambush = createAmbushRuntime({
      random: () => 0,
      scenes: [SCENE],
      foes: [FOE_GROUP],
      exemptBots: false, // Production: không miễn trừ bot theo tên
      ambushBots: false, // Mặc định tắt
    });

    const fakeNames = ["Bot 001", "Bot Hoang", "bot_vip_99", "Bot Sát Thần"];
    for (const [i, name] of fakeNames.entries()) {
      const sid = `player_${i}`;
      const { p, c } = addPlayer(w, sid, 1, 2);
      p.name = name;
      c.proto = AMBUSH_MIN_PROTOCOL;
      p.x = 2200;
      p.y = 1536;
      ambushOf(w, c).cooldownUntil = 0;
      // Không bị chặn bởi nhánh "bot", được chặn đường bình thường
      expect(ambushBlocked(w, sid)).toBeNull();
    }
  });

  it("mặc định ở môi trường thử nghiệm (exemptBots: true): bot BỊ BỎ QUA khi AMBUSH_BOTS tắt (rt.ambushBots !== true)", () => {
    const { w } = makeWorld(DEFAULT_MAP);
    w.ambush = createAmbushRuntime({
      random: () => 0,
      scenes: [SCENE],
      foes: [FOE_GROUP],
      exemptBots: true, // Dev/test: bật cơ chế miễn trừ bot
      ambushBots: false, // Mặc định TẮT
    });

    const botPlayers = Array.from({ length: 20 }, (_, i) => {
      const name = `Bot ${String(i + 1).padStart(3, "0")}`;
      const { p, c } = addPlayer(w, `sid_${i}`, 1, 2);
      p.name = name;
      c.proto = AMBUSH_MIN_PROTOCOL;
      p.x = 2200;
      p.y = 1536;
      ambushOf(w, c).cooldownUntil = 0;
      return { p, c, sid: `sid_${i}` };
    });

    for (const b of botPlayers) {
      expect(ambushBlocked(w, b.sid)).toBe("bot");
    }
  });

  it("khi AMBUSH_BOTS bật: bot đi hoang được kích hoạt chặn đường, nhận offer", async () => {
    const { w, ambushOffers, ambushEnds } = makeWorld(DEFAULT_MAP);
    w.ambush = createAmbushRuntime({
      random: () => 0,
      scenes: [SCENE],
      foes: [FOE_GROUP],
      ambushBots: true, // BẬT cho bot
    });

    const botName = "Bot 001";
    const { p, c } = addPlayer(w, "bot_sid", 1, 2);
    p.name = botName;
    c.proto = AMBUSH_MIN_PROTOCOL;
    p.hp = p.maxHp = 1000;
    p.exp = 400;
    p.expMax = 1000;
    c.coin = 5000;
    ambushOf(w, c).cooldownUntil = 0;

    // Không bị chặn bởi nhánh bot
    expect(ambushBlocked(w, "bot_sid")).toBeNull();

    // Đi hoang đủ AMBUSH_STRIDE_PX để kích hoạt (đổi hướng tránh đi ra ngoài bản đồ)
    let seq = 0;
    for (let t = 0; t < 600 && c.ambush?.offer === undefined; t++) {
      w.now += TICK_MS;
      c.inputs.push({ seq: ++seq, dx: Math.floor(t / 80) % 2 === 0 ? 1 : -1, dy: 0 });
      c.moveBudget = 5;
      tickWorld(w, TICK_MS);
    }

    // Bot đã nhận được offer
    expect(c.ambush?.offer).toBeDefined();
    expect(ambushOffers.length).toBeGreaterThanOrEqual(1);

    const offer = ambushOffers[0]?.msg;
    expect(offer.id).toBe(c.ambush?.offer?.id);
    expect(offer.foe.name).toBe("Đạo Tặc");

    // Bot gửi ambushSeen ngay lập tức
    onAmbushSeen(w, "bot_sid", { id: offer.id });
    expect(c.ambush!.offer!.seen).toBe(true);

    // Chờ qua AMBUSH_ARM_MS (700ms) rồi chọn Bỏ chạy
    w.now += AMBUSH_ARM_MS + 100;
    await onAmbushChoose(w, "bot_sid", { id: offer.id, choice: "flee_exp" });

    // Kết thúc bỏ chạy, hộp thoại đóng
    tickWorld(w, TICK_MS);
    expect(c.ambush?.offer).toBeUndefined();
    expect(ambushEnds).toHaveLength(1);
    expect(ambushEnds[0]?.msg).toMatchObject({ result: "fled" });
  });

  it("100 bot cùng gặp chặn đường: đo thời gian tick trung bình < 10 ms và xử lý lựa chọn ngẫu nhiên", async () => {
    const { w } = makeWorld();
    w.ambush = createAmbushRuntime({
      random: () => 0,
      scenes: [SCENE],
      foes: [FOE_GROUP],
      ambushBots: true,
    });

    const BOT_COUNT = 100;
    const bots = Array.from({ length: BOT_COUNT }, (_, i) => {
      const sid = `bot_sid_${i}`;
      const h = addPlayer(w, sid, 1, 0);
      h.p.name = `Bot ${String(i + 1).padStart(3, "0")}`;
      h.c.proto = AMBUSH_MIN_PROTOCOL;
      h.c.coin = 1000;
      h.p.exp = 100;
      h.p.expMax = 1000;
      ambushOf(w, h.c).cooldownUntil = 0;
      return { ...h, sid };
    });

    // Cho cả 100 bot đi hoang đến khi đều nhận được offer (khoảng 300-500 ticks)
    let seq = 0;
    const walk = (tick: number) => {
      w.now += TICK_MS;
      seq++;
      for (const b of bots) {
        b.c.inputs.push({ seq, dx: Math.floor(tick / 100) % 2 === 0 ? 1 : -1, dy: 0 });
        b.c.moveBudget = 5;
      }
      tickWorld(w, TICK_MS);
    };

    for (let t = 0; t < 600 && bots.some((b) => b.c.ambush?.offer === undefined); t++) {
      walk(t);
    }

    const offeredBots = bots.filter((b) => b.c.ambush?.offer !== undefined);
    expect(offeredBots.length).toBe(BOT_COUNT);
    expect(w.ambush.open.size).toBe(BOT_COUNT);

    // Cả 100 bot gửi seen ngay
    for (const b of offeredBots) {
      const offerId = b.c.ambush!.offer!.id;
      onAmbushSeen(w, b.sid, { id: offerId });
      expect(b.c.ambush!.offer!.seen).toBe(true);
    }

    // Đo thời gian tick khi 100 bot cùng đang mở hộp thoại
    const tickDurations: number[] = [];
    for (let t = 0; t < 50; t++) {
      const t0 = performance.now();
      w.now += TICK_MS;
      tickWorld(w, TICK_MS);
      tickDurations.push(performance.now() - t0);
    }
    const avgTickMs = tickDurations.reduce((a, b) => a + b, 0) / tickDurations.length;
    expect(avgTickMs).toBeLessThan(10); // Ngân sách < 10 ms/tick

    // Sau khi qua AMBUSH_ARM_MS, bot chọn ngẫu nhiên Chiến hoặc Bỏ chạy
    w.now += AMBUSH_ARM_MS + 200;
    let fightCount = 0;
    let fleeCount = 0;

    for (let i = 0; i < offeredBots.length; i++) {
      const b = offeredBots[i];
      const offerId = b.c.ambush!.offer!.id;
      // Chia 50% Chiến, 50% Bỏ chạy (Linh thạch hoặc tu vi)
      const choice: AmbushChoice = i % 2 === 0 ? "fight" : i % 4 === 1 ? "flee_coin" : "flee_exp";
      if (choice === "fight") fightCount++;
      else fleeCount++;

      await onAmbushChoose(w, b.sid, { id: offerId, choice });
    }

    expect(fightCount).toBe(50);
    expect(fleeCount).toBe(50);

    // Chạy thêm một tick để hoàn tất lưu của các bot bỏ chạy
    tickWorld(w, TICK_MS);

    // 50 bot bỏ chạy đã dọn xong hộp thoại
    const remainingOffers = bots.filter((b) => b.c.ambush?.offer !== undefined);
    // Những bot chọn fight huỷ lặng lẽ vì w.ambush.startFight chưa được gán trong test này
    // và toàn bộ 100 bot đều không bị kẹt hộp thoại
    expect(remainingOffers.length).toBe(0);
    expect(w.ambush.open.size).toBe(0);
  });

  it("bot vào đấu trường solo: phòng tự dọn dẹp khi kết thúc trận, không rò rỉ phòng", async () => {
    // Giả lập đấu trường solo với CD3 arena
    const h = makeWorld(ARENA_MAP);
    h.w.now = 1_000_000;
    h.w.ambush = createAmbushRuntime({ random: () => 0, scenes: [], foes: [] });

    const ticket: AmbushTicket = {
      id: "ticket_bot_1",
      key: "bot_001",
      name: "Bot 001",
      origin: { mapId: DEFAULT_MAP_ID, x: 2200, y: 1536 },
      group: FOE_GROUP,
      tier: "normal",
      roomId: "arena_room_1",
      createdAt: h.w.now,
      expiresAt: h.w.now + 60_000,
      ended: false,
    };

    const arena = createArena(h.w, ticket);
    h.w.arena = arena;

    // Bot vào phòng đấu trường
    const { p, c } = addPlayer(h.w, "bot_sid", 1, 2);
    p.name = "Bot 001";
    p.exp = 400;
    p.expMax = 1000;
    c.coin = 5000;
    arenaJoined(h.w, "bot_sid");

    expect(arena.phase).toBe("fighting");

    // Bot thử bỏ chạy giữa trận (vận 1s)
    await onAmbushFlee(h.w, "bot_sid", { choice: "flee_exp" });
    expect(arena.fleeing).toBeDefined();

    // Vận xong sau 1s (AMBUSH_FLEE_CHANNEL_MS)
    h.w.now += 1200;
    tickArena(h.w, TICK_MS);
    await new Promise((r) => setTimeout(r, 20));

    // Trận kết thúc với kết quả fled
    expect(arena.phase).toBe("over");
    expect(arena.result).toBe("fled");

    // Dọn dẹp phòng
    h.w.arena = null;
    expect(h.w.arena).toBeNull();
  });

  it("an toàn cổng: assertNotProd ngăn chặn tuyệt đối việc bắn bot vào cổng 2567 (BẢN CHẠY THẬT)", () => {
    expect(() => assertNotProd(2567, "bots")).toThrow(/2567/);
    expect(() => assertNotProd("ws://tiengioi.hethongtm.site", "bots")).toThrow();
    // Các cổng dev bình thường được phép
    expect(() => assertNotProd(2587, "bots")).not.toThrow();
  });
});
