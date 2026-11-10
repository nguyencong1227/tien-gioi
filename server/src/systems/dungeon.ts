// Bí cảnh: sổ lần chạy (run) và phần "sảnh" của vòng đời (M3 bước 4b-1, docs/THIET_KE_BI_CANH.md mục 4, 5;
// hợp đồng shared/src/dungeon.ts). Mở -> mời -> vào / từ chối -> hết hạn mời. Không đụng Colyseus `Room`: việc tạo phòng,
// lưu nhân vật và đưa người sang phòng bí cảnh là I/O nên do WorldRoom làm, nối vào đây bằng hook của `World`
// (`onDungeonOpen`, `onDungeonEnter`) như `onLimbo`.
// Phần trong phòng bí cảnh (4b-2): `memberJoined` / `memberLeft`, đồng hồ, `dungeonState` mỗi giây, kết thúc (hết giờ, mọi
// người chết / rời), đưa về Lạc Hà (`onDungeonExit`). Thắng (trùm chết), thưởng và lượt thưởng ngày là 4c (`finishRun` có sẵn).
//
// Server quyết định mọi thứ: tin từ client chỉ là ý định, kiểm lại hết (đội trưởng, cỡ đội, cảnh giới, còn sống, đứng gần
// Thủ môn, hồi chiêu, số run tối đa). Khoá thành viên là ĐẠO HIỆU viết thường (như `Hub.parties`): sessionId đổi mỗi lần
// vào phòng và sẽ đổi khi sang phòng bí cảnh.
import { randomBytes } from "node:crypto";
import {
  DUNGEONS,
  DUNGEON_DAILY_REWARDS,
  DUNGEON_INVITE_MS,
  DUNGEON_OPEN_COOLDOWN_MS,
  DUNGEON_STATE_MS,
  TICK_MS,
  TRAVEL_COMBAT_LOCK_MS,
  canOpenDungeon,
  dungeonOf,
  dungeonOpenFailMessage,
  dungeonRewardsLeft,
  parseDungeonDecline,
  parseDungeonEnter,
  parseDungeonOpen,
  stepOf,
  type DialogOption,
  type DungeonDef,
  type DungeonEndReason,
  type DungeonMemberCheck,
  type DungeonMemberView,
  type DungeonPhase,
  type DungeonStateMsg,
} from "@tien-gioi/shared";
import type { PlayerCtrl, World } from "../world";
import { nearNpc } from "./near-npc";

/** NPC mở bí cảnh (shared/src/npcs.ts). */
export const GATEKEEPER_ID = "thu_mon";

/** Nhịp kiểm hết hạn mời (ms): chung cho mọi phòng, không mỗi tick. */
const RUNS_CHECK_MS = 500;
/** Gửi `dungeonState` mỗi chừng này tick (`DUNGEON_STATE_MS` / `TICK_MS` = 20). */
const STATE_EVERY_TICKS = Math.max(1, Math.round(DUNGEON_STATE_MS / TICK_MS));
/** Sau khi run thua, chờ chừng này (ms) cho client hiện màn kết quả rồi đưa mọi người về Lạc Hà. */
export const DUNGEON_EXIT_DELAY_MS = 3000;

export type MemberStatus = "invited" | "declined" | "inside" | "left";

export interface RunMember {
  /** Khoá: đạo hiệu viết thường */
  key: string;
  /** Đạo hiệu hiển thị (lúc mở) */
  name: string;
  status: MemberStatus;
}

export interface Run {
  /** 128 bit ngẫu nhiên, hex thường (`RUN_ID_RE`): đoán không được */
  readonly id: string;
  readonly dungeonId: string;
  /** Id phòng Colyseus của run; `null` cho tới khi phòng được tạo (chưa mời, chưa vào được) */
  roomId: string | null;
  /** Khoá đội trưởng */
  readonly leader: string;
  /** Thành viên CỐ ĐỊNH lúc mở (người rời đội giữa chừng vẫn ở trong run, người mới vào đội thì không) */
  readonly members: Map<string, RunMember>;
  phase: DungeonPhase;
  readonly openedAt: number;
  /** Hết hạn bấm "Vào" (ms, đồng hồ `World.now`) */
  readonly inviteUntil: number;
  /** Lúc người đầu tiên vào phòng (bắt đầu đồng hồ `timeLimitMs`); `null` khi còn `gathering` */
  startedAt: number | null;
  /** Hết hạn của pha hiện tại */
  deadline: number;
  /** Lúc đưa mọi người còn trong phòng về Lạc Hà và xoá run (sau khi kết thúc); `null` khi còn đang chạy */
  exitAt: number | null;
  /** Lý do kết thúc (chỉ có sau khi `finishRun`) */
  endReason: DungeonEndReason | null;
}

/** Sổ run của cả tiến trình (`Hub.runs`): chỉ mục theo run và theo khoá đạo hiệu. */
export class Runs {
  private readonly byId = new Map<string, Run>();
  private readonly runOfKey = new Map<string, string>();
  /** Lần mở gần nhất của mỗi đội trưởng (hồi chiêu) */
  private readonly lastOpenAt = new Map<string, number>();
  private nextCheckAt = 0;

  /** Số run đang mở (đếm theo `MAX_DUNGEON_RUNS`). */
  get size() {
    return this.byId.size;
  }

  get(id: unknown): Run | undefined {
    return typeof id === "string" ? this.byId.get(id) : undefined;
  }

  /** Run mà người chơi `key` đang là thành viên (mỗi người tối đa một). */
  ofKey(key: string): Run | undefined {
    const id = this.runOfKey.get(key);
    return id === undefined ? undefined : this.byId.get(id);
  }

  all(): IterableIterator<Run> {
    return this.byId.values();
  }

  /** Còn bao nhiêu ms hồi chiêu mở của đội trưởng `key` (0 = sẵn sàng). */
  cooldownLeft(key: string, now: number): number {
    const last = this.lastOpenAt.get(key);
    return last === undefined ? 0 : Math.max(0, DUNGEON_OPEN_COOLDOWN_MS - (now - last));
  }

  /** Số đội trưởng còn đang trong hồi chiêu mở (số đo / test rò rỉ: về 0 sau khi hết hồi chiêu và qua một nhịp kiểm). */
  get cooldownSize() {
    return this.lastOpenAt.size;
  }

  /** @internal Bỏ các mục hồi chiêu đã hết (không có thì mỗi đội trưởng từng mở để lại một mục suốt đời tiến trình). */
  _sweepCooldowns(now: number) {
    for (const [key, at] of this.lastOpenAt)
      if (now - at >= DUNGEON_OPEN_COOLDOWN_MS) this.lastOpenAt.delete(key);
  }

  /** @internal Đăng ký run mới và chiếm chỗ của từng thành viên. */
  _add(run: Run, now: number) {
    this.byId.set(run.id, run);
    for (const key of run.members.keys()) this.runOfKey.set(key, run.id);
    this.lastOpenAt.set(run.leader, now);
  }

  /** @internal Xoá run, giải phóng mọi thành viên. Idempotent. */
  _remove(run: Run) {
    if (this.byId.get(run.id) !== run) return;
    this.byId.delete(run.id);
    for (const key of run.members.keys())
      if (this.runOfKey.get(key) === run.id) this.runOfKey.delete(key);
  }

  /** @internal Tới nhịp kiểm hết hạn chưa (dùng chung mọi phòng). */
  _dueCheck(now: number): boolean {
    if (now < this.nextCheckAt) return false;
    this.nextCheckAt = now + RUNS_CHECK_MS;
    return true;
  }

  /** Xoá sạch (test). */
  clear() {
    this.byId.clear();
    this.runOfKey.clear();
    this.lastOpenAt.clear();
    this.nextCheckAt = 0;
  }
}

const keyOfName = (name: string) => name.toLowerCase();

const toast = (w: World, sid: string, text: string, tone: "good" | "bad" | "info" = "bad") =>
  w.events.toast(sid, { text, tone });

/** Gửi toast cho một người theo khoá, ở phòng nào cũng được (im lặng nếu không tìm thấy). */
function toastKey(w: World, key: string, text: string, tone: "good" | "bad" | "info") {
  const loc = w.hub.locate(key);
  if (loc) loc.w.events.toast(loc.sid, { text, tone });
}

/**
 * Lượt nhận thưởng hoàn thành còn lại hôm nay của người chơi. 4b chưa có bộ đếm trong file lưu (`dungeonDaily`, 4c)
 * nên mọi người còn đủ lượt; 4c đọc `c.save.dungeonDaily` ở ĐÚNG hàm này.
 */
export function rewardsLeftOf(_c: PlayerCtrl, now: number): number {
  return dungeonRewardsLeft(undefined, now);
}

/** Người chơi ở bất cứ phòng nào, nhìn bằng con mắt của `canOpenDungeon`. */
function memberCheck(w: World, key: string): DungeonMemberCheck {
  const loc = w.hub.locate(key);
  const name = loc?.p.name ?? w.parties.names.get(key) ?? key;
  if (!loc) {
    return { name, online: false, alive: false, step: 0, inRun: false, reconnecting: false };
  }
  return {
    name,
    online: true,
    alive: !loc.p.dead,
    step: stepOf(loc.p.realm, loc.p.tier),
    inRun: w.hub.runs.ofKey(key) !== undefined,
    reconnecting: loc.w.ghosts.has(loc.sid),
  };
}

/** Thành viên đội của người chơi `key` (không có đội thì chỉ chính họ) và họ có phải đội trưởng không. */
function partyOf(w: World, key: string): { keys: readonly string[]; isLeader: boolean } {
  const id = w.parties.partyIdOf(key);
  const party = id === undefined ? undefined : w.parties._get(id);
  if (!party) return { keys: [key], isLeader: true };
  return { keys: party.members, isLeader: party.leader === key };
}

// ---------- Mở ----------

/**
 * `dungeonOpen { dungeonId }`: đội trưởng mở bí cảnh. Kiểm LẠI mọi điều kiện ở server (`canOpenDungeon`), lập run
 * `gathering`, rồi nhờ phòng tạo phòng bí cảnh (`w.onDungeonOpen`); phòng gọi `runReady` khi đã có `roomId` để gửi lời mời.
 * Không có hook (test đơn vị) thì coi phòng đã sẵn sàng ngay với id giả. Trả run vừa lập, hoặc `null` nếu từ chối.
 */
export function openDungeon(w: World, sid: string, raw: unknown): Run | null {
  const msg = parseDungeonOpen(raw);
  if (!msg) return null; // tin rác: im lặng (đã tính vào hạn mức tin nhắn)
  const near = nearNpc(w, sid, GATEKEEPER_ID);
  if (!near) return toastNull(w, sid, "Phải đứng gần Thủ môn mới mở được bí cảnh.");
  const def = dungeonOf(msg.dungeonId);
  const me = keyOfName(near.p.name);
  const { keys, isLeader } = partyOf(w, me);
  const check = canOpenDungeon({
    def,
    isLeader,
    members: keys.map((k) => memberCheck(w, k)),
    runsOpen: w.hub.runs.size,
    cooldownLeftMs: w.hub.runs.cooldownLeft(me, w.now),
  });
  if (!check.ok) return toastNull(w, sid, dungeonOpenFailMessage(check.reason, check.who));
  // `canOpenDungeon` ok thì `def` có (`unknown_dungeon` đã loại), nhưng kiểu không biết điều đó
  if (!def) return null;

  const members = new Map<string, RunMember>();
  for (const k of keys) {
    const loc = w.hub.locate(k);
    members.set(k, { key: k, name: loc?.p.name ?? k, status: "invited" });
  }
  const run: Run = {
    id: randomBytes(16).toString("hex"),
    dungeonId: def.id,
    roomId: null,
    leader: me,
    members,
    phase: "gathering",
    openedAt: w.now,
    inviteUntil: w.now + DUNGEON_INVITE_MS,
    startedAt: null,
    deadline: w.now + DUNGEON_INVITE_MS,
    exitAt: null,
    endReason: null,
  };
  w.hub.runs._add(run, w.now);
  if (w.onDungeonOpen) w.onDungeonOpen(run);
  else runReady(w, run, `test-${run.id.slice(0, 8)}`);
  return run;
}

function toastNull(w: World, sid: string, text: string): null {
  toast(w, sid, text);
  return null;
}

/** Phòng bí cảnh đã tạo xong: ghi `roomId` rồi mời từng thành viên đang online (ở bất cứ phòng nào). */
export function runReady(w: World, run: Run, roomId: string) {
  if (w.hub.runs.get(run.id) !== run) return; // huỷ trong lúc phòng đang được tạo
  run.roomId = roomId;
  const def = dungeonOf(run.dungeonId);
  if (!def) return;
  const leaderName = run.members.get(run.leader)?.name ?? "";
  for (const m of run.members.values()) {
    const loc = w.hub.locate(m.key);
    const c = loc?.w.ctrl.get(loc.sid);
    if (!loc || !c) continue;
    loc.w.events.dungeonInvite(loc.sid, {
      runId: run.id,
      dungeonId: def.id,
      from: leaderName,
      expiresInMs: Math.max(0, run.inviteUntil - w.now),
      rewardsLeft: rewardsLeftOf(c, w.now),
    });
  }
}

/** Không tạo được phòng (lỗi matchMaker...): huỷ run, báo đội trưởng. */
export function runFailed(w: World, run: Run) {
  if (w.hub.runs.get(run.id) !== run) return;
  w.hub.runs._remove(run);
  run.phase = "lost";
  toastKey(w, run.leader, "Bí cảnh chưa mở được, thử lại sau.", "bad");
}

// ---------- Vào / từ chối ----------

/** Run và thành viên ứng với một tin `dungeonEnter` / `dungeonDecline`, hoặc `null` (đã báo người chơi). */
function lookupInvite(
  w: World,
  sid: string,
  runId: string,
): { run: Run; member: RunMember; key: string } | null {
  const p = w.state.players.get(sid);
  if (!p) return null;
  const key = keyOfName(p.name);
  const run = w.hub.runs.get(runId);
  const member = run?.members.get(key);
  // Không phân biệt "run không có" với "không phải thành viên": không lộ run của người khác
  if (!run || !member || run.roomId === null || run.phase === "won" || run.phase === "lost")
    return toastNull(w, sid, "Lời mời đã hết hạn.");
  return { run, member, key };
}

/**
 * `dungeonEnter { runId }`: bước vào run đã được mời. Kiểm lại lời mời (còn hạn, đúng người, chưa trả lời), còn sống, không
 * đang đi qua cổng / rớt mạng, không vừa giao chiến. Đạt thì nhờ phòng đưa sang phòng bí cảnh (`w.onDungeonEnter`: lưu
 * nhân vật với chỗ vào ở Lạc Hà rồi gửi `travelTo { mapId, roomId }`). Trạng thái thành viên đổi thành `inside` khi họ
 * thật sự vào phòng bí cảnh (`memberJoined`), không phải lúc này: vào không được (rớt mạng) thì còn bấm lại được.
 */
export function enterDungeon(w: World, sid: string, raw: unknown): boolean {
  const msg = parseDungeonEnter(raw);
  if (!msg) return false;
  const found = lookupInvite(w, sid, msg.runId);
  if (!found) return false;
  const { run, member } = found;
  if (w.map.def.kind === "dungeon") return false; // đã ở trong bí cảnh: không có gì để vào
  if (member.status !== "invited") return toastFalse(w, sid, "Ngươi đã trả lời lời mời này rồi.");
  if (w.now >= run.inviteUntil) return toastFalse(w, sid, "Lời mời đã hết hạn.");
  const r = w.ready(sid);
  if (!r) return false; // đang trọng thương / không có trong phòng
  if (r.c.travelling || w.ghosts.has(sid)) return false;
  if (w.now - r.c.lastHitAt < TRAVEL_COMBAT_LOCK_MS)
    return toastFalse(w, sid, "Đang giao chiến, chưa vào bí cảnh được.");
  if (!w.onDungeonEnter) return false; // không có phòng nối vào (test đơn vị tự đặt hook)
  w.onDungeonEnter(sid, run);
  return true;
}

function toastFalse(w: World, sid: string, text: string): false {
  toast(w, sid, text);
  return false;
}

/**
 * `dungeonDecline { runId }`: từ chối lời mời. Báo đội trưởng ngay; mọi người được mời đều đã từ chối (không ai chờ trả
 * lời, không ai ở trong) thì huỷ run sớm và báo đội trưởng `declined`.
 */
export function declineDungeon(w: World, sid: string, raw: unknown) {
  const msg = parseDungeonDecline(raw);
  if (!msg) return;
  const found = lookupInvite(w, sid, msg.runId);
  if (!found) return;
  const { run, member, key } = found;
  if (member.status !== "invited") return;
  member.status = "declined";
  if (key !== run.leader) toastKey(w, run.leader, `${member.name} đã từ chối vào bí cảnh.`, "info");
  const waiting = [...run.members.values()].some(
    (m) => m.status === "invited" || m.status === "inside",
  );
  if (!waiting) endGathering(w, run, "declined");
}

// ---------- Kết thúc sảnh ----------

/**
 * Run còn `gathering` mà không ai vào được nữa (hết hạn mời, hoặc mọi người đã từ chối): huỷ run, báo đội trưởng bằng
 * `dungeonEnd` (ở ngoài phòng nên client hiện thông báo, không mở màn kết quả). Phòng bí cảnh thấy run biến mất thì tự đóng.
 */
export function endGathering(
  w: World,
  run: Run,
  reason: Extract<DungeonEndReason, "no_entry" | "declined">,
) {
  if (run.phase !== "gathering" || w.hub.runs.get(run.id) !== run) return;
  w.hub.runs._remove(run);
  run.phase = "lost";
  const loc = w.hub.locate(run.leader);
  const c = loc?.w.ctrl.get(loc.sid);
  if (loc && c)
    loc.w.events.dungeonEnd(loc.sid, {
      result: "lost",
      reason,
      rewardsLeft: rewardsLeftOf(c, w.now),
    });
}

/**
 * Mỗi tick (mọi phòng gọi, nhịp chung `RUNS_CHECK_MS`): run `gathering` quá hạn mời thì huỷ. Idempotent giữa các phòng:
 * phòng nào tick trước xử lý, phòng sau thấy run đã biến mất.
 */
export function tickDungeons(w: World) {
  const runs = w.hub.runs;
  if ((runs.size === 0 && runs.cooldownSize === 0) || !runs._dueCheck(w.now)) return;
  runs._sweepCooldowns(w.now);
  for (const run of [...runs.all()]) {
    if (run.phase === "gathering" && w.now >= run.inviteUntil) endGathering(w, run, "no_entry");
  }
}

// ---------- Trong phòng bí cảnh (4b-2) ----------

/** Run mà phòng bí cảnh này phục vụ; `undefined` ở phòng thường hoặc khi run đã bị xoá. */
export function runOfWorld(w: World): Run | undefined {
  return w.runId === null ? undefined : w.hub.runs.get(w.runId);
}

/** Đạo hiệu (viết thường) của những người ĐANG CÓ MẶT và còn sống trong phòng này. */
function aliveKeys(w: World): Set<string> {
  const alive = new Set<string>();
  w.state.players.forEach((p) => {
    if (!p.dead) alive.add(keyOfName(p.name));
  });
  return alive;
}

/**
 * Một thành viên đã thật sự vào phòng bí cảnh (`onJoin`): đánh dấu `inside`; người ĐẦU TIÊN vào thì run chuyển `running` và
 * đồng hồ `timeLimitMs` bắt đầu chạy. Người vào muộn (còn trong hạn mời) không đổi đồng hồ.
 */
export function memberJoined(w: World, run: Run, key: string) {
  const m = run.members.get(key);
  if (!m) return;
  m.status = "inside";
  if (run.phase === "gathering") {
    const def = dungeonOf(run.dungeonId);
    run.phase = "running";
    run.startedAt = w.now;
    run.deadline = w.now + (def?.timeLimitMs ?? 0);
  }
  sendDungeonState(w, run);
}

/** Một thành viên rời phòng bí cảnh (thoát, rớt mạng quá hạn, được đưa về Lạc Hà): `left`. Không đổi nếu họ không ở trong. */
export function memberLeft(w: World, run: Run, key: string) {
  const m = run.members.get(key);
  if (m && m.status === "inside") m.status = "left";
  void w;
}

/** `dungeonLeave`: rời bí cảnh sớm, về cổng vào (Lạc Hà). Chỉ trong phòng bí cảnh, người còn sống và đang ở trong run. */
export function leaveDungeon(w: World, sid: string) {
  const run = runOfWorld(w);
  const r = w.ready(sid);
  if (!run || !r || run.members.get(keyOfName(r.p.name))?.status !== "inside") return;
  w.onDungeonExit?.(sid);
}

/** Thành viên đang ở trong phòng này (`inside`), kèm sessionId. */
function insideMembers(w: World, run: Run): { sid: string; key: string; dead: boolean }[] {
  const out: { sid: string; key: string; dead: boolean }[] = [];
  w.state.players.forEach((p, sid) => {
    const key = keyOfName(p.name);
    if (run.members.get(key)?.status === "inside") out.push({ sid, key, dead: p.dead });
  });
  return out;
}

/** Còn bao nhiêu ms tới hạn của pha hiện tại (không âm). */
function deadlineIn(w: World, run: Run): number {
  const at = run.exitAt ?? (run.phase === "gathering" ? run.inviteUntil : run.deadline);
  return Math.max(0, Math.round(at - w.now));
}

function stateOf(w: World, run: Run, def: DungeonDef): DungeonStateMsg {
  let mobsLeft = 0;
  let boss: DungeonStateMsg["boss"] = null;
  w.state.monsters.forEach((m) => {
    if (m.kind === def.boss) boss = { hp: Math.ceil(m.hp), maxHp: m.maxHp };
    else mobsLeft++;
  });
  const alive = aliveKeys(w);
  const members: DungeonMemberView[] = [];
  for (const m of run.members.values()) {
    if (m.status !== "inside" && m.status !== "left") continue; // chưa vào / từ chối: chưa phải người của phòng
    members.push({ name: m.name, alive: m.status === "inside" && alive.has(m.key) });
  }
  return { phase: run.phase, deadlineInMs: deadlineIn(w, run), mobsLeft, boss, members };
}

/** Gửi `dungeonState` cho mọi thành viên đang ở trong phòng (HUD). */
export function sendDungeonState(w: World, run: Run) {
  const def = dungeonOf(run.dungeonId);
  if (!def) return;
  const msg = stateOf(w, run, def);
  for (const m of insideMembers(w, run)) w.events.dungeonState(m.sid, msg);
}

/**
 * Kết thúc run (hết giờ, mọi người chết / rời; 4c thêm `boss_dead` thắng): đổi pha, gửi `dungeonEnd` cho người còn trong
 * phòng, hẹn `exitAt` để đưa mọi người về Lạc Hà. Run vẫn nằm trong sổ cho tới `exitRun` (không ai vào thêm được: `onAuth`
 * chỉ nhận run `gathering` / `running`). Idempotent.
 */
export function finishRun(
  w: World,
  run: Run,
  result: "won" | "lost",
  reason: DungeonEndReason,
  exitDelayMs: number = DUNGEON_EXIT_DELAY_MS,
) {
  if (run.exitAt !== null || w.hub.runs.get(run.id) !== run) return;
  run.phase = result;
  run.endReason = reason;
  run.exitAt = w.now + exitDelayMs;
  for (const m of insideMembers(w, run)) {
    const c = w.ctrl.get(m.sid);
    if (c) w.events.dungeonEnd(m.sid, { result, reason, rewardsLeft: rewardsLeftOf(c, w.now) });
  }
  sendDungeonState(w, run);
}

/**
 * Đưa mọi người còn sống trong phòng về Lạc Hà rồi xoá run khỏi sổ. Người đang ở Hoàng Tuyền (chết thật) KHÔNG bị đưa đi
 * ở đây: họ còn phải chọn đầu thai, và `rebirth` tự đưa về Lạc Hà (WorldRoom). Phòng tự đóng khi trống (`autoDispose`).
 */
function exitRun(w: World, run: Run) {
  for (const m of insideMembers(w, run)) if (!m.dead) w.onDungeonExit?.(m.sid);
  w.hub.runs._remove(run);
}

/**
 * Mỗi tick của phòng bí cảnh: đồng hồ và điều kiện kết thúc, `dungeonState` mỗi `DUNGEON_STATE_MS`, đưa người về khi tới
 * `exitAt`. Phòng thường (`runId === null`) và run đã bị xoá thì thoát ngay.
 */
export function tickDungeonRun(w: World) {
  const run = runOfWorld(w);
  if (!run) return;
  if (run.exitAt !== null) {
    if (w.now >= run.exitAt) exitRun(w, run);
    else if (w.tick % STATE_EVERY_TICKS === 0) sendDungeonState(w, run);
    return;
  }
  if (run.phase === "running") {
    if (w.now >= run.deadline) return finishRun(w, run, "lost", "timeout");
    // Còn ai có thể đánh tiếp: người còn sống trong phòng, hoặc người đã được mời mà chưa tới và còn hạn
    const alive = aliveKeys(w);
    const inside = insideMembers(w, run);
    const standing = inside.some((m) => alive.has(m.key));
    const pending = [...run.members.values()].some(
      (m) => m.status === "invited" && w.now < run.inviteUntil,
    );
    if (!standing && !pending)
      return finishRun(w, run, "lost", inside.length > 0 ? "all_dead" : "all_left");
  }
  if (w.tick % STATE_EVERY_TICKS === 0) sendDungeonState(w, run);
}

// ---------- Hộp thoại Thủ môn ----------

/**
 * Nút "Mở bí cảnh" cho hộp thoại của Thủ môn: mỗi bí cảnh một nút; vô hiệu khi chưa đủ điều kiện (client ẩn / làm mờ).
 * Kèm dòng lý do (đúng câu `dungeonOpenFailMessage` nếu có) hoặc số lượt thưởng còn lại hôm nay.
 */
export function dungeonDialog(
  w: World,
  sid: string,
): { lines: string[]; options: DialogOption[] } | null {
  const r = w.ready(sid);
  if (!r) return null;
  const me = keyOfName(r.p.name);
  const { keys, isLeader } = partyOf(w, me);
  const lines: string[] = [];
  const options: DialogOption[] = [];
  for (const def of DUNGEONS) {
    const check = canOpenDungeon({
      def,
      isLeader,
      members: keys.map((k) => memberCheck(w, k)),
      runsOpen: w.hub.runs.size,
      cooldownLeftMs: w.hub.runs.cooldownLeft(me, w.now),
    });
    options.push({
      label: `Mở ${def.name}`,
      action: { kind: "dungeon", dungeonId: def.id },
      ...(check.ok ? {} : { disabled: true }),
    });
    lines.push(
      check.ok
        ? `${def.name}: đội đủ điều kiện. Hôm nay còn ${rewardsLeftOf(r.c, w.now)}/${DUNGEON_DAILY_REWARDS} lượt thưởng hoàn thành.`
        : `${def.name}: ${dungeonOpenFailMessage(check.reason, check.who)}`,
    );
  }
  return { lines, options };
}
