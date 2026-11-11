// Tông môn nối với phòng (M3.6 bước 6c, docs/THIET_KE_TONG_MON.md mục 4.2, 4.4, 5): tin nhắn từ client, lời mời đang chờ, ảnh chụp
// `SectMsg` cho thành viên (khi có đổi, không mỗi tick), `sectPresence` (ai đang trực tuyến, 10 giây một lần chỉ khi đổi), chat
// `/s` xuyên phòng, cờ công khai `Player.sect` (biệt hiệu), và phần tiền (lập tông môn, góp, rút kho) đi qua ví + lưu hồ sơ.
// Dịch vụ `SectService` lo luật và kho lưu; ở đây không có luật nghiệp vụ nào ngoài thứ tự "ví <-> hồ sơ <-> kho".
//
// Thứ tự tiền (ưu tiên MẤT hơn NHÂN ĐÔI, mục 4.4): LẬP / GÓP = trừ ví -> LƯU hồ sơ -> kho; kho từ chối thì hoàn ví. RÚT = trừ kho
// -> cộng ví -> lưu hồ sơ; cộng ví không trọn thì góp lại phần thừa vào kho. Sập giữa chừng: có thể MẤT số tiền đang chuyển (hiếm),
// không bao giờ có thêm tiền.
//
// Mọi hàm tin nhắn là async (kho lưu bất đồng bộ): WorldRoom gọi bằng `void`. Người chơi có thể rời giữa các `await`: sau mỗi `await`
// kiểm lại `ctrl` còn đó (và cùng danh tính) trước khi đụng tới ví.
import {
  COIN_CAP,
  NO_SECT,
  SECT_CREATE_COST,
  SECT_INVITES_MAX,
  SECT_INVITE_TTL_MS,
  SECT_PRESENCE_MS,
  cleanSectName,
  cleanSectTag,
  parseSectAmount,
  parseSectAnswer,
  parseSectInvite,
  parseSectKick,
  parseSectMotd,
  parseSectRank,
  parseSectTransfer,
  sectFailMessage,
  sectKey,
  type ChatOut,
  type SectFail,
  type SectPresenceEntry,
} from "@tien-gioi/shared";
import type { Located } from "../hub";
import type { Sect } from "../sect-store";
import { sectViewOf, type SectActor } from "../sect-service";
import type { World } from "../world";
import { changeCoin, trySpendCoin } from "./wallet";

// ---------- Sổ chung (một cho cả tiến trình, qua `Hub.sects`) ----------

/** Lời mời vào tông môn đang chờ, giữ theo `soulKey` của người được mời (sống qua việc đi qua cổng). */
export interface SectInvite {
  /** `soulKey` và đạo hiệu người mời (kiểm lại quyền mời LÚC NHẬN) */
  fromKey: string;
  fromName: string;
  sectId: string;
  /** Tên và biệt hiệu lúc mời (chỉ để hiển thị) */
  sectName: string;
  tag: string;
  /** Hết hạn (ms, đồng hồ `World.now`) */
  until: number;
}

export class SectBook {
  private readonly invites = new Map<string, SectInvite[]>();
  /** Thành viên ĐANG TRỰC TUYẾN (ở phòng nào cũng được): `soulKey` -> id tông môn. */
  readonly online = new Map<string, string>();
  /** Bản ghi mới nhất của các tông môn đang có người trực tuyến (cập nhật sau mỗi thao tác thành công). */
  readonly cache = new Map<string, Sect>();
  /** Lần gửi `sectPresence` gần nhất của từng tông môn (để chỉ gửi khi đổi). */
  readonly lastPresence = new Map<string, string>();
  private nextTickAt = 0;

  /** Số lời mời đang giữ (test rò rỉ). */
  get invitesSize(): number {
    let n = 0;
    for (const list of this.invites.values()) n += list.length;
    return n;
  }

  /** Lời mời còn hạn tới người này (dọn các lời mời hết hạn của họ). */
  _invitesTo(key: string, now: number): SectInvite[] {
    const list = (this.invites.get(key) ?? []).filter((i) => i.until > now);
    if (list.length === 0) this.invites.delete(key);
    else this.invites.set(key, list);
    return list;
  }

  _add(key: string, inv: SectInvite) {
    this.invites.set(key, [...(this.invites.get(key) ?? []), inv]);
  }

  /** Lấy và xoá lời mời của người có đạo hiệu `fromName` (nhận hay từ chối đều dùng một lần). Trả cả lời mời đã hết hạn để báo lý do. */
  _take(key: string, fromName: string): SectInvite | undefined {
    const list = this.invites.get(key) ?? [];
    const i = list.findIndex((x) => sectKey(x.fromName) === sectKey(fromName));
    if (i < 0) return undefined;
    const [inv] = list.splice(i, 1);
    if (list.length === 0) this.invites.delete(key);
    return inv;
  }

  /** Quên mọi lời mời tới người này (đã vào tông môn). */
  _forget(key: string) {
    this.invites.delete(key);
  }

  /** Dọn lời mời hết hạn; trả số mục đã dọn. */
  _sweep(now: number): number {
    let n = 0;
    for (const key of [...this.invites.keys()]) {
      const before = this.invites.get(key)!.length;
      n += before - this._invitesTo(key, now).length;
    }
    return n;
  }

  /** Nhịp chung `SECT_PRESENCE_MS` cho mọi phòng: phòng nào tick trước thì xử lý. */
  _dueTick(now: number): boolean {
    if (now < this.nextTickAt) return false;
    this.nextTickAt = now + SECT_PRESENCE_MS;
    return true;
  }
}

// ---------- Tiện ích ----------

function toastFail(w: World, sid: string, reason: SectFail) {
  w.events.toast(sid, { text: sectFailMessage(reason), tone: "bad" });
}

function toastGood(w: World, sid: string, text: string) {
  w.events.toast(sid, { text, tone: "good" });
}

function actorOf(w: World, sid: string): SectActor | null {
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  return p && c ? { soulKey: c.identity.soulKey, name: p.name } : null;
}

/** Người chơi vẫn còn trong phòng này VÀ vẫn là cùng một linh hồn (sau một `await`). */
function stillHere(w: World, sid: string, soulKey: string): boolean {
  return w.ctrl.get(sid)?.identity.soulKey === soulKey;
}

/**
 * Ví của người này đang nhận được tiền: còn trong phòng, cùng linh hồn, và KHÔNG ở Hoàng Tuyền. Lúc đầu thai `applyRebirth` GHI ĐÈ
 * `coin` bằng phần mang theo (`min(coinAtDeath, coinCarryCap)`), nên Linh thạch cộng vào ví của kiếp đã mất sẽ biến mất.
 */
function walletOpen(w: World, sid: string, soulKey: string): boolean {
  const c = w.ctrl.get(sid);
  return c?.identity.soulKey === soulKey && !c.limbo;
}

/** Thành viên đang trực tuyến ở bất cứ phòng nào (khớp cả `soulKey`, không chỉ đạo hiệu). */
function locateMember(w: World, m: { soulKey: string; name: string }): Located | null {
  const loc = w.hub.locate(m.name.toLowerCase());
  return loc && loc.w.ctrl.get(loc.sid)?.identity.soulKey === m.soulKey ? loc : null;
}

/** Lưu hồ sơ NGAY; `true` khi đã nằm trên đĩa (hoặc không có hook lưu). `false`: người gọi phải huỷ và hoàn ví. */
function saveNow(w: World, sid: string): Promise<boolean> {
  return w.onSaveNow ? w.onSaveNow(sid) : Promise.resolve(true);
}

// ---------- Gửi ảnh chụp / presence ----------

/**
 * Sau một thay đổi thành công: nhớ bản ghi mới, gửi `SectMsg` cho mọi thành viên đang trực tuyến, đặt `Player.sect`, và gửi
 * `NO_SECT` (xoá cờ) cho những người vừa bị gỡ. Không gửi gì cho người ngoại tuyến (vào phòng sẽ tự nhận).
 */
function broadcastSect(w: World, sect: Sect, removed: { soulKey: string; name: string }[] = []) {
  const book = w.hub.sects;
  book.cache.set(sect.id, sect);
  book.lastPresence.delete(sect.id); // thành viên đổi: gửi lại presence ở nhịp tới
  for (const m of sect.members) {
    const loc = locateMember(w, m);
    if (!loc) continue;
    loc.p.sect = sect.tag;
    book.online.set(m.soulKey, sect.id);
    loc.w.events.sect(loc.sid, { sect: sectViewOf(sect, m.soulKey) });
  }
  sendPresence(w, sect); // ai đang trực tuyến cập nhật NGAY khi thành viên đổi (không chờ nhịp `tickSect`)
  sendRemoved(w, removed);
}

/** Báo cho những người vừa rời / bị mời ra / tông môn giải tán: xoá bảng, xoá cờ biệt hiệu. */
function sendRemoved(w: World, removed: { soulKey: string; name: string }[]) {
  const book = w.hub.sects;
  for (const m of removed) {
    book.online.delete(m.soulKey);
    const loc = locateMember(w, m);
    if (!loc) continue;
    loc.p.sect = "";
    loc.w.events.sect(loc.sid, NO_SECT);
  }
}

function presenceOf(w: World, sect: Sect): SectPresenceEntry[] {
  const out: SectPresenceEntry[] = [];
  for (const m of sect.members) {
    const loc = locateMember(w, m);
    if (loc)
      out.push({ name: loc.p.name, realm: loc.p.realm, tier: loc.p.tier, mapId: loc.w.map.def.id });
  }
  return out;
}

function sendPresence(w: World, sect: Sect, only?: Located) {
  const online = presenceOf(w, sect);
  const msg = { online };
  if (only) return void only.w.events.sectPresence(only.sid, msg);
  for (const m of sect.members) {
    const loc = locateMember(w, m);
    if (loc) loc.w.events.sectPresence(loc.sid, msg);
  }
}

/**
 * Vào phòng (WorldRoom gọi bằng `void`): cập nhật đạo hiệu đã lưu của thành viên, đặt `Player.sect`, gửi ảnh chụp và presence.
 * Không ở tông môn nào (hoặc `SECTS=off`) thì không làm gì (client không có bảng, `Player.sect` là "").
 */
export async function sectOnJoin(w: World, sid: string) {
  const svc = w.sectService;
  const a = actorOf(w, sid);
  if (!svc || !a) return;
  const r = await svc.refreshName(a);
  if (!r.ok || !r.sect || !stillHere(w, sid, a.soulKey)) return;
  const sect = r.sect;
  const book = w.hub.sects;
  book.cache.set(sect.id, sect);
  book.online.set(a.soulKey, sect.id);
  const loc = locateMember(w, a);
  if (!loc) return;
  loc.p.sect = sect.tag;
  w.events.sect(sid, { sect: sectViewOf(sect, a.soulKey) });
  sendPresence(w, sect); // mọi người trong tông môn thấy người mới trực tuyến ngay
}

/** Rời phòng (kể cả đi qua cổng): người này không còn trực tuyến ở đây. Gọi TRƯỚC khi xoá khỏi `ctrl`. */
export function sectDrop(w: World, sid: string) {
  const c = w.ctrl.get(sid);
  if (!c) return;
  const book = w.hub.sects;
  const sectId = book.online.get(c.identity.soulKey);
  if (sectId === undefined) return;
  book.online.delete(c.identity.soulKey);
  book.lastPresence.delete(sectId);
  // Không còn ai trực tuyến thì bỏ bản ghi nhớ (không giữ mãi trong bộ nhớ)
  let anyone = false;
  for (const id of book.online.values())
    if (id === sectId) {
      anyone = true;
      break;
    }
  if (!anyone) book.cache.delete(sectId);
}

/**
 * Mỗi tick (nhịp chung `SECT_PRESENCE_MS`): dọn lời mời hết hạn và gửi `sectPresence` cho tông môn nào có đổi (ai trực tuyến, cảnh
 * giới, bản đồ). Không có ai trực tuyến / không có lời mời thì thoát ngay.
 */
export function tickSect(w: World) {
  const book = w.hub.sects;
  if (book.online.size === 0 && book.invitesSize === 0) return;
  if (!book._dueTick(w.now)) return;
  book._sweep(w.now);
  for (const sectId of new Set(book.online.values())) {
    const sect = book.cache.get(sectId);
    if (!sect) continue;
    const hash = JSON.stringify(presenceOf(w, sect));
    if (book.lastPresence.get(sectId) === hash) continue;
    book.lastPresence.set(sectId, hash);
    sendPresence(w, sect);
  }
  for (const id of [...book.lastPresence.keys()])
    if (!book.cache.has(id)) book.lastPresence.delete(id);
}

// ---------- Chat tông môn ----------

/** `/s <nội dung>`: chat tông môn (tới thành viên ở mọi bản đồ). `text` đã được làm sạch và cắt độ dài ở systems/chat.ts. */
export function sectChat(w: World, sid: string, text: string) {
  const a = actorOf(w, sid);
  if (!a) return;
  const book = w.hub.sects;
  const sect = w.sectService ? book.cache.get(book.online.get(a.soulKey) ?? "") : undefined;
  if (!sect) return toastFail(w, sid, "not_in_sect");
  const out: ChatOut = { from: a.name, text, channel: "sect" };
  for (const m of sect.members) {
    const loc = locateMember(w, m);
    if (loc) loc.w.events.chatTo(loc.sid, out);
  }
}

// ---------- Lập / mời / nhận ----------

/** `sectCreate { name, tag }`: trừ `SECT_CREATE_COST` -> lưu hồ sơ -> lập; kho từ chối thì hoàn tiền. */
export async function sectCreate(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const a = actorOf(w, sid);
  if (!a) return;
  const r = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = cleanSectName(r.name);
  if (name === null) return toastFail(w, sid, "name_invalid");
  const tag = cleanSectTag(r.tag);
  if (tag === null) return toastFail(w, sid, "tag_invalid");
  if (await svc.sectOf(a.soulKey)) return toastFail(w, sid, "already_in_sect");
  if (svc.createCooldownLeft(a.soulKey) > 0) return toastFail(w, sid, "create_cooldown");
  if (!stillHere(w, sid, a.soulKey) || !trySpendCoin(w, sid, SECT_CREATE_COST))
    return toastFail(w, sid, "no_coin");
  // Tiền đã trừ phải xuống file TRƯỚC khi tông môn ra đời (không nhân đôi nếu sập); lưu không được thì huỷ, hoàn ví
  if (!(await saveNow(w, sid))) {
    if (stillHere(w, sid, a.soulKey)) changeCoin(w, sid, SECT_CREATE_COST);
    return toastFail(w, sid, "error");
  }
  const res = await svc.create(a, name, tag);
  if (!res.ok) {
    if (stillHere(w, sid, a.soulKey)) changeCoin(w, sid, SECT_CREATE_COST); // hoàn tiền
    return toastFail(w, sid, res.reason);
  }
  broadcastSect(w, res.sect);
  w.audit?.("sect.create", {
    name: a.name,
    sect: res.sect.name,
    tag: res.sect.tag,
    cost: SECT_CREATE_COST,
  });
  toastGood(w, sid, `Đã lập tông môn ${res.sect.name} [${res.sect.tag}].`);
}

/** `sectInvite { name }`: mời người đang trực tuyến (ở phòng nào cũng được). */
export async function sectInvite(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectInvite(raw);
  const a = actorOf(w, sid);
  if (!msg || !a) return;
  const target = w.hub.locate(msg.name.toLowerCase());
  const targetKey = target?.w.ctrl.get(target.sid)?.identity.soulKey;
  if (!target || targetKey === undefined) return toastFail(w, sid, "target_not_found");
  const chk = await svc.checkInvite(a.soulKey, targetKey);
  if (!chk.ok) return toastFail(w, sid, chk.reason);
  const book = w.hub.sects;
  const pending = book._invitesTo(targetKey, w.now);
  if (pending.some((i) => i.sectId === chk.sect.id)) return toastFail(w, sid, "already_invited");
  if (pending.length >= SECT_INVITES_MAX) return toastFail(w, sid, "target_overloaded");
  book._add(targetKey, {
    fromKey: a.soulKey,
    fromName: a.name,
    sectId: chk.sect.id,
    sectName: chk.sect.name,
    tag: chk.sect.tag,
    until: w.now + SECT_INVITE_TTL_MS,
  });
  target.w.events.sectInvited(target.sid, {
    from: a.name,
    sect: chk.sect.name,
    tag: chk.sect.tag,
    ttlMs: SECT_INVITE_TTL_MS,
  });
  w.events.toast(sid, { text: `Đã mời ${target.p.name} vào tông môn.`, tone: "info" });
}

/** `sectAccept` / `sectDecline { from }`: trả lời lời mời của `from` (đạo hiệu người mời). Dùng một lần; nhận thì kiểm lại tất cả. */
export async function sectAnswer(w: World, sid: string, raw: unknown, accept: boolean) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectAnswer(raw);
  const a = actorOf(w, sid);
  if (!msg || !a) return;
  const inv = w.hub.sects._take(a.soulKey, msg.from);
  if (!inv) return toastFail(w, sid, "invite_invalid");
  if (inv.until <= w.now) return toastFail(w, sid, "invite_expired");
  if (!accept) {
    const from = w.hub.locate(inv.fromName.toLowerCase());
    if (from)
      from.w.events.toast(from.sid, {
        text: `${a.name} từ chối lời mời vào tông môn.`,
        tone: "info",
      });
    return;
  }
  const res = await svc.join(inv.sectId, inv.fromKey, a);
  if (!res.ok) return toastFail(w, sid, res.reason);
  w.hub.sects._forget(a.soulKey); // đã có tông môn: các lời mời khác vô nghĩa
  broadcastSect(w, res.sect);
  toastGood(w, sid, `Đã gia nhập tông môn ${res.sect.name} [${res.sect.tag}].`);
}

// ---------- Rời / mời ra / chức vụ / thông báo ----------

export async function sectLeave(w: World, sid: string) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const a = actorOf(w, sid);
  if (!a) return;
  const res = await svc.leave(a);
  if (!res.ok) return toastFail(w, sid, res.reason);
  broadcastSect(w, res.sect, [a]);
  w.events.toast(sid, { text: "Ngươi đã rời tông môn.", tone: "info" });
}

export async function sectKick(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectKick(raw);
  const a = actorOf(w, sid);
  if (!msg || !a) return;
  const res = await svc.kick(a, msg.name);
  if (!res.ok) return toastFail(w, sid, res.reason);
  broadcastSect(w, res.sect, [res.removed]);
  w.audit?.("sect.kick", { name: a.name, sect: res.sect.name, target: res.removed.name });
  const loc = locateMember(w, res.removed);
  if (loc) loc.w.events.toast(loc.sid, { text: "Ngươi đã bị mời ra khỏi tông môn.", tone: "bad" });
  toastGood(w, sid, `Đã mời ${res.removed.name} ra khỏi tông môn.`);
}

export async function sectRank(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectRank(raw);
  const a = actorOf(w, sid);
  if (!msg || !a) return;
  const res = await svc.setRank(a, msg.name, msg.rank);
  if (!res.ok) return toastFail(w, sid, res.reason);
  broadcastSect(w, res.sect);
}

export async function sectTransfer(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectTransfer(raw);
  const a = actorOf(w, sid);
  if (!msg || !a) return;
  const res = await svc.transfer(a, msg.name);
  if (!res.ok) return toastFail(w, sid, res.reason);
  broadcastSect(w, res.sect);
  w.audit?.("sect.transfer", { name: a.name, sect: res.sect.name, target: msg.name });
  toastGood(w, sid, `Đã chuyển quyền Tông chủ cho ${msg.name}.`);
}

/** `sectDisband`: chỉ Tông chủ và chỉ khi kho rỗng (kiểm nguyên tử ở kho). Mọi thành viên nhận `NO_SECT`. */
export async function sectDisband(w: World, sid: string) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const a = actorOf(w, sid);
  if (!a) return;
  const res = await svc.disband(a);
  if (!res.ok) return toastFail(w, sid, res.reason);
  w.audit?.("sect.disband", {
    name: a.name,
    sect: res.sect.name,
    members: res.sect.members.length,
  });
  const book = w.hub.sects;
  book.cache.delete(res.sect.id);
  book.lastPresence.delete(res.sect.id);
  sendRemoved(w, res.sect.members);
  for (const m of res.sect.members) {
    const loc = locateMember(w, m);
    if (loc)
      loc.w.events.toast(loc.sid, { text: `Tông môn ${res.sect.name} đã giải tán.`, tone: "info" });
  }
}

export async function sectMotd(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectMotd(raw);
  const a = actorOf(w, sid);
  if (!msg || !a) return;
  const res = await svc.setMotd(a, msg.motd);
  if (!res.ok) return toastFail(w, sid, res.reason);
  broadcastSect(w, res.sect);
}

// ---------- Kho chung (ví <-> hồ sơ <-> kho) ----------

/** `sectDeposit { amount }`: trừ ví -> LƯU hồ sơ -> cộng kho; kho từ chối thì hoàn ví. */
export async function sectDeposit(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectAmount(raw);
  const a = actorOf(w, sid);
  if (!a) return;
  if (!msg) return toastFail(w, sid, "amount_invalid");
  if (!(await svc.sectOf(a.soulKey))) return toastFail(w, sid, "not_in_sect"); // khỏi trừ rồi hoàn
  if (!stillHere(w, sid, a.soulKey) || !trySpendCoin(w, sid, msg.amount))
    return toastFail(w, sid, "no_coin");
  // Ví đã trừ phải xuống file TRƯỚC khi kho được cộng; lưu không được thì huỷ, hoàn ví (kho chưa đụng tới)
  if (!(await saveNow(w, sid))) {
    if (stillHere(w, sid, a.soulKey)) changeCoin(w, sid, msg.amount);
    return toastFail(w, sid, "error");
  }
  const res = await svc.deposit(a, msg.amount);
  if (!res.ok) {
    if (stillHere(w, sid, a.soulKey)) changeCoin(w, sid, msg.amount); // hoàn tiền
    return toastFail(w, sid, res.reason);
  }
  broadcastSect(w, res.sect);
  w.audit?.("sect.deposit", {
    name: a.name,
    sect: res.sect.name,
    amount: msg.amount,
    treasury: res.sect.coin,
  });
  toastGood(w, sid, `Đã góp ${msg.amount} Linh thạch vào kho tông môn.`);
}

/**
 * `sectWithdraw { amount }`: trừ kho -> cộng ví -> LƯU hồ sơ. Ví không chứa nổi (`COIN_CAP`) thì từ chối từ đầu (không rút dở); nếu
 * giữa chừng ví đầy lên hoặc người chơi đã rời thì GÓP LẠI phần chưa cộng được vào kho (không để Linh thạch biến mất khi tránh được).
 */
export async function sectWithdraw(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectAmount(raw);
  const a = actorOf(w, sid);
  const c = w.ctrl.get(sid);
  if (!a || !c) return;
  if (!msg) return toastFail(w, sid, "amount_invalid");
  if (COIN_CAP - c.coin < msg.amount) return toastFail(w, sid, "wallet_full");
  // Đang qua cổng: hồ sơ không lưu được lúc này, rút ra sẽ mất (kho đã trừ, ví không xuống đĩa). Thử lại sau.
  // Đang ở Hoàng Tuyền: ví của kiếp đã mất, đầu thai sẽ ghi đè, rút ra cũng mất. Từ chối từ đầu, kho nguyên.
  if (c.travelling || c.limbo) return toastFail(w, sid, "error");
  const res = await svc.withdraw(a, msg.amount);
  if (!res.ok) return toastFail(w, sid, res.reason);
  // Chết giữa lúc đang rút (kho đã trừ) thì không cộng vào ví kiếp đã mất: phần chưa cộng được góp lại kho ngay dưới
  const credited = walletOpen(w, sid, a.soulKey) ? changeCoin(w, sid, msg.amount) : 0;
  let sect = res.sect;
  if (credited < msg.amount) {
    const back = await svc.deposit(a, msg.amount - credited);
    if (back.ok) sect = back.sect;
  }
  if (credited > 0) await saveNow(w, sid);
  broadcastSect(w, sect);
  if (credited > 0)
    w.audit?.("sect.withdraw", {
      name: a.name,
      sect: sect.name,
      amount: credited,
      treasury: sect.coin,
    });
  if (credited > 0) toastGood(w, sid, `Đã rút ${credited} Linh thạch từ kho tông môn.`);
}
