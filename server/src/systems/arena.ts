// ĐẤU TRƯỜNG SOLO của GẶP CHẶN ĐƯỜNG (QUYET_DINH_M3 mục 52, docs/THIET_KE_CHAN_DUONG.md mục 5-7, issue CD3 #1063): phòng tạm MỘT người, kẻ chặn đường do máy chủ đặt, thắng / thua /
// hết giờ / bỏ chạy giữa trận, thưởng, về CHỖ CŨ. Hộp thoại + kích hoạt là `ambush.ts` (CD2); ở đây là phần "Chiến".
//
// Khác thiết kế gốc một điểm có chủ ý: vé đấu trường nằm ở sổ RIÊNG `Hub.ambushes` (không dùng `Run` / `Hub.runs`). `Run` gắn chặt với bí cảnh (lời mời, pha `gathering`, thành viên nhiều
// người, `dungeonFall`, `watchRun`...): nhét một người vào đó phải rẽ nhánh ở hàng chục chỗ. Vé riêng chỉ có đúng thứ đấu trường cần, và vẫn giữ hai bất biến của bí cảnh:
// phòng chỉ do máy chủ mở cho một vé còn hiệu lực, hồ sơ LUÔN ghi chỗ cũ (server sập / rớt mạng giữa trận thì lần sau đăng nhập ở chỗ cũ, không kẹt).
//
// Luật:
//  - `openTicket` (phòng thường, lúc người chơi chọn Chiến): chặn nếu đã có vé của người này hoặc đủ `MAX_AMBUSH_ROOMS`; đội nhận dòng thông báo "X bị chặn đường".
//  - Trong phòng đấu trường (`World.arena`): trận bắt đầu lúc người chơi VÀO (`arenaJoined`), kéo dài tối đa `AMBUSH_TIME_MS`. Thắng = hạ hết bầy; thua = bị hạ (`arenaFall`: từ mục 53 = CHẾT THẬT
//    qua `beginLimbo` khi luân hồi bật, không trừ giá; luân hồi tắt thì nằm rồi đứng dậy như cũ); hết giờ = thua (trả giá); `ambushFlee` = bỏ chạy giữa trận; thoát / rớt mạng = giá giữa trận bằng tu vi (`arenaDrop`).
//  - Giá giữa trận CHỐT và làm mới mỗi `ambushState` (mỗi giây); thua / hết giờ / thoát trừ bằng TU VI (luôn trả được, không rớt cảnh giới). Chưa có đầu vào nào suốt trận mà
//    thua / hết giờ thì tính ĐẦU HÀNG: giá HỘP THOẠI (người vắng mặt thật không bị phạt nặng gấp đôi).
//  - Kết thúc: `ambushEnd`, `AMBUSH_EXIT_MS` xem kết quả (kẻ địch bỏ mục tiêu, bất khả xâm phạm), rồi `World.onArenaExit` đưa về chỗ cũ (thử lại mỗi 2 giây nếu lỗi).
//  - Quái trong đấu trường KHÔNG tu vi / KHÔNG rơi đồ / KHÔNG tính nhiệm vụ riêng (`MonsterCtrl.arena`): mọi thưởng đi qua MỘT đường (`payRewards`), thưởng không phụ thuộc lựa chọn ở hộp thoại.
import { randomBytes } from "node:crypto";
import {
  AMBUSH_EXIT_MS,
  AMBUSH_FALL_MS,
  AMBUSH_FLEE_CHANNEL_MS,
  AMBUSH_TIME_MS,
  MAX_AMBUSH_ROOMS,
  TICK_MS,
  MONSTER_BY_ID,
  ambushRewardExp,
  parseAmbushFlee,
  rollCoin,
  stepOf,
  type AmbushEndMsg,
  type AmbushFoeGroup,
  type AmbushPrice,
  type AmbushResult,
  type AmbushTier,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { PlayerCtrl, World } from "../world";
import { ELITE_COIN_MULT, canBeElite, eliteDefOf } from "./elite";
import { placeMonster, forgetTarget } from "./monsters";
import { savePos } from "./movement";
import { gainExp } from "./progression";
import { changeCoin } from "./wallet";
import { ambushPriceOf, chargeFlee, type AmbushOfferCtrl } from "./ambush";

/** Vé còn hiệu lực chừng này (ms) kể từ lúc dựng để người chơi kịp vào phòng; quá hạn mà phòng chưa có ai thì phòng tự đóng và dọn vé. */
export const AMBUSH_TICKET_TTL_MS = 30_000;
/** Bán kính (px) vòng đặt kẻ địch quanh tâm hang khi có nhiều con. */
const FOE_RING_PX = 80;
/** Thử lại việc đưa người về chỗ cũ sau chừng này (ms) nếu lần trước không thành (lưu lỗi...). */
const EXIT_RETRY_MS = 2000;
/** Đi xa chỗ vào hơn thế (px) thì tính là ĐÃ có đầu vào (không phải người vắng mặt). */
const ACTED_MOVE_PX = 16;
/** Chết thật trong đấu trường: chờ tối đa chừng này (ms) cho Duyên cộng xong rồi mới đưa về phòng gốc (quá thì phòng gốc tự cộng khi nạp hồ sơ Hoàng Tuyền). */
const DIED_EXIT_PATIENCE_MS = 15_000;

/**
 * Hệ số thưởng LINH THẠCH so với Linh thạch rơi thường của từng con kẻ địch. TẠM (Linh thạch chặn đường thấp hơn nhiều so với phần tu vi: một lần thắng ~ vài con quái, không phải ~5 phút săn).
 * Phần TU VI không dùng hệ số này: đi theo `ambushRewardExp` (phút săn của bậc người chơi, CD6b), vì tu vi / phút săn khác nhau tới 18 lần giữa các bậc nên hệ số nhân với `def.exp` không
 * chỉnh đều được (đo 21/11: Nguyên Anh tăng 29 -> 60-79% trong khi Luyện Khí chỉ 3-11%). Tinh anh đã nhân sẵn trong `eliteDefOf`.
 */
export const ARENA_REWARD_MULT: Readonly<Record<AmbushTier, number>> = {
  normal: 1.5,
  elite: 1.5,
  leader: 1,
};

/** Vé vào đấu trường của MỘT người (do `openTicket` lập ở phòng thường, đấu trường nhận ở `onCreate`). */
export interface AmbushTicket {
  /** 128 bit ngẫu nhiên, hex thường: đoán không được (chỉ máy chủ đưa cho phòng đấu trường qua `createRoom`). */
  readonly id: string;
  /** Khoá: đạo hiệu viết thường. */
  readonly key: string;
  readonly name: string;
  /** CHỖ CŨ: bản đồ + toạ độ nguyên không bị chặn, nơi hồ sơ luôn ghi và nơi người chơi trở về. */
  readonly origin: { mapId: string; x: number; y: number };
  readonly group: AmbushFoeGroup;
  readonly tier: AmbushTier;
  /** Id phòng Colyseus; `null` cho tới khi đấu trường nhận vé. */
  roomId: string | null;
  readonly createdAt: number;
  /** Hết hạn vào phòng (`World.now`). */
  readonly expiresAt: number;
  /** Trận đã có kết cục (hoặc bị huỷ): vé chỉ còn để người chơi xem kết quả rồi về. */
  ended: boolean;
}

/** Sổ vé của cả tiến trình (`Hub.ambushes`): chỉ mục theo vé và theo khoá đạo hiệu (mỗi người tối đa một vé). */
export class Ambushes {
  private readonly byId = new Map<string, AmbushTicket>();
  private readonly idOfKey = new Map<string, string>();

  /** Số vé đang có (đếm theo `MAX_AMBUSH_ROOMS`). */
  get size() {
    return this.byId.size;
  }

  get(id: unknown): AmbushTicket | undefined {
    return typeof id === "string" ? this.byId.get(id) : undefined;
  }

  /** Vé của người chơi `key` (mỗi người tối đa một). */
  ofKey(key: string): AmbushTicket | undefined {
    const id = this.idOfKey.get(key);
    return id === undefined ? undefined : this.byId.get(id);
  }

  all(): IterableIterator<AmbushTicket> {
    return this.byId.values();
  }

  /** @internal Đăng ký vé mới. */
  _add(t: AmbushTicket) {
    this.byId.set(t.id, t);
    this.idOfKey.set(t.key, t.id);
  }

  /** @internal Xoá vé, giải phóng người chơi. Idempotent. */
  _remove(t: AmbushTicket) {
    if (this.byId.get(t.id) !== t) return;
    this.byId.delete(t.id);
    if (this.idOfKey.get(t.key) === t.id) this.idOfKey.delete(t.key);
  }

  /** Xoá sạch (test). */
  clear() {
    this.byId.clear();
    this.idOfKey.clear();
  }
}

/** Pha của trận: `fighting` đang đánh; `over` đã có kết cục, chờ về chỗ cũ. */
export type ArenaPhase = "fighting" | "over";

/** Trạng thái đấu trường của MỘT phòng (`World.arena`; `null` ở phòng thường). */
export interface ArenaCtrl {
  readonly ticket: AmbushTicket;
  phase: ArenaPhase;
  /** Lúc người chơi vào (`World.now`); `null` cho tới lúc đó (đồng hồ trận chưa chạy). */
  startedAt: number | null;
  /** Hết giờ (`World.now`). */
  deadline: number;
  /** Id những con quái của bầy (thắng khi không còn con nào trong state). */
  foes: string[];
  /** Chỗ người chơi vào (để biết đã di chuyển). */
  spawn: { x: number; y: number };
  /** Đã có đầu vào nào (đi, đánh) chưa: chưa thì thua / hết giờ tính giá HỘP THOẠI. */
  acted: boolean;
  /** Giá bỏ chạy giữa trận ĐÃ CHỐT (làm mới mỗi `ambushState`). */
  price: AmbushPrice;
  nextStateAt: number;
  /** Lúc đưa về chỗ cũ (sau khi có kết cục); `null` khi còn đang đánh. */
  endAt: number | null;
  exitTryAt: number;
  result?: AmbushResult;
  /** Tin kết cục đã gửi (để gửi LẠI cho người nối lại sau khi rớt mạng lúc xem kết quả). */
  end?: AmbushEndMsg;
  /** Đang bỏ chạy: đã trừ `paid` (một lần), chờ LƯU xong rồi mới kết thúc. */
  settling?: { choice: "flee_coin" | "flee_exp"; paid: { exp?: number; coin?: number } };
  /**
   * Đang VẬN bỏ chạy (mục 53): `at` = lúc thoát (`World.now`). Bấm được cả khi bị khống chế; trong lúc vận KHÔNG bất khả xâm phạm (bị hạ = chết thật, huỷ vận, không trừ giá); hạ hết bầy
   * trong lúc vận thì THẮNG (huỷ vận). Rớt mạng (hồn lìa xác) thì `at` dời theo (đóng băng).
   */
  fleeing?: { choice: "flee_coin" | "flee_exp"; at: number };
}

// ---------- Phòng thường: lập vé ----------

/** Người chơi `sid` đang có đội: báo cho các thành viên khác (ở mọi phòng) "X bị chặn đường" (thông báo thôi, không ai vào được). */
function notifyParty(w: World, p: Player): void {
  const id = w.parties.partyIdOf(p.name.toLowerCase());
  if (id === undefined) return;
  for (const key of w.parties.membersOf(id)) {
    if (key === p.name.toLowerCase()) continue;
    const loc = w.hub.locate(key);
    if (loc) loc.w.events.toast(loc.sid, { text: `${p.name} bị chặn đường.`, tone: "info" });
  }
}

/**
 * Lập vé cho lựa chọn "Chiến" (gọi từ `AmbushRuntime.startFight` của `WorldRoom`): trả `null` (huỷ lặng lẽ, không phạt) khi người này đã có vé hoặc đủ `MAX_AMBUSH_ROOMS` đấu trường.
 * Chỗ cũ lấy từ vị trí THẬT hiện tại (làm tròn về điểm không bị chặn: `savePos`).
 */
export function openTicket(w: World, sid: string, offer: AmbushOfferCtrl): AmbushTicket | null {
  const p = w.state.players.get(sid);
  if (!p) return null;
  const key = p.name.toLowerCase();
  if (w.hub.ambushes.ofKey(key) !== undefined) return null;
  if (w.hub.ambushes.size >= MAX_AMBUSH_ROOMS) return null;
  const at = savePos(w.map, p.x, p.y);
  const t: AmbushTicket = {
    id: randomBytes(16).toString("hex"),
    key,
    name: p.name,
    origin: { mapId: w.map.def.id, x: at.x, y: at.y },
    group: offer.group,
    tier: offer.tier,
    roomId: null,
    createdAt: w.now,
    expiresAt: w.now + AMBUSH_TICKET_TTL_MS,
    ended: false,
  };
  w.hub.ambushes._add(t);
  notifyParty(w, p);
  w.audit?.("ambush.fight", { name: p.name, map: t.origin.mapId, tier: t.tier, group: t.group.id });
  return t;
}

// ---------- Phòng đấu trường ----------

/** Định nghĩa loài của một con trong bầy ở mức `tier` (tinh anh = bản nhân). `undefined` nếu loài lạ. */
function foeDefOf(tier: AmbushTier, kind: string) {
  const def = Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, kind)
    ? MONSTER_BY_ID[kind]
    : undefined;
  if (!def) return undefined;
  return tier === "elite" && canBeElite(def) ? eliteDefOf(def) : def;
}

/**
 * Dựng đấu trường cho vé (gọi MỘT lần ở `onCreate` của phòng): đặt `World.arena` và kẻ địch quanh tâm hang (`GameMap.lairPx`) theo đúng thứ tự `group.foes` (kẻ cầm đầu ở TÂM). Không
 * dùng `Math.random`: vị trí là vòng đều quanh tâm. Quái không sinh tự nhiên (`monsterCap` của đấu trường rỗng) và `topUpMonsters` không chạy ở phòng này.
 */
export function createArena(w: World, ticket: AmbushTicket): ArenaCtrl {
  const lair = w.map.lairPx ?? { x: w.map.townPx.x, y: w.map.townPx.y - 400, r: 80 };
  const spec: { kind: string; boss: boolean }[] = [];
  for (const f of ticket.group.foes)
    for (let i = 0; i < f.count; i++)
      spec.push({ kind: f.kind, boss: ticket.tier === "leader" && spec.length === 0 });
  const foes: string[] = [];
  const ring = spec.filter((s) => !s.boss).length;
  let ri = 0;
  for (const s of spec) {
    const def = foeDefOf(ticket.tier, s.kind);
    if (!def) continue;
    let x = lair.x;
    let y = lair.y;
    if (!s.boss) {
      const a = (2 * Math.PI * ri++) / Math.max(1, ring);
      const r = ring + (spec.length - ring) > 1 ? FOE_RING_PX : 0;
      x += Math.cos(a) * r;
      y += Math.sin(a) * r;
    }
    const id = placeMonster(
      w,
      def,
      x,
      y,
      ticket.tier === "elite" && canBeElite(MONSTER_BY_ID[s.kind]!),
    );
    const mc = w.mctrl.get(id);
    if (mc) mc.arena = true;
    foes.push(id);
  }
  w.arena = {
    ticket,
    phase: "fighting",
    startedAt: null,
    deadline: 0,
    foes,
    spawn: { x: w.map.townPx.x, y: w.map.townPx.y },
    acted: false,
    price: { exp: 0, coin: { price: 0, enough: false } },
    nextStateAt: 0,
    endAt: null,
    exitTryAt: 0,
  };
  return w.arena;
}

/** Bầy còn con nào đang sống trong phòng không. */
function foesAlive(w: World, a: ArenaCtrl): boolean {
  for (const id of a.foes) {
    const m = w.state.monsters.get(id);
    if (m && m.hp > 0) return true;
  }
  return false;
}

/** Người chơi vừa vào đấu trường: đồng hồ trận bắt đầu, chốt giá giữa trận, gửi `ambushState` đầu tiên. Gọi cuối `onJoin`. */
export function arenaJoined(w: World, sid: string): void {
  const a = w.arena;
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!a || !p || !c || a.startedAt !== null) return;
  a.startedAt = w.now;
  a.deadline = w.now + AMBUSH_TIME_MS;
  a.spawn = { x: p.x, y: p.y };
  a.price = ambushPriceOf(p, c, "mid");
  a.nextStateAt = w.now + 1000;
  w.events.ambushState(sid, { msLeft: AMBUSH_TIME_MS, price: a.price });
}

/** Đã có đầu vào nào chưa (đi xa chỗ vào, hoặc gây sát thương). */
function updateActed(w: World, a: ArenaCtrl, p: Player, c: PlayerCtrl): void {
  if (a.acted || a.startedAt === null) return;
  if (
    Math.hypot(p.x - a.spawn.x, p.y - a.spawn.y) > ACTED_MOVE_PX ||
    (c.lastDealtAt !== undefined && c.lastDealtAt >= a.startedAt)
  )
    a.acted = true;
}

/** Khoá người chơi khi trận đã kết thúc: kẻ địch bỏ mục tiêu, bất khả xâm phạm tới lúc về (xem kết quả, nhặt nốt). */
function lockOver(w: World, sid: string, c: PlayerCtrl, until: number): void {
  c.shieldUntil = Math.max(c.shieldUntil ?? 0, until);
  w.shielded.add(sid);
  forgetTarget(w, sid);
}

/** Chuyển sang pha `over` (đồng bộ): ghi kết cục, hẹn giờ về, đóng vé, khoá người chơi. */
function closeMatch(w: World, sid: string, a: ArenaCtrl, result: AmbushResult): void {
  a.phase = "over";
  a.result = result;
  a.endAt = w.now + AMBUSH_EXIT_MS;
  a.exitTryAt = a.endAt;
  a.ticket.ended = true;
  const c = w.ctrl.get(sid);
  if (c) lockOver(w, sid, c, a.endAt + 5_000);
}

/** Lưu hồ sơ (số dư / tu vi mới) rồi mới báo `ambushEnd`: người chơi thấy kết quả thì kết quả đã nằm trên đĩa. Lưu hỏng vẫn báo (lần lưu lúc về chỗ cũ sẽ ghi lại). */
async function saveThenNotify(w: World, sid: string, end: AmbushEndMsg): Promise<void> {
  await w.onSaveNow?.(sid);
  w.events.ambushEnd(sid, end);
}

/** Trừ TU VI giá giữa trận (hoặc giá hộp thoại nếu chưa có đầu vào nào): luôn trả được, không rớt cảnh giới. Trả số đã trừ. */
function payLossExp(w: World, a: ArenaCtrl, p: Player, c: PlayerCtrl): number {
  const price = a.acted ? a.price : ambushPriceOf(p, c, "offer");
  const paid = Math.min(Math.max(0, price.exp), Math.max(0, Math.floor(p.exp)));
  p.exp -= paid;
  return paid;
}

/**
 * Thưởng khi thắng. TU VI: `ambushRewardExp` (phút săn của bậc người chơi x mức kẻ địch; thuần, ở `shared/`). LINH THẠCH: theo số liệu của chính kẻ địch x `ARENA_REWARD_MULT` (TẠM).
 * Đi qua `gainExp` / `changeCoin`; đồ rơi chờ CD6 (D chốt `AMBUSH_LOOT`).
 */
function payRewards(
  w: World,
  sid: string,
  p: Player,
  a: ArenaCtrl,
): NonNullable<AmbushEndMsg["rewards"]> {
  const rng = w.ambush?.random ?? Math.random;
  const mult = ARENA_REWARD_MULT[a.ticket.tier];
  const exp = ambushRewardExp(stepOf(p.realm, p.tier), a.ticket.tier);
  let coin = 0;
  for (const f of a.ticket.group.foes) {
    const def = foeDefOf(a.ticket.tier, f.kind);
    if (!def) continue;
    for (let i = 0; i < f.count; i++)
      coin += rollCoin(f.kind, rng) * (a.ticket.tier === "elite" ? ELITE_COIN_MULT : 1) * mult;
  }
  coin = Math.round(coin);
  if (exp > 0) gainExp(w, sid, p, exp);
  if (coin > 0) changeCoin(w, sid, coin);
  return { exp, coin, items: [] };
}

/** Kết thúc trận với `result` (`won` / `lost` / `timeout`; bỏ chạy đi đường `onAmbushFlee`). Chỉ chạy MỘT lần (pha `over` thì bỏ qua). */
export function finishArena(w: World, sid: string, result: "won" | "lost" | "timeout"): void {
  const a = w.arena;
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!a || a.phase !== "fighting" || !p || !c) return;
  closeMatch(w, sid, a, result);
  let end: AmbushEndMsg;
  if (result === "won") end = { result, rewards: payRewards(w, sid, p, a) };
  else end = { result, paid: { exp: payLossExp(w, a, p, c) } };
  w.audit?.("ambush.end", {
    name: p.name,
    result,
    map: a.ticket.origin.mapId,
    tier: a.ticket.tier,
  });
  a.end = end;
  void saveThenNotify(w, sid, end);
}

/**
 * Hết khí huyết TRONG ĐẤU TRƯỜNG (gọi từ `hurtPlayer`, TRƯỚC `beginLimbo`; "tha chết do mạng" `spareFromNetDeath` chạy trước nên rớt mạng không chết thật). `false` ở phòng thường.
 *  - QUYET_DINH_M3 mục 53: khi luân hồi BẬT (`World.reincarnate`) và trận đang đánh, bị hạ = CHẾT THẬT: kết cục `lost` + `died` (KHÔNG trừ giá: cái chết thay giá), huỷ vận bỏ chạy đang
 *    dở (không trừ giá), đặt đưa về phòng của CHỖ CŨ NGAY (hồ sơ lưu kèm bản ghi Hoàng Tuyền ở chỗ cũ; màn hình Hoàng Tuyền hiện ở đó), rồi trả `false` để `hurtPlayer` chạy `beginLimbo`.
 *  - Luân hồi TẮT (bản thử / bench) hoặc trận không còn đang đánh: giữ cách cũ (nằm `AMBUSH_FALL_MS` rồi đứng dậy; đang đánh thì trận `lost` trừ giá giữa trận bằng tu vi).
 */
export function arenaFall(w: World, sid: string, p: Player, c: PlayerCtrl): boolean {
  const a = w.arena;
  if (!a) return false;
  if (a.phase === "fighting" && w.reincarnate) {
    a.fleeing = undefined; // bị hạ giữa lúc vận bỏ chạy: chết thật, KHÔNG trừ giá
    closeMatch(w, sid, a, "lost");
    a.endAt = w.now; // đưa về chỗ cũ ngay (không đợi AMBUSH_EXIT_MS): màn hình Hoàng Tuyền hiện ở phòng gốc
    a.exitTryAt = w.now;
    a.end = { result: "lost", died: true };
    w.audit?.("ambush.end", {
      name: p.name,
      result: "lost",
      died: true,
      map: a.ticket.origin.mapId,
      tier: a.ticket.tier,
    });
    w.events.ambushEnd(sid, a.end);
    return false; // `hurtPlayer` chạy `beginLimbo` ngay sau đây
  }
  p.dead = true;
  p.meditating = false;
  c.deadAt = w.now;
  c.inputs.length = 0;
  c.reviveAt = w.now + AMBUSH_FALL_MS;
  c.reviveHpPct = 1;
  forgetTarget(w, sid);
  if (a.phase === "fighting") {
    a.fleeing = undefined;
    w.events.toast(sid, { text: "Ngươi đã gục!", tone: "bad" });
    finishArena(w, sid, "lost");
  }
  return true;
}

/**
 * `ambushFlee { choice }` giữa trận (mục 53): BẤM ĐƯỢC LUÔN (kể cả khi đang bị khống chế: tin này không đi qua `cast` / di chuyển) nhưng cần VẬN `AMBUSH_FLEE_CHANNEL_MS` rồi mới thoát, để không
 * lách được đòn đang ra bằng cách bấm đúng lúc. Bấm: kiểm cách trả hợp lệ (Linh thạch đủ giá, hoặc tu vi), đặt `a.fleeing`, gửi `ambushState` có `fleeMs`; bấm lần hai khi đang vận bị bỏ qua;
 * đã trừ giá mà lần LƯU trước hỏng (`a.settling`) thì bấm lại là thử lưu tiếp (không trừ hai lần). Tới giờ thoát `tickArena` gọi `completeFlee`.
 */
export async function onAmbushFlee(w: World, sid: string, raw: unknown): Promise<void> {
  const m = parseAmbushFlee(raw);
  const a = w.arena;
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (m === null || !a || !p || !c || p.dead || a.phase !== "fighting" || a.startedAt === null)
    return;
  if (a.fleeing !== undefined) return; // đang vận: bấm thêm bị bỏ qua
  if (a.settling !== undefined) {
    if (a.settling.choice !== m.choice) return; // đang chờ lưu một cách trả khác: không đổi giữa chừng
    return completeFlee(w, sid, a); // đã vận + đã trừ: thử lưu lại
  }
  // cách trả phải hợp lệ NGAY LÚC BẤM (Linh thạch đủ giá chốt / có tu vi để trả); lúc thoát vẫn kiểm lại và có đường lui (xem `completeFlee`)
  if (m.choice === "flee_coin" && !a.price.coin.enough) {
    w.events.toast(sid, { text: "Không đủ Linh thạch để bỏ chạy", tone: "bad" });
    return;
  }
  if (m.choice === "flee_exp" && (a.price.exp <= 0 || p.exp < a.price.exp)) {
    w.events.toast(sid, { text: "Không đủ tu vi để bỏ chạy", tone: "bad" });
    return;
  }
  a.fleeing = { choice: m.choice, at: w.now + AMBUSH_FLEE_CHANNEL_MS };
  w.events.ambushState(sid, {
    msLeft: Math.max(0, a.deadline - w.now),
    price: a.price,
    fleeMs: AMBUSH_FLEE_CHANNEL_MS,
  });
}

/**
 * Hết thời gian vận: trừ ĐÚNG giá đã chốt (`a.price`) -> LƯU -> mới kết thúc (`fled`). Cách đã chọn không trả được nữa thì thử cách còn lại; cả hai đều không (hết sạch tiền và tu vi)
 * thì thoát KHÔNG mất gì (người chơi luôn thoát được: mục 53; có dòng audit `ambush.flee_free`). Lưu hỏng thì giữ trận + `settling`, bấm lại chỉ lưu (không trừ hai lần).
 */
async function completeFlee(w: World, sid: string, a: ArenaCtrl): Promise<void> {
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!p || !c || p.dead || a.phase !== "fighting") return;
  if (a.settling === undefined) {
    const want = a.fleeing?.choice ?? "flee_exp";
    a.fleeing = undefined;
    const other = want === "flee_coin" ? "flee_exp" : "flee_coin";
    let choice: "flee_coin" | "flee_exp" = want;
    let paid = chargeFlee(w, sid, p, a.price, want);
    if (paid === null) {
      choice = other;
      paid = chargeFlee(w, sid, p, a.price, other);
    }
    if (paid === null) {
      // hết sạch cả hai (chống bỏ chạy miễn phí ở HỘP THOẠI là chuyện khác; ở đây cái chết thật đang treo trên đầu nên LUÔN cho thoát)
      paid = {};
      w.audit?.("ambush.flee_free", { name: p.name, stage: "arena" });
    }
    a.settling = { choice, paid };
  }
  const settling = a.settling;
  const ok = (await w.onSaveNow?.(sid)) ?? true;
  if (w.arena !== a || a.phase !== "fighting") return; // trong lúc lưu có kết cục khác (hạ / hết giờ / rời)
  if (!ok) {
    w.events.toast(sid, { text: "Chưa lưu được, hãy bấm lại sau giây lát", tone: "bad" });
    return;
  }
  closeMatch(w, sid, a, "fled");
  w.audit?.("ambush.flee", {
    name: p.name,
    choice: settling.choice,
    paid: settling.paid,
    stage: "arena",
  });
  a.end = { result: "fled", paid: settling.paid };
  w.events.ambushEnd(sid, a.end);
}

/**
 * Người chơi thoát / rớt mạng khỏi đấu trường lúc đang đánh = trả giá giữa trận bằng TU VI (chống né giá bằng cách thoát); đã trừ rồi (đang chờ lưu khi bỏ chạy) thì giữ nguyên.
 * Gọi ở `WorldRoom.onLeave` TRƯỚC lần lưu cuối. Trận đã kết thúc thì không làm gì. Trả số tu vi đã trừ.
 */
export function arenaDrop(w: World, sid: string): number {
  const a = w.arena;
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!a || !p || !c || a.phase !== "fighting") return 0;
  const paid = a.settling !== undefined ? (a.settling.paid.exp ?? 0) : payLossExp(w, a, p, c);
  a.phase = "over";
  a.result = "dropped";
  a.ticket.ended = true;
  w.audit?.("ambush.drop", { name: p.name, paid, stage: "arena" });
  return paid;
}

/**
 * Nối lại mạng giữa trận: gửi LẠI trạng thái hiện tại cho phòng mới (đang đánh: `ambushState` với thời gian còn THẬT; đã có kết cục: `ambushEnd` đã gửi), để giao diện không treo.
 * Phòng thường / chưa vào trận thì không làm gì.
 */
export function arenaResend(w: World, sid: string): void {
  const a = w.arena;
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!a || !p || !c || a.startedAt === null) return;
  if (a.phase === "fighting")
    w.events.ambushState(sid, { msLeft: Math.max(0, a.deadline - w.now), price: a.price });
  else if (a.end !== undefined) w.events.ambushEnd(sid, a.end);
}

// ---------- Mỗi tick ----------

/**
 * Mỗi tick của phòng đấu trường (phòng thường thoát ngay): đồng hồ, điều kiện thắng / hết giờ, `ambushState` mỗi giây, đưa về chỗ cũ khi tới `endAt`.
 * Đồng hồ chỉ chạy khi người chơi đã vào (`startedAt`).
 */
export function tickArena(w: World, dtMs: number = TICK_MS): void {
  const a = w.arena;
  if (a === null || a.startedAt === null) return;
  let sid: string | undefined;
  for (const k of w.state.players.keys()) sid = k;
  if (sid === undefined) return;
  const p = w.state.players.get(sid)!;
  const c = w.ctrl.get(sid);
  if (!c) return;
  if (w.ghosts.size > 0 && w.ghosts.has(sid)) {
    // Rớt mạng (hồn lìa xác, mục 33): ĐÓNG BĂNG đồng hồ trận / đồng hồ về chỗ cũ đúng bước tick; kẻ địch bỏ mục tiêu, người chơi bất khả xâm phạm (`hurtPlayer`). Quá hạn chờ nối
    // lại thì `WorldRoom.onLeave` gọi `arenaDrop` (giá giữa trận bằng tu vi).
    if (a.phase === "fighting") {
      a.deadline += dtMs;
      a.nextStateAt += dtMs;
      if (a.fleeing !== undefined) a.fleeing.at += dtMs; // đóng băng cả vận bỏ chạy
    } else if (a.endAt !== null) {
      a.endAt += dtMs;
      a.exitTryAt += dtMs;
    }
    forgetTarget(w, sid);
    return;
  }
  if (a.phase === "fighting") {
    updateActed(w, a, p, c);
    if (!foesAlive(w, a) && !p.dead) {
      a.fleeing = undefined; // hạ hết bầy trong lúc vận: THẮNG (huỷ vận, không trừ giá)
      return finishArena(w, sid, "won");
    }
    if (a.fleeing !== undefined && w.now >= a.fleeing.at && a.settling === undefined) {
      void completeFlee(w, sid, a); // hết vận: trừ giá -> lưu -> thoát (ưu tiên hơn hết giờ: người đã bấm bỏ chạy thì được trả giá bỏ chạy)
      return;
    }
    if (w.now >= a.deadline) return finishArena(w, sid, "timeout");
    if (w.now >= a.nextStateAt) {
      a.nextStateAt = w.now + 1000;
      a.price = ambushPriceOf(p, c, "mid");
      const fleeMs = a.fleeing !== undefined ? Math.max(1, a.fleeing.at - w.now) : undefined;
      w.events.ambushState(sid, {
        msLeft: Math.max(0, a.deadline - w.now),
        price: a.price,
        ...(fleeMs !== undefined ? { fleeMs } : {}),
      });
    }
    return;
  }
  // pha `over`: kẻ địch không đánh tiếp (đặt lại hộ thể phòng hộ thể mạng vừa ghi đè `shieldUntil` lúc nối lại); tới giờ thì đưa về chỗ cũ
  if (a.endAt !== null) lockOver(w, sid, c, a.endAt + 5_000);
  forgetTarget(w, sid);
  // Chết thật (mục 53): thoát khi Duyên đã cộng (`limbo.credited`, WorldRoom.enterLimbo) hoặc hết kiên nhẫn (phòng gốc tự cộng khi nạp hồ sơ Hoàng Tuyền); sống: thoát khi đã đứng dậy
  const died = c.limbo !== undefined;
  const ready = died
    ? c.limbo!.credited || w.now >= (a.endAt ?? 0) + DIED_EXIT_PATIENCE_MS
    : !p.dead;
  if (a.endAt !== null && w.now >= a.endAt && w.now >= a.exitTryAt && !c.travelling && ready) {
    a.exitTryAt = w.now + EXIT_RETRY_MS;
    w.onArenaExit?.(sid);
  }
}
