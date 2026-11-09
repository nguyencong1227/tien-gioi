// Tổ đội (#74, hợp đồng shared/src/party.ts): mời, nhận, rời, kick, chat đội, chia tu vi, quyền nhặt đồ.
// Đội chỉ sống trong bộ nhớ (không vào state chung, không lưu file nhân vật): tắt server hoặc rời phòng là rời đội.
// Mọi tin nhắn từ client đều không đáng tin: kiểm tra kiểu, tên qua cleanName, trạng thái người mời / người nhận.
import {
  NO_PARTY,
  PARTY_INVITE_COOLDOWN_MS,
  PARTY_INVITE_TTL_MS,
  PARTY_MAX,
  PARTY_SHARE_RANGE,
  PARTY_SNAPSHOT_MS,
  partyExpShare,
  type ChatOut,
  type PartyMember,
  type PartyMsg,
} from "@tien-gioi/shared";
import { cleanName } from "../store";
import type { World } from "../world";

interface Party {
  id: number;
  /** sessionId đội trưởng */
  leader: string;
  /** sessionId các thành viên, người vào trước đứng trước (gồm đội trưởng) */
  members: string[];
}

interface Invite {
  from: string;
  /** Đội của người mời lúc mời (0 = chưa có đội); đổi thì lời mời mất hiệu lực */
  partyId: number;
  until: number;
}

/** Sổ đội hình của cả phòng. System bên dưới gọi qua `w.parties`. */
export class Parties {
  private nextId = 1;
  private readonly byId = new Map<number, Party>();
  private readonly partyOfSid = new Map<string, number>();
  /** Lời mời đang chờ, theo người được mời */
  private readonly invites = new Map<string, Invite[]>();
  /** Lần mời gần nhất của mỗi người (hồi chiêu) */
  private readonly lastInviteAt = new Map<string, number>();
  private nextSnapshotAt = 0;

  partyIdOf(sid: string): number | undefined {
    return this.partyOfSid.get(sid);
  }

  /** sessionId các thành viên của đội (không có đội thì mảng rỗng). Không sửa mảng trả về. */
  membersOf(partyId: number): readonly string[] {
    return this.byId.get(partyId)?.members ?? [];
  }

  /** Hai người cùng một đội (người không có đội thì không cùng đội với ai, kể cả chính mình). */
  sameParty(a: string, b: string): boolean {
    const pa = this.partyOfSid.get(a);
    return pa !== undefined && pa === this.partyOfSid.get(b);
  }

  /** Số đội đang có (dùng cho test / số đo). */
  get size() {
    return this.byId.size;
  }

  // ---------- nội bộ, chỉ system party.ts dùng ----------

  /** @internal */
  _create(leader: string, other: string): Party {
    const party: Party = { id: this.nextId++, leader, members: [leader, other] };
    this.byId.set(party.id, party);
    this.partyOfSid.set(leader, party.id);
    this.partyOfSid.set(other, party.id);
    return party;
  }

  /** @internal */
  _get(partyId: number) {
    return this.byId.get(partyId);
  }

  /** @internal */
  _join(party: Party, sid: string) {
    party.members.push(sid);
    this.partyOfSid.set(sid, party.id);
  }

  /** @internal Gỡ khỏi đội; trả về đội (còn lại) hoặc undefined nếu đội đã giải tán / người đó không có đội. */
  _remove(sid: string): { party: Party; dissolved: string[] } | undefined {
    const id = this.partyOfSid.get(sid);
    const party = id === undefined ? undefined : this.byId.get(id);
    if (!party) return undefined;
    this.partyOfSid.delete(sid);
    party.members = party.members.filter((m) => m !== sid);
    const dissolved: string[] = [];
    if (party.members.length < 2) {
      // Còn một người thì không còn là đội
      for (const m of party.members) {
        this.partyOfSid.delete(m);
        dissolved.push(m);
      }
      this.byId.delete(party.id);
      party.members = [];
    } else if (party.leader === sid) {
      party.leader = party.members[0];
    }
    return { party, dissolved };
  }

  /** @internal */
  _invitesFor(target: string) {
    return this.invites.get(target);
  }
  /** @internal */
  _setInvites(target: string, list: Invite[]) {
    if (list.length) this.invites.set(target, list);
    else this.invites.delete(target);
  }
  /** @internal */
  _forgetPlayer(sid: string) {
    this.invites.delete(sid);
    this.lastInviteAt.delete(sid);
    for (const [target, list] of this.invites) {
      const kept = list.filter((i) => i.from !== sid);
      if (kept.length !== list.length) this._setInvites(target, kept);
    }
  }
  /** @internal */
  _cooldown(sid: string, now: number): boolean {
    const last = this.lastInviteAt.get(sid);
    return last !== undefined && now - last < PARTY_INVITE_COOLDOWN_MS;
  }
  /** @internal */
  _markInvite(sid: string, now: number) {
    this.lastInviteAt.set(sid, now);
  }
  /** @internal */
  _dueSnapshot(now: number): boolean {
    if (now < this.nextSnapshotAt) return false;
    this.nextSnapshotAt = now + PARTY_SNAPSHOT_MS;
    return true;
  }
  /** @internal */
  _all(): IterableIterator<Party> {
    return this.byId.values();
  }
}

const bad = (w: World, sid: string, text: string) => w.events.toast(sid, { text, tone: "bad" });

/** Tìm người chơi trong phòng theo đạo hiệu (không phân biệt hoa thường). */
function findByName(w: World, raw: unknown): string | null {
  const name = cleanName(raw);
  if (!name) return null;
  const key = name.toLowerCase();
  let found: string | null = null;
  w.state.players.forEach((p, sid) => {
    if (found === null && p.name.toLowerCase() === key) found = sid;
  });
  return found;
}

function nameOf(w: World, sid: string): string {
  return w.state.players.get(sid)?.name ?? "";
}

function snapshot(w: World, party: Party): PartyMsg {
  const members: PartyMember[] = [];
  for (const sid of party.members) {
    const p = w.state.players.get(sid);
    if (!p) continue;
    members.push({
      name: p.name,
      realm: p.realm,
      tier: p.tier,
      hp: p.hp,
      maxHp: p.maxHp,
      x: Math.round(p.x),
      y: Math.round(p.y),
    });
  }
  return { leader: nameOf(w, party.leader), members };
}

/** Gửi đội hình hiện tại cho cả đội. */
function broadcastParty(w: World, party: Party) {
  const msg = snapshot(w, party);
  for (const sid of party.members) w.events.party(sid, msg);
}

// ---------- Tin nhắn từ client ----------

/** `partyInvite { name }`: mời một người vào đội (chưa có đội thì đội được lập khi họ nhận). */
export function partyInvite(w: World, sid: string, rawName: unknown) {
  const r = w.ready(sid);
  if (!r) return;
  const book = w.parties;
  if (book._cooldown(sid, w.now)) return bad(w, sid, "Mời chậm lại một chút.");
  const target = findByName(w, rawName);
  if (target === null) return bad(w, sid, "Không tìm thấy đạo hữu này.");
  if (target === sid) return bad(w, sid, "Không thể tự mời mình.");
  if (book.partyIdOf(target) !== undefined)
    return bad(w, sid, `${nameOf(w, target)} đã ở trong một đội.`);
  const myParty = book.partyIdOf(sid);
  if (myParty !== undefined && book.membersOf(myParty).length >= PARTY_MAX)
    return bad(w, sid, "Đội đã đủ người.");
  // Lời mời cũ đã hết hạn thì bỏ; mời trùng (cùng người, còn hạn) thì từ chối
  const live = (book._invitesFor(target) ?? []).filter((i) => i.until > w.now);
  if (live.some((i) => i.from === sid))
    return bad(w, sid, `Đã mời ${nameOf(w, target)}, đang chờ trả lời.`);
  book._markInvite(sid, w.now);
  live.push({ from: sid, partyId: myParty ?? 0, until: w.now + PARTY_INVITE_TTL_MS });
  book._setInvites(target, live);
  w.events.partyInvited(target, { from: r.p.name, ttlMs: PARTY_INVITE_TTL_MS });
  w.events.toast(sid, { text: `Đã mời ${nameOf(w, target)} vào đội.`, tone: "info" });
}

/** `partyAccept { from }` / `partyDecline { from }`: trả lời lời mời của `from` (đạo hiệu người mời). */
export function partyAnswer(w: World, sid: string, rawFrom: unknown, accept: boolean) {
  const me = w.state.players.get(sid);
  if (!me) return;
  const book = w.parties;
  const from = findByName(w, rawFrom);
  const list = book._invitesFor(sid) ?? [];
  const idx = from === null ? -1 : list.findIndex((i) => i.from === from);
  if (from === null || idx < 0) return bad(w, sid, "Không có lời mời nào từ người này.");
  const inv = list[idx];
  // Lời mời được dùng một lần (nhận hay từ chối đều xoá), kể cả hết hạn
  book._setInvites(
    sid,
    list.filter((_, i) => i !== idx),
  );
  if (inv.until <= w.now) return bad(w, sid, "Lời mời đã hết hạn.");
  if (!accept) {
    w.events.toast(from, { text: `${me.name} đã từ chối lời mời vào đội.`, tone: "info" });
    return;
  }
  if (book.partyIdOf(sid) !== undefined) return bad(w, sid, "Ngươi đã ở trong một đội.");
  const inviter = w.state.players.get(from);
  if (!inviter) return bad(w, sid, "Người mời đã rời đi.");
  if ((book.partyIdOf(from) ?? 0) !== inv.partyId)
    return bad(w, sid, "Lời mời không còn hiệu lực.");
  let party = inv.partyId ? book._get(inv.partyId) : undefined;
  if (party) {
    if (party.members.length >= PARTY_MAX) return bad(w, sid, "Đội đã đủ người.");
    book._join(party, sid);
  } else {
    party = book._create(from, sid);
  }
  for (const m of party.members) {
    if (m !== sid) w.events.toast(m, { text: `${me.name} đã vào đội.`, tone: "good" });
  }
  w.events.toast(sid, { text: `Đã vào đội của ${inviter.name}.`, tone: "good" });
  broadcastParty(w, party);
}

/** `partyLeave`: rời đội. */
export function partyLeave(w: World, sid: string) {
  if (!w.state.players.has(sid)) return;
  if (w.parties.partyIdOf(sid) === undefined) return bad(w, sid, "Ngươi chưa ở trong đội nào.");
  partyDrop(w, sid);
  w.events.toast(sid, { text: "Đã rời đội.", tone: "info" });
}

/** `partyKick { name }`: đội trưởng mời một thành viên ra khỏi đội. */
export function partyKick(w: World, sid: string, rawName: unknown) {
  const book = w.parties;
  const id = book.partyIdOf(sid);
  const party = id === undefined ? undefined : book._get(id);
  if (!party) return bad(w, sid, "Ngươi chưa ở trong đội nào.");
  if (party.leader !== sid) return bad(w, sid, "Chỉ đội trưởng mới mời người ra khỏi đội.");
  const target = findByName(w, rawName);
  if (target === null || !party.members.includes(target))
    return bad(w, sid, "Người này không ở trong đội.");
  if (target === sid) return bad(w, sid, "Muốn rời đội thì chọn Rời đội.");
  partyDrop(w, target);
  w.events.toast(target, { text: "Ngươi đã bị mời ra khỏi đội.", tone: "bad" });
}

/**
 * Gỡ một người khỏi đội và báo cho những người còn lại: dùng cho rời đội, bị kick, rời phòng.
 * Cũng dọn lời mời liên quan tới người đó. Gọi trước khi xoá khỏi `state.players`.
 */
export function partyDrop(w: World, sid: string) {
  const book = w.parties;
  book._forgetPlayer(sid);
  const res = book._remove(sid);
  if (!res) return;
  w.events.party(sid, NO_PARTY);
  if (res.dissolved.length) {
    for (const m of res.dissolved) {
      w.events.party(m, NO_PARTY);
      w.events.toast(m, { text: "Đội đã giải tán.", tone: "info" });
    }
  } else {
    const left = nameOf(w, sid);
    if (left)
      for (const m of res.party.members)
        w.events.toast(m, { text: `${left} đã rời đội.`, tone: "info" });
    broadcastParty(w, res.party);
  }
}

/** `/p <nội dung>`: chat đội. `text` đã được làm sạch và cắt độ dài ở systems/chat.ts. */
export function partyChat(w: World, sid: string, text: string) {
  const p = w.state.players.get(sid);
  if (!p) return;
  const id = w.parties.partyIdOf(sid);
  if (id === undefined) return bad(w, sid, "Ngươi chưa ở trong đội nào.");
  const out: ChatOut = { from: p.name, text, channel: "party" };
  for (const m of w.parties.membersOf(id)) w.events.chatTo(m, out);
}

/** Mỗi tick: gửi đội hình cho từng đội mỗi PARTY_SNAPSHOT_MS (máu, vị trí thay đổi liên tục). */
export function tickParty(w: World) {
  const book = w.parties;
  if (book.size === 0 || !book._dueSnapshot(w.now)) return;
  for (const party of book._all()) broadcastParty(w, party);
}

// ---------- Chia tu vi và quyền nhặt đồ ----------

/**
 * Hệ số tu vi cho từng người khi một con quái chết, nhân với `killExp(quái, cảnh giới của chính người đó)`.
 * - Người không có đội: `dmg / tổng` như cũ.
 * - Đội: `f` = tổng sát thương của các thành viên chia tổng sát thương; mỗi thành viên còn sống và trong
 *   PARTY_SHARE_RANGE quanh chỗ quái chết (kể cả người chưa ra đòn) nhận `f × partyExpShare(n)`,
 *   `n` là số thành viên đủ điều kiện. Thành viên ở xa hoặc đã ngã không được chia và không tính vào `n`.
 * - `withBonus = false` (chia Linh thạch): bỏ thưởng đội, mỗi thành viên đủ điều kiện nhận `f / n`, nên tổng
 *   hệ số của một đội đúng bằng `f` và việc lập đội không làm sinh thêm tiền.
 */
export function killShares(
  w: World,
  damageBy: ReadonlyMap<string, number>,
  x: number,
  y: number,
  withBonus = true,
): Map<string, number> {
  let total = 0;
  for (const dmg of damageBy.values()) total += dmg;
  if (total <= 0) total = 1;
  const out = new Map<string, number>();
  const partyDmg = new Map<number, number>();
  for (const [sid, dmg] of damageBy) {
    const pid = w.parties.partyIdOf(sid);
    if (pid === undefined) out.set(sid, dmg / total);
    else partyDmg.set(pid, (partyDmg.get(pid) ?? 0) + dmg);
  }
  for (const [pid, dmg] of partyDmg) {
    const present = w.parties.membersOf(pid).filter((sid) => {
      const p = w.state.players.get(sid);
      return p !== undefined && !p.dead && Math.hypot(p.x - x, p.y - y) <= PARTY_SHARE_RANGE;
    });
    if (present.length === 0) continue;
    const frac = (dmg / total) * (withBonus ? partyExpShare(present.length) : 1 / present.length);
    for (const sid of present) out.set(sid, frac);
  }
  return out;
}

/**
 * Chủ đồ rơi: nhóm (đội hoặc người lẻ) gây nhiều sát thương nhất, rồi người đánh nhiều nhất trong nhóm đó
 * (còn trong phòng, chưa ngã). "" nếu không ai đủ điều kiện. Các thành viên khác của đội nhặt được nhờ `sameParty`.
 */
export function lootOwner(w: World, damageBy: ReadonlyMap<string, number>): string {
  const group = new Map<string, number>();
  const key = (sid: string) => {
    const pid = w.parties.partyIdOf(sid);
    return pid === undefined ? sid : `party:${pid}`;
  };
  for (const [sid, dmg] of damageBy) {
    const p = w.state.players.get(sid);
    if (!p || p.dead) continue;
    group.set(key(sid), (group.get(key(sid)) ?? 0) + dmg);
  }
  let bestGroup = "",
    bestGroupDmg = 0;
  for (const [k, dmg] of group) {
    if (dmg > bestGroupDmg) {
      bestGroupDmg = dmg;
      bestGroup = k;
    }
  }
  if (!bestGroup) return "";
  let owner = "",
    best = 0;
  for (const [sid, dmg] of damageBy) {
    const p = w.state.players.get(sid);
    if (p && !p.dead && key(sid) === bestGroup && dmg > best) {
      best = dmg;
      owner = sid;
    }
  }
  return owner;
}
