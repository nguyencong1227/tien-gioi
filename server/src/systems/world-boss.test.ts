// Trùm thế giới theo giờ (M9.4, docs/PHAN_CONG_M9.md mục 4): lịch, báo trước, sinh trùm, điểm đóng góp theo LINH HỒN, thưởng một lần mỗi linh hồn, bỏ chạy, huỷ, sập máy.
// Dùng lịch MẪU của `shared/` (khung 12:00 Thiên Hàn Vương ở Hàn Vân Lĩnh, 21:00 Hắc Giao ở Âm Sương Trạch): dữ liệu thật là việc của E (M9.10).
import { describe, expect, it } from "vitest";
import {
  INVENTORY_SLOTS,
  MONSTER_BY_ID,
  WORLD_BOSS_TZ_OFFSET_MS,
  getMap,
  sampleWorldBossSchedule,
  worldBossViolations,
  type SoulSocial,
  type WorldBossSlot,
} from "@tien-gioi/shared";
import { legacyIdentity } from "../identity";
import { Hub } from "../hub";
import type { World } from "../world";
import { addPlayer, makeWorld } from "./test-helpers";
import { dealMonsterDamage } from "./combat";
import { topUpMonsters } from "./monsters";
import { placeMonster } from "./monster-place";
import { tickWorldBoss, worldBossStatus } from "./world-boss";

/** 00:00 giờ máy chủ (UTC+7) của ngày 18/11/2026, theo ms của đồng hồ. */
const DAY0 = Date.UTC(2026, 10, 18) - WORLD_BOSS_TZ_OFFSET_MS;
const at = (h: number, m = 0, s = 0) => DAY0 + ((h * 60 + m) * 60 + s) * 1000;
const MIN = 60_000;
const HAN = MONSTER_BY_ID.thien_han_vuong;

/** Hub có lịch (mặc định lịch mẫu) + hai phòng (Hàn Vân Lĩnh giữ trùm 12:00, Lạc Hà để người ở phòng khác). */
function setup(slots: WorldBossSlot[] = sampleWorldBossSchedule()) {
  const hub = new Hub();
  hub.worldBoss.slots = slots;
  const han = makeWorld(getMap("han_van")!, hub);
  const lac = makeWorld(undefined, hub);
  return { hub, han, lac };
}

/** Đặt đồng hồ MỌI phòng rồi chạy một nhịp bộ lập lịch (gọi từ phòng đầu). */
function tickAt(rooms: World[], ms: number) {
  for (const x of rooms) x.now = ms;
  tickWorldBoss(rooms[0]);
}

/** Chạy đồng hồ từ `from` tới `to` theo bước `step` (ms), mọi phòng cùng giờ. */
function run(rooms: World[], from: number, to: number, step = 1000) {
  for (let t = from; t <= to; t += step) tickAt(rooms, t);
}

/** Sổ xã hội trong bộ nhớ (thay cho `WorldRoom.socialUpdate`). */
function withSocial(w: World, store: Map<string, SoulSocial>) {
  w.onSocial = (key, fn) => void store.set(key, fn(store.get(key)));
}

function bossOf(w: World) {
  const id = w.wbossId;
  if (id === null) return null;
  return { id, m: w.state.monsters.get(id)!, mc: w.mctrl.get(id)! };
}

/** Người chơi `sid` ở `w` đánh trùm `dmg` sát thương qua cổng chung `dealMonsterDamage`. */
function hit(w: World, sid: string, dmg: number) {
  const b = bossOf(w)!;
  dealMonsterDamage(w, b.id, b.m, sid, dmg, false);
}

const soulOf = (sid: string) => legacyIdentity(sid).soulKey;

describe("world-boss: lịch rỗng / tắt", () => {
  it("không có lịch (mặc định) hoặc WORLD_BOSS=off thì không làm gì và trả `none`", () => {
    const hub = new Hub();
    const a = makeWorld(getMap("han_van")!, hub);
    addPlayer(a.w, "A");
    expect(hub.worldBoss.slots.length).toBe(0); // dữ liệu thật của E chưa có
    expect(hub.worldBoss.active).toBe(false);
    run([a.w], at(11, 59), at(12, 1));
    expect(a.sys).toEqual([]);
    expect(a.worldBosses).toEqual([]);
    expect(worldBossStatus(a.w, "A").phase).toBe("none");
    hub.worldBoss.slots = sampleWorldBossSchedule();
    hub.worldBoss.enabled = false;
    run([a.w], at(11, 59), at(12, 1));
    expect(a.worldBosses).toEqual([]);
    expect(a.w.wbossId).toBeNull();
    expect(worldBossStatus(a.w, "A").phase).toBe("none");
  });

  it("lịch MẪU hợp lệ theo luật kiểm của shared (nền cho các ca dưới đây)", () => {
    expect(worldBossViolations(sampleWorldBossSchedule())).toEqual([]);
  });
});

describe("world-boss: báo trước + sinh trùm", () => {
  it("báo trước đúng các mốc 10 / 5 / 1 phút, MỖI MỐC MỘT LẦN, cho mọi người ở mọi phòng; đúng giờ thì trùm sinh ở phòng đích", () => {
    const { han, lac } = setup();
    addPlayer(han.w, "A");
    addPlayer(lac.w, "B");
    run([han.w, lac.w], at(11, 49), at(12, 0, 5), 500);
    const soon = lac.worldBosses.filter((x) => x.msg.phase === "soon");
    expect(soon.map((x) => Math.round(x.msg.startsInMs! / MIN))).toEqual([10, 5, 1]);
    // thông báo hệ thống toàn server: mỗi phòng nhận đủ ba mốc báo trước
    for (const m of [10, 5, 1])
      expect(lac.sys.filter((t) => t.includes(`sau ${m} phút`))).toHaveLength(1);
    expect(lac.sys.filter((t) => t.includes("xuất hiện ở"))).toHaveLength(4); // 3 mốc báo trước + 1 dòng lúc xuất hiện
    // trùm đã sinh ở Hàn Vân Lĩnh (không phải phòng Lạc Hà), đúng loài, đã đánh dấu trùm thế giới
    const b = bossOf(han.w)!;
    expect(b.m.kind).toBe("thien_han_vuong");
    expect(b.mc.wboss).toBe(true);
    expect(lac.w.wbossId).toBeNull();
    expect(lac.w.state.monsters.size).toBe(0);
    // `live` tới người ở phòng khác (không kèm bảng)
    const live = lac.worldBosses.filter((x) => x.msg.phase === "live");
    expect(live).toHaveLength(1);
    expect(live[0].msg.mapId).toBe("han_van");
    expect(live[0].msg.top).toBeUndefined();
    expect(live[0].msg.endsInMs).toBeGreaterThan(29 * MIN);
  });

  it("khung giờ 00:00-00:09: báo trước 10 / 5 / 1 phút rơi vào cuối NGÀY HÔM TRƯỚC (23:55...) vẫn phát đủ, mỗi mốc MỘT lần, qua nửa đêm không phát đôi, trùm sinh đúng 00:05", () => {
    const slot: WorldBossSlot = {
      ...sampleWorldBossSchedule()[0]!,
      id: "dau_ngay",
      hour: 0,
      minute: 5,
    };
    const { han, lac } = setup([slot]);
    addPlayer(han.w, "A");
    addPlayer(lac.w, "B");
    // 23:50 ngày 17 -> 00:06 ngày 18 (qua nửa đêm), bước 500 ms
    run([han.w, lac.w], at(0) - 10 * MIN, at(0, 5, 5), 500);
    const soon = lac.worldBosses.filter((x) => x.msg.phase === "soon");
    expect(soon.map((x) => Math.round(x.msg.startsInMs! / MIN))).toEqual([10, 5, 1]); // trước khi sửa: chỉ [5, 1] hoặc rỗng
    for (const m of [10, 5, 1])
      expect(lac.sys.filter((t) => t.includes(`sau ${m} phút`))).toHaveLength(1);
    expect(bossOf(han.w)?.m.kind).toBe("thien_han_vuong"); // đúng giờ 00:05 (sang ngày mới) vẫn sinh
    expect(lac.worldBosses.filter((x) => x.msg.phase === "live")).toHaveLength(1);
  });

  it("khởi động (sập máy) GIỮA sự kiện thì sự kiện đó coi như huỷ: không sinh, không báo, sự kiện kế vẫn đúng giờ", () => {
    const { hub, han } = setup();
    addPlayer(han.w, "A");
    run([han.w], at(12, 10), at(12, 29, 59)); // lần gọi đầu chỉ ghi mốc
    expect(han.w.wbossId).toBeNull();
    expect(hub.worldBoss.current).toBeNull();
    expect(han.worldBosses.filter((x) => x.msg.phase === "live")).toEqual([]);
    expect(worldBossStatus(han.w, "A").phase).toBe("soon"); // lần kế (21:00), không trả lần đã huỷ
    expect(worldBossStatus(han.w, "A").id).toBe("mau_toi");
    run([han.w], at(20, 59), at(21, 0, 2)); // 21:00 vẫn chạy bình thường (Âm Sương Trạch chưa có phòng nên chưa sinh)
    expect(hub.worldBoss.current?.slot.id).toBe("mau_toi");
  });

  it("phòng đích chưa có lúc tới giờ: sự kiện vẫn `live`, trùm sinh ngay khi phòng có mặt", () => {
    const { hub, lac } = setup();
    addPlayer(lac.w, "B");
    run([lac.w], at(20, 59), at(21, 0, 2));
    const ev = hub.worldBoss.current!;
    expect(ev.slot.id).toBe("mau_toi");
    expect(ev.spawn).toBeNull();
    const am = makeWorld(getMap("am_suong")!, hub); // phòng đích xuất hiện muộn
    run([lac.w, am.w], at(21, 0, 3), at(21, 0, 5));
    expect(bossOf(am.w)?.m.kind).toBe("hac_giao");
    expect(hub.worldBoss.current?.spawn?.id).toBe(am.w.wbossId);
  });

  it("trùm thế giới là THÊM một con: `topUpMonsters` không tính nó vào số trùm thường của loài", () => {
    const { han } = setup();
    addPlayer(han.w, "A");
    run([han.w], at(11, 59), at(12, 0, 2));
    expect(bossOf(han.w)).not.toBeNull();
    const cap = han.w.map.monsterCapOf("thien_han_vuong");
    expect(cap).toBeGreaterThan(1);
    const spot = han.w.map.townPx;
    placeMonster(han.w, HAN, spot.x + 400, spot.y); // có sẵn cap - 1 con thường (con thứ cap - 1 chưa có)
    for (let i = 2; i < cap; i++) placeMonster(han.w, HAN, spot.x + 400 + i * 60, spot.y);
    topUpMonsters(han.w);
    const regular = [...han.w.mctrl.values()].filter(
      (m) => m.def.id === "thien_han_vuong" && !m.wboss,
    );
    expect(regular).toHaveLength(cap); // thiếu một con thường thì bổ sung đủ cap, dù trùm thế giới cũng cùng loài
  });
});

describe("world-boss: bảng đóng góp + trạng thái", () => {
  it("gửi bảng mỗi 2 giây CHỈ cho người ở phòng đích; mỗi người nhận `mine` của riêng mình; người chưa đủ ngưỡng thì `eligible: false`", () => {
    const { han, lac } = setup();
    addPlayer(han.w, "A");
    addPlayer(han.w, "B");
    addPlayer(lac.w, "C");
    run([han.w, lac.w], at(11, 59), at(12, 0, 1)); // sinh trùm + bảng đầu tiên
    hit(han.w, "A", HAN.hp * 0.4);
    hit(han.w, "B", HAN.hp * 0.001); // 0,1 % < 1,5 %
    const before = han.worldBosses.length;
    run([han.w, lac.w], at(12, 0, 2), at(12, 0, 2)); // chưa đủ 2 giây từ bảng trước
    expect(han.worldBosses.length).toBe(before);
    run([han.w, lac.w], at(12, 0, 3), at(12, 0, 3));
    const boards = han.worldBosses.slice(before);
    expect(boards.length).toBe(2); // một tin mỗi người trong phòng
    const a = boards.find((x) => x.sid === "A")!.msg;
    const b = boards.find((x) => x.sid === "B")!.msg;
    expect(a.top?.map((r) => r.name)).toEqual(["A"]); // chỉ người ĐỦ ngưỡng nằm trong top
    expect(a.mine).toMatchObject({ eligible: true, pct: 100 });
    expect(b.top?.map((r) => r.name)).toEqual(["A"]);
    expect(b.mine).toMatchObject({ eligible: false, pct: 0 });
    expect(a.hpPct).toBeGreaterThan(55);
    expect(a.hpPct).toBeLessThan(65);
    // người ở phòng khác không nhận bảng
    expect(lac.worldBosses.some((x) => x.msg.top !== undefined)).toBe(false);
  });

  it("`worldBossStatus`: không có lịch gần -> sắp tới; đang diễn ra -> live (có bảng nếu người hỏi ở phòng đích)", () => {
    const { han, lac } = setup();
    addPlayer(han.w, "A");
    addPlayer(lac.w, "B");
    han.w.now = at(11, 0);
    const soon = worldBossStatus(han.w, "A");
    expect(soon).toMatchObject({ phase: "soon", id: "mau_trua", mapId: "han_van" });
    expect(soon.startsInMs).toBe(60 * MIN); // BẤT KỲ độ lớn (không chỉ trong 10 phút báo trước)
    run([han.w, lac.w], at(11, 59), at(12, 0, 1));
    const here = worldBossStatus(han.w, "A");
    expect(here.phase).toBe("live");
    expect(here.top).toEqual([]);
    expect(here.mine).toEqual({ pts: 0, pct: 0, eligible: false });
    const away = worldBossStatus(lac.w, "B");
    expect(away.phase).toBe("live");
    expect(away.top).toBeUndefined();
    expect(away.mine).toBeUndefined();
  });

  it("`hpPct` còn sống thì không bao giờ hiện 0 % (còn 0,1 % máu vẫn là 1)", () => {
    const { han } = setup();
    addPlayer(han.w, "A");
    run([han.w], at(11, 59), at(12, 0, 1));
    hit(han.w, "A", HAN.hp * 0.999);
    expect(bossOf(han.w)!.m.hp).toBeGreaterThan(0);
    expect(worldBossStatus(han.w, "A").hpPct).toBe(1);
  });

  it("chỉ trùm thế giới ghi điểm: quái thường cùng loài không; nguồn không phải người chơi không; điểm theo LINH HỒN (hai nhân vật cùng linh hồn cộng dồn)", () => {
    const { hub, han } = setup();
    addPlayer(han.w, "A");
    const { c: c2 } = addPlayer(han.w, "A2");
    c2.identity = { ...c2.identity, soulKey: soulOf("A") }; // hai nhân vật cùng một linh hồn
    run([han.w], at(11, 59), at(12, 0, 1));
    const spot = han.w.map.townPx;
    const reg = placeMonster(han.w, HAN, spot.x + 500, spot.y);
    dealMonsterDamage(han.w, reg, han.w.state.monsters.get(reg)!, "A", 100, false);
    hit(han.w, "A", 1000);
    hit(han.w, "A2", 500);
    const b = bossOf(han.w)!;
    dealMonsterDamage(han.w, b.id, b.m, "", 777, false); // không rõ nguồn
    dealMonsterDamage(han.w, b.id, b.m, "khong-ai", 777, false); // nguồn đã rời phòng
    const ev = hub.worldBoss.current!;
    expect([...ev.rows.keys()]).toEqual([soulOf("A")]);
    expect(ev.rows.get(soulOf("A"))!.damage).toBe(1500);
  });
});

describe("world-boss: kết cục", () => {
  /** A 0,4 / B 0,25 / C 0,5 % (dưới ngưỡng) / D 0,15 / E 0,1 / F nhát kết liễu (phần còn lại). */
  function fight() {
    const slots = sampleWorldBossSchedule();
    slots[0] = { ...slots[0], reward: { exp: 100, coin: 200, top: slots[0].reward.top } };
    const s = setup(slots);
    const store = new Map<string, SoulSocial>();
    const audits: Array<{ ev: string; f: Record<string, unknown> }> = [];
    for (const x of [s.han, s.lac]) {
      withSocial(x.w, store);
      x.w.audit = (ev, f) => void audits.push({ ev, f: f ?? {} });
    }
    const who = ["A", "B", "C", "D", "E", "F"];
    const ps = Object.fromEntries(who.map((id) => [id, addPlayer(s.han.w, id)]));
    run([s.han.w, s.lac.w], at(11, 59), at(12, 0, 1));
    const H = HAN.hp;
    const parts: Array<[string, number]> = [
      ["A", H * 0.4],
      ["B", H * 0.25],
      ["C", H * 0.005],
      ["D", H * 0.15],
      ["E", H * 0.1],
    ];
    for (const [id, d] of parts) hit(s.han.w, id, d);
    return { ...s, store, audits, ps, parts, H, kill: () => hit(s.han.w, "F", H * 2) };
  }

  it("hạ được: thưởng CHIA THEO ĐIỂM cho người ĐỦ ngưỡng, top 3 thêm vật phẩm, người dưới ngưỡng không có gì; nhát kết liễu chỉ tính phần máu còn lại", () => {
    const f = fight();
    const { han, ps, H } = f;
    f.kill();
    const finish = H - f.parts.reduce((a, [, d]) => a + d, 0); // phần F thật sự gây
    const pts: Record<string, number> = {
      A: H * 0.4,
      B: H * 0.25,
      D: H * 0.15,
      E: H * 0.1,
      F: finish,
    };
    const total = Object.values(pts).reduce((a, b) => a + b, 0);
    const exp = (id: string) => Math.floor((100 * pts[id]) / total);
    const coin = (id: string) => Math.floor((200 * pts[id]) / total);
    for (const id of ["A", "B", "D", "E", "F"]) {
      expect(ps[id].c.coin).toBe(coin(id));
      expect(ps[id].p.exp).toBe(exp(id));
    }
    expect(ps.C.c.coin).toBe(0); // 0,5 % < ngưỡng 1,5 %
    expect(ps.C.p.exp).toBe(0);
    // tổng thưởng không vượt thưởng của khung giờ (chia theo tỉ lệ, không cày được bằng cách thêm người)
    const sumCoin = ["A", "B", "D", "E", "F"].reduce((a, id) => a + ps[id].c.coin, 0);
    expect(sumCoin).toBeLessThanOrEqual(200);
    expect(sumCoin).toBeGreaterThan(190);
    // top 3 theo điểm (A, B, D) có vật phẩm; E, F (hạng 4, 5) và C thì không
    const has = (id: string) => ps[id].c.inv.some((s) => s?.itemId === "dai_hoi_huyet_dan");
    expect(["A", "B", "D", "E", "F", "C"].map(has)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    // KHÔNG đi đường quái thường: không rơi đồ xuống đất, không Linh thạch rơi, trùm biến mất
    expect(han.w.state.loot.size).toBe(0);
    expect(han.w.wbossId).toBeNull();
    expect(han.w.state.monsters.size).toBe(0);
    // sổ về rỗng: không còn sự kiện, đòn đánh sau đó không ghi
    expect(han.w.hub.worldBoss.current).toBeNull();
    // Duyên của kiếp (như hạ trùm thường) chỉ cho người được thưởng
    expect(ps.A.c.life.bossKills).toBe(1);
    expect(ps.C.c.life.bossKills).toBe(0);
  });

  it("tin kết thúc: người được thưởng nhận `reward`, người dưới ngưỡng và người ở phòng khác chỉ nhận `outcome: killed`; thông báo nêu top đóng góp", () => {
    const f = fight();
    addPlayer(f.lac.w, "Z"); // người không tham gia, ở phòng khác
    f.kill();
    const ended = (
      x: {
        worldBosses: Array<{
          sid: string;
          msg: { phase: string; reward?: unknown; outcome?: string };
        }>;
      },
      sid: string,
    ) => x.worldBosses.filter((m) => m.sid === sid && m.msg.phase === "ended");
    expect(ended(f.han, "A")).toHaveLength(1);
    expect(ended(f.han, "A")[0].msg.outcome).toBe("killed");
    expect(ended(f.han, "A")[0].msg.reward).toMatchObject({
      item: { itemId: "dai_hoi_huyet_dan", count: 1 },
    });
    expect(ended(f.han, "E")[0].msg.reward).toMatchObject({
      exp: expect.any(Number),
      coin: expect.any(Number),
    });
    expect((ended(f.han, "E")[0].msg.reward as { item?: unknown }).item).toBeUndefined();
    expect(ended(f.han, "C")[0].msg.outcome).toBe("killed");
    expect(ended(f.han, "C")[0].msg.reward).toBeUndefined();
    expect(ended(f.lac, "Z")[0].msg.reward).toBeUndefined();
    expect(f.lac.sys.some((t) => t.includes("hạ gục") && t.includes("A, B, D"))).toBe(true);
  });

  it("mỗi LINH HỒN chỉ nhận MỘT lần dù có hai nhân vật cùng trực tuyến ở hai phòng; sự kiện đã chốt thì tick sau không trao lại", () => {
    const f = fight();
    const { c: a2 } = addPlayer(f.lac.w, "A"); // cùng linh hồn "A" đang online ở phòng khác
    expect(a2.identity.soulKey).toBe(soulOf("A"));
    f.kill();
    const got = f.ps.A.c.coin + a2.coin;
    expect(got).toBe(f.ps.A.c.coin); // chỉ một nơi nhận
    const once = f.ps.A.c.coin;
    expect(once).toBeGreaterThan(0);
    run([f.han.w, f.lac.w], at(12, 0, 5), at(12, 10), 5000);
    expect(f.ps.A.c.coin).toBe(once);
    expect(f.han.worldBosses.filter((m) => m.sid === "A" && m.msg.phase === "ended")).toHaveLength(
      1,
    );
  });

  it("người đóng góp đã sang phòng khác vẫn nhận (theo linh hồn); người đã rời hẳn thì MẤT phần mình, không ai nhận thay", () => {
    const f = fight();
    // B đi qua cổng sang Lạc Hà (cùng linh hồn); E rớt hẳn khỏi thế giới
    f.han.w.state.players.delete("B");
    f.han.w.ctrl.delete("B");
    const { c: bAway } = addPlayer(f.lac.w, "B");
    f.han.w.state.players.delete("E");
    f.han.w.ctrl.delete("E");
    f.kill();
    const H = f.H;
    const finish = H - f.parts.reduce((a, [, d]) => a + d, 0);
    const total = H * 0.4 + H * 0.25 + H * 0.15 + H * 0.1 + finish; // E vẫn tính vào TỔNG (phần của E không chia lại)
    expect(bAway.coin).toBe(Math.floor((200 * H * 0.25) / total));
    expect(f.ps.A.c.coin).toBe(Math.floor((200 * H * 0.4) / total));
    expect(f.ps.E.c.coin).toBe(0);
    expect(f.audits.some((a) => a.ev === "worldboss.reward_lost" && a.f.who === "E")).toBe(true);
  });

  it("người đang ở Hoàng Tuyền lúc chốt không nhận (kiếp cũ đã hết) nhưng cũng không nhận bù sau đó", () => {
    const f = fight();
    Object.assign(f.ps.D.c, { limbo: {} });
    f.kill();
    expect(f.ps.D.c.coin).toBe(0);
    expect(f.ps.D.c.inv.some((s) => s?.itemId === "dai_hoi_huyet_dan")).toBe(false);
    expect(f.ps.A.c.coin).toBeGreaterThan(0);
  });

  it("túi đầy: vật phẩm top rơi dưới chân người nhận (không mất)", () => {
    const f = fight();
    const inv = f.ps.A.c.inv;
    for (let i = 0; i < INVENTORY_SLOTS; i++) inv[i] = { itemId: "hoi_huyet_dan", qty: 1 };
    f.kill();
    expect(inv.some((s) => s?.itemId === "dai_hoi_huyet_dan")).toBe(false);
    const dropped = [...f.han.w.state.loot.values()].filter(
      (l) => l.itemId === "dai_hoi_huyet_dan",
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0].owner).toBe("A");
  });

  it("bộ đếm xã hội (thành tựu) và nhật ký kiểm toán: người ĐỦ ngưỡng +1 `world_boss_joined` và `boss:<loài>`, top 3 thêm `world_boss_top`", () => {
    const f = fight();
    f.kill();
    const counters = (id: string) => f.store.get(soulOf(id))?.counters ?? {};
    expect(counters("A")).toMatchObject({
      world_boss_joined: 1,
      "boss:thien_han_vuong": 1,
      world_boss_top: 1,
    });
    expect(counters("E")).toMatchObject({ world_boss_joined: 1, "boss:thien_han_vuong": 1 });
    expect(counters("E").world_boss_top).toBeUndefined();
    expect(f.store.get(soulOf("C"))).toBeUndefined();
    expect(f.audits.filter((a) => a.ev === "worldboss.reward")).toHaveLength(5);
    expect(f.audits.filter((a) => a.ev === "worldboss.end")[0].f).toMatchObject({
      outcome: "killed",
      contributors: 5,
    });
    // không lộ gì ngoài tên nhân vật / số (nhật ký không chứa bí mật)
    expect(JSON.stringify(f.audits)).not.toMatch(/secret|token|password/i);
  });

  it("hết giờ mà chưa hạ: trùm bỏ chạy, KHÔNG thưởng, ai cũng nhận `outcome: fled`; sự kiện kế vẫn đúng giờ", () => {
    const f = fight();
    run([f.han.w, f.lac.w], at(12, 0, 2), at(12, 30, 2), 2000);
    expect(f.han.w.wbossId).toBeNull();
    expect(f.han.w.state.monsters.size).toBe(0);
    expect(f.ps.A.c.coin).toBe(0);
    const end = f.han.worldBosses.filter((m) => m.sid === "A" && m.msg.phase === "ended");
    expect(end).toHaveLength(1);
    expect(end[0].msg).toMatchObject({ outcome: "fled" });
    expect(end[0].msg.reward).toBeUndefined();
    expect(f.han.sys.some((t) => t.includes("bỏ chạy"))).toBe(true);
    expect(f.han.w.hub.worldBoss.current).toBeNull();
    expect(worldBossStatus(f.han.w, "A")).toMatchObject({ phase: "soon", id: "mau_toi" });
    run([f.han.w, f.lac.w], at(20, 59), at(21, 0, 2));
    expect(f.han.w.hub.worldBoss.current?.slot.id).toBe("mau_toi");
  });

  it("phòng giữ trùm đóng giữa sự kiện: huỷ, không thưởng; trùm biến mất không do bị hạ cũng huỷ", () => {
    const f = fight();
    f.han.w.dispose(); // phòng đóng (khỏi `hub.worlds`)
    tickAt([f.lac.w, f.han.w], at(12, 1));
    expect(f.han.w.hub.worldBoss.current).toBeNull();
    expect(f.lac.sys.some((t) => t.includes("huỷ"))).toBe(true);
    expect(f.ps.A.c.coin).toBe(0);

    const g = fight();
    const id = g.han.w.wbossId!;
    g.han.w.state.monsters.delete(id);
    g.han.w.mctrl.delete(id); // biến mất không qua `killMonster`
    tickAt([g.han.w, g.lac.w], at(12, 1));
    expect(g.han.w.hub.worldBoss.current).toBeNull();
    expect(
      g.han.worldBosses.some((m) => m.msg.phase === "ended" && m.msg.outcome === "cancelled"),
    ).toBe(true);
    expect(g.ps.A.c.coin).toBe(0);
  });

  it("đòn đánh SAU khi sự kiện đã chốt không ghi điểm vào sự kiện nào (sổ đã đóng)", () => {
    const f = fight();
    f.kill();
    const spot = f.han.w.map.townPx;
    const orphan = placeMonster(f.han.w, HAN, spot.x + 400, spot.y);
    f.han.w.mctrl.get(orphan)!.wboss = true; // trùm mồ côi (sổ đã chốt)
    dealMonsterDamage(f.han.w, orphan, f.han.w.state.monsters.get(orphan)!, "A", HAN.hp * 5, false);
    expect(f.han.w.state.monsters.has(orphan)).toBe(false); // chỉ biến mất
    expect(f.ps.A.c.coin).toBe(
      Math.floor(
        (200 * HAN.hp * 0.4) /
          (HAN.hp * 0.4 +
            HAN.hp * 0.25 +
            HAN.hp * 0.15 +
            HAN.hp * 0.1 +
            (HAN.hp - f.parts.reduce((a, [, d]) => a + d, 0))),
      ),
    );
  });
});

describe("world-boss: hiệu năng", () => {
  it("không có lịch thì mỗi tick không tốn gì; có lịch thì chỉ một lần làm việc mỗi nhịp 250 ms dù nhiều phòng gọi", () => {
    const { hub, han, lac } = setup();
    addPlayer(han.w, "A");
    for (const x of [han.w, lac.w]) x.now = at(11, 0);
    tickWorldBoss(han.w); // ghi mốc
    const calls: number[] = [];
    const book = hub.worldBoss;
    const orig = book.todaysOccurrences.bind(book);
    book.todaysOccurrences = (n: number) => (calls.push(n), orig(n));
    for (let i = 1; i <= 20; i++) {
      for (const x of [han.w, lac.w]) x.now = at(11, 0) + i * 50; // hai phòng, mỗi tick 50 ms (20 tick/giây)
      tickWorldBoss(han.w);
      tickWorldBoss(lac.w);
    }
    expect(calls.length).toBe(4); // 1000 ms / 250 ms
  });

  it("100 người dồn một phòng đánh trùm thế giới 20 lần/giây: tick < 10 ms (ngân sách), bảng chỉ gửi mỗi 2 giây", () => {
    const { hub, han } = setup();
    const ids = Array.from({ length: 100 }, (_, i) => `P${i}`);
    for (const id of ids) addPlayer(han.w, id);
    run([han.w], at(11, 59), at(12, 0, 1));
    const b = bossOf(han.w)!;
    b.m.hp = b.m.maxHp = 1e12; // không chết trong ca đo: chỉ đo chi phí ghi điểm + gửi bảng
    hub.worldBoss.current!.maxHp = 1e12;
    han.worldBosses.length = 0;
    let slow = 0;
    let total = 0;
    const TICKS = 200; // 10 giây
    for (let t = 0; t < TICKS; t++) {
      han.w.now = at(12, 0, 2) + t * 50;
      const t0 = performance.now();
      for (const id of ids) dealMonsterDamage(han.w, b.id, b.m, id, 1000, false); // mỗi người một đòn mỗi tick: nặng hơn thật nhiều
      tickWorldBoss(han.w);
      const dt = performance.now() - t0;
      total += dt;
      if (dt > 10) slow++;
    }
    expect(total / TICKS).toBeLessThan(10);
    expect(slow).toBeLessThanOrEqual(10); // chấp nhận lẻ tẻ (GC, máy chung 8 dev đang bận: gặp 1 lần đỏ khi chạy song song), tối đa 5 % số tick; thước chính là TRUNG BÌNH ở trên
    const boards = han.worldBosses.filter((m) => m.msg.phase === "live" && m.msg.top !== undefined);
    expect(boards.length).toBeGreaterThanOrEqual(100 * 4); // ~5 lần mỗi 10 giây (mỗi 2 giây)
    expect(boards.length).toBeLessThanOrEqual(100 * 6); // không phải mỗi tick (20 lần/giây x 100 người = 20000)
    expect(hub.worldBoss.current!.rows.size).toBe(100);
  });
});
