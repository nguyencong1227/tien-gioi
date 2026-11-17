// TRÙM THẾ GIỚI THEO GIỜ (M9.4, docs/PHAN_CONG_M9.md mục 4): phần có tác dụng phụ lên `World`. Sổ và luật điểm ở `world-boss-book.ts` (`Hub.worldBoss`, một đồng hồ cho mọi phòng).
//
// Vòng đời một sự kiện: báo trước (`soon`, mốc 10 / 5 / 1 phút của lịch) -> đến giờ thì SINH trùm ở phòng của bản đồ đích (`live`; phòng chưa có thì chờ, thế giới luôn sống nên thường có sẵn)
// -> trong lúc đó mỗi `WORLD_BOSS_BOARD_EVERY_MS` gửi bảng đóng góp cho người Ở PHÒNG ĐÍCH -> trùm bị hạ (`killMonster` gọi `worldBossKilled`: chia thưởng) hoặc hết giờ (bỏ chạy, không thưởng)
// hoặc bị huỷ (phòng giữ trùm đóng / trùm biến mất). Trùm thế giới là quái `wboss`: KHÔNG rơi đồ / tu vi / Linh thạch theo đường quái thường (thưởng đi MỘT đường riêng ở đây).
//
// Bất biến: (1) mỗi LINH HỒN nhận tối đa MỘT lần mỗi sự kiện (`WbEvent.claimed`, ghi TRƯỚC khi trao: sập máy giữa chừng chỉ MẤT, không nhân đôi); (2) chỉ người ĐỦ ngưỡng
// (`WORLD_BOSS_MIN_SHARE_PCT` % máu tối đa) được thưởng; (3) thưởng chia theo tỉ lệ điểm nên TỔNG thưởng một sự kiện không vượt `reward` của khung giờ (không cày được bằng cách thêm người);
// (4) người không còn trực tuyến (hoặc đang ở Hoàng Tuyền) lúc chốt thì MẤT phần thưởng (ưu tiên mất hơn nhân đôi); (5) sập máy giữa sự kiện = huỷ, không thưởng bù.
import {
  MONSTER_BY_ID,
  WORLD_BOSS_BOARD_EVERY_MS,
  WORLD_BOSS_TOP_N,
  expMultOf,
  getMap,
  worldBossAnnouncements,
  worldBossNoneMsg,
  type MonsterKind,
  type WorldBossMsg,
  type WorldBossOccurrence,
  type WorldBossOutcome,
  type WorldBossRewardMsg,
  type WorldBossSlot,
} from "@tien-gioi/shared";
import { rand, type MonsterCtrl, type World } from "../world";
import type { Hub } from "../hub";
import { bossDespawnAdds } from "./boss-state";
import { titleOf } from "./chat-title";
import { giveItem } from "./inventory";
import { spawnLoot } from "./loot";
import { bossSpawnOk } from "./monsters";
import { placeMonster } from "./monster-place";
import { gainExp } from "./progression";
import { onMonsterKilled } from "./quests";
import { trackSocial } from "./social";
import { changeCoin } from "./wallet";
import type { WbEvent, WbRanked } from "./world-boss-book";

/** Tên trùm hiển thị của một khung giờ (loài không có trong bảng thì dùng id). */
function bossNameOf(slot: WorldBossSlot): string {
  return MONSTER_BY_ID[slot.boss]?.name ?? slot.boss;
}

function mapNameOf(mapId: string): string {
  return getMap(mapId)?.wildName ?? mapId;
}

/** Gửi một tin `worldBoss` cho MỌI người chơi trực tuyến ở mọi phòng. */
function msgAll(hub: Hub, msg: WorldBossMsg): void {
  for (const x of hub.worlds) x.state.players.forEach((_, sid) => x.events.worldBoss(sid, msg));
}

/** Thông báo hệ thống toàn server (mỗi phòng một lần, kênh `sys` của phòng). */
function sysAll(hub: Hub, text: string): void {
  for (const x of hub.worlds) x.events.sys(text);
}

/** Phòng THƯỜNG của bản đồ đích (không phải bí cảnh / đấu trường), hoặc `undefined` nếu chưa có. */
function targetWorld(hub: Hub, mapId: string): World | undefined {
  for (const x of hub.worlds)
    if (x.map.def.id === mapId && x.runId === null && x.arena === null) return x;
  return undefined;
}

/** Tìm chỗ sinh đủ rộng, xa khu an toàn (như trùm thường: thử chặt trước, không được thì nới); `null` nếu bản đồ không có chỗ nào. */
function findSpot(w: World, def: MonsterKind): { x: number; y: number } | null {
  const map = w.map;
  for (const strict of [true, false]) {
    for (let i = 0; i < (strict ? 200 : 60); i++) {
      const x = rand(64, map.worldW - 64);
      const y = rand(64, map.worldH - 64);
      if (map.inSafe(x, y, 160) || map.circleBlocked(x, y, def.radius)) continue;
      // lượt chặt: đúng vùng nguy hiểm tối thiểu của loài như `spawnMonster` (không hiện trùm sát khu an toàn nếu loài đó vốn ở vùng sâu); lượt nới bỏ luật này để KHÔNG thiếu trùm
      if (strict && (map.dangerAt(x, y) < def.minDanger || !bossSpawnOk(w, def, x, y))) continue;
      return { x, y };
    }
  }
  return null;
}

/** Sinh trùm thế giới ở `w` cho sự kiện `ev`. Trả `false` nếu không tìm được chỗ (sự kiện bị huỷ). */
function spawnBoss(w: World, ev: WbEvent): boolean {
  const def = MONSTER_BY_ID[ev.slot.boss];
  if (!def) return false;
  const spot = findSpot(w, def);
  if (!spot) return false;
  const id = placeMonster(w, def, spot.x, spot.y);
  const mc = w.mctrl.get(id);
  const mon = w.state.monsters.get(id);
  if (!mc || !mon) return false;
  mc.wboss = true;
  w.wbossId = id;
  ev.spawn = { world: w, id };
  ev.maxHp = mon.maxHp;
  ev.hpPct = 100;
  return true;
}

/** Gỡ trùm thế giới khỏi phòng giữ nó (hết giờ / huỷ): không tu vi, không rơi đồ. */
function removeBoss(ev: WbEvent): void {
  const sp = ev.spawn;
  if (!sp) return;
  const w = sp.world as World;
  const mc = w.mctrl.get(sp.id);
  if (mc?.boss) bossDespawnAdds(w, mc.boss);
  w.state.monsters.delete(sp.id);
  w.mctrl.delete(sp.id);
  if (w.wbossId === sp.id) w.wbossId = null;
  ev.spawn = null;
}

function hpPctOf(ev: WbEvent): number {
  const sp = ev.spawn;
  if (!sp) return ev.hpPct;
  const mon = (sp.world as World).state.monsters.get(sp.id);
  if (!mon || !(mon.maxHp > 0)) return ev.hpPct;
  const pct = Math.round((mon.hp / mon.maxHp) * 100);
  return mon.hp > 0 ? Math.max(1, Math.min(100, pct)) : 0; // còn sống thì không bao giờ hiện 0 %
}

/** Gửi bảng đóng góp cho người ở PHÒNG ĐÍCH (mỗi người nhận `mine` của riêng mình). */
function sendBoard(w: World, ev: WbEvent): void {
  const book = w.hub.worldBoss;
  ev.hpPct = hpPctOf(ev);
  const ranked = book.ranking(ev);
  w.state.players.forEach((_, sid) => {
    const soulKey = w.ctrl.get(sid)?.identity.soulKey ?? null;
    w.events.worldBoss(sid, book.liveMsg(ev, w.now, { ranked, soulKey }));
  });
}

/** Mọi người chơi trực tuyến theo khoá linh hồn (ở bất cứ phòng nào). Một linh hồn có hai nhân vật cùng online thì lấy người gặp trước. */
function onlineBySoul(hub: Hub): Map<string, { w: World; sid: string }> {
  const out = new Map<string, { w: World; sid: string }>();
  for (const x of hub.worlds)
    x.ctrl.forEach((c, sid) => {
      if (!out.has(c.identity.soulKey)) out.set(c.identity.soulKey, { w: x, sid });
    });
  return out;
}

/** Trao thưởng cho người ĐỦ ngưỡng còn trực tuyến. Trả tin thưởng theo khoá linh hồn (để gửi kèm tin `ended`). */
function grantRewards(
  w: World,
  ev: WbEvent,
  ranked: readonly WbRanked[],
): Map<string, WorldBossRewardMsg> {
  const online = onlineBySoul(w.hub);
  const msgs = new Map<string, WorldBossRewardMsg>();
  ranked.forEach((r, rank) => {
    if (ev.claimed.has(r.key)) return;
    ev.claimed.add(r.key); // GHI SỔ TRƯỚC khi trao: sập máy giữa chừng chỉ làm mất, không nhân đôi
    const at = online.get(r.key);
    const x = at?.w;
    const sid = at?.sid;
    const p = x && sid ? x.state.players.get(sid) : undefined;
    const c = x && sid ? x.ctrl.get(sid) : undefined;
    if (!x || !sid || !p || !c || c.limbo) {
      w.audit?.("worldboss.reward_lost", {
        event: ev.slot.id,
        who: r.row.name,
        why: !at ? "offline" : "limbo",
      });
      return;
    }
    const frac = r.pct / 100;
    const exp = Math.floor(ev.slot.reward.exp * frac);
    const coin = Math.floor(ev.slot.reward.coin * frac);
    const msg: WorldBossRewardMsg = { exp, coin };
    if (exp > 0) gainExp(x, sid, p, exp, expMultOf(c.soul.unlocks));
    if (coin > 0) changeCoin(x, sid, coin);
    const top = rank < WORLD_BOSS_TOP_N ? ev.slot.reward.top : undefined;
    if (top) {
      const left = giveItem(x, sid, top.itemId, top.count);
      if (left < top.count) msg.item = { itemId: top.itemId, count: top.count - left };
      if (left > 0) spawnLoot(x, top.itemId, left, p.x, p.y, sid); // túi đầy: món rơi dưới chân, chủ nhặt trước
    }
    c.life.kills++;
    c.life.bossKills++; // Duyên của kiếp (như hạ trùm thường)
    onMonsterKilled(x, sid, ev.slot.boss);
    trackSocial(
      x,
      sid,
      ["world_boss_joined", 1],
      [`boss:${ev.slot.boss}`, 1],
      ...(rank < WORLD_BOSS_TOP_N ? ([["world_boss_top", 1]] as Array<[string, number]>) : []),
    );
    x.audit?.("worldboss.reward", {
      event: ev.slot.id,
      who: p.name,
      rank: rank + 1,
      exp,
      coin,
      item: msg.item?.itemId ?? null,
    });
    const save = x.onSaveNow;
    if (save) void save(sid).catch(() => {}); // lưu NGAY phần vừa trao (mất kết nối sau đó không làm mất thưởng đã trao)
    msgs.set(r.key, msg);
  });
  return msgs;
}

/** Chốt kết cục sự kiện: gỡ trùm (nếu còn), trao thưởng khi `killed`, báo mọi người, đưa sổ về rỗng. Gọi nhiều lần chỉ chốt một lần. */
function settle(w: World, ev: WbEvent, outcome: WorldBossOutcome): void {
  if (ev.settled) return;
  const hub = w.hub;
  const book = hub.worldBoss;
  const ranked = book.ranking(ev); // xếp hạng TRƯỚC khi đóng sổ
  ev.settled = true;
  if (outcome !== "killed") removeBoss(ev);
  const rewards =
    outcome === "killed" ? grantRewards(w, ev, ranked) : new Map<string, WorldBossRewardMsg>();
  const base: WorldBossMsg = {
    phase: "ended",
    id: ev.slot.id,
    name: ev.bossName,
    mapId: ev.slot.mapId,
    outcome,
  };
  for (const x of hub.worlds)
    x.state.players.forEach((_, sid) => {
      const reward = rewards.get(x.ctrl.get(sid)?.identity.soulKey ?? "");
      x.events.worldBoss(sid, reward ? { ...base, reward } : base);
    });
  const name = ev.bossName;
  if (outcome === "killed") {
    const names = ranked.slice(0, WORLD_BOSS_TOP_N).map((r) => r.row.name);
    sysAll(
      hub,
      `🐉 ${name} đã bị chư vị đạo hữu hạ gục!${names.length ? ` Đóng góp nhiều nhất: ${names.join(", ")}.` : ""}`,
    );
  } else if (outcome === "fled") {
    sysAll(hub, `🐉 ${name} đã bỏ chạy, hẹn kỳ sau.`);
  } else {
    sysAll(hub, `🐉 Sự kiện ${name} đã bị huỷ.`);
  }
  w.audit?.("worldboss.end", {
    event: ev.slot.id,
    outcome,
    contributors: ranked.length,
  });
  book.clear();
}

/** Bắt đầu một lần xảy ra: sinh trùm nếu phòng đích đã có, báo `live` cho mọi người. */
function startEvent(w: World, o: WorldBossOccurrence): void {
  const hub = w.hub;
  const book = hub.worldBoss;
  if (book.current) settle(w, book.current, "cancelled"); // không để hai sự kiện chồng nhau (lịch đã bị `worldBossViolations` cấm, đây là dây an toàn)
  const ev = book.begin(o, bossNameOf(o.slot));
  const target = targetWorld(hub, o.slot.mapId);
  if (target && !spawnBoss(target, ev)) {
    settle(w, ev, "cancelled");
    return;
  }
  const mapName = mapNameOf(o.slot.mapId);
  sysAll(hub, `🐉 ${ev.bossName} xuất hiện ở ${mapName}! Đạo hữu mau tới hợp lực hạ yêu.`);
  msgAll(hub, book.liveMsg(ev, w.now));
  w.audit?.("worldboss.start", { event: o.slot.id, map: o.slot.mapId });
}

/**
 * Nhịp của bộ lập lịch: MỌI phòng gọi mỗi tick, nhưng sổ chỉ cho lần gọi đầu của mỗi nhịp (`WORLD_BOSS_TICK_MS`) làm việc nên chi phí ở các phòng khác ~0; không có lịch / tắt thì thoát ngay.
 * Làm theo thứ tự: chốt sự kiện đang chạy (hết giờ / trùm biến mất) -> sinh trùm nếu còn thiếu -> gửi bảng -> báo trước + bắt đầu sự kiện mới.
 */
export function tickWorldBoss(w: World): void {
  const book = w.hub.worldBoss;
  if (!book.active) return;
  const prev = book.advance(w.now);
  if (prev === null) return;
  const hub = w.hub;
  const ev = book.current;
  if (ev) {
    const sp = ev.spawn;
    if (sp && !(hub.worlds.has(sp.world as World) && (sp.world as World).mctrl.has(sp.id))) {
      settle(w, ev, "cancelled"); // phòng giữ trùm đã đóng, hoặc trùm biến mất không do bị hạ
    } else if (w.now >= ev.endMs) {
      settle(w, ev, "fled");
    } else {
      if (!sp) {
        const t = targetWorld(hub, ev.slot.mapId);
        if (t && !spawnBoss(t, ev)) settle(w, ev, "cancelled");
      }
      if (!ev.settled && ev.spawn && w.now >= ev.nextBoardAt) {
        ev.nextBoardAt = w.now + WORLD_BOSS_BOARD_EVERY_MS;
        sendBoard(ev.spawn.world as World, ev);
      }
    }
  }
  for (const o of book.todaysOccurrences(w.now)) {
    for (const m of worldBossAnnouncements(o.slot, o.startMs, prev, w.now)) {
      sysAll(
        hub,
        `🐉 ${bossNameOf(o.slot)} sẽ xuất hiện ở ${mapNameOf(o.slot.mapId)} sau ${m} phút (giờ máy chủ, UTC+7).`,
      );
      msgAll(hub, book.soonMsg(o, bossNameOf(o.slot), w.now));
    }
    if (prev < o.startMs && o.startMs <= w.now && w.now < o.endMs) startEvent(w, o);
  }
}

/**
 * Ghi đóng góp SÁT THƯƠNG khi người chơi `by` đánh quái `mc` (gọi từ `dealMonsterDamage`, chỉ khi `mc.wboss`). `dealt` là phần THẬT SỰ trừ vào máu (đã cắt phần thừa lúc chết).
 */
export function worldBossCredit(w: World, id: string, by: string, dealt: number): void {
  const book = w.hub.worldBoss;
  const ev = book.current;
  if (!ev || ev.spawn?.id !== id || ev.spawn.world !== w) return;
  const c = w.ctrl.get(by);
  if (!c) return; // nguồn không phải người chơi (hoặc đã rời phòng): không tính
  const p = w.state.players.get(by);
  const titleId = titleOf(p);
  book.credit(
    ev,
    c.identity.soulKey,
    { name: p?.name ?? by, ...(titleId !== undefined ? { titleId } : {}) },
    "damage",
    dealt,
  );
}

/** Trùm thế giới vừa chết (`killMonster`): gỡ khỏi phòng, chia thưởng, báo mọi người. */
export function worldBossKilled(w: World, id: string, mc: MonsterCtrl): void {
  if (mc.boss) bossDespawnAdds(w, mc.boss);
  w.state.monsters.delete(id);
  w.mctrl.delete(id);
  if (w.wbossId === id) w.wbossId = null;
  const ev = w.hub.worldBoss.current;
  if (!ev || ev.spawn?.id !== id || ev.spawn.world !== w) return; // trùm mồ côi (sổ đã chốt / sổ khác): chỉ biến mất
  ev.spawn = null;
  ev.hpPct = 0;
  settle(w, ev, "killed");
}

/** Trạng thái hiện tại cho `worldBossGet` / lúc vào phòng: đang diễn ra thì `live` (kèm bảng nếu người hỏi Ở PHÒNG ĐÍCH), không thì lần sắp tới, không có lịch thì `none`. */
export function worldBossStatus(w: World, sid: string): WorldBossMsg {
  const book = w.hub.worldBoss;
  if (!book.active) return worldBossNoneMsg();
  const ev = book.current;
  if (ev && !ev.settled) {
    const here = ev.spawn?.world === w;
    ev.hpPct = hpPctOf(ev);
    return book.liveMsg(
      ev,
      w.now,
      here
        ? { ranked: book.ranking(ev), soulKey: w.ctrl.get(sid)?.identity.soulKey ?? null }
        : undefined,
    );
  }
  const up = book.upcoming(w.now);
  return up ? book.soonMsg(up, bossNameOf(up.slot), w.now) : worldBossNoneMsg();
}
