// PK thách đấu (M3 bước 5b, docs/THIET_KE_PK.md; hợp đồng shared/src/duel.ts). Hai người CÙNG PHÒNG chỉ đánh nhau khi CẢ HAI
// đồng ý; trận có đếm ngược và luôn kết thúc rõ; chết vì thách đấu KHÔNG mất kiếp.
//
// Điểm an toàn chính: sát thương người lên người đi qua `duelHit` (hàm trừ máu RIÊNG), KHÔNG BAO GIỜ qua `hurtPlayer` /
// `beginLimbo`, nên không có đường nào từ thách đấu tới luân hồi. Người trong trận bất tử trước quái (`hurtPlayer` và AI quái
// kiểm `World.duels`), không hồi phục, không uống đan hồi huyết. Trận KHÔNG lưu file (sập giữa trận: không có gì để mất).
//
// Không đụng Colyseus `Room`; mọi tin từ client đều không đáng tin (bộ đọc ở shared, kiểm lại trạng thái lúc nhận).
import {
  DUEL_COOLDOWN_MS,
  DUEL_COUNTDOWN_MS,
  DUEL_INVITE_TTL_MS,
  DUEL_KO_HP_PCT,
  DUEL_KO_MS,
  DUEL_LEASH_PX,
  DUEL_MAX_MS,
  DUEL_RANGE,
  DUEL_STATE_MS,
  PK_DAMAGE_MULT,
  PLAYER_RADIUS,
  TICK_MS,
  TRAVEL_COMBAT_LOCK_MS,
  canChallenge,
  duelChallengeFailMessage,
  parseDuelAnswer,
  parseDuelChallenge,
  statsFor,
  type DuelEndReason,
  type DuelParty,
  type DuelPhase,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import { angleDiff, type PlayerCtrl, type World } from "../world";
import { rollDamage } from "./damage";

/** Sai số khoảng cách (px) cho độ trễ: client kiểm bằng vị trí đoán trước nên có thể lệch vài bước (như `PORTAL_SLACK`). */
export const DUEL_RANGE_SLACK = 24;
/** Nhịp quét lời mời / hồi chiêu hết hạn (ms), không mỗi tick. */
const SWEEP_MS = 500;
/** Gửi `duelState` mỗi chừng này tick. */
const STATE_EVERY_TICKS = Math.max(1, Math.round(DUEL_STATE_MS / TICK_MS));

export interface Duel {
  a: string;
  b: string;
  phase: DuelPhase;
  /** Lúc được đánh (hết đếm ngược) */
  fightAt: number;
  /** Lúc hết giờ (hoà) */
  endsAt: number;
  /** Điểm bắt đầu (tâm hai người lúc nhận): rời quá `DUEL_LEASH_PX` là bỏ chạy */
  ox: number;
  oy: number;
}

interface Invite {
  /** sessionId người thách */
  from: string;
  until: number;
}

/** Sổ trận và lời mời của MỘT phòng (hai người phải cùng phòng nên không cần `Hub`). */
export class Duels {
  private readonly byPlayer = new Map<string, Duel>();
  /** Lời mời đang chờ, theo người được mời */
  private readonly invites = new Map<string, Invite[]>();
  /** Lần thách gần nhất của mỗi người (hồi chiêu) */
  private readonly lastChallengeAt = new Map<string, number>();
  /** Hồi chiêu theo cặp (sau khi bị từ chối / hết hạn): khoá `a|b` có thứ tự, giá trị là lúc hết */
  private readonly pairUntil = new Map<string, number>();
  nextSweepAt = 0;

  /** Có trận nào đang diễn ra không (rẻ, không cấp phát: dùng ở đường nóng như vòng lặp quái). */
  get active() {
    return this.byPlayer.size > 0;
  }
  /** Số trận đang diễn ra (mỗi trận đếm một lần; cấp phát một `Set`: chỉ dùng ngoài đường nóng, test, số đo). */
  get size() {
    return new Set(this.byPlayer.values()).size;
  }
  /** Số lời mời đang chờ (số đo / test rò rỉ: về 0 sau khi hết hạn). */
  get invitesSize() {
    let n = 0;
    for (const l of this.invites.values()) n += l.length;
    return n;
  }
  /** Số mục hồi chiêu đang giữ (về 0 sau khi hết hồi chiêu và qua một nhịp quét). */
  get cooldownSize() {
    return this.lastChallengeAt.size + this.pairUntil.size;
  }
  /** Còn gì cần `tickDuels` làm không (đường nóng: thường là không). */
  get idle() {
    return this.byPlayer.size === 0 && this.invites.size === 0 && this.cooldownSize === 0;
  }

  has(sid: string) {
    return this.byPlayer.has(sid);
  }
  of(sid: string): Duel | undefined {
    return this.byPlayer.get(sid);
  }
  all(): Duel[] {
    return [...new Set(this.byPlayer.values())];
  }
  /** Người còn lại của trận chứa `sid` (không có trận thì `undefined`). */
  opponentOf(sid: string): string | undefined {
    const d = this.byPlayer.get(sid);
    return d ? (d.a === sid ? d.b : d.a) : undefined;
  }

  /** @internal */
  _start(d: Duel) {
    this.byPlayer.set(d.a, d);
    this.byPlayer.set(d.b, d);
  }
  /** @internal */
  _end(d: Duel) {
    if (this.byPlayer.get(d.a) === d) this.byPlayer.delete(d.a);
    if (this.byPlayer.get(d.b) === d) this.byPlayer.delete(d.b);
  }
  /** @internal Lời mời còn hạn tới `target`. */
  _invitesTo(target: string, now: number): Invite[] {
    return (this.invites.get(target) ?? []).filter((i) => i.until > now);
  }
  /** @internal */
  _addInvite(target: string, inv: Invite) {
    const list = this.invites.get(target) ?? [];
    list.push(inv);
    this.invites.set(target, list);
  }
  /** @internal Bỏ lời mời của `from` tới `target` (một lần dùng); trả lời mời đã bỏ nếu có. */
  _takeInvite(target: string, from: string): Invite | undefined {
    const list = this.invites.get(target) ?? [];
    const i = list.findIndex((x) => x.from === from);
    if (i < 0) return undefined;
    const [inv] = list.splice(i, 1);
    if (list.length) this.invites.set(target, list);
    else this.invites.delete(target);
    return inv;
  }
  /** @internal Bỏ mọi lời mời liên quan tới `sid` (gửi đi hoặc nhận về). */
  _dropInvitesOf(sid: string) {
    this.invites.delete(sid);
    for (const [target, list] of this.invites) {
      const kept = list.filter((i) => i.from !== sid);
      if (kept.length) this.invites.set(target, kept);
      else this.invites.delete(target);
    }
  }
  /** @internal */
  _cooldownLeft(sid: string, now: number): number {
    const last = this.lastChallengeAt.get(sid);
    return last === undefined ? 0 : Math.max(0, DUEL_COOLDOWN_MS - (now - last));
  }
  /** @internal */
  _markChallenge(sid: string, now: number) {
    this.lastChallengeAt.set(sid, now);
  }
  /** @internal */
  _pairLeft(from: string, to: string, now: number): number {
    return Math.max(0, (this.pairUntil.get(`${from}|${to}`) ?? 0) - now);
  }
  /** @internal */
  _markPair(from: string, to: string, now: number) {
    this.pairUntil.set(`${from}|${to}`, now + DUEL_COOLDOWN_MS);
  }
  /** @internal Quên mọi thứ về `sid` (rời phòng). */
  _forget(sid: string) {
    this.lastChallengeAt.delete(sid);
    for (const k of [...this.pairUntil.keys()]) {
      const [a, b] = k.split("|");
      if (a === sid || b === sid) this.pairUntil.delete(k);
    }
  }
  /** @internal Bỏ các mục hết hạn; trả lời mời vừa hết hạn để báo người thách. */
  _sweep(now: number): { target: string; from: string }[] {
    const expired: { target: string; from: string }[] = [];
    for (const [target, list] of [...this.invites]) {
      const kept = list.filter((i) => {
        if (i.until > now) return true;
        expired.push({ target, from: i.from });
        return false;
      });
      if (kept.length) this.invites.set(target, kept);
      else this.invites.delete(target);
    }
    for (const [sid, at] of [...this.lastChallengeAt])
      if (now - at >= DUEL_COOLDOWN_MS) this.lastChallengeAt.delete(sid);
    for (const [k, until] of [...this.pairUntil]) if (until <= now) this.pairUntil.delete(k);
    return expired;
  }
  clear() {
    this.byPlayer.clear();
    this.invites.clear();
    this.lastChallengeAt.clear();
    this.pairUntil.clear();
    this.nextSweepAt = 0;
  }
}

const toast = (w: World, sid: string, text: string, tone: "good" | "bad" | "info" = "bad") =>
  w.events.toast(sid, { text, tone });

/** sessionId của người có đạo hiệu `name` (không phân biệt hoa thường) trong phòng này. */
function sidByName(w: World, name: string): string | null {
  const key = name.toLowerCase();
  let found: string | null = null;
  w.state.players.forEach((p, sid) => {
    if (found === null && p.name.toLowerCase() === key) found = sid;
  });
  return found;
}

/** Một bên của lời thách, nhìn bằng con mắt của `canChallenge`. */
function partyOf(w: World, sid: string): { party: DuelParty; p: Player; c: PlayerCtrl } | null {
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!p || !c) return null;
  return {
    p,
    c,
    party: {
      name: p.name,
      alive: !p.dead,
      inSafe: w.map.inSafe(p.x, p.y),
      inDuel: w.duels.has(sid),
      busy:
        w.ghosts.has(sid) || c.travelling === true || w.now - c.lastHitAt < TRAVEL_COMBAT_LOCK_MS,
    },
  };
}

const inDungeonRoom = (w: World) => w.map.def.kind === "dungeon";

const distanceOf = (a: Player, b: Player) =>
  Math.max(0, Math.hypot(a.x - b.x, a.y - b.y) - DUEL_RANGE_SLACK);

// ---------- Thách / trả lời ----------

/** `duelChallenge { name }`: thách đấu một người cùng phòng. Kiểm LẠI mọi điều kiện ở server (`canChallenge`). */
export function duelChallenge(w: World, sid: string, raw: unknown) {
  const msg = parseDuelChallenge(raw);
  if (!msg) return; // tin rác: im lặng (đã tính vào hạn mức tin nhắn)
  const me = partyOf(w, sid);
  if (!me) return;
  const targetSid = sidByName(w, msg.name);
  const target = targetSid === null ? null : partyOf(w, targetSid);
  const check = canChallenge({
    self: me.party,
    target: target?.party ?? null,
    distance: target ? distanceOf(me.p, target.p) : Infinity,
    inDungeon: inDungeonRoom(w),
    cooldownLeftMs: w.duels._cooldownLeft(sid, w.now),
    pairCooldownLeftMs: targetSid === null ? 0 : w.duels._pairLeft(sid, targetSid, w.now),
    alreadyInvited:
      targetSid !== null && w.duels._invitesTo(targetSid, w.now).some((i) => i.from === sid),
    targetPendingInvites: targetSid === null ? 0 : w.duels._invitesTo(targetSid, w.now).length,
  });
  if (!check.ok) return toast(w, sid, duelChallengeFailMessage(check.reason));
  if (targetSid === null || !target) return;
  w.duels._markChallenge(sid, w.now);
  w.duels._addInvite(targetSid, { from: sid, until: w.now + DUEL_INVITE_TTL_MS });
  w.events.duelInvited(targetSid, { from: me.p.name, ttlMs: DUEL_INVITE_TTL_MS });
  toast(w, sid, `Đã thách đấu ${target.p.name}.`, "info");
}

/** `duelAccept { from }` / `duelDecline { from }`: trả lời lời thách đấu của `from` (đạo hiệu người thách). */
export function duelAnswer(w: World, sid: string, raw: unknown, accept: boolean) {
  const msg = parseDuelAnswer(raw);
  if (!msg) return;
  const me = partyOf(w, sid);
  if (!me) return;
  const fromSid = sidByName(w, msg.from);
  const inv = fromSid === null ? undefined : w.duels._takeInvite(sid, fromSid); // một lần dùng, nhận hay từ chối đều xoá
  if (fromSid === null || !inv) return toast(w, sid, "Không có lời thách đấu nào từ người này.");
  if (inv.until <= w.now) return toast(w, sid, "Lời thách đấu đã hết hạn.");
  const challenger = partyOf(w, fromSid);
  if (!accept) {
    w.duels._markPair(fromSid, sid, w.now);
    if (challenger) toast(w, fromSid, `${me.p.name} từ chối lời thách đấu.`, "info");
    return;
  }
  // Kiểm LẠI lúc nhận: người thách còn trong tầm, ngoài trấn, chưa trong trận khác; cả hai còn sống và rảnh
  const stale = () => toast(w, sid, "Lời thách đấu không còn hiệu lực.");
  if (!challenger || inDungeonRoom(w)) return stale();
  const ok = (x: DuelParty) => x.alive && !x.inDuel && !x.inSafe && !x.busy;
  if (!ok(me.party) || !ok(challenger.party)) return stale();
  if (!(distanceOf(me.p, challenger.p) <= DUEL_RANGE)) return stale();
  startDuel(w, fromSid, challenger.p, sid, me.p);
}

function startDuel(w: World, a: string, pa: Player, b: string, pb: Player) {
  // Mọi lời mời khác liên quan tới hai người mất hiệu lực (một người một trận)
  w.duels._dropInvitesOf(a);
  w.duels._dropInvitesOf(b);
  const d: Duel = {
    a,
    b,
    phase: "countdown",
    fightAt: w.now + DUEL_COUNTDOWN_MS,
    endsAt: w.now + DUEL_COUNTDOWN_MS + DUEL_MAX_MS,
    ox: (pa.x + pb.x) / 2,
    oy: (pa.y + pb.y) / 2,
  };
  w.duels._start(d);
  for (const [sid, p] of [
    [a, pa],
    [b, pb],
  ] as const) {
    p.duel = true;
    p.meditating = false;
    for (const m of w.mctrl.values()) if (m.target === sid) m.target = null; // quái bỏ mục tiêu ngay
  }
  sendState(w, d);
}

/** `duelYield`: đầu hàng (thua ngay, không gục, giữ khí huyết). */
export function duelYield(w: World, sid: string) {
  const d = w.duels.of(sid);
  if (!d) return;
  endDuel(w, d, w.duels.opponentOf(sid)!, "yield");
}

// ---------- Sát thương người lên người ----------

/**
 * Đòn của `attacker` trúng `target`: chỉ khi hai người đang trong CÙNG MỘT trận, pha `fight`. Hàm trừ máu riêng, KHÔNG qua
 * `hurtPlayer` / `beginLimbo`. Hết máu thì `endDuel` (người thua gục, không mất gì). Trả `true` nếu có sát thương.
 */
export function duelHit(w: World, attacker: string, target: string, mult: number): boolean {
  const d = w.duels.of(attacker);
  if (!d || d.phase !== "fight" || w.duels.opponentOf(attacker) !== target) return false;
  const pa = w.state.players.get(attacker);
  const pt = w.state.players.get(target);
  if (!pa || !pt || pa.dead || pt.dead) return false;
  const atk = statsFor(pa.realm, pa.tier, pa, w.ctrl.get(attacker)?.mult).atk;
  const { dmg, crit } = rollDamage(atk, mult * PK_DAMAGE_MULT);
  pt.hp = Math.max(0, pt.hp - dmg);
  w.events.dmg({ target, amount: dmg, x: pt.x, y: pt.y - 20, crit, toPlayer: true });
  if (pt.hp <= 0) endDuel(w, d, attacker, "ko");
  return true;
}

/** Đòn chém (cung quanh người đánh): trúng ĐỐI THỦ nếu trong tầm và trong cung. Gọi từ `slash` sau khi duyệt quái. */
export function duelSlash(
  w: World,
  sid: string,
  p: Player,
  angle: number,
  range: number,
  arc: number,
  mult: number,
) {
  const target = w.duels.opponentOf(sid);
  const pt = target === undefined ? undefined : w.state.players.get(target);
  if (!target || !pt) return;
  const d = Math.hypot(pt.x - p.x, pt.y - p.y);
  if (d > range + PLAYER_RADIUS) return;
  if (d > PLAYER_RADIUS && angleDiff(Math.atan2(pt.y - p.y, pt.x - p.x), angle) > arc / 2) return;
  duelHit(w, sid, target, mult);
}

/** Kiếm khí (tia thẳng): trúng ĐỐI THỦ nếu nằm trên tia. Gọi từ `swordQi` sau khi duyệt quái. */
export function duelBeam(
  w: World,
  sid: string,
  p: Player,
  angle: number,
  range: number,
  width: number,
  mult: number,
) {
  const target = w.duels.opponentOf(sid);
  const pt = target === undefined ? undefined : w.state.players.get(target);
  if (!target || !pt) return;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const rx = pt.x - p.x;
  const ry = pt.y - p.y;
  const along = rx * ux + ry * uy;
  const perp = Math.abs(rx * uy - ry * ux);
  if (along < -PLAYER_RADIUS || along > range + PLAYER_RADIUS || perp > width / 2 + PLAYER_RADIUS)
    return;
  duelHit(w, sid, target, mult);
}

// ---------- Kết thúc ----------

/**
 * Kết thúc trận (idempotent: trận đã dọn thì thôi). `winner` bỏ trống là HOÀ. Luôn: xoá khỏi sổ, tắt cờ `Player.duel`, gửi
 * `duelEnd` cho cả hai. Người thua vì `ko` gục `DUEL_KO_MS` rồi đứng dậy TẠI CHỖ (`c.reviveAt`); các lý do khác không gục.
 */
export function endDuel(w: World, d: Duel, winner: string | undefined, reason: DuelEndReason) {
  if (w.duels.of(d.a) !== d && w.duels.of(d.b) !== d) return;
  w.duels._end(d);
  for (const sid of [d.a, d.b]) {
    const p = w.state.players.get(sid);
    const c = w.ctrl.get(sid);
    if (p) p.duel = false;
    const result = winner === undefined ? "draw" : winner === sid ? "won" : "lost";
    if (p && c && result === "lost" && reason === "ko") {
      p.dead = true;
      c.deadAt = w.now;
      c.reviveAt = w.now + DUEL_KO_MS;
      c.inputs.length = 0;
      p.meditating = false;
    }
    if (p) w.events.duelEnd(sid, { result, reason });
  }
}

/** Người chơi rời phòng / bị gỡ: huỷ trận (hoà) và dọn lời mời, hồi chiêu liên quan. Gọi TRƯỚC khi xoá khỏi state. */
export function duelDrop(w: World, sid: string) {
  const d = w.duels.of(sid);
  if (d) endDuel(w, d, undefined, "disconnect");
  w.duels._dropInvitesOf(sid);
  w.duels._forget(sid);
}

/** Đứng dậy tại chỗ sau khi gục (gọi từ `tickRespawn` khi `c.reviveAt` tới): thua thách đấu (`DUEL_KO_HP_PCT`) hoặc gục trong bí cảnh (`c.reviveHpPct`). */
export function reviveInPlace(p: Player, c: PlayerCtrl) {
  const pct = c.reviveHpPct ?? DUEL_KO_HP_PCT;
  c.reviveAt = undefined;
  c.reviveHpPct = undefined;
  p.dead = false;
  p.meditating = false;
  p.hp = Math.max(1, Math.round(p.maxHp * pct));
}

function sendState(w: World, d: Duel) {
  for (const sid of [d.a, d.b]) {
    const opp = w.state.players.get(sid === d.a ? d.b : d.a);
    if (!opp || !w.state.players.has(sid)) continue;
    w.events.duelState(sid, {
      phase: d.phase,
      opponent: opp.name,
      startsInMs: Math.max(0, Math.round(d.fightAt - w.now)),
      endsInMs: Math.max(0, Math.round(d.endsAt - w.now)),
    });
  }
}

// ---------- Mỗi tick ----------

/**
 * Mỗi tick của phòng: quét lời mời / hồi chiêu hết hạn (theo nhịp, báo người thách), và với từng trận: đổi pha, hết giờ (hoà),
 * rớt mạng / qua cổng (hoà), bỏ chạy (rời quá `DUEL_LEASH_PX` hoặc vào khu an toàn: thua), `duelState` mỗi giây.
 * Không có trận, lời mời hay hồi chiêu nào thì thoát ngay (ngân sách tick không đổi).
 */
export function tickDuels(w: World) {
  const duels = w.duels;
  if (duels.idle) return;
  if (w.now >= duels.nextSweepAt) {
    duels.nextSweepAt = w.now + SWEEP_MS;
    for (const e of duels._sweep(w.now)) {
      duels._markPair(e.from, e.target, w.now);
      const target = w.state.players.get(e.target);
      if (target && w.state.players.has(e.from))
        toast(w, e.from, `${target.name} không trả lời lời thách đấu.`, "info");
    }
  }
  if (!duels.active) return;
  const emit = w.tick % STATE_EVERY_TICKS === 0;
  for (const d of duels.all()) {
    const pa = w.state.players.get(d.a);
    const pb = w.state.players.get(d.b);
    const ca = w.ctrl.get(d.a);
    const cb = w.ctrl.get(d.b);
    // Một bên không còn (rời phòng), rớt mạng (hồn lìa xác), đang đi qua cổng, hoặc chết vì lý do khác: huỷ, HOÀ
    if (
      !pa ||
      !pb ||
      !ca ||
      !cb ||
      pa.dead ||
      pb.dead ||
      w.ghosts.has(d.a) ||
      w.ghosts.has(d.b) ||
      ca.travelling ||
      cb.travelling
    ) {
      endDuel(w, d, undefined, "disconnect");
      continue;
    }
    // Bỏ chạy: vào khu an toàn hoặc rời quá xa điểm bắt đầu (người đó thua; hai người cùng vi phạm thì người thách trước)
    const fled = [d.a, d.b].find((sid) => {
      const p = w.state.players.get(sid)!;
      return w.map.inSafe(p.x, p.y) || Math.hypot(p.x - d.ox, p.y - d.oy) > DUEL_LEASH_PX;
    });
    if (fled !== undefined) {
      endDuel(w, d, w.duels.opponentOf(fled)!, "fled");
      continue;
    }
    if (w.now >= d.endsAt) {
      endDuel(w, d, undefined, "timeout");
      continue;
    }
    if (d.phase === "countdown" && w.now >= d.fightAt) {
      d.phase = "fight";
      sendState(w, d);
    } else if (emit) sendState(w, d);
  }
}
