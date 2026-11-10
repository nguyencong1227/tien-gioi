// Hợp đồng bí cảnh (M3 bước 4, PR 4a): dữ liệu nhất quán, điều kiện mở, bộ đọc tin nhắn, thưởng theo ngày, bản đồ bí cảnh.
import { describe, expect, it } from "vitest";
import {
  DUNGEONS,
  DUNGEON_DAILY_REWARDS,
  DUNGEON_FALL_EXIT_MS,
  DUNGEON_FALL_HP_PCT,
  DUNGEON_ID_RE,
  DUNGEON_LOOT_MS,
  DUNGEON_MSG,
  DUNGEON_STATE_MS,
  JOIN_NOT_IN_RUN,
  LINH_HU_ID,
  MAX_DUNGEON_RUNS,
  RUN_ID_RE,
  canOpenDungeon,
  dungeonOf,
  dungeonOfMap,
  dungeonOpenFailMessage,
  dungeonRewardsLeft,
  parseDungeonDecline,
  parseDungeonEnter,
  parseDungeonOpen,
  rewardEligible,
  type DungeonEndMsg,
  type DungeonFallenMsg,
  type DungeonMemberCheck,
  type DungeonOpenFail,
  type DungeonOpenInput,
} from "./dungeon";
import {
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  DUNGEON_MAPS,
  GameMap,
  HAC_PHONG_ID,
  LINH_HU_MAP_ID,
  MAPS,
  BLOCKING,
  TILE,
  T,
  getMap,
  isDungeonMap,
} from "./map";
import { JOIN_WRONG_MAP, ROOM_ID_RE, roomNameOf } from "./travel";
import { JOIN_BAD_TOKEN, JOIN_NEED_CHARACTER } from "./account";
import { ITEM_BY_ID } from "./items";
import { MONSTERS, MONSTER_BY_ID, MONSTER_CAP, PLAYER_RADIUS, WILD_MONSTERS } from "./game";
import { NPCS } from "./npcs";
import { dayKey } from "./quests";
import { REALMS, stepOf } from "./realms";

describe("dữ liệu bí cảnh nhất quán", () => {
  it("id duy nhất; bản đồ bí cảnh và bản đồ cổng vào có thật; trùm là quái `boss` có thật", () => {
    expect(new Set(DUNGEONS.map((d) => d.id)).size).toBe(DUNGEONS.length);
    for (const d of DUNGEONS) {
      const at = d.id;
      const m = getMap(d.mapId);
      expect(m, at).toBeDefined();
      expect(isDungeonMap(d.mapId), at).toBe(true);
      expect(
        DUNGEON_MAPS.some((x) => x.id === d.mapId),
        at,
      ).toBe(true);
      expect(
        MAPS.some((x) => x.id === d.entryMapId),
        at,
      ).toBe(true);
      expect(isDungeonMap(d.entryMapId), at).toBe(false);
      expect(MONSTER_BY_ID[d.boss]?.boss, at).toBe(true);
      // đúng một trùm trong bản đồ bí cảnh
      expect(m!.monsterCapOf(d.boss), at).toBe(1);
      expect(dungeonOfMap(d.mapId), at).toBe(d);
      expect(DUNGEONS.filter((x) => x.mapId === d.mapId)).toHaveLength(1);
    }
  });

  it("cỡ đội, ngưỡng cảnh giới, thời hạn hợp lý; ngưỡng không vượt cảnh giới cao nhất", () => {
    const maxStep = stepOf(REALMS.length - 1, REALMS[REALMS.length - 1].tiers.length - 1);
    for (const d of DUNGEONS) {
      expect(Number.isInteger(d.partyMin) && d.partyMin >= 1, d.id).toBe(true);
      expect(Number.isInteger(d.partyMax) && d.partyMax >= d.partyMin, d.id).toBe(true);
      expect(d.partyMax, d.id).toBeLessThanOrEqual(8);
      expect(d.minStep, d.id).toBeGreaterThanOrEqual(0);
      expect(d.minStep, d.id).toBeLessThanOrEqual(maxStep);
      expect(d.timeLimitMs, d.id).toBeGreaterThan(60_000);
    }
    // bản đầu: Linh Hư cần cuối Luyện Khí, đội 2-4
    const lh = dungeonOf(LINH_HU_ID)!;
    expect([lh.partyMin, lh.partyMax, lh.minStep]).toEqual([2, 4, stepOf(1, 8)]);
  });

  it("thưởng: vật phẩm có thật, số lượng nguyên dương không vượt `stack`, xác suất trong (0, 1], tiền nguyên không âm", () => {
    for (const d of DUNGEONS) {
      expect(Number.isInteger(d.reward.coin) && d.reward.coin >= 0, d.id).toBe(true);
      expect(d.reward.items.length, d.id).toBeGreaterThan(0);
      for (const it of d.reward.items) {
        expect(ITEM_BY_ID[it.itemId], `${d.id} ${it.itemId}`).toBeDefined();
        expect(Number.isInteger(it.qty) && it.qty >= 1, it.itemId).toBe(true);
        expect(it.qty, it.itemId).toBeLessThanOrEqual(ITEM_BY_ID[it.itemId].stack);
        expect(it.chance, it.itemId).toBeGreaterThan(0);
        expect(it.chance, it.itemId).toBeLessThanOrEqual(1);
      }
    }
  });

  it("dungeonOf / dungeonOfMap: id lạ, sai kiểu và khoá nguyên mẫu (`constructor`, `__proto__`) trả undefined", () => {
    expect(dungeonOf(LINH_HU_ID)).toBe(DUNGEONS[0]);
    for (const bad of [
      "constructor",
      "__proto__",
      "toString",
      "",
      "khong_co",
      undefined,
      null,
      5,
      {},
      [],
    ])
      expect(dungeonOf(bad), String(bad)).toBeUndefined();
    expect(dungeonOfMap(LINH_HU_MAP_ID)).toBe(DUNGEONS[0]);
    for (const bad of [DEFAULT_MAP_ID, "constructor", undefined, 7])
      expect(dungeonOfMap(bad)).toBeUndefined();
  });

  it("mã lỗi vào phòng và tên tin nhắn không trùng mã cũ / không trùng nhau", () => {
    const codes = [400, 403, 409, JOIN_WRONG_MAP, JOIN_BAD_TOKEN, JOIN_NEED_CHARACTER];
    expect(codes).not.toContain(JOIN_NOT_IN_RUN);
    expect(JOIN_NOT_IN_RUN).toBe(422);
    const names = Object.values(DUNGEON_MSG);
    expect(new Set(names).size).toBe(names.length);
    expect(DUNGEON_MSG.decline).toBe("dungeonDecline");
    expect(DUNGEON_MSG.open).toBe("dungeonOpen");
    expect(DUNGEON_MSG.fallen).toBe("dungeonFallen");
    for (const n of names) expect(n).toMatch(/^dungeon[A-Z]/);
  });
});

describe("gục trong bí cảnh không mất kiếp (quyết định 11/11)", () => {
  it("hằng số: nằm vài giây rồi đứng dậy với một PHẦN khí huyết; kịp hiện thông báo nhưng không dài hơn nhịp state / giờ nhặt đồ", () => {
    for (const v of [DUNGEON_FALL_EXIT_MS, DUNGEON_STATE_MS]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(DUNGEON_FALL_EXIT_MS).toBeGreaterThanOrEqual(DUNGEON_STATE_MS); // ít nhất một lần `dungeonState` kịp tới
    expect(DUNGEON_FALL_EXIT_MS).toBeLessThan(DUNGEON_LOOT_MS);
    expect(DUNGEON_FALL_HP_PCT).toBeGreaterThan(0);
    expect(DUNGEON_FALL_HP_PCT).toBeLessThan(1); // MỘT PHẦN, không đầy
  });

  it("`dungeonFallen` là tin riêng, khác `dungeonEnd`: người gục không nhận kết quả run; các trường nằm trong khoảng hợp lệ", () => {
    expect(DUNGEON_MSG.fallen).not.toBe(DUNGEON_MSG.end);
    const msg: DungeonFallenMsg = {
      exitInMs: DUNGEON_FALL_EXIT_MS,
      rewardsLeft: DUNGEON_DAILY_REWARDS - 1,
    };
    expect(msg.exitInMs).toBeGreaterThan(0);
    expect(msg.rewardsLeft).toBeGreaterThanOrEqual(0);
    expect(msg.rewardsLeft).toBeLessThan(DUNGEON_DAILY_REWARDS); // vừa bị trừ một lượt nên không bao giờ còn đủ
    // kiểu: DungeonEndMsg không có exitInMs (để client không nhầm hai tin)
    const end: DungeonEndMsg = { result: "lost", reason: "all_dead", rewardsLeft: 0 };
    expect("exitInMs" in end).toBe(false);
  });

  it("lượt ngày: bị gục tính như một lần dùng lượt (cùng bộ đếm `dungeonDaily`, cùng `dungeonRewardsLeft`)", () => {
    const day = Date.parse("2026-11-11T05:00:00.000Z");
    const today = "2026-11-11";
    expect(dungeonRewardsLeft({ day: today, rewards: 0 }, day)).toBe(DUNGEON_DAILY_REWARDS);
    expect(dungeonRewardsLeft({ day: today, rewards: 1 }, day)).toBe(DUNGEON_DAILY_REWARDS - 1);
    expect(dungeonRewardsLeft({ day: today, rewards: DUNGEON_DAILY_REWARDS }, day)).toBe(0);
  });
});

describe("bản đồ và quái của bí cảnh", () => {
  it("bí cảnh KHÔNG nằm trong MAPS (không có phòng thường), vẫn tra được bằng getMap và không có trong tên phòng thường", () => {
    expect(MAPS.some((m) => m.id === LINH_HU_MAP_ID)).toBe(false);
    expect(MAPS.map((m) => m.id)).toEqual([DEFAULT_MAP_ID, HAC_PHONG_ID]);
    expect(getMap(LINH_HU_MAP_ID)?.def.kind).toBe("dungeon");
    expect(isDungeonMap(LINH_HU_MAP_ID)).toBe(true);
    for (const id of [DEFAULT_MAP_ID, HAC_PHONG_ID, "constructor", "", undefined, 3])
      expect(isDungeonMap(id)).toBe(false);
    expect(roomNameOf(LINH_HU_MAP_ID)).toBe("world_bi_canh_linh_hu");
  });

  it("trùm KHÔNG sinh ở bản đồ thường: cap = 0 ở Lạc Hà, Hắc Phong và ngoài `WILD_MONSTERS`", () => {
    expect(MONSTER_CAP.yeu_vuong).toBe(0);
    expect(DEFAULT_MAP.monsterCapOf("yeu_vuong")).toBe(0);
    expect(getMap(HAC_PHONG_ID)!.monsterCapOf("yeu_vuong")).toBe(0);
    expect(WILD_MONSTERS.map((m) => m.id)).not.toContain("yeu_vuong");
    expect(WILD_MONSTERS.length).toBe(MONSTERS.length - 1);
    for (const m of WILD_MONSTERS) expect(DEFAULT_MAP.monsterCapOf(m.id)).toBeGreaterThan(0);
  });

  it("bản đồ bí cảnh dựng được: cổng vào (khu an toàn) đi lại được ở phía nam, không có cổng chuyển bản đồ, có chỗ cho trùm xa cổng vào", () => {
    const m = getMap(LINH_HU_MAP_ID)!;
    expect(m.portals).toEqual([]);
    expect(m.townName).toBe("Cổng Vào");
    expect(m.circleBlocked(m.townPx.x, m.townPx.y, PLAYER_RADIUS)).toBe(false);
    expect(m.inSafe(m.townPx.x, m.townPx.y)).toBe(true);
    expect(m.townPx.y).toBeGreaterThan(m.worldH / 2); // cổng vào ở nửa phía nam
    // đủ ô đi lại ở vùng nguy hiểm >= minDanger của trùm để `spawnMonster` tìm được chỗ
    const boss = MONSTER_BY_ID.yeu_vuong;
    let free = 0;
    for (let ty = 2; ty < m.def.h - 2; ty++)
      for (let tx = 2; tx < m.def.w - 2; tx++) {
        const x = tx * TILE + TILE / 2;
        const y = ty * TILE + TILE / 2;
        if (
          m.dangerAt(x, y) >= boss.minDanger &&
          !m.circleBlocked(x, y, boss.radius) &&
          !m.inSafe(x, y, 160)
        )
          free++;
      }
    expect(free).toBeGreaterThan(100);
    // quái nhỏ cũng có chỗ: ngoài khu an toàn, đủ nguy hiểm
    for (const id of ["lang", "ho"]) {
      const def = MONSTER_BY_ID[id];
      let ok = 0;
      for (let ty = 2; ty < m.def.h - 2; ty++)
        for (let tx = 2; tx < m.def.w - 2; tx++) {
          const x = tx * TILE + TILE / 2;
          const y = ty * TILE + TILE / 2;
          if (
            m.dangerAt(x, y) >= def.minDanger &&
            !m.circleBlocked(x, y, def.radius) &&
            !m.inSafe(x, y, 160)
          )
            ok++;
        }
      expect(ok, id).toBeGreaterThan(m.monsterCapOf(id) * 3);
    }
  });

  it("hang trùm: chỉ bí cảnh có; nền đi lại được, xa cổng vào, đủ nguy hiểm cho trùm, và đi bộ từ cổng vào tới được", () => {
    for (const id of [DEFAULT_MAP_ID, HAC_PHONG_ID]) expect(getMap(id)!.lairPx).toBeUndefined();
    const m = getMap(LINH_HU_MAP_ID)!;
    const lair = m.lairPx!;
    expect(lair).toBeDefined();
    expect(lair).toEqual({ x: 32 * TILE, y: 9 * TILE, r: 3 * TILE });
    // tâm hang đứng được và nằm ở nửa phía bắc, đối diện cổng vào
    expect(m.circleBlocked(lair.x, lair.y, MONSTER_BY_ID.yeu_vuong.radius)).toBe(false);
    expect(lair.y).toBeLessThan(m.worldH / 2);
    // mọi ô trong bán kính hang là đất (không chặn), kể cả sát mép
    for (let ty = 0; ty < m.def.h; ty++)
      for (let tx = 0; tx < m.def.w; tx++)
        if (Math.hypot((tx + 0.5) * TILE - lair.x, (ty + 0.5) * TILE - lair.y) <= lair.r - 1)
          expect(m.tileAt(tx, ty), `${tx},${ty}`).toBe(T.Dirt);
    // ngoài khu an toàn, đủ nguy hiểm để `minDanger` của trùm không loại mất chỗ sinh
    expect(m.inSafe(lair.x, lair.y, lair.r)).toBe(false);
    expect(m.dangerAt(lair.x, lair.y)).toBeGreaterThanOrEqual(MONSTER_BY_ID.yeu_vuong.minDanger);
    // đi bộ (4 hướng, ô không chặn) từ tâm cổng vào tới tâm hang: nếu không, đội mở bí cảnh mà không bao giờ tới trùm
    const seen = new Uint8Array(m.def.w * m.def.h);
    const start = [Math.floor(m.townPx.x / TILE), Math.floor(m.townPx.y / TILE)];
    const goal = [Math.floor(lair.x / TILE), Math.floor(lair.y / TILE)];
    const q = [start];
    seen[start[1] * m.def.w + start[0]] = 1;
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.def.w || ny >= m.def.h) continue;
        if (seen[ny * m.def.w + nx] || BLOCKING.has(m.tileAt(nx, ny))) continue;
        seen[ny * m.def.w + nx] = 1;
        q.push([nx, ny]);
      }
    }
    expect(seen[goal[1] * m.def.w + goal[0]]).toBe(1);
  });

  it("dựng bản đồ từ chối hang sai: ngoài / sát viền, đè khu an toàn, số lẻ, bán kính xấu", () => {
    const base = DUNGEON_MAPS[0];
    const make = (lair: { cx: number; cy: number; r: number }) => new GameMap({ ...base, lair });
    expect(() => make({ cx: 32, cy: 9, r: 3 })).not.toThrow();
    expect(() => make({ cx: 1, cy: 9, r: 3 })).toThrow(/hang trùm/); // sát viền núi đá
    expect(() => make({ cx: 32, cy: 70, r: 3 })).toThrow(/hang trùm/); // ngoài bản đồ
    expect(() => make({ cx: 32, cy: 50, r: 3 })).toThrow(/hang trùm/); // đè lên cổng vào (cy 56, r 4)
    expect(() => make({ cx: 32.5, cy: 9, r: 3 })).toThrow(/số nguyên/);
    for (const r of [0, 0.5, -2, NaN, Infinity]) expect(() => make({ cx: 32, cy: 9, r })).toThrow();
  });

  it("NPC Thủ môn: ở Lạc Hà, trong trấn, không trên ô chặn, không đè NPC khác", () => {
    const n = NPCS.find((x) => x.id === "thu_mon")!;
    expect(n).toBeDefined();
    expect(n.mapId).toBeUndefined();
    expect(DEFAULT_MAP.inTown(n.x, n.y)).toBe(true);
    expect(DEFAULT_MAP.circleBlocked(n.x, n.y, PLAYER_RADIUS)).toBe(false);
    for (const o of NPCS)
      if (o !== n && o.mapId === undefined)
        expect(Math.hypot(o.x - n.x, o.y - n.y), o.id).toBeGreaterThan(60);
  });
});

describe("canOpenDungeon", () => {
  const def = DUNGEONS[0];
  const ok = (name: string, over: Partial<DungeonMemberCheck> = {}): DungeonMemberCheck => ({
    name,
    online: true,
    alive: true,
    step: def.minStep + 2,
    inRun: false,
    reconnecting: false,
    ...over,
  });
  const base = (over: Partial<DungeonOpenInput> = {}): DungeonOpenInput => ({
    def,
    isLeader: true,
    members: [ok("A"), ok("B")],
    runsOpen: 0,
    cooldownLeftMs: 0,
    ...over,
  });

  it("đủ điều kiện thì ok", () => {
    expect(canOpenDungeon(base())).toEqual({ ok: true });
    expect(canOpenDungeon(base({ members: [ok("A"), ok("B"), ok("C"), ok("D")] }))).toEqual({
      ok: true,
    });
  });

  it("từng lý do, đúng thứ tự kiểm cố định; thành viên đầu tiên vi phạm được báo tên", () => {
    const cases: [Partial<DungeonOpenInput>, DungeonOpenFail, string | undefined][] = [
      [{ def: undefined }, "unknown_dungeon", undefined],
      [{ isLeader: false }, "not_leader", undefined],
      [{ members: [ok("A")] }, "party_small", undefined],
      [{ members: [ok("A"), ok("B"), ok("C"), ok("D"), ok("E")] }, "party_big", undefined],
      [{ members: [ok("A"), ok("B", { online: false })] }, "member_offline", "B"],
      [{ members: [ok("A"), ok("B", { reconnecting: true })] }, "member_reconnecting", "B"],
      [{ members: [ok("A", { alive: false }), ok("B")] }, "member_dead", "A"],
      [{ members: [ok("A"), ok("B", { inRun: true })] }, "member_in_run", "B"],
      [{ members: [ok("A"), ok("B", { step: def.minStep - 1 })] }, "member_low", "B"],
      [{ members: [ok("A"), ok("B", { step: Number.NaN })] }, "member_low", "B"],
      [{ runsOpen: MAX_DUNGEON_RUNS }, "full", undefined],
      [{ runsOpen: MAX_DUNGEON_RUNS + 5 }, "full", undefined],
      [{ cooldownLeftMs: 1 }, "cooldown", undefined],
    ];
    for (const [over, reason, who] of cases) {
      const r = canOpenDungeon(base(over));
      expect(r.ok, reason).toBe(false);
      if (!r.ok) expect([r.reason, r.who]).toEqual([reason, who]);
    }
    // thứ tự: không phải đội trưởng thắng đội thiếu người; đội thiếu thắng thành viên ngoại tuyến; thành viên thắng "đầy" và hồi chiêu
    expect(canOpenDungeon(base({ isLeader: false, members: [ok("A")] }))).toMatchObject({
      reason: "not_leader",
    });
    expect(canOpenDungeon(base({ members: [ok("A", { online: false })] }))).toMatchObject({
      reason: "party_small",
    });
    expect(
      canOpenDungeon(
        base({ members: [ok("A", { alive: false }), ok("B")], runsOpen: 99, cooldownLeftMs: 9 }),
      ),
    ).toMatchObject({ reason: "member_dead", who: "A" });
    expect(canOpenDungeon(base({ runsOpen: 99, cooldownLeftMs: 9 }))).toMatchObject({
      reason: "full",
    });
  });

  it("mọi lý do đều có câu báo riêng bằng tiếng Việt; có `who` thì câu nêu tên; không lộ số / id nội bộ", () => {
    const reasons: DungeonOpenFail[] = [
      "unknown_dungeon",
      "not_leader",
      "party_small",
      "party_big",
      "member_offline",
      "member_dead",
      "member_reconnecting",
      "member_in_run",
      "member_low",
      "full",
      "cooldown",
    ];
    const msgs = reasons.map((r) => dungeonOpenFailMessage(r));
    expect(new Set(msgs).size).toBe(reasons.length);
    for (const m of msgs) expect(m.length).toBeGreaterThan(8);
    for (const r of [
      "member_offline",
      "member_dead",
      "member_reconnecting",
      "member_in_run",
      "member_low",
    ] as const)
      expect(dungeonOpenFailMessage(r, "Lâm Thanh")).toContain("Lâm Thanh");
  });
});

describe.each([
  ["parseDungeonEnter", parseDungeonEnter],
  ["parseDungeonDecline", parseDungeonDecline],
])("%s (không tin client)", (_name, parse) => {
  const id = "0123456789abcdef0123456789abcdef";
  it("nhận runId đúng dạng 128 bit hex thường; mọi thứ khác là null", () => {
    expect(parse({ runId: id })).toEqual({ runId: id });
    expect(RUN_ID_RE.test(id)).toBe(true);
    const bad: unknown[] = [
      undefined,
      null,
      5,
      "x",
      [],
      [id],
      {},
      { runId: 5 },
      { runId: null },
      { runId: "" },
      { runId: id.toUpperCase() },
      { runId: id + "0" },
      { runId: id.slice(1) },
      { runId: "g".repeat(32) },
      { runId: `${id}\n` },
      { runId: "../".repeat(11) },
      { runId: { toString: () => id } },
    ];
    for (const b of bad) expect(parse(b), JSON.stringify(b)).toBeNull();
  });

  it("không mang trường lạ sang kết quả (không `__proto__`, không trường thừa)", () => {
    const raw = JSON.parse(`{"runId":"${id}","__proto__":{"x":1},"admin":true}`);
    const r = parse(raw)!;
    expect(Object.keys(r)).toEqual(["runId"]);
    expect((r as any).admin).toBeUndefined();
  });
});

describe("parseDungeonOpen (không tin client)", () => {
  it("nhận id bí cảnh đúng dạng (mọi DUNGEONS.id thoả); mọi thứ khác là null", () => {
    for (const d of DUNGEONS) {
      expect(DUNGEON_ID_RE.test(d.id), d.id).toBe(true);
      expect(parseDungeonOpen({ dungeonId: d.id })).toEqual({ dungeonId: d.id });
    }
    const bad: unknown[] = [
      undefined,
      null,
      5,
      "linh_hu",
      [],
      [{ dungeonId: "linh_hu" }],
      {},
      { dungeonId: 5 },
      { dungeonId: null },
      { dungeonId: "" },
      { dungeonId: "Linh_hu" },
      { dungeonId: "1linh" },
      { dungeonId: "linh hu" },
      { dungeonId: "linh_hu\n" },
      { dungeonId: "a".repeat(33) },
      { dungeonId: "../x" },
      { dungeonId: { toString: () => "linh_hu" } },
    ];
    for (const b of bad) expect(parseDungeonOpen(b), JSON.stringify(b)).toBeNull();
  });

  it("không mang trường lạ; id lạ nhưng đúng dạng vẫn qua bộ đọc (server tra `dungeonOf`, không `DUNGEON_BY_ID[id]`)", () => {
    const raw = JSON.parse('{"dungeonId":"linh_hu","__proto__":{"x":1},"admin":true}');
    const r = parseDungeonOpen(raw)!;
    expect(Object.keys(r)).toEqual(["dungeonId"]);
    // "constructor" đúng dạng nhưng không phải bí cảnh: dungeonOf trả undefined
    const c = parseDungeonOpen({ dungeonId: "constructor" })!;
    expect(c).toEqual({ dungeonId: "constructor" });
    expect(dungeonOf(c.dungeonId)).toBeUndefined();
  });
});

describe("ROOM_ID_RE (TravelToMsg.roomId)", () => {
  it("id phòng Colyseus ngắn hợp lệ, chuỗi lạ bị từ chối", () => {
    for (const ok of ["abc123", "a_b-C", "Xk2oVQb1y", "a".repeat(64)])
      expect(ROOM_ID_RE.test(ok), ok).toBe(true);
    for (const bad of ["", "a b", "../x", "a/b", "a".repeat(65), "é", "a\n", "<s>"])
      expect(ROOM_ID_RE.test(bad), bad).toBe(false);
  });
});

describe("rewardEligible và dungeonRewardsLeft", () => {
  it("chỉ thành viên còn sống, đang trong phòng và đã gây sát thương cho trùm mới được tính", () => {
    expect(rewardEligible({ alive: true, present: true, damage: 1 })).toBe(true);
    for (const i of [
      { alive: false, present: true, damage: 100 },
      { alive: true, present: false, damage: 100 },
      { alive: true, present: true, damage: 0 },
      { alive: true, present: true, damage: -5 },
      { alive: true, present: true, damage: Number.NaN },
      { alive: true, present: true, damage: Infinity },
    ])
      expect(rewardEligible(i), JSON.stringify(i)).toBe(false);
  });

  it(`lượt thưởng mỗi ngày: đủ ${DUNGEON_DAILY_REWARDS} khi chưa có / sang ngày mới; trừ dần; không âm; số hỏng không phá`, () => {
    const t = Date.parse("2026-11-10T10:00:00Z");
    const today = dayKey(t);
    expect(dungeonRewardsLeft(undefined, t)).toBe(DUNGEON_DAILY_REWARDS);
    expect(dungeonRewardsLeft({ day: "2020-01-01", rewards: 99 }, t)).toBe(DUNGEON_DAILY_REWARDS); // ngày khác
    for (let used = 0; used <= DUNGEON_DAILY_REWARDS + 2; used++)
      expect(dungeonRewardsLeft({ day: today, rewards: used }, t)).toBe(
        Math.max(0, DUNGEON_DAILY_REWARDS - used),
      );
    // bộ đếm bị sửa tay trong file lưu
    for (const rewards of [-5, Number.NaN, Infinity, 1.9, 1e300]) {
      const left = dungeonRewardsLeft({ day: today, rewards }, t);
      expect(
        Number.isInteger(left) && left >= 0 && left <= DUNGEON_DAILY_REWARDS,
        String(rewards),
      ).toBe(true);
    }
    expect(dungeonRewardsLeft({ day: today, rewards: 1.9 }, t)).toBe(DUNGEON_DAILY_REWARDS - 1);
    // đổi ngày theo giờ Việt Nam (UTC+7): 16:59Z cùng ngày, 17:00Z sang ngày mới
    const before = Date.parse("2026-11-10T16:59:00Z");
    const after = Date.parse("2026-11-10T17:00:00Z");
    expect(
      dungeonRewardsLeft({ day: dayKey(before), rewards: DUNGEON_DAILY_REWARDS }, before),
    ).toBe(0);
    expect(dungeonRewardsLeft({ day: dayKey(before), rewards: DUNGEON_DAILY_REWARDS }, after)).toBe(
      DUNGEON_DAILY_REWARDS,
    );
  });
});
