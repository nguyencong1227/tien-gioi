// Tổ đội (#74, hợp đồng shared/src/party.ts): mời, nhận, rời, kick, chat đội, chia tu vi, quyền nhặt đồ.
// Đội chỉ sống trong bộ nhớ (không vào state chung, không lưu file nhân vật): tắt server hoặc thoát game là rời đội.
// Đội dùng chung giữa các phòng (mỗi bản đồ một phòng): sổ đội nằm ở `Hub`, thành viên khoá theo ĐẠO HIỆU viết thường
// (không phải sessionId: sessionId đổi mỗi lần vào phòng) nên đi qua cổng vẫn ở trong đội; tin gửi cho thành viên ở
// phòng khác được định tuyến qua `Hub.locate`. Chia tu vi / đồ rơi chỉ tính người CÙNG phòng với con quái.
// Mọi tin nhắn từ client đều không đáng tin: kiểm tra kiểu, tên qua cleanName, trạng thái người mời / người nhận.
import {
  NO_PARTY,
  PARTY_INVITE_COOLDOWN_MS,
  PARTY_INVITE_TTL_MS,
  PARTY_MAX,
  PARTY_SHARE_RANGE,
  PARTY_SNAPSHOT_MS,
  partyExpShare,
  cleanName,
  type ChatOut,
  type PartyMember,
  type PartyMsg,
} from "@tien-gioi/shared";
import type { World } from "../world";
import type { Located } from "../hub";

/** Thành viên không ở phòng nào quá lâu (đóng tab giữa lúc qua cổng, mất mạng) thì bị gỡ khỏi đội (ms). */
export const PARTY_AWAY_MS = 30_000;

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
  /** Đạo hiệu hiển thị của từng khoá (để còn gọi đúng tên khi người đó đang ở phòng khác / vừa đi vắng) */
  readonly names = new Map<string, string>();
  /** Lần gần nhất thấy thành viên ở một phòng nào đó (để gỡ người đi vắng quá lâu) */
  readonly seenAt = new Map<string, number>();
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
    this.names.delete(sid);
    this.seenAt.delete(sid);
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

/** Khoá thành viên trong sổ đội: đạo hiệu viết thường. */
const keyOfName = (name: string) => name.toLowerCase();

/** Khoá của người chơi `sid` trong phòng này; `null` nếu không có trong phòng. */
function keyOf(w: World, sid: string): string | null {
  const p = w.state.players.get(sid);
  return p ? keyOfName(p.name) : null;
}

/** Hai người (sessionId trong CÙNG một phòng) cùng một đội. */
export function sameParty(w: World, a: string, b: string): boolean {
  const ka = keyOf(w, a);
  const kb = keyOf(w, b);
  return ka !== null && kb !== null && w.parties.sameParty(ka, kb);
}

/** Nhớ đạo hiệu hiển thị và lần thấy gần nhất của một người đang ở một phòng. */
function noteSeen(w: World, key: string, loc: Located) {
  w.parties.names.set(key, loc.p.name);
  w.parties.seenAt.set(key, w.now);
}

/** Tìm người chơi theo đạo hiệu ở MỌI phòng (không phân biệt hoa thường). */
function findByName(w: World, raw: unknown): (Located & { key: string }) | null {
  const name = cleanName(raw);
  if (!name) return null;
  const key = keyOfName(name);
  const loc = w.hub.locate(key);
  return loc ? { ...loc, key } : null;
}

function nameOfKey(w: World, key: string): string {
  return w.hub.locate(key)?.p.name ?? w.parties.names.get(key) ?? "";
}

const bad = (w: World, sid: string, text: string) => w.events.toast(sid, { text, tone: "bad" });

/** Gửi toast cho thành viên ở bất cứ phòng nào (im lặng nếu không tìm thấy). */
function toastKey(w: World, key: string, text: string, tone: "good" | "bad" | "info") {
  const loc = w.hub.locate(key);
  if (loc) loc.w.events.toast(loc.sid, { text, tone });
}

function snapshot(w: World, party: Party): PartyMsg {
  const members: PartyMember[] = [];
  for (const key of party.members) {
    const loc = w.hub.locate(key);
    if (!loc) continue; // đang đi qua cổng / đi vắng: tạm không hiện
    noteSeen(w, key, loc);
    const p = loc.p;
    members.push({
      name: p.name,
      realm: p.realm,
      tier: p.tier,
      hp: p.hp,
      maxHp: p.maxHp,
      x: Math.round(p.x),
      y: Math.round(p.y),
      mapId: loc.w.map.def.id,
    });
  }
  return { leader: nameOfKey(w, party.leader), members };
}

/** Gửi đội hình hiện tại cho cả đội (thành viên ở phòng khác nhận qua phòng của họ). */
function broadcastParty(w: World, party: Party) {
  const msg = snapshot(w, party);
  for (const key of party.members) {
    const loc = w.hub.locate(key);
    if (loc) loc.w.events.party(loc.sid, msg);
  }
}

/** Gửi lại đội hình cho một người (vừa vào phòng, vd sau khi đi qua cổng): không phải chờ nhịp snapshot kế tiếp. */
export function partyResync(w: World, sid: string) {
  const key = keyOf(w, sid);
  if (key === null) return;
  const id = w.parties.partyIdOf(key);
  const party = id === undefined ? undefined : w.parties._get(id);
  if (party) w.events.party(sid, snapshot(w, party));
}

// ---------- Tin nhắn từ client ----------

/** `partyInvite { name }`: mời một người (ở bất cứ bản đồ nào) vào đội (chưa có đội thì đội được lập khi họ nhận). */
export function partyInvite(w: World, sid: string, rawName: unknown) {
  const r = w.ready(sid);
  if (!r) return;
  const me = keyOfName(r.p.name);
  const book = w.parties;
  if (book._cooldown(me, w.now)) return bad(w, sid, "Mời chậm lại một chút.");
  const target = findByName(w, rawName);
  if (target === null) return bad(w, sid, "Không tìm thấy đạo hữu này.");
  if (target.key === me) return bad(w, sid, "Không thể tự mời mình.");
  if (book.partyIdOf(target.key) !== undefined)
    return bad(w, sid, `${target.p.name} đã ở trong một đội.`);
  const myParty = book.partyIdOf(me);
  if (myParty !== undefined && book.membersOf(myParty).length >= PARTY_MAX)
    return bad(w, sid, "Đội đã đủ người.");
  // Lời mời cũ đã hết hạn thì bỏ; mời trùng (cùng người, còn hạn) thì từ chối
  const live = (book._invitesFor(target.key) ?? []).filter((i) => i.until > w.now);
  if (live.some((i) => i.from === me))
    return bad(w, sid, `Đã mời ${target.p.name}, đang chờ trả lời.`);
  book._markInvite(me, w.now);
  book.names.set(me, r.p.name);
  live.push({ from: me, partyId: myParty ?? 0, until: w.now + PARTY_INVITE_TTL_MS });
  book._setInvites(target.key, live);
  target.w.events.partyInvited(target.sid, { from: r.p.name, ttlMs: PARTY_INVITE_TTL_MS });
  w.events.toast(sid, { text: `Đã mời ${target.p.name} vào đội.`, tone: "info" });
}

/** `partyAccept { from }` / `partyDecline { from }`: trả lời lời mời của `from` (đạo hiệu người mời). */
export function partyAnswer(w: World, sid: string, rawFrom: unknown, accept: boolean) {
  const me = w.state.players.get(sid);
  if (!me) return;
  const meKey = keyOfName(me.name);
  const book = w.parties;
  const nameKey = typeof rawFrom === "string" ? cleanName(rawFrom) : null;
  const from = nameKey ? keyOfName(nameKey) : null;
  const list = book._invitesFor(meKey) ?? [];
  const idx = from === null ? -1 : list.findIndex((i) => i.from === from);
  if (from === null || idx < 0) return bad(w, sid, "Không có lời mời nào từ người này.");
  const inv = list[idx];
  // Lời mời được dùng một lần (nhận hay từ chối đều xoá), kể cả hết hạn
  book._setInvites(
    meKey,
    list.filter((_, i) => i !== idx),
  );
  if (inv.until <= w.now) return bad(w, sid, "Lời mời đã hết hạn.");
  if (!accept) {
    toastKey(w, from, `${me.name} đã từ chối lời mời vào đội.`, "info");
    return;
  }
  if (book.partyIdOf(meKey) !== undefined) return bad(w, sid, "Ngươi đã ở trong một đội.");
  const inviter = w.hub.locate(from);
  if (!inviter) return bad(w, sid, "Người mời đã rời đi.");
  if ((book.partyIdOf(from) ?? 0) !== inv.partyId)
    return bad(w, sid, "Lời mời không còn hiệu lực.");
  let party = inv.partyId ? book._get(inv.partyId) : undefined;
  if (party) {
    if (party.members.length >= PARTY_MAX) return bad(w, sid, "Đội đã đủ người.");
    book._join(party, meKey);
  } else {
    party = book._create(from, meKey);
  }
  noteSeen(w, from, inviter);
  book.names.set(meKey, me.name);
  book.seenAt.set(meKey, w.now);
  for (const m of party.members) {
    if (m !== meKey) toastKey(w, m, `${me.name} đã vào đội.`, "good");
  }
  w.events.toast(sid, { text: `Đã vào đội của ${inviter.p.name}.`, tone: "good" });
  broadcastParty(w, party);
}

/** `partyLeave`: rời đội. */
export function partyLeave(w: World, sid: string) {
  const key = keyOf(w, sid);
  if (key === null) return;
  if (w.parties.partyIdOf(key) === undefined) return bad(w, sid, "Ngươi chưa ở trong đội nào.");
  partyDrop(w, sid);
  w.events.toast(sid, { text: "Đã rời đội.", tone: "info" });
}

/** `partyKick { name }`: đội trưởng mời một thành viên ra khỏi đội. */
export function partyKick(w: World, sid: string, rawName: unknown) {
  const me = keyOf(w, sid);
  if (me === null) return;
  const book = w.parties;
  const id = book.partyIdOf(me);
  const party = id === undefined ? undefined : book._get(id);
  if (!party) return bad(w, sid, "Ngươi chưa ở trong đội nào.");
  if (party.leader !== me) return bad(w, sid, "Chỉ đội trưởng mới mời người ra khỏi đội.");
  const target = findByName(w, rawName);
  if (target === null || !party.members.includes(target.key))
    return bad(w, sid, "Người này không ở trong đội.");
  if (target.key === me) return bad(w, sid, "Muốn rời đội thì chọn Rời đội.");
  dropKey(w, target.key);
  target.w.events.toast(target.sid, { text: "Ngươi đã bị mời ra khỏi đội.", tone: "bad" });
}

/**
 * Gỡ một người khỏi đội và báo cho những người còn lại (ở bất cứ phòng nào): dùng cho rời đội, bị kick, thoát hẳn.
 * Cũng dọn lời mời liên quan tới người đó. Gọi trước khi xoá khỏi `state.players`. KHÔNG gọi khi đi qua cổng:
 * đi qua cổng vẫn ở trong đội.
 */
export function partyDrop(w: World, sid: string) {
  const key = keyOf(w, sid);
  if (key !== null) dropKey(w, key);
}

/** Gỡ thành viên theo khoá (kể cả người không còn ở phòng nào). */
function dropKey(w: World, key: string) {
  const book = w.parties;
  const leftName = nameOfKey(w, key);
  book._forgetPlayer(key);
  const res = book._remove(key);
  if (!res) return;
  const self = w.hub.locate(key);
  if (self) self.w.events.party(self.sid, NO_PARTY);
  if (res.dissolved.length) {
    for (const m of res.dissolved) {
      const loc = w.hub.locate(m);
      if (loc) {
        loc.w.events.party(loc.sid, NO_PARTY);
        loc.w.events.toast(loc.sid, { text: "Đội đã giải tán.", tone: "info" });
      }
      book.names.delete(m);
      book.seenAt.delete(m);
    }
  } else {
    if (leftName)
      for (const m of res.party.members) toastKey(w, m, `${leftName} đã rời đội.`, "info");
    broadcastParty(w, res.party);
  }
}

/** `/p <nội dung>`: chat đội (tới thành viên ở mọi bản đồ). `text` đã được làm sạch và cắt độ dài ở systems/chat.ts. */
export function partyChat(w: World, sid: string, text: string) {
  const p = w.state.players.get(sid);
  if (!p) return;
  const id = w.parties.partyIdOf(keyOfName(p.name));
  if (id === undefined) return bad(w, sid, "Ngươi chưa ở trong đội nào.");
  const out: ChatOut = { from: p.name, text, channel: "party" };
  for (const key of w.parties.membersOf(id)) {
    const loc = w.hub.locate(key);
    if (loc) loc.w.events.chatTo(loc.sid, out);
  }
}

/**
 * Mỗi tick: gửi đội hình cho từng đội mỗi PARTY_SNAPSHOT_MS (máu, vị trí thay đổi liên tục), và gỡ thành viên đi vắng
 * quá `PARTY_AWAY_MS`. Nhịp gửi dùng chung cho mọi phòng (sổ đội dùng chung): phòng nào tick trước thì gửi cho TẤT CẢ
 * các đội, tin tới thành viên qua phòng của họ.
 */
export function tickParty(w: World) {
  const book = w.parties;
  if (book.size === 0 || !book._dueSnapshot(w.now)) return;
  const away: string[] = [];
  for (const party of [...book._all()]) {
    for (const key of party.members) {
      const loc = w.hub.locate(key);
      if (loc) noteSeen(w, key, loc);
      else if (
        w.now - (book.seenAt.get(key) ?? (book.seenAt.set(key, w.now), w.now)) >
        PARTY_AWAY_MS
      )
        away.push(key);
    }
  }
  for (const key of away) dropKey(w, key);
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
    const key = keyOf(w, sid);
    const pid = key === null ? undefined : w.parties.partyIdOf(key);
    if (pid === undefined) out.set(sid, dmg / total);
    else partyDmg.set(pid, (partyDmg.get(pid) ?? 0) + dmg);
  }
  // sessionId (trong phòng này) của từng người theo khoá: chỉ dựng khi có đội. Thành viên ở phòng khác không có ở đây
  // nên tự nhiên không được chia (họ ở bản đồ khác, xa quái).
  let sidByKey: Map<string, string> | undefined;
  const localSid = (key: string) => {
    if (!sidByKey) {
      sidByKey = new Map();
      w.state.players.forEach((p, sid) => sidByKey!.set(keyOfName(p.name), sid));
    }
    return sidByKey.get(key);
  };
  for (const [pid, dmg] of partyDmg) {
    const present: string[] = [];
    for (const key of w.parties.membersOf(pid)) {
      const sid = localSid(key);
      const p = sid === undefined ? undefined : w.state.players.get(sid);
      if (sid !== undefined && p && !p.dead && Math.hypot(p.x - x, p.y - y) <= PARTY_SHARE_RANGE)
        present.push(sid);
    }
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
    const k = keyOf(w, sid);
    const pid = k === null ? undefined : w.parties.partyIdOf(k);
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
