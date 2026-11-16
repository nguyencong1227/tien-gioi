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
  ITEM_BY_ID,
  NO_SECT,
  SECT_CREATE_COST,
  SECT_INVITES_MAX,
  SECT_INVITE_TTL_MS,
  SECT_PRESENCE_MS,
  cleanSectName,
  cleanSectTag,
  addToInventory,
  sectLevelInfo,
  sectLevelOf,
  dayKey,
  parseSectAmount,
  parseSectHallGet,
  parseSectAnswer,
  parseSectInvite,
  parseSectKick,
  parseSectMotd,
  parseSectRank,
  parseSectTransfer,
  parseSectVaultDeposit,
  parseSectVaultPolicy,
  parseSectVaultWithdraw,
  sectDepositCh,
  sectDepositValue,
  sectFailMessage,
  sectKey,
  sectVaultAccepts,
  type ChatOut,
  type Inventory,
  type SectEarnSource,
  type SectFail,
  type SectPresenceEntry,
} from "@tien-gioi/shared";
import type { Located } from "../hub";
import type { Sect } from "../sect-store";
import { sectHallViewOf, sectVaultViewOf, sectViewOf, type SectActor } from "../sect-service";
import type { World } from "../world";
import { sendInv, takeFromSlot } from "./inventory";
import { spawnLoot } from "./loot";
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
  /** Linh hồn đang có MỘT thao tác tông môn dở (kho đồ: góp / rút; M8: nhiệm vụ, cửa hàng): thao tác thứ hai của cùng người bị từ chối thay vì chồng lên (mục 11.5 lớp 3). */
  readonly busy = new Set<string>();
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
 * ĐÃ CHẾT (QUYET_DINH_M3 mục 38): khí huyết về 0 (`p.dead`) hoặc ở Hoàng Tuyền (`c.limbo`, từ lúc bị hạ tới khi đầu thai xong). Người đã chết KHÔNG góp được gì vào
 * kho (đồ lẫn Linh thạch): đồ của kiếp cũ mất theo luật luân hồi, không "cứu" qua kho. `beginLimbo` (đặt `limbo` + xoá túi + xoá ví) chạy ĐỒNG BỘ trong `hurtPlayer`,
 * và mọi yêu cầu góp được kiểm ở đây SAU khi chết thì bị từ chối (kể cả gửi trước, máy chủ nhận sau): không có cửa sổ nào góp được đồ của người đã chết. "Tha chết do
 * mạng" (mục 33.4) KHÔNG đặt `dead` / `limbo` nên không tính là chết. Đồ / tiền đã trừ khỏi túi / ví TRƯỚC khi chết (đang chờ lưu / ghi kho) vẫn vào kho (góp trước khi chết).
 */
function isDown(w: World, sid: string): boolean {
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  return !p || !c || p.dead || c.limbo !== undefined;
}

/** Báo người đã chết không góp được (lý do riêng, không dùng `error` chung). */
function downFail(w: World, sid: string) {
  toastFail(w, sid, "down"); // chuỗi CHUNG cho góp / nhận / trả / mua (review B ở #837: không dùng chuỗi riêng cho góp)
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

/** Còn bao nhiêu ms hết khoá "kiếp mới chưa được rút" của người chơi `sid` ở phòng `w` (0 = không khoá hoặc cờ tắt). */
function newLifeLockLeft(w: World, sid: string): number {
  const c = w.ctrl.get(sid);
  return c && w.sectNewLifeLockMs > 0 ? Math.max(0, w.sectNewLifeLockMs - c.life.playMs) : 0;
}

/** Ảnh chụp kho đồ cho người `soulKey` đang đứng ở phòng `w` với phiên `sid` (lượt rút còn lại theo ngày của phòng đó, khoá kiếp mới của chính người đó). */
function vaultMsgFor(w: World, sid: string, sect: Sect, soulKey: string) {
  return { vault: sectVaultViewOf(sect, soulKey, dayKey(w.now), newLifeLockLeft(w, sid)) };
}

/** Ảnh chụp "Nội vụ" cho người `soulKey` đang đứng ở phòng `w` với phiên `sid` (đồng hồ phòng + cờ "chờ sang ngày" của phòng đó). */
function hallMsgFor(w: World, sect: Sect, soulKey: string) {
  return { hall: sectHallViewOf(sect, soulKey, w.now, w.sectEarnWarmup) };
}

/**
 * Sau một thay đổi thành công: nhớ bản ghi mới, gửi `SectMsg` cho mọi thành viên đang trực tuyến, đặt `Player.sect`, và gửi
 * `NO_SECT` (xoá cờ) cho những người vừa bị gỡ. Không gửi gì cho người ngoại tuyến (vào phòng sẽ tự nhận).
 */
function broadcastSect(w: World, sect: Sect, removed: { soulKey: string; name: string }[] = []) {
  const book = w.hub.sects;
  // Mỗi thao tác nhận bản ghi NGAY sau `update` nhưng PHÁT sau khi lưu hồ sơ (chậm, thời gian khác nhau): hai thao tác đua nhau có thể phát bản CŨ SAU bản MỚI, và người chơi kẹt ở ảnh
  // chụp cũ (kho còn món đã rút...). `updatedAt` tăng nghiêm ngặt theo từng lần ghi (`SectStore.update`) nên bản NHỚ mới hơn thì thay thế bản cũ vừa nhận (CI #864: "đua rút cùng 1 ô kho").
  const known = book.cache.get(sect.id);
  if (known && known.updatedAt > sect.updatedAt) sect = known;
  book.cache.set(sect.id, sect);
  book.lastPresence.delete(sect.id); // thành viên đổi: gửi lại presence ở nhịp tới
  for (const m of sect.members) {
    const loc = locateMember(w, m);
    if (!loc) continue;
    loc.p.sect = sect.tag;
    book.online.set(m.soulKey, sect.id);
    loc.w.events.sect(loc.sid, { sect: sectViewOf(sect, m.soulKey) });
    loc.w.events.sectVault(loc.sid, vaultMsgFor(loc.w, loc.sid, sect, m.soulKey));
    loc.w.events.sectHall(loc.sid, hallMsgFor(loc.w, sect, m.soulKey));
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
    loc.w.events.sectHall(loc.sid, { hall: null });
    loc.w.events.sectVault(loc.sid, { vault: null });
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
  w.events.sectVault(sid, vaultMsgFor(w, sid, sect, a.soulKey));
  w.events.sectHall(sid, hallMsgFor(w, sect, a.soulKey));
  sendPresence(w, sect); // mọi người trong tông môn thấy người mới trực tuyến ngay
}

/**
 * `sectHallGet`: xin ảnh chụp "Nội vụ" mới (chỉ đọc, giới hạn tần suất ở `WorldRoom.on`). Client xin lúc mở tab và khi qua mốc đặt lại trong ngày (`SectHallView.resetAt`);
 * máy chủ KHÔNG tự đẩy lúc nửa đêm. Không ở tông môn nào thì trả `hall: null`.
 */
export async function sectHallGet(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  const a = actorOf(w, sid);
  if (!svc || !a || !parseSectHallGet(raw)) return;
  const sect = await svc.sectOf(a.soulKey);
  if (!stillHere(w, sid, a.soulKey)) return;
  w.events.sectHall(sid, sect ? hallMsgFor(w, sect, a.soulKey) : { hall: null });
}

/**
 * Cộng cống hiến cho `sid` từ `source` qua MỘT cổng (`SectService.award`): gọi SAU khi thao tác chính (góp kho) đã THÀNH CÔNG; thao tác chính KHÔNG bị hoàn khi cống hiến bị từ chối
 * (chưa tới ngày được kiếm, hết trần, đã chết: chỉ là không có cống hiến). Trả số cống hiến được cộng (0 = không). Thành công thì ghi audit `sect.earn`, gửi lại `sectHall` cho
 * NGƯỜI KIẾM; lên cấp thì ghi `sect.level_up`, báo cả tông môn (toast + ảnh chụp). Người đã chết / ở Hoàng Tuyền không kiếm (mục 12.3, cùng `isDown`).
 */
async function awardContribution(
  w: World,
  sid: string,
  a: SectActor,
  source: SectEarnSource,
  want: number,
  key?: string,
): Promise<number> {
  const svc = w.sectService;
  if (!svc || want < 1 || isDown(w, sid)) return 0;
  const res = await svc.award(a, source, want, { key, warmup: w.sectEarnWarmup });
  if (!res.ok) return 0;
  w.audit?.("sect.earn", {
    name: a.name,
    sect: res.sect.name,
    source,
    amount: res.granted,
    level: res.level,
  });
  if (res.levelUp) {
    w.audit?.("sect.level_up", { sect: res.sect.name, level: res.level });
    broadcastSect(w, res.sect); // cả tông môn nhận ảnh chụp mới (cấp, giới hạn, buff)
    for (const m of res.sect.members) {
      const loc = locateMember(w, m);
      if (loc) toastGood(loc.w, loc.sid, `Tông môn ${res.sect.name} lên cấp ${res.level}!`);
    }
  } else if (stillHere(w, sid, a.soulKey)) {
    w.events.sectHall(sid, hallMsgFor(w, res.sect, a.soulKey));
    w.hub.sects.cache.set(res.sect.id, res.sect);
  }
  return res.granted;
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
  if (isDown(w, sid)) return downFail(w, sid); // đã chết (mục 38): không góp
  if (!(await svc.sectOf(a.soulKey))) return toastFail(w, sid, "not_in_sect"); // khỏi trừ rồi hoàn
  // Sau `await` người này có thể vừa bị hạ: kiểm lại NGAY trước khi trừ ví (đồng bộ với `trySpendCoin`, không `await` chen giữa)
  if (stillHere(w, sid, a.soulKey) && isDown(w, sid)) return downFail(w, sid);
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
  const ch = await awardContribution(
    w,
    sid,
    a,
    "deposit",
    sectDepositCh(sectDepositValue({ coin: msg.amount })),
  );
  toastGood(
    w,
    sid,
    `Đã góp ${msg.amount} Linh thạch vào kho tông môn.${ch > 0 ? ` (+${ch} cống hiến)` : ""}`,
  );
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
  if (newLifeLockLeft(w, sid) > 0) return toastFail(w, sid, "vault_locked"); // cờ kiếp mới chưa được rút (mặc định tắt)
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

// ---------- Kho đồ (túi <-> hồ sơ <-> kho; docs/THIET_KE_TONG_MON.md mục 11.4) ----------
// Ưu tiên MẤT hơn NHÂN ĐÔI: GÓP = trừ túi -> LƯU hồ sơ -> cộng kho (từ chối / lỗi thì trả túi, túi đầy thì rơi đất); RÚT = trừ kho (kèm hạn mức, sổ) -> cộng
// túi -> LƯU hồ sơ (túi không nhận trọn thì trả phần thừa vào kho, không được thì rơi đất). Sập giữa chừng chỉ có thể MẤT phần đồ đang chuyển, không bao giờ có thêm.

/** Túi `inv` còn chỗ cho `qty` món `itemId` không (thử trên bản sao). */
function bagHolds(inv: Inventory, itemId: string, qty: number): boolean {
  const copy = inv.map((s) => (s ? { ...s } : null));
  return addToInventory(copy, itemId, qty) === 0;
}

/**
 * Kho `sect` còn chỗ cho `qty` món `itemId` không (thử trên bản sao; kiểm SỚM để khỏi trừ túi rồi hoàn). Chỉ tính các ô ĐÃ MỞ theo cấp tông (M8: ô khoá không
 * chứa được): phải khớp `addToVault` của `SectService`, không thì kiểm sớm cho qua rồi dịch vụ từ chối SAU khi đã trừ túi và lưu hồ sơ.
 */
function vaultHolds(sect: Sect, itemId: string, qty: number): boolean {
  const open = sect.vault.slots
    .slice(0, sectLevelInfo(sectLevelOf(sect.points ?? 0)).vaultSlots)
    .map((s) => (s ? { ...s } : null));
  return addToInventory(open, itemId, qty) === 0;
}

/**
 * Trả đồ vào túi của `sid` (đúng linh hồn); phần túi không nhận thì RƠI XUỐNG ĐẤT tại chân (chủ nhặt trước). Người chơi đã rời thì đồ mất: không bao giờ
 * cộng ở hai chỗ.
 */
function returnToBag(w: World, sid: string, soulKey: string, itemId: string, qty: number) {
  const c = w.ctrl.get(sid);
  const p = w.state.players.get(sid);
  if (!c || !p || c.identity.soulKey !== soulKey) return;
  const left = addToInventory(c.inv, itemId, qty);
  if (left < qty) sendInv(w, sid, [{ itemId, qty: qty - left }]);
  else sendInv(w, sid);
  if (left > 0) spawnLoot(w, itemId, left, p.x, p.y, sid);
}

const itemName = (id: string) => ITEM_BY_ID[id]?.name ?? id;

/** Lý do từ chối cho thấy giao diện đang xem kho CŨ (người khác vừa lấy / thêm đồ, hay hết lượt): gửi lại ảnh chụp mới nhất cho chính người bị từ chối. */
const STALE_VAULT_FAILS: readonly SectFail[] = ["vault_changed", "vault_full", "vault_limit"];

/** Báo từ chối; nếu giao diện đang thấy kho cũ thì gửi kèm ảnh chụp kho MỚI NHẤT (tải lại bản ghi nếu chưa có `known`), khỏi chờ người khác làm kho đổi. */
async function vaultFail(w: World, sid: string, a: SectActor, reason: SectFail, known?: Sect) {
  toastFail(w, sid, reason);
  if (!STALE_VAULT_FAILS.includes(reason)) return;
  const sect = known ?? (await w.sectService?.sectOf(a.soulKey));
  if (sect && stillHere(w, sid, a.soulKey))
    w.events.sectVault(sid, vaultMsgFor(w, sid, sect, a.soulKey));
}

/** `sectVaultDeposit { slot, qty }`: kiểm sớm -> trừ túi -> LƯU hồ sơ -> cộng kho; từ chối / lỗi thì trả túi. */
export async function sectVaultDeposit(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectVaultDeposit(raw);
  const a = actorOf(w, sid);
  const c = w.ctrl.get(sid);
  if (!a || !c) return;
  if (!msg) return toastFail(w, sid, "item_invalid");
  // Đang qua cổng: hồ sơ không lưu được lúc này (đồ trừ khỏi túi mà đĩa vẫn giữ đồ: nhân đôi nếu sập). Ở Hoàng Tuyền: túi của kiếp đã mất.
  if (isDown(w, sid)) return downFail(w, sid); // đã chết (mục 38): không góp
  if (c.travelling || c.limbo) return toastFail(w, sid, "error");
  const book = w.hub.sects;
  if (book.busy.has(a.soulKey)) return toastFail(w, sid, "error"); // đang xử lý một thao tác kho đồ của chính người này
  book.busy.add(a.soulKey);
  try {
    const slot = c.inv[msg.slot];
    if (!slot || msg.qty > slot.qty) return toastFail(w, sid, "item_invalid");
    const itemId = slot.itemId;
    if (!sectVaultAccepts(itemId)) return toastFail(w, sid, "vault_denied");
    const cur = await svc.sectOf(a.soulKey);
    if (!cur) return toastFail(w, sid, "not_in_sect"); // khỏi trừ rồi hoàn
    if (!vaultHolds(cur, itemId, msg.qty)) return vaultFail(w, sid, a, "vault_full", cur);
    // Sau `await` túi có thể đã đổi (nhặt / dùng / vứt): kiểm lại ĐÚNG ô và số lượng rồi mới trừ
    const c2 = w.ctrl.get(sid);
    if (!c2 || !stillHere(w, sid, a.soulKey)) return toastFail(w, sid, "error");
    if (isDown(w, sid)) return downFail(w, sid); // vừa bị hạ trong lúc chờ: túi đã bị xoá / sắp bị xoá, KHÔNG góp (mục 38)
    if (c2.travelling || c2.limbo) return toastFail(w, sid, "error");
    const s2 = c2.inv[msg.slot];
    if (!s2 || s2.itemId !== itemId || msg.qty > s2.qty) return toastFail(w, sid, "item_invalid");
    takeFromSlot(c2.inv, msg.slot, msg.qty);
    sendInv(w, sid);
    // Túi đã trừ phải xuống đĩa TRƯỚC khi kho được cộng; lưu không được thì huỷ, trả túi (kho chưa đụng tới)
    if (!(await saveNow(w, sid))) {
      returnToBag(w, sid, a.soulKey, itemId, msg.qty);
      return toastFail(w, sid, "error");
    }
    const res = await svc.vaultDeposit(a, itemId, msg.qty);
    if (!res.ok) {
      returnToBag(w, sid, a.soulKey, itemId, msg.qty); // trả đồ
      return vaultFail(w, sid, a, res.reason);
    }
    broadcastSect(w, res.sect);
    w.audit?.("sect.vault_deposit", { name: a.name, sect: res.sect.name, itemId, qty: msg.qty });
    const ch = await awardContribution(
      w,
      sid,
      a,
      "deposit",
      sectDepositCh(sectDepositValue({ itemId, qty: msg.qty })),
    );
    toastGood(
      w,
      sid,
      `Đã góp ${msg.qty} ${itemName(itemId)} vào kho đồ tông môn.${ch > 0 ? ` (+${ch} cống hiến)` : ""}`,
    );
  } finally {
    book.busy.delete(a.soulKey);
  }
}

/**
 * `sectVaultWithdraw { slot, itemId, qty }`: kiểm sớm (túi còn chỗ, khoá kiếp mới) -> trừ kho (nguyên tử: quyền, khoá kỳ vọng theo ô, hạn mức, sổ) -> cộng túi ->
 * LƯU hồ sơ. Túi không nhận trọn (vừa đầy, người chơi đã rời / gục / đang qua cổng) thì TRẢ phần thừa vào kho; kho cũng hết chỗ thì rơi đất tại chân.
 */
export async function sectVaultWithdraw(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectVaultWithdraw(raw);
  const a = actorOf(w, sid);
  const c = w.ctrl.get(sid);
  if (!a || !c) return;
  if (!msg) return toastFail(w, sid, "item_invalid");
  if (c.travelling || c.limbo) return toastFail(w, sid, "error");
  if (newLifeLockLeft(w, sid) > 0) return toastFail(w, sid, "vault_locked");
  const book = w.hub.sects;
  if (book.busy.has(a.soulKey)) return toastFail(w, sid, "error");
  book.busy.add(a.soulKey);
  try {
    if (!bagHolds(c.inv, msg.itemId, msg.qty)) return toastFail(w, sid, "bag_full");
    const today = dayKey(w.now);
    const res = await svc.vaultWithdraw(a, msg, today);
    if (!res.ok) return vaultFail(w, sid, a, res.reason);
    // Kho đã trừ: đồ phải VÀO túi hoặc VỀ kho. Chỉ cộng túi khi người này vẫn ở đây, cùng linh hồn, còn sống kiếp này và không đang qua cổng.
    const cur = w.ctrl.get(sid);
    let left = msg.qty;
    if (cur && walletOpen(w, sid, a.soulKey) && !cur.travelling) {
      left = addToInventory(cur.inv, msg.itemId, msg.qty);
      if (left < msg.qty) sendInv(w, sid, [{ itemId: msg.itemId, qty: msg.qty - left }]);
    }
    const got = msg.qty - left;
    let sect = res.sect;
    if (left > 0) {
      // trả phần chưa nhận được vào kho (hoàn cả lượt rút nếu không nhận được gì); kho hết chỗ thì rơi đất tại chân
      const back = await svc.vaultReturn(a, msg.itemId, left, got === 0, today);
      if (back.ok) sect = back.sect;
      else {
        const p = w.state.players.get(sid);
        if (p && stillHere(w, sid, a.soulKey)) spawnLoot(w, msg.itemId, left, p.x, p.y, sid);
      }
    }
    if (got > 0) await saveNow(w, sid);
    broadcastSect(w, sect);
    if (got > 0) {
      w.audit?.("sect.vault_withdraw", {
        name: a.name,
        sect: sect.name,
        itemId: msg.itemId,
        qty: got,
      });
      toastGood(w, sid, `Đã rút ${got} ${itemName(msg.itemId)} từ kho đồ tông môn.`);
    } else toastFail(w, sid, "bag_full");
  } finally {
    book.busy.delete(a.soulKey);
  }
}

/** `sectVaultPolicy { drawPerDay }`: chỉ Tông chủ; đặt số lượt rút / ngày của Đệ tử rồi gửi lại kho cho mọi thành viên trực tuyến. */
export async function sectVaultPolicy(w: World, sid: string, raw: unknown) {
  const svc = w.sectService;
  if (!svc) return toastFail(w, sid, "disabled");
  const msg = parseSectVaultPolicy(raw);
  const a = actorOf(w, sid);
  if (!a) return;
  if (!msg) return toastFail(w, sid, "amount_invalid");
  const res = await svc.vaultPolicy(a, msg.drawPerDay);
  if (!res.ok) return toastFail(w, sid, res.reason);
  broadcastSect(w, res.sect);
  w.audit?.("sect.vault_policy", { name: a.name, sect: res.sect.name, drawPerDay: msg.drawPerDay });
  toastGood(w, sid, `Đệ tử nay được rút kho đồ ${msg.drawPerDay} lượt mỗi ngày.`);
}
