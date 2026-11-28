// Gặp chặn đường, phần KÍCH HOẠT + HỘP THOẠI phía server (mục 52, docs/THIET_KE_CHAN_DUONG.md mục 4, 6.1, 6.2; CD2 #1062): `ambushBlocked` từng nhánh, quãng đi thật, tung xúc xắc
// tiêm `random`, hồi + trần ngày, giá CHỐT, khoá nhân vật, bỏ chạy (trừ -> LƯU -> đóng), rớt mạng đóng băng, thoát = bỏ chạy bằng tu vi. World giả, đồng hồ `w.now` điều khiển tay.
import { describe, expect, it } from "vitest";
import {
  AMBUSH_ARM_MS,
  AMBUSH_CALM_MS,
  AMBUSH_COOLDOWN_MS,
  AMBUSH_DAY_CAP,
  AMBUSH_FOE_LEVEL_CAP,
  AMBUSH_FLEE_MIN_COIN,
  AMBUSH_LOGIN_COOLDOWN_MS,
  AMBUSH_MIN_HP_PCT,
  AMBUSH_MIN_PROTOCOL,
  AMBUSH_OFFER_MS,
  AMBUSH_RETURN_GRACE_MS,
  AMBUSH_SEEN_MS,
  AMBUSH_STRIDE_PX,
  DEFAULT_MAP,
  TICK_MS,
  ambushRollP,
  dayKey,
  type AmbushFoeGroup,
  type AmbushScene,
  stepOf,
} from "@tien-gioi/shared";
import { applyInputs } from "./movement";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { tickWorld } from "./tick";
import {
  AMBUSH_PARTY_NEAR_PX,
  AMBUSH_TELEPORT_PX,
  ambushBlocked,
  ambushDropOffer,
  ambushLeftToday,
  ambushOf,
  ambushPause,
  ambushPriceOf,
  ambushResend,
  applyReturnGrace,
  AMBUSH_RETURN_WINDOW_MS,
  createAmbushRuntime,
  isBotPlayer,
  onAmbushChoose,
  onAmbushSeen,
  pickAmbush,
  protoOf,
  rollAmbush,
  sanitizeAmbushDaily,
  sanitizeAmbushUntil,
  tickAmbush,
  trackAmbushWalk,
} from "./ambush";

const MAP_ID = DEFAULT_MAP.def.id;
const T0 = Date.UTC(2026, 10, 17, 5, 0, 0);

const SCENE: AmbushScene = {
  id: "canh_thu",
  text: "Đường qua {dia_danh} bỗng vắng hẳn, {ke_dich} lao ra chắn trước mặt.",
  mapIds: [MAP_ID],
  tiers: ["normal", "elite", "leader"],
  source: "test",
};
const NORMAL: AmbushFoeGroup = {
  id: "bay_thuong",
  name: "Sói Hoang",
  mapId: MAP_ID,
  minStep: 0,
  maxStep: 40,
  tier: "normal",
  foes: [{ kind: "tho", count: 2 }],
};
const ELITE: AmbushFoeGroup = {
  ...NORMAL,
  id: "bay_tinh_anh",
  name: "Sói Tinh Anh",
  tier: "elite",
};

interface Opts {
  /** Dãy số cho `random` (hết dãy thì 0.99: không trúng). Mặc định 0: luôn trúng, luôn chọn phần tử đầu. */
  rolls?: number[];
  foes?: readonly AmbushFoeGroup[];
  scenes?: readonly AmbushScene[];
}

function setup(opts: Opts = {}) {
  const h = makeWorld();
  const { w } = h;
  w.now = T0;
  const rolls = opts.rolls ? [...opts.rolls] : null;
  w.ambush = createAmbushRuntime({
    random: () => (rolls ? (rolls.shift() ?? 0.99) : 0),
    scenes: opts.scenes ?? [SCENE],
    foes: opts.foes ?? [NORMAL],
  });
  const { p, c } = addPlayer(w, "a", 1, 2);
  c.proto = AMBUSH_MIN_PROTOCOL;
  p.exp = 400;
  p.expMax = 1000;
  c.coin = 5000;
  // Hết hồi mở đầu: các test không liên quan tới hồi muốn bị chặn được ngay
  ambushOf(w, c).cooldownUntil = 0;
  return { ...h, w, p, c, sid: "a" };
}

/** Mở một hộp thoại thật (đi vào `openOffer` qua `rollAmbush`) và trả lời đề nghị. */
function openOne(s: ReturnType<typeof setup>) {
  expect(rollAmbush(s.w, s.sid, s.p, s.c)).toBe(true);
  const o = s.c.ambush!.offer!;
  expect(o).toBeDefined();
  return o;
}

describe("ambushBlocked: từng nhánh của mục 4.2 (không kích hoạt SAI lúc)", () => {
  it("nền: người chơi bình thường ở vùng hoang, đủ máu, yên, có hộp thoại: KHÔNG bị chặn", () => {
    const { w, sid } = setup();
    expect(ambushBlocked(w, sid)).toBeNull();
  });

  it("off: tính năng tắt (World.ambush === null) hoặc không còn trong phòng", () => {
    const s = setup();
    s.w.ambush = null;
    expect(ambushBlocked(s.w, s.sid)).toBe("off");
    const t = setup();
    expect(ambushBlocked(t.w, "khong_co")).toBe("off");
  });

  it("protocol: client cũ (v < AMBUSH_MIN_PROTOCOL) hoặc chưa khai v", () => {
    const s = setup();
    s.c.proto = AMBUSH_MIN_PROTOCOL - 1;
    expect(ambushBlocked(s.w, s.sid)).toBe("protocol");
    s.c.proto = undefined;
    expect(ambushBlocked(s.w, s.sid)).toBe("protocol");
    s.c.proto = AMBUSH_MIN_PROTOCOL;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
  });

  it("bot: ở production (exemptBots: false, mặc định) người chơi đặt tên Bot VẪN bị chặn đường bình thường (chống lách luật)", () => {
    const s = setup();
    // createAmbushRuntime mặc định exemptBots: false
    expect(s.w.ambush!.exemptBots).toBe(false);
    s.p.name = "Bot 001";
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    s.p.name = "Bot Hoang";
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    s.p.name = "bot_vip_99";
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
  });

  it("bot: ở môi trường thử nghiệm (exemptBots: true) tài khoản bot mặc định bị bỏ qua, trừ khi AMBUSH_BOTS bật", () => {
    const s = setup();
    s.w.ambush!.exemptBots = true;
    s.p.name = "Bot 001";
    expect(ambushBlocked(s.w, s.sid)).toBe("bot");
    s.p.name = "bot_u_042";
    expect(ambushBlocked(s.w, s.sid)).toBe("bot");
    // Khi bật ambushBots
    s.w.ambush!.ambushBots = true;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    // Người chơi bình thường không bị coi là bot dù rt.ambushBots tắt
    s.w.ambush!.ambushBots = false;
    s.p.name = "Thanh Vân Tử";
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    s.p.name = "botanist";
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
  });

  it("isBotPlayer: nhận diện đúng tiền tố Bot hoặc bot_", () => {
    expect(isBotPlayer("Bot 001")).toBe(true);
    expect(isBotPlayer("bot 999")).toBe(true);
    expect(isBotPlayer("bot_u_123")).toBe(true);
    expect(isBotPlayer("  BOT_xyz  ")).toBe(true);
    expect(isBotPlayer("botanist")).toBe(false);
    expect(isBotPlayer("robot")).toBe(false);
    expect(isBotPlayer("Thanh Vân Tử")).toBe(false);
  });

  it("run: phòng bí cảnh / đấu trường (World.runId !== null)", () => {
    const s = setup();
    s.w.runId = "run-1";
    expect(ambushBlocked(s.w, s.sid)).toBe("run");
  });

  it("dead: đã chết / đang nằm", () => {
    const s = setup();
    s.p.dead = true;
    expect(ambushBlocked(s.w, s.sid)).toBe("dead");
  });

  it("limbo: đang ở Hoàng Tuyền", () => {
    const s = setup();
    s.c.limbo = {
      endedLifeId: "x",
      summary: {} as never,
      keepable: [],
      engravable: [],
      coinAtDeath: 0,
      counts: true,
      credited: false,
    };
    expect(ambushBlocked(s.w, s.sid)).toBe("limbo");
  });

  it("ghost: hồn lìa xác (rớt mạng) và im lặng (socket đứng)", () => {
    const s = setup();
    s.w.ghosts.add(s.sid);
    expect(ambushBlocked(s.w, s.sid)).toBe("ghost");
    s.w.ghosts.delete(s.sid);
    s.c.silent = true;
    expect(ambushBlocked(s.w, s.sid)).toBe("ghost");
  });

  it("travel: đang chuyển phòng, hoặc còn trong hồi qua cổng", () => {
    const s = setup();
    s.c.travelling = true;
    expect(ambushBlocked(s.w, s.sid)).toBe("travel");
    s.c.travelling = false;
    s.c.save.travelAt = s.w.now - 1000;
    expect(ambushBlocked(s.w, s.sid)).toBe("travel");
    s.c.save.travelAt = s.w.now - 10_000;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
  });

  it("duel: đang thách đấu PK", () => {
    const s = setup();
    s.w.duels.has = (sid: string) => sid === s.sid;
    expect(ambushBlocked(s.w, s.sid)).toBe("duel");
  });

  it("offer: đã có hộp thoại đang mở", () => {
    const s = setup();
    openOne(s);
    expect(ambushBlocked(s.w, s.sid)).toBe("offer");
  });

  it("safe: trong trấn và trong tầm một cổng", () => {
    const s = setup();
    s.p.x = s.w.map.townPx.x;
    s.p.y = s.w.map.townPx.y;
    expect(ambushBlocked(s.w, s.sid)).toBe("safe");
    const portal = s.w.map.portals[0];
    if (portal) {
      s.p.x = portal.x;
      s.p.y = portal.y;
      expect(ambushBlocked(s.w, s.sid)).toBe("safe");
    }
  });

  it("hp: dưới AMBUSH_MIN_HP_PCT thì chặn, đúng ngưỡng thì cho", () => {
    const s = setup();
    s.p.maxHp = 1000;
    s.p.hp = (1000 * AMBUSH_MIN_HP_PCT) / 100 - 1;
    expect(ambushBlocked(s.w, s.sid)).toBe("hp");
    s.p.hp = (1000 * AMBUSH_MIN_HP_PCT) / 100;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
  });

  it("potion (AMBUSH_MIN_POTIONS, CD6c): túi có ít đan hồi huyết hơn ngưỡng thì KHÔNG chặn đường; đủ thì cho; mặc định (vắng / 0) không đòi; cộng mọi ô, mọi bậc đan (thường / Đại / Thượng)", () => {
    const s = setup();
    s.c.inv.fill(null);
    // mặc định: không đòi, túi trống vẫn bị chặn được
    expect(s.w.ambush!.minPotions).toBeUndefined();
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    s.w.ambush!.minPotions = 0;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    s.w.ambush!.minPotions = 2;
    expect(ambushBlocked(s.w, s.sid)).toBe("potion"); // túi trống
    s.c.inv[0] = { itemId: "hoi_huyet_dan", qty: 1 };
    expect(ambushBlocked(s.w, s.sid)).toBe("potion"); // 1 < 2
    s.c.inv[3] = { itemId: "hoi_huyet_dan", qty: 1 }; // cộng cả hai ô
    expect(ambushBlocked(s.w, s.sid)).toBeNull(); // 2 >= 2
    // đan Đại / Thượng (người Kim Đan trở lên) CŨNG tính: không bị coi là 'không đan' (B, review #1257)
    s.c.inv[3] = { itemId: "dai_hoi_huyet_dan", qty: 1 };
    expect(ambushBlocked(s.w, s.sid)).toBeNull(); // 1 thường + 1 Đại
    s.c.inv[0] = null;
    s.c.inv[3] = { itemId: "thuong_hoi_huyet_dan", qty: 2 };
    expect(ambushBlocked(s.w, s.sid)).toBeNull(); // chỉ Thượng x2
    s.c.inv[3] = { itemId: "thuong_hoi_huyet_dan", qty: 1 };
    expect(ambushBlocked(s.w, s.sid)).toBe("potion"); // 1 < 2
    // đan KHÔNG hồi khí huyết (hồi linh lực) và id lạ KHÔNG tính
    s.c.inv[0] = { itemId: "hoi_linh_dan", qty: 5 };
    s.c.inv[1] = { itemId: "constructor", qty: 5 };
    s.c.inv[2] = { itemId: "khong_co_vat_pham_nay", qty: 5 };
    expect(ambushBlocked(s.w, s.sid)).toBe("potion");
    s.c.inv[0] = { itemId: "hoi_huyet_dan", qty: Number.NaN }; // số rác coi là 0
    s.c.inv[1] = null;
    s.c.inv[2] = null;
    s.c.inv[3] = null;
    s.w.ambush!.minPotions = 1;
    expect(ambushBlocked(s.w, s.sid)).toBe("potion");
    // rollAmbush cũng không mở hộp thoại cho người thiếu đan
    s.c.inv[0] = null;
    expect(rollAmbush(s.w, s.sid, s.p, s.c)).toBe(false);
    expect(s.c.ambush?.offer).toBeUndefined();
    s.c.inv[0] = { itemId: "dai_hoi_huyet_dan", qty: 1 };
    expect(rollAmbush(s.w, s.sid, s.p, s.c)).toBe(true);
  });

  it("combat: bị đánh / vừa đánh trong AMBUSH_CALM_MS, hoặc có quái đang nhắm; hết thời gian thì cho", () => {
    const s = setup();
    s.c.lastHitAt = s.w.now - (AMBUSH_CALM_MS - 1);
    expect(ambushBlocked(s.w, s.sid)).toBe("combat");
    s.c.lastHitAt = s.w.now - AMBUSH_CALM_MS;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    s.c.lastDealtAt = s.w.now - (AMBUSH_CALM_MS - 1);
    expect(ambushBlocked(s.w, s.sid)).toBe("combat");
    s.c.lastDealtAt = s.w.now - AMBUSH_CALM_MS;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    const { mc } = addMonster(s.w, "tho", s.p.x + 600, s.p.y);
    mc.target = s.sid;
    expect(ambushBlocked(s.w, s.sid)).toBe("combat");
  });

  it("party_combat: đồng đội trong AMBUSH_PARTY_NEAR_PX đang giao chiến thì chặn; ở xa hoặc không cùng đội thì không", () => {
    const s = setup();
    const b = addPlayer(s.w, "b", 1, 2);
    b.p.x = s.p.x + AMBUSH_PARTY_NEAR_PX - 10;
    b.p.y = s.p.y;
    b.c.lastHitAt = s.w.now;
    expect(ambushBlocked(s.w, s.sid)).toBeNull(); // chưa cùng đội
    s.w.parties._create("a", "b");
    expect(ambushBlocked(s.w, s.sid)).toBe("party_combat");
    b.p.x = s.p.x + AMBUSH_PARTY_NEAR_PX + 10;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
  });

  it("boss: trùm còn sống trong tầm đánh thức thì chặn; trùm ở xa thì không (trùm đang nhắm đã bị nhánh combat bắt trước)", () => {
    const s = setup();
    const far = addMonster(s.w, "tho", s.p.x + 5000, s.p.y);
    far.mc.def = { ...far.mc.def, boss: true };
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    const near = addMonster(s.w, "tho", s.p.x + 500, s.p.y);
    near.mc.def = { ...near.mc.def, boss: true };
    expect(ambushBlocked(s.w, s.sid)).toBe("boss");
    near.m.hp = 0; // đã chết: không còn là mối đe doạ
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
  });

  it("event: sự kiện đặc biệt đang diễn ra (eventBusy)", () => {
    const s = setup();
    s.w.ambush!.eventBusy = () => true;
    expect(ambushBlocked(s.w, s.sid)).toBe("event");
  });

  it("cooldown: còn hồi thì chặn, hết thì cho (biên: đúng mốc)", () => {
    const s = setup();
    ambushOf(s.w, s.c).cooldownUntil = s.w.now + 1;
    expect(ambushBlocked(s.w, s.sid)).toBe("cooldown");
    ambushOf(s.w, s.c).cooldownUntil = s.w.now;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
  });

  it("day_cap: hết AMBUSH_DAY_CAP lần hôm nay thì chặn; sang ngày mới thì đủ lại", () => {
    const s = setup();
    s.c.save.ambushDaily = { day: dayKey(s.w.now), n: AMBUSH_DAY_CAP - 1 };
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
    s.c.save.ambushDaily = { day: dayKey(s.w.now), n: AMBUSH_DAY_CAP };
    expect(ambushBlocked(s.w, s.sid)).toBe("day_cap");
    s.w.now += 24 * 3_600_000;
    ambushOf(s.w, s.c).cooldownUntil = 0;
    expect(ambushBlocked(s.w, s.sid)).toBeNull();
  });
});

describe("hồ sơ: ambushDaily / ambushUntil làm sạch, hồi lúc vào phòng", () => {
  it("sanitizeAmbushDaily: chỉ nhận { day thật, n nguyên 0..AMBUSH_DAY_CAP }", () => {
    expect(sanitizeAmbushDaily({ day: "2026-11-17", n: 3 })).toEqual({ day: "2026-11-17", n: 3 });
    expect(sanitizeAmbushDaily({ day: "2026-11-17", n: AMBUSH_DAY_CAP })).toBeDefined();
    for (const bad of [
      null,
      undefined,
      [],
      "x",
      7,
      { day: "2026-02-30", n: 1 },
      { day: "17-11-2026", n: 1 },
      { day: "2026-11-17", n: -1 },
      { day: "2026-11-17", n: 1.5 },
      { day: "2026-11-17", n: AMBUSH_DAY_CAP + 1 },
      { day: "2026-11-17", n: "3" },
      { n: 1 },
    ])
      expect(sanitizeAmbushDaily(bad), JSON.stringify(bad)).toBeUndefined();
  });

  it("sanitizeAmbushUntil: hữu hạn, không âm, kẹp ở now + AMBUSH_COOLDOWN_MS (file hỏng không treo hồi vô hạn)", () => {
    expect(sanitizeAmbushUntil(T0 + 1000, T0)).toBe(T0 + 1000);
    expect(sanitizeAmbushUntil(-5, T0)).toBe(0);
    expect(sanitizeAmbushUntil(T0 * 10, T0)).toBe(T0 + AMBUSH_COOLDOWN_MS);
    for (const bad of [Number.NaN, Infinity, "1", null, undefined, {}])
      expect(sanitizeAmbushUntil(bad, T0)).toBeUndefined();
  });

  it("ambushLeftToday: ngày khác coi như đủ; số lạ trong hồ sơ coi như chưa dùng", () => {
    const s = setup();
    expect(ambushLeftToday(s.c, s.w.now)).toBe(AMBUSH_DAY_CAP);
    s.c.save.ambushDaily = { day: dayKey(s.w.now), n: 5 };
    expect(ambushLeftToday(s.c, s.w.now)).toBe(AMBUSH_DAY_CAP - 5);
    s.c.save.ambushDaily = { day: "2020-01-01", n: AMBUSH_DAY_CAP };
    expect(ambushLeftToday(s.c, s.w.now)).toBe(AMBUSH_DAY_CAP);
    s.c.save.ambushDaily = { day: dayKey(s.w.now), n: 999 };
    expect(ambushLeftToday(s.c, s.w.now)).toBe(AMBUSH_DAY_CAP);
  });

  it("vào phòng: chưa bị chặn trong AMBUSH_LOGIN_COOLDOWN_MS; mốc đã lưu dài hơn thì giữ mốc đó (đăng nhập lại / qua cổng KHÔNG xoá hồi)", () => {
    const h = makeWorld();
    h.w.now = T0;
    h.w.ambush = createAmbushRuntime({ random: () => 0, scenes: [SCENE], foes: [NORMAL] });
    const a = addPlayer(h.w, "a");
    expect(ambushOf(h.w, a.c).cooldownUntil).toBe(T0 + AMBUSH_LOGIN_COOLDOWN_MS);
    const b = addPlayer(h.w, "b");
    b.c.save.ambushUntil = T0 + AMBUSH_COOLDOWN_MS - 1000;
    expect(ambushOf(h.w, b.c).cooldownUntil).toBe(T0 + AMBUSH_COOLDOWN_MS - 1000);
    const c = addPlayer(h.w, "c");
    c.c.save.ambushUntil = T0 + 1000; // ngắn hơn hồi đăng nhập: không rút ngắn
    expect(ambushOf(h.w, c.c).cooldownUntil).toBe(T0 + AMBUSH_LOGIN_COOLDOWN_MS);
  });

  it("ambushPause (vừa đầu thai) chỉ kéo dài hồi, không bao giờ rút ngắn", () => {
    const s = setup();
    ambushOf(s.w, s.c).cooldownUntil = s.w.now + 100_000;
    ambushPause(s.w, s.c, 50_000);
    expect(s.c.ambush!.cooldownUntil).toBe(s.w.now + 100_000);
    ambushPause(s.w, s.c, 200_000);
    expect(s.c.ambush!.cooldownUntil).toBe(s.w.now + 200_000);
  });

  it("protoOf: chỉ nhận số nguyên 0..999", () => {
    expect(protoOf(6)).toBe(6);
    expect(protoOf(0)).toBe(0);
    for (const bad of [-1, 1000, 1.5, "6", null, undefined, Number.NaN, Infinity])
      expect(protoOf(bad)).toBeUndefined();
  });
});

describe("chọn cảnh + bầy (pickAmbush)", () => {
  const rt = (rolls: number[], foes: readonly AmbushFoeGroup[], scenes = [SCENE]) => {
    const q = [...rolls];
    return { random: () => q.shift() ?? 0, scenes, foes };
  };

  it("bảng rỗng / sai bản đồ / sai bậc: không chọn gì (lần tung bị bỏ)", () => {
    expect(pickAmbush(rt([], []), MAP_ID, 3)).toBeNull();
    expect(pickAmbush(rt([], [NORMAL]), "ban_do_khac", 3)).toBeNull();
    expect(pickAmbush(rt([], [NORMAL]), MAP_ID, 41)).toBeNull();
    expect(pickAmbush(rt([], [NORMAL], []), MAP_ID, 3)).toBeNull(); // có bầy nhưng không cảnh nào hợp
  });

  it("chỉ chọn mức có CẢ cảnh lẫn bầy; theo trọng số trong số mức có", () => {
    const only = { ...SCENE, tiers: ["elite" as const] };
    // chỉ elite có cảnh: dù random thấp vẫn ra elite
    expect(pickAmbush(rt([0], [NORMAL, ELITE], [only]), MAP_ID, 3)?.group.tier).toBe("elite");
    // đủ cảnh cho cả hai mức: normal 70, elite 25 (tổng 95): 0 -> normal, 0.99 -> elite
    expect(pickAmbush(rt([0], [NORMAL, ELITE]), MAP_ID, 3)?.group.tier).toBe("normal");
    expect(pickAmbush(rt([0.99], [NORMAL, ELITE]), MAP_ID, 3)?.group.tier).toBe("elite");
  });

  it("MỤC 53 (bị hạ = chết thật): KHÔNG BAO GIỜ chọn bầy có loài mạnh vượt cảnh giới người chơi (dây an toàn thứ hai ngoài ambushViolations)", () => {
    const wide = (kind: string): AmbushFoeGroup => ({
      ...NORMAL,
      minStep: 0,
      maxStep: 200,
      foes: [{ kind, count: 1 }],
    });
    const step = (realm: number) => stepOf(realm, 0);
    // Hắc Hổ (cấp 7): vừa Luyện Khí (trần 7), quá sức Phàm Nhân (trần 1)
    expect(pickAmbush(rt([], [wide("ho")]), MAP_ID, step(0))).toBeNull();
    expect(pickAmbush(rt([], [wide("ho")]), MAP_ID, step(1))).not.toBeNull();
    // Xích Mãng (cấp 12): quá sức Luyện Khí, vừa Trúc Cơ
    expect(pickAmbush(rt([], [wide("mang")]), MAP_ID, step(1))).toBeNull();
    expect(pickAmbush(rt([], [wide("mang")]), MAP_ID, step(2))).not.toBeNull();
    // Hắc Giao (cấp 18): chỉ từ Nguyên Anh; Thiên Hàn Vương (21) không bao giờ
    expect(pickAmbush(rt([], [wide("hac_giao")]), MAP_ID, step(3))).toBeNull();
    expect(pickAmbush(rt([], [wide("hac_giao")]), MAP_ID, step(4))).not.toBeNull();
    expect(pickAmbush(rt([], [wide("thien_han_vuong")]), MAP_ID, step(4))).toBeNull();
    // Hóa Thần đã khai trần 21 (A1 #1461): bầy yếu hợp lệ, Thiên Hàn Vương (cấp 21) cũng hợp lệ ở Hóa Thần (nhưng KHÔNG ở Nguyên Anh, đã kiểm ở trên)
    expect(pickAmbush(rt([], [wide("lang")]), MAP_ID, step(5))).not.toBeNull();
    expect(pickAmbush(rt([], [wide("thien_han_vuong")]), MAP_ID, step(5))).not.toBeNull();
    // cảnh giới chưa khai trần: không chọn gì (gỡ tạm khoá 5 để thử nhánh phòng thủ, trả lại ngay)
    const capTable = AMBUSH_FOE_LEVEL_CAP as Record<number, number>;
    const saved5 = capTable[5];
    delete capTable[5];
    try {
      expect(pickAmbush(rt([], [wide("lang")]), MAP_ID, step(5))).toBeNull();
    } finally {
      capTable[5] = saved5!;
    }
    expect(pickAmbush(rt([], [wide("lang")]), MAP_ID, step(5))).not.toBeNull();
    // loài lạ trong bảng: không chọn (không ném lỗi)
    expect(pickAmbush(rt([], [wide("khong_co")]), MAP_ID, step(1))).toBeNull();
    // chỉ một loài quá sức trong bầy cũng loại cả bầy
    const mixed = {
      ...wide("lang"),
      foes: [
        { kind: "lang", count: 1 },
        { kind: "mang", count: 1 },
      ],
    };
    expect(pickAmbush(rt([], [mixed]), MAP_ID, step(1))).toBeNull();
    // còn bầy khác hợp thì chọn bầy đó
    expect(pickAmbush(rt([0], [mixed, wide("lang")]), MAP_ID, step(1))?.group.foes[0]?.kind).toBe(
      "lang",
    );
  });

  it("khoảng bậc là gồm cả hai đầu", () => {
    const g = { ...NORMAL, minStep: 5, maxStep: 7 };
    expect(pickAmbush(rt([], [g]), MAP_ID, 4)).toBeNull();
    expect(pickAmbush(rt([], [g]), MAP_ID, 5)).not.toBeNull();
    expect(pickAmbush(rt([], [g]), MAP_ID, 7)).not.toBeNull();
    expect(pickAmbush(rt([], [g]), MAP_ID, 8)).toBeNull();
  });
});

describe("tung xúc xắc (rollAmbush): random tiêm vào, xác suất theo độ nguy hiểm", () => {
  it("random dưới p thì trúng, bằng / trên p thì không", () => {
    const probe = setup();
    const p = ambushRollP(probe.w.map.dangerAt(probe.p.x, probe.p.y));
    expect(p).toBeGreaterThan(0);
    const miss = setup({ rolls: [p] }); // đúng p: KHÔNG trúng (so sánh `>=`)
    expect(rollAmbush(miss.w, miss.sid, miss.p, miss.c)).toBe(false);
    expect(miss.ambushOffers).toHaveLength(0);
    const hit = setup({ rolls: [p - 1e-9, 0, 0, 0] });
    expect(rollAmbush(hit.w, hit.sid, hit.p, hit.c)).toBe(true);
    expect(hit.ambushOffers).toHaveLength(1);
  });

  it("tung trúng nhưng bị chặn (đang đánh): BỎ lần tung, không mở, không tính ngày, không dồn", () => {
    const s = setup();
    s.c.lastHitAt = s.w.now;
    expect(rollAmbush(s.w, s.sid, s.p, s.c)).toBe(false);
    expect(s.ambushOffers).toHaveLength(0);
    expect(s.c.save.ambushDaily).toBeUndefined();
  });

  it("tính năng tắt: không làm gì", () => {
    const s = setup();
    s.w.ambush = null;
    expect(rollAmbush(s.w, s.sid, s.p, s.c)).toBe(false);
    trackAmbushWalk(s.w, s.sid, s.p, s.c);
    expect(s.c.ambush!.walked).toBe(0);
  });
});

describe("quãng đi THẬT (trackAmbushWalk)", () => {
  /** Đi `px` theo trục x trong các bước nhỏ, gọi theo dõi sau mỗi bước. */
  function walk(s: ReturnType<typeof setup>, px: number, step = 10) {
    for (let d = 0; d < px; d += step) {
      s.p.x += step;
      trackAmbushWalk(s.w, s.sid, s.p, s.c);
    }
  }

  it("chỉ cộng quãng thật (px); tung đúng MỘT lần mỗi AMBUSH_STRIDE_PX", () => {
    const s = setup({ rolls: [0.99, 0.99, 0.99, 0.99, 0.99, 0.99] });
    trackAmbushWalk(s.w, s.sid, s.p, s.c); // mốc đầu
    walk(s, AMBUSH_STRIDE_PX - 20);
    expect(s.c.ambush!.walked).toBe(AMBUSH_STRIDE_PX - 20);
    expect(s.ambushOffers).toHaveLength(0);
    // vượt đủ chặng bằng MỘT bước 70 px: tung (random 0.99 không trúng), `walked` còn đúng phần dư (1180 + 70 - 1200 = 50), không mất
    walk(s, 70, 70);
    expect(s.c.ambush!.walked).toBe(50);
  });

  it("đủ chặng + trúng thì mở hộp thoại ngay và reset quãng", () => {
    const s = setup();
    trackAmbushWalk(s.w, s.sid, s.p, s.c);
    walk(s, AMBUSH_STRIDE_PX + 10);
    expect(s.ambushOffers).toHaveLength(1);
    expect(s.c.ambush!.walked).toBe(0);
    expect(s.c.ambush!.offer).toBeDefined();
  });

  it("dịch chuyển tức thời (bước nhảy > AMBUSH_TELEPORT_PX) KHÔNG tính; đứng yên không tính", () => {
    const s = setup({ rolls: [] });
    trackAmbushWalk(s.w, s.sid, s.p, s.c);
    s.p.x += AMBUSH_TELEPORT_PX + 1;
    trackAmbushWalk(s.w, s.sid, s.p, s.c);
    expect(s.c.ambush!.walked).toBe(0);
    trackAmbushWalk(s.w, s.sid, s.p, s.c); // đứng yên
    expect(s.c.ambush!.walked).toBe(0);
    s.p.x += AMBUSH_TELEPORT_PX; // đúng ngưỡng: còn là đi bộ
    trackAmbushWalk(s.w, s.sid, s.p, s.c);
    expect(s.c.ambush!.walked).toBe(AMBUSH_TELEPORT_PX);
  });

  it("trong trấn / khu an toàn không tính quãng đi", () => {
    const s = setup({ rolls: [] });
    s.p.x = s.w.map.townPx.x;
    s.p.y = s.w.map.townPx.y;
    trackAmbushWalk(s.w, s.sid, s.p, s.c);
    walk(s, 200);
    expect(s.c.ambush!.walked).toBe(0);
  });

  it("đang có hộp thoại: không cộng quãng, không tung thêm", () => {
    const s = setup();
    openOne(s);
    const before = s.ambushOffers.length;
    walk(s, AMBUSH_STRIDE_PX * 2);
    expect(s.c.ambush!.walked).toBe(0);
    expect(s.ambushOffers).toHaveLength(before);
  });

  it("qua tickWorld: người đi thật mới bị tung; đứng yên nhiều giờ thì không", () => {
    const s = setup();
    for (let i = 0; i < 4000; i++) {
      s.w.now += TICK_MS;
      tickWorld(s.w, TICK_MS);
    }
    expect(s.ambushOffers).toHaveLength(0); // đứng yên ~200 giây
    // Đi qua lại ở vùng hoang (đi về phía đông tới mép bản đồ rồi quay lại, tránh trấn): quãng thật vượt một chặng
    let seq = 0;
    for (let i = 0; i < 400 && s.ambushOffers.length === 0; i++) {
      s.w.now += TICK_MS;
      s.c.inputs.push({ seq: ++seq, dx: i < 100 ? 1 : -1, dy: 0 });
      s.c.moveBudget = 5;
      tickWorld(s.w, TICK_MS);
    }
    expect(s.ambushOffers).toHaveLength(1);
    expect(s.c.ambush!.offer).toBeDefined();
  });
});

describe("hộp thoại: dựng, giá CHỐT, khoá nhân vật", () => {
  it("tin ambushOffer đúng nội dung: cảnh đã điền, kẻ địch, giá chốt, ms = AMBUSH_OFFER_MS", () => {
    const s = setup();
    const o = openOne(s);
    expect(s.ambushOffers).toHaveLength(1);
    const msg = s.ambushOffers[0]!.msg;
    expect(s.ambushOffers[0]!.sid).toBe(s.sid);
    expect(msg.id).toBe(o.id);
    expect(msg.id).toMatch(/^[a-f0-9]{16}$/);
    expect(msg.scene).toBe(
      `Đường qua ${s.w.map.wildName} bỗng vắng hẳn, Sói Hoang lao ra chắn trước mặt.`,
    );
    expect(msg.scene).not.toMatch(/[{}]/);
    expect(msg.foe).toEqual({ name: "Sói Hoang", tier: "normal", count: 2 });
    expect(msg.price).toEqual(ambushPriceOf(s.p, s.c, "offer"));
    expect(msg.ms).toBe(AMBUSH_OFFER_MS);
  });

  it("mỗi lời đề nghị một id riêng; lần bị chặn được ghi vào sổ ngày (hồ sơ)", () => {
    const s = setup();
    const o1 = openOne(s);
    expect(s.c.save.ambushDaily).toEqual({ day: dayKey(s.w.now), n: 1 });
    // đóng bằng cách huỷ rồi mở lại
    s.w.now += AMBUSH_SEEN_MS;
    tickAmbush(s.w, TICK_MS);
    ambushOf(s.w, s.c).cooldownUntil = 0;
    const o2 = openOne(s);
    expect(o2.id).not.toBe(o1.id);
    expect(s.c.save.ambushDaily).toEqual({ day: dayKey(s.w.now), n: 2 });
  });

  it("khoá: bất khả xâm phạm, quái bỏ mục tiêu, input được tiêu thụ mà KHÔNG di chuyển, ready() = null", () => {
    const s = setup();
    const { mc } = addMonster(s.w, "tho", s.p.x + 300, s.p.y);
    mc.target = s.sid;
    // quái đang nhắm thì rollAmbush bị chặn (combat); bỏ mục tiêu trước rồi mới tung
    mc.target = null;
    openOne(s);
    expect(s.w.shielded.has(s.sid)).toBe(true);
    expect(s.w.ready(s.sid)).toBeNull();
    const x0 = s.p.x;
    s.c.inputs.push({ seq: 41, dx: 1, dy: 0 }, { seq: 42, dx: 1, dy: 0 });
    s.c.moveBudget = 5;
    applyInputs(s.w.map, s.p, s.c, TICK_MS);
    expect(s.p.x).toBe(x0);
    expect(s.p.lastSeq).toBe(42);
  });

  it("giá chốt: tu vi / ví đổi trong 10 giây KHÔNG đổi số bị trừ", () => {
    const s = setup();
    const o = openOne(s);
    const chot = { ...o.price, coin: { ...o.price.coin } };
    s.p.expMax = 999_999;
    s.c.coin += 123_456;
    expect(o.price).toEqual(chot);
  });
});

describe("hết giờ, huỷ không ai thấy, đóng băng khi rớt mạng", () => {
  it("không ambushSeen trong AMBUSH_SEEN_MS: HUỶ lặng lẽ (không phạt, vào hồi, mở khoá)", () => {
    const s = setup();
    openOne(s);
    const coin = s.c.coin;
    const exp = s.p.exp;
    s.w.now += AMBUSH_SEEN_MS - 1;
    tickAmbush(s.w, TICK_MS);
    expect(s.c.ambush!.offer).toBeDefined();
    s.w.now += 1;
    tickAmbush(s.w, TICK_MS);
    expect(s.c.ambush!.offer).toBeUndefined();
    expect(s.ambushEnds).toEqual([{ sid: s.sid, msg: { result: "canceled" } }]);
    expect(s.c.coin).toBe(coin);
    expect(s.p.exp).toBe(exp);
    expect(s.c.ambush!.cooldownUntil).toBe(s.w.now + AMBUSH_COOLDOWN_MS);
    expect(s.c.save.ambushUntil).toBe(s.w.now + AMBUSH_COOLDOWN_MS);
    expect(s.w.shielded.has(s.sid)).toBe(false);
    expect(s.w.ready(s.sid)).not.toBeNull();
    expect(s.w.ambush!.open.size).toBe(0);
  });

  it("đã ambushSeen: hộp thoại giữ tới AMBUSH_OFFER_MS rồi = Chiến (gọi startFight); sai id thì bỏ qua", () => {
    const s = setup();
    const started: string[] = [];
    s.w.ambush!.startFight = (_w, sid) => {
      started.push(sid);
      return true;
    };
    const o = openOne(s);
    onAmbushSeen(s.w, s.sid, { id: "0".repeat(16) }); // id sai: bỏ qua
    expect(o.seen).toBe(false);
    onAmbushSeen(s.w, s.sid, { id: o.id });
    expect(o.seen).toBe(true);
    s.w.now += AMBUSH_OFFER_MS - 1;
    tickAmbush(s.w, TICK_MS);
    expect(started).toEqual([]);
    s.w.now += 1;
    tickAmbush(s.w, TICK_MS);
    expect(started).toEqual([s.sid]);
    expect(s.c.ambush!.offer).toBeUndefined();
    expect(s.w.ambush!.open.size).toBe(0);
  });

  it("hết giờ mà chưa có đấu trường (CD3): huỷ lặng lẽ, không trừ gì", () => {
    const s = setup();
    const o = openOne(s);
    onAmbushSeen(s.w, s.sid, { id: o.id });
    s.w.now += AMBUSH_OFFER_MS;
    tickAmbush(s.w, TICK_MS);
    expect(s.ambushEnds[0]!.msg).toEqual({ result: "canceled" });
    expect(s.c.coin).toBe(5000);
  });

  it("hồn lìa xác: ĐÓNG BĂNG đồng hồ (cả hạn xác nhận); nối lại thì còn nguyên thời gian", () => {
    const s = setup();
    const o = openOne(s);
    const endsAt0 = o.endsAt;
    s.w.ghosts.add(s.sid);
    for (let i = 0; i < 100; i++) {
      s.w.now += 1000; // 100 giây > OFFER + SEEN
      tickAmbush(s.w, 1000);
    }
    expect(s.c.ambush!.offer).toBe(o); // không hết giờ, không huỷ
    expect(o.endsAt).toBe(endsAt0 + 100_000);
    s.w.ghosts.delete(s.sid);
    ambushResend(s.w, s.sid);
    const resent = s.ambushOffers.at(-1)!.msg;
    expect(resent.id).toBe(o.id); // CÙNG id
    expect(resent.ms).toBe(AMBUSH_OFFER_MS); // còn nguyên 10 giây
  });

  it("hộ thể mạng ghi đè shieldUntil giữa chừng: hộp thoại đặt lại hộ thể ở nhịp sau", () => {
    const s = setup();
    openOne(s);
    s.c.shieldUntil = s.w.now + 10; // như `grantShield`
    s.w.shielded.delete(s.sid); // net-guard gỡ khi hết hạn
    tickAmbush(s.w, TICK_MS);
    expect(s.w.shielded.has(s.sid)).toBe(true);
  });
});

describe("ambushChoose: bỏ chạy = trừ ĐÚNG giá chốt -> LƯU -> đóng", () => {
  /** Mở hộp thoại, đã qua AMBUSH_ARM_MS. */
  function ready() {
    const s = setup();
    const o = openOne(s);
    s.w.now += AMBUSH_ARM_MS;
    return { ...s, o };
  }

  it("flee_coin: trừ đúng giá chốt, LƯU xong mới đóng; ví lúc LƯU đã bị trừ", async () => {
    const s = ready();
    const order: string[] = [];
    let coinAtSave = -1;
    s.w.onSaveNow = async () => {
      order.push("save");
      coinAtSave = s.c.coin;
      return true;
    };
    const price = s.o.price.coin.price;
    const before = s.c.coin;
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_coin" });
    expect(order).toEqual(["save"]);
    expect(coinAtSave).toBe(before - price);
    expect(s.c.coin).toBe(before - price);
    expect(s.ambushEnds).toEqual([{ sid: s.sid, msg: { result: "fled", paid: { coin: price } } }]);
    expect(s.c.ambush!.offer).toBeUndefined();
    expect(s.c.ambush!.cooldownUntil).toBe(s.w.now + AMBUSH_COOLDOWN_MS);
    expect(s.w.shielded.has(s.sid)).toBe(false);
  });

  it("mốc hồi (ambushUntil) đã nằm trong hồ sơ ngay LÚC lưu, cùng lần lưu với số dư mới", async () => {
    const s = ready();
    let saved: { coin: number; until: number | undefined } | null = null;
    s.w.onSaveNow = async () => {
      saved = { coin: s.c.coin, until: s.c.save.ambushUntil };
      return true;
    };
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_coin" });
    expect(saved).toEqual({
      coin: 5000 - s.o.price.coin.price,
      until: s.w.now + AMBUSH_COOLDOWN_MS,
    });
  });

  it("flee_exp: trừ đúng giá chốt trong thanh tu vi; không bao giờ xuống dưới 0", async () => {
    const s = ready();
    const price = s.o.price.exp;
    expect(price).toBeGreaterThan(0);
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_exp" });
    expect(s.p.exp).toBe(400 - price);
    expect(s.ambushEnds[0]!.msg).toEqual({ result: "fled", paid: { exp: price } });
  });

  it("giá chốt: tu vi tăng sau khi dựng KHÔNG làm giá đổi; tu vi tụt dưới giá chốt thì từ chối (không trừ)", async () => {
    const s = ready();
    const price = s.o.price.exp;
    s.p.expMax = 1_000_000; // nếu tính lại thì giá sẽ vọt lên
    s.p.exp = 100_000;
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_exp" });
    expect(s.p.exp).toBe(100_000 - price);
    const t = ready();
    t.p.exp = t.o.price.exp - 1;
    await onAmbushChoose(t.w, t.sid, { id: t.o.id, choice: "flee_exp" });
    expect(t.p.exp).toBe(t.o.price.exp - 1);
    expect(t.c.ambush!.offer).toBeDefined();
    expect(t.ambushEnds).toHaveLength(0);
    expect(t.toasts).toHaveLength(1);
  });

  it("thanh tu vi trống (giá tu vi = 0): KHÔNG cho bỏ chạy bằng tu vi miễn phí; vẫn trả được bằng Linh thạch", async () => {
    const s = setup();
    s.p.exp = 0;
    const o = openOne(s);
    expect(o.price.exp).toBe(0);
    s.w.now += AMBUSH_ARM_MS;
    await onAmbushChoose(s.w, s.sid, { id: o.id, choice: "flee_exp" });
    expect(s.c.ambush!.offer).toBeDefined();
    expect(s.ambushEnds).toHaveLength(0);
    await onAmbushChoose(s.w, s.sid, { id: o.id, choice: "flee_coin" });
    expect(s.ambushEnds[0]!.msg.result).toBe("fled");
  });

  it("không đủ Linh thạch: không trừ, hộp thoại giữ, báo toast; giá có sàn AMBUSH_FLEE_MIN_COIN", async () => {
    const s = ready();
    s.c.coin = s.o.price.coin.price - 1;
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_coin" });
    expect(s.c.coin).toBe(s.o.price.coin.price - 1);
    expect(s.c.ambush!.offer).toBeDefined();
    expect(s.toasts).toHaveLength(1);
    const cheap = ready();
    cheap.o.price = { exp: 0, coin: { price: 1, enough: true } }; // giá thấp bất thường: vẫn tính sàn
    cheap.c.coin = 100;
    await onAmbushChoose(cheap.w, cheap.sid, { id: cheap.o.id, choice: "flee_coin" });
    expect(cheap.c.coin).toBe(100 - AMBUSH_FLEE_MIN_COIN);
  });

  it("lưu HỎNG: giữ hộp thoại, đã trừ MỘT lần; lần thử lại chỉ lưu, KHÔNG trừ lần hai; xong mới đóng", async () => {
    const s = ready();
    let ok = false;
    let saves = 0;
    s.w.onSaveNow = async () => {
      saves++;
      return ok;
    };
    const price = s.o.price.coin.price;
    const before = s.c.coin;
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_coin" });
    expect(s.c.ambush!.offer).toBeDefined();
    expect(s.ambushEnds).toHaveLength(0);
    expect(s.c.coin).toBe(before - price);
    // Lưu hỏng KHÔNG im lặng (review B ở #1083): báo toast + gửi LẠI hộp thoại (cùng id) để client biết mà thử lại
    expect(s.toasts).toHaveLength(1);
    expect(s.ambushOffers.at(-1)!.msg.id).toBe(s.o.id);
    expect(s.ambushOffers.length).toBeGreaterThan(1);
    ok = true;
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_coin" });
    expect(saves).toBe(2);
    expect(s.c.coin).toBe(before - price); // không trừ hai lần
    expect(s.ambushEnds).toHaveLength(1);
    expect(s.c.ambush!.offer).toBeUndefined();
  });

  it("đang chờ lưu một cách trả thì không đổi sang cách khác (không trừ cả hai)", async () => {
    const s = ready();
    let release!: (v: boolean) => void;
    s.w.onSaveNow = () => new Promise<boolean>((r) => (release = r));
    const first = onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_coin" });
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_exp" });
    expect(s.p.exp).toBe(400); // tu vi chưa bị trừ
    release(true);
    await first;
    expect(s.ambushEnds).toHaveLength(1);
    expect(s.p.exp).toBe(400);
  });

  it("đến sớm hơn AMBUSH_ARM_MS: BỎ QUA hoàn toàn (không trừ, không đổi trạng thái)", async () => {
    const s = setup();
    const o = openOne(s);
    s.w.now += AMBUSH_ARM_MS - 1;
    await onAmbushChoose(s.w, s.sid, { id: o.id, choice: "flee_coin" });
    expect(s.c.coin).toBe(5000);
    expect(s.ambushEnds).toHaveLength(0);
    expect(s.c.ambush!.offer!.settling).toBeUndefined();
    s.w.now += 1;
    await onAmbushChoose(s.w, s.sid, { id: o.id, choice: "flee_coin" });
    expect(s.ambushEnds).toHaveLength(1);
  });

  it("id sai, choice lạ, tin rác, không có hộp thoại, đang đóng băng: bỏ qua lặng lẽ", async () => {
    const s = ready();
    const bads: unknown[] = [
      undefined,
      null,
      "flee_coin",
      42,
      { id: "0".repeat(16), choice: "flee_coin" },
      { id: s.o.id, choice: "flee_all" },
      { id: s.o.id },
      { id: 7, choice: "fight" },
      { choice: "flee_coin" },
      [s.o.id, "flee_coin"],
    ];
    for (const bad of bads) await onAmbushChoose(s.w, s.sid, bad);
    expect(s.c.coin).toBe(5000);
    expect(s.ambushEnds).toHaveLength(0);
    s.w.ghosts.add(s.sid);
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_coin" });
    expect(s.c.coin).toBe(5000);
    await onAmbushChoose(s.w, "nguoi_la", { id: s.o.id, choice: "flee_coin" });
    expect(s.ambushEnds).toHaveLength(0);
  });

  it("ambushSeen: tin rác / id sai / người lạ thì bỏ qua, không ném lỗi", () => {
    const s = ready();
    const bads: unknown[] = [
      undefined,
      null,
      "x",
      7,
      [],
      {},
      { id: 5 },
      { id: "ABCDEF0123456789" },
      { id: "0".repeat(16) },
    ];
    for (const bad of bads) expect(() => onAmbushSeen(s.w, s.sid, bad)).not.toThrow();
    expect(s.o.seen).toBe(false);
    expect(() => onAmbushSeen(s.w, "nguoi_la", { id: s.o.id })).not.toThrow();
    expect(s.o.seen).toBe(false);
  });

  it("fight: gọi startFight (CD3); từ chối / không có móc thì huỷ lặng lẽ không phạt", async () => {
    const a = ready();
    const got: string[] = [];
    a.w.ambush!.startFight = (_w, sid, offer) => {
      got.push(`${sid}:${offer.id}`);
      return true;
    };
    await onAmbushChoose(a.w, a.sid, { id: a.o.id, choice: "fight" });
    expect(got).toEqual([`${a.sid}:${a.o.id}`]);
    expect(a.c.ambush!.offer).toBeUndefined();
    expect(a.ambushEnds).toHaveLength(0); // kết cục của đấu trường là của CD3
    const b = ready();
    b.w.ambush!.startFight = () => false;
    await onAmbushChoose(b.w, b.sid, { id: b.o.id, choice: "fight" });
    expect(b.ambushEnds[0]!.msg).toEqual({ result: "canceled" });
    expect(b.c.coin).toBe(5000);
    const c = ready();
    await onAmbushChoose(c.w, c.sid, { id: c.o.id, choice: "fight" });
    expect(c.ambushEnds[0]!.msg).toEqual({ result: "canceled" });
  });

  it("chuỗi 'bị chặn rồi bỏ chạy' không bao giờ có lợi: tổng tu vi + Linh thạch chỉ giảm", async () => {
    const s = ready();
    const total = () => s.p.exp + s.c.coin;
    const before = total();
    await onAmbushChoose(s.w, s.sid, { id: s.o.id, choice: "flee_coin" });
    expect(total()).toBeLessThan(before);
    const t = ready();
    const tb = t.p.exp + t.c.coin;
    await onAmbushChoose(t.w, t.sid, { id: t.o.id, choice: "flee_exp" });
    expect(t.p.exp + t.c.coin).toBeLessThan(tb);
  });
});

describe("thoát / rớt mạng quá hạn lúc hộp thoại = bỏ chạy bằng tu vi giá hộp thoại", () => {
  it("ambushDropOffer trừ tu vi đúng giá chốt, đóng hộp thoại, đặt hồi; không có hộp thoại thì 0", () => {
    const s = setup();
    expect(ambushDropOffer(s.w, s.sid)).toBe(0);
    const o = openOne(s);
    const price = o.price.exp;
    const paid = ambushDropOffer(s.w, s.sid);
    expect(paid).toBe(price);
    expect(s.p.exp).toBe(400 - price);
    expect(s.c.ambush!.offer).toBeUndefined();
    expect(s.c.save.ambushUntil).toBe(s.w.now + AMBUSH_COOLDOWN_MS);
    expect(s.w.ambush!.open.size).toBe(0);
    expect(s.w.shielded.has(s.sid)).toBe(false);
  });

  it("tu vi không đủ giá chốt thì chỉ trừ phần có (không âm, không rớt cảnh giới)", () => {
    const s = setup();
    const o = openOne(s);
    s.p.exp = o.price.exp - 5;
    expect(ambushDropOffer(s.w, s.sid)).toBe(o.price.exp - 5);
    expect(s.p.exp).toBe(0);
  });

  it("đã trừ rồi (đang chờ lưu khi rớt): không trừ lần hai", async () => {
    const s = setup();
    const o = openOne(s);
    s.w.now += AMBUSH_ARM_MS;
    s.w.onSaveNow = () => new Promise<boolean>(() => {}); // lưu treo
    void onAmbushChoose(s.w, s.sid, { id: o.id, choice: "flee_exp" });
    await Promise.resolve();
    const afterCharge = s.p.exp;
    expect(afterCharge).toBe(400 - o.price.exp);
    expect(ambushDropOffer(s.w, s.sid)).toBe(o.price.exp);
    expect(s.p.exp).toBe(afterCharge);
  });
});

describe("dọn dẹp", () => {
  it("người rời phòng không qua ambushDropOffer: nhịp sau dọn khỏi `open`, không rò", () => {
    const s = setup();
    openOne(s);
    expect(s.w.ambush!.open.size).toBe(1);
    s.w.ctrl.delete(s.sid);
    s.w.state.players.delete(s.sid);
    tickAmbush(s.w, TICK_MS);
    expect(s.w.ambush!.open.size).toBe(0);
  });

  it("tickAmbush khi không ai có hộp thoại là no-op (đường nóng rẻ)", () => {
    const s = setup();
    expect(() => tickAmbush(s.w, TICK_MS)).not.toThrow();
    s.w.ambush = null;
    expect(() => tickAmbush(s.w, TICK_MS)).not.toThrow();
  });
});

describe("số đo: giá đọc từ nhân vật THẬT", () => {
  it("ambushPriceOf theo thanh tu vi, bậc và ví của người chơi", () => {
    const s = setup();
    const price = ambushPriceOf(s.p, s.c, "offer");
    expect(price.exp).toBe(108); // bậc 3: 2 phút săn x 54 tu vi / phút (< 400 tu vi đang có trong thanh)
    expect(price.coin.enough).toBe(true);
    s.c.coin = 0;
    expect(ambushPriceOf(s.p, s.c, "offer").coin.enough).toBe(false);
    s.p.exp = 10;
    expect(ambushPriceOf(s.p, s.c, "offer").exp).toBe(10); // kẹp theo tu vi đang có
  });
});

describe("bảo hộ sau khi được đưa về từ đấu trường (applyReturnGrace)", () => {
  it("vừa về: bảo hộ AMBUSH_RETURN_GRACE_MS kể từ lúc VÀO; trường được xoá (lần vào sau không còn)", () => {
    const s = setup();
    s.c.save.ambushReturnAt = s.w.now - 1000;
    expect(applyReturnGrace(s.w, s.sid, s.c)).toBe(true);
    expect(s.w.shielded.has(s.sid)).toBe(true);
    expect(s.c.shieldUntil).toBe(s.w.now + AMBUSH_RETURN_GRACE_MS);
    expect(s.c.save.ambushReturnAt).toBeUndefined();
    expect(applyReturnGrace(s.w, s.sid, s.c)).toBe(false); // dùng một lần
  });

  it("quá AMBUSH_RETURN_WINDOW_MS, ở tương lai, sai kiểu: KHÔNG bảo hộ (nhưng trường vẫn bị xoá)", () => {
    for (const at of [
      0,
      -1,
      Number.NaN,
      Infinity,
      "x" as never,
      null as never,
      T0 + 60_000,
      T0 - AMBUSH_RETURN_WINDOW_MS,
    ]) {
      const s = setup();
      s.c.save.ambushReturnAt = at as number;
      expect(applyReturnGrace(s.w, s.sid, s.c), String(at)).toBe(false);
      expect(s.w.shielded.has(s.sid)).toBe(false);
      expect(s.c.save.ambushReturnAt).toBeUndefined();
    }
    const t = setup();
    expect(applyReturnGrace(t.w, t.sid, t.c)).toBe(false); // chưa từng ở đấu trường
  });

  it("quái đang nhắm bỏ mục tiêu khi vào", () => {
    const s = setup();
    const { mc } = addMonster(s.w, "tho", s.p.x + 100, s.p.y);
    mc.target = s.sid;
    s.c.save.ambushReturnAt = s.w.now;
    applyReturnGrace(s.w, s.sid, s.c);
    expect(mc.target).toBeNull();
  });
});
