// Tông môn (M3 bước 6, docs/THIET_KE_TONG_MON.md; PR 6a chỉ có hợp đồng, chưa có mã server / client).
//
// Một nhóm người chơi lập tông môn (tên + biệt hiệu ngắn), có chức vụ (Tông chủ / Trưởng lão / Đệ tử), chat riêng `/s`, thông báo
// một dòng và kho chung Linh thạch. THÀNH VIÊN LÀ LINH HỒN (`Identity.soulKey`), không phải nhân vật của một kiếp: đầu thai vẫn ở
// tông môn với đúng chức vụ. Bản ghi `Sect` (nguồn sự thật) chỉ nằm ở server; client nhận `SectMsg` (ảnh chụp) khi có đổi.
//
// Luồng tin nhắn (server kiểm LẠI mọi thứ; các hàm thuần ở đây chỉ để client ẩn nút và báo lý do bằng tiếng Việt):
//  1. Lập: `sectCreate { name, tag }` (mất `SECT_CREATE_COST` Linh thạch) -> `sect` (ảnh chụp, mình là Tông chủ).
//  2. Mời: Tông chủ / Trưởng lão bấm vào người chơi -> `sectInvite { name }` -> người kia nhận `sectInvited`, trả lời trong
//     `SECT_INVITE_TTL_MS` bằng `sectAccept { from }` / `sectDecline { from }`; lời mời dùng một lần, server kiểm lại lúc nhận.
//  3. Quản lý: `sectLeave`, `sectKick`, `sectRank`, `sectTransfer`, `sectDisband`, `sectMotd`; kho: `sectDeposit` / `sectWithdraw`.
//     Mọi thay đổi gửi lại `sect` cho các thành viên; `sectPresence` (ai đang trực tuyến) tách riêng vì đổi thường hơn.
//  4. Chat: lệnh `/s <nội dung>` qua tin `chat` sẵn có, trả về `ChatOut { channel: "sect" }` cho mọi thành viên, kể cả ở bản đồ khác.
// Mọi lý do từ chối đi về client bằng toast `sectFailMessage(reason)`; lỗi hệ thống không lộ chi tiết.
import { cleanName } from "./account";
import { COIN_CAP } from "./currency";

// ---------- Hằng số (thời gian tính bằng ms) ----------

export const SECT_NAME_MIN = 2;
export const SECT_NAME_MAX = 16;
/** Biệt hiệu hiện cạnh tên người chơi dạng `[xxxx]`. */
export const SECT_TAG_MIN = 2;
export const SECT_TAG_MAX = 4;
/** Thông báo của tông môn (một dòng, đếm theo ký tự Unicode). */
export const SECT_MOTD_MAX = 120;

/** Số thành viên tối đa (gồm Tông chủ). */
export const SECT_MAX_MEMBERS = 30;
/** Số Trưởng lão tối đa cùng lúc. */
export const SECT_ELDERS_MAX = 3;

/** Lời mời tự hết hạn sau chừng này (coi như từ chối). */
export const SECT_INVITE_TTL_MS = 30_000;
/** Số lời mời còn hạn tối đa tới MỘT người (chống rải lời mời làm phiền). */
export const SECT_INVITES_MAX = 3;
/** Người tự rời / bị mời ra phải đợi chừng này mới nhận hoặc được nhận lời mời vào tông môn khác. */
export const SECT_REJOIN_COOLDOWN_MS = 600_000;
/** Hồi chiêu lập tông môn của mỗi người (kể cả sau khi giải tán), chống lập rồi giải tán liên tục. */
export const SECT_CREATE_COOLDOWN_MS = 60_000;
/** Linh thạch phải trả để lập tông môn (một "chỗ xả tiền", docs/CAN_BANG.md). Mất hẳn, không hoàn khi giải tán. */
export const SECT_CREATE_COST = 1_000;
/** Kho chung tối đa. Lớn hơn `COIN_CAP` của ví để một lần góp đầy ví vẫn luôn vào được kho trống. */
export const SECT_COIN_CAP = 9_999_999_999;
/** Sổ ghi kho giữ chừng này mục gần nhất. */
export const SECT_LOG_MAX = 30;
/** Gửi lại `sectPresence` mỗi chừng này, chỉ khi có đổi. */
export const SECT_PRESENCE_MS = 10_000;

// ---------- Chức vụ ----------

/** Từ cao xuống thấp. */
export const SECT_RANKS = ["chu", "truong_lao", "de_tu"] as const;
export type SectRank = (typeof SECT_RANKS)[number];

/** Chức vụ có thể giao cho người khác bằng `sectRank` (Tông chủ chỉ đổi bằng `sectTransfer`). */
export const SECT_ASSIGNABLE_RANKS = ["truong_lao", "de_tu"] as const;
export type SectAssignableRank = (typeof SECT_ASSIGNABLE_RANKS)[number];

export const SECT_RANK_LABEL: Record<SectRank, string> = {
  chu: "Tông chủ",
  truong_lao: "Trưởng lão",
  de_tu: "Đệ tử",
};

/** Hạng càng nhỏ càng cao: dùng để xếp danh sách thành viên. */
export function sectRankOrder(rank: SectRank): number {
  return SECT_RANKS.indexOf(rank);
}

// ---------- Tin nhắn ----------

/** Tên tin nhắn Colyseus của tông môn. Chat tông môn đi bằng tin `chat` sẵn có (lệnh `/s`), không có tên riêng. */
export const SECT_MSG = {
  create: "sectCreate",
  invite: "sectInvite",
  accept: "sectAccept",
  decline: "sectDecline",
  leave: "sectLeave",
  kick: "sectKick",
  rank: "sectRank",
  transfer: "sectTransfer",
  disband: "sectDisband",
  motd: "sectMotd",
  deposit: "sectDeposit",
  withdraw: "sectWithdraw",
  invited: "sectInvited",
  snapshot: "sect",
  presence: "sectPresence",
} as const;

/** Client -> server: lập tông môn. */
export interface SectCreateMsg {
  name: string;
  tag: string;
}
/** Client -> server: mời người chơi có đạo hiệu `name` (đang trực tuyến) vào tông môn. */
export interface SectInviteMsg {
  name: string;
}
/** Client -> server: nhận (`sectAccept`) hoặc từ chối (`sectDecline`) lời mời của `from` (đạo hiệu người mời). */
export interface SectAnswerMsg {
  from: string;
}
/** Client -> server: mời thành viên `name` ra khỏi tông môn. */
export interface SectKickMsg {
  name: string;
}
/** Client -> server: chuyển quyền Tông chủ cho thành viên `name` (mình xuống Trưởng lão). */
export interface SectTransferMsg {
  name: string;
}
/** Client -> server: đặt chức vụ cho thành viên `name`. */
export interface SectRankMsg {
  name: string;
  rank: SectAssignableRank;
}
/** Client -> server: sửa thông báo (rỗng = xoá). */
export interface SectMotdMsg {
  motd: string;
}
/** Client -> server: góp (`sectDeposit`) hoặc rút (`sectWithdraw`) `amount` Linh thạch. */
export interface SectAmountMsg {
  amount: number;
}
/** `sectLeave`, `sectDisband`: không có trường nào. */
export type SectEmptyMsg = Record<string, never>;

// ---------- Làm sạch dữ liệu từ client (server KHÔNG tin client: vẫn gọi lại các hàm này) ----------

/** Độ dài theo ký tự Unicode (không phải đơn vị UTF-16). */
function len(s: string): number {
  return [...s].length;
}

/**
 * Tên tông môn hợp lệ (NFC, gộp khoảng trắng, cắt hai đầu; chữ, số, dấu cách; `SECT_NAME_MIN`..`SECT_NAME_MAX` ký tự), hoặc `null`.
 * Cùng bảng chữ với đạo hiệu (`cleanName`) nhưng độ dài tính theo ký tự Unicode.
 */
export function cleanSectName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  const l = len(n);
  if (l < SECT_NAME_MIN || l > SECT_NAME_MAX) return null;
  if (!/^[\p{L}\p{N} ]+$/u.test(n)) return null;
  return n;
}

/** Biệt hiệu hợp lệ (NFC, chỉ chữ và số, không dấu cách, `SECT_TAG_MIN`..`SECT_TAG_MAX` ký tự), hoặc `null`. Không tự cắt giữa chừng. */
export function cleanSectTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.normalize("NFC").trim();
  const l = len(n);
  if (l < SECT_TAG_MIN || l > SECT_TAG_MAX) return null;
  if (!/^[\p{L}\p{N}]+$/u.test(n)) return null;
  return n;
}

/**
 * Thông báo: một dòng. Mọi khoảng trắng (kể cả xuống dòng) thành dấu cách đơn, bỏ ký tự điều khiển và ký tự định dạng vô hình
 * (độ rộng bằng 0, đảo chiều chữ...), cắt hai đầu, rồi CẮT còn `SECT_MOTD_MAX` ký tự. Rỗng là hợp lệ (xoá thông báo).
 * Chỉ `null` khi không phải chuỗi. Client hiển thị bằng `textContent`.
 */
export function cleanMotd(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.normalize("NFC").replace(/\s+/g, " ").replace(/\p{C}/gu, "").trim();
  return [...s].slice(0, SECT_MOTD_MAX).join("").trim();
}

/**
 * Khoá so sánh tên / biệt hiệu duy nhất toàn server: không phân biệt hoa thường (có dấu vẫn là chữ khác).
 * Server và client dùng chung để cùng một luật "đã có người dùng".
 */
export function sectKey(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw === null || typeof raw !== "object" || Array.isArray(raw)
    ? null
    : (raw as Record<string, unknown>);
}

/** Đọc `{ <field>: đạo hiệu }`: sai kiểu / đạo hiệu sai luật (`cleanName`) thì `null`; chỉ lấy đúng trường đó. */
function parseNameField<K extends string>(raw: unknown, field: K): Record<K, string> | null {
  const r = asRecord(raw);
  if (!r) return null;
  const name = cleanName(r[field]);
  return name === null ? null : ({ [field]: name } as Record<K, string>);
}

/** Đọc `sectCreate`: tên và biệt hiệu đều hợp lệ, hoặc `null`; không mang trường lạ. */
export function parseSectCreate(raw: unknown): SectCreateMsg | null {
  const r = asRecord(raw);
  if (!r) return null;
  const name = cleanSectName(r.name);
  const tag = cleanSectTag(r.tag);
  return name === null || tag === null ? null : { name, tag };
}

/** Đọc `sectInvite`. */
export function parseSectInvite(raw: unknown): SectInviteMsg | null {
  return parseNameField(raw, "name");
}

/** Đọc `sectAccept` / `sectDecline`. */
export function parseSectAnswer(raw: unknown): SectAnswerMsg | null {
  return parseNameField(raw, "from");
}

/** Đọc `sectKick`. */
export function parseSectKick(raw: unknown): SectKickMsg | null {
  return parseNameField(raw, "name");
}

/** Đọc `sectTransfer`. */
export function parseSectTransfer(raw: unknown): SectTransferMsg | null {
  return parseNameField(raw, "name");
}

/** Đọc `sectRank`: đạo hiệu hợp lệ và chức vụ là `truong_lao` hoặc `de_tu` (KHÔNG có `chu`: dùng `sectTransfer`). */
export function parseSectRank(raw: unknown): SectRankMsg | null {
  const r = asRecord(raw);
  if (!r) return null;
  const who = parseNameField(r, "name");
  const rank = r.rank;
  if (!who || !(SECT_ASSIGNABLE_RANKS as readonly unknown[]).includes(rank)) return null;
  return { name: who.name, rank: rank as SectAssignableRank };
}

/** Đọc `sectMotd`: chuỗi (đã làm sạch và cắt độ dài theo `cleanMotd`), hoặc `null` nếu không phải chuỗi. */
export function parseSectMotd(raw: unknown): SectMotdMsg | null {
  const r = asRecord(raw);
  if (!r) return null;
  const motd = cleanMotd(r.motd);
  return motd === null ? null : { motd };
}

/**
 * Đọc `sectDeposit` / `sectWithdraw`: số nguyên an toàn trong 1..`COIN_CAP` (không làm tròn hộ client: 1.5, NaN, Infinity, chuỗi,
 * 0, số âm đều bị từ chối), hoặc `null`.
 */
export function parseSectAmount(raw: unknown): SectAmountMsg | null {
  const r = asRecord(raw);
  if (!r) return null;
  const a = r.amount;
  if (typeof a !== "number" || !Number.isSafeInteger(a) || a < 1 || a > COIN_CAP) return null;
  return { amount: a };
}

// ---------- Tin server -> client ----------

/** Một thành viên trong ảnh chụp. Thứ tự trong `SectView.members` theo `compareSectMembers`. */
export interface SectMember {
  /** Đạo hiệu (lần cuối server thấy) */
  name: string;
  rank: SectRank;
  /** Thời điểm vào tông môn (ms epoch) */
  joinedAt: number;
}

export type SectLogKind = "deposit" | "withdraw";

/** Một dòng sổ kho: ai góp / rút bao nhiêu Linh thạch, lúc nào. `amount` luôn là số nguyên dương. */
export interface SectLogEntry {
  at: number;
  name: string;
  kind: SectLogKind;
  amount: number;
}

/** Ảnh chụp tông môn gửi cho từng thành viên (riêng tư: người ngoài không nhận). */
export interface SectView {
  name: string;
  tag: string;
  motd: string;
  /** Chức vụ của chính người nhận (client dùng cho `canSect`) */
  myRank: SectRank;
  members: SectMember[];
  /** Số dư kho, 0..`SECT_COIN_CAP` */
  coin: number;
  /** Mới nhất đứng đầu, tối đa `SECT_LOG_MAX` */
  log: SectLogEntry[];
  createdAt: number;
}

/**
 * Server -> client: gửi lúc vào phòng và mỗi khi tông môn đổi (không mỗi tick). `sect: null` = không (còn) ở tông môn nào:
 * mới rời, bị mời ra, tông môn giải tán; client xoá bảng.
 */
export interface SectMsg {
  sect: SectView | null;
}
export const NO_SECT: SectMsg = { sect: null };

/** Một thành viên đang trực tuyến. Thành viên không có trong danh sách là ngoại tuyến. */
export interface SectPresenceEntry {
  name: string;
  realm: number;
  tier: number;
  /** Bản đồ đang đứng */
  mapId: string;
}

/** Server -> client: ai đang trực tuyến. Mỗi `SECT_PRESENCE_MS` và chỉ khi có đổi (gồm cả lần đầu vào phòng). */
export interface SectPresenceMsg {
  online: SectPresenceEntry[];
}

/** Server -> client: có người mời ngươi vào tông môn; hiện Nhận / Từ chối trong `ttlMs`. */
export interface SectInvitedMsg {
  /** Đạo hiệu người mời (gửi lại bằng `sectAccept` / `sectDecline`) */
  from: string;
  /** Tên và biệt hiệu tông môn */
  sect: string;
  tag: string;
  /** Còn bao nhiêu ms để trả lời (đồng hồ của server; client đếm ngược theo đó) */
  ttlMs: number;
}

/** Xếp danh sách thành viên: chức vụ cao trước, rồi vào sớm trước, rồi theo tên. Server và client dùng chung để cùng một thứ tự. */
export function compareSectMembers(a: SectMember, b: SectMember): number {
  return (
    sectRankOrder(a.rank) - sectRankOrder(b.rank) ||
    a.joinedAt - b.joinedAt ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  );
}

// ---------- Quyền theo chức vụ (hàm thuần: client ẩn nút, server kiểm lại trên bản ghi đọc trong `update`) ----------

export type SectAction =
  | "chat"
  | "deposit"
  | "invite"
  | "motd"
  | "withdraw"
  | "kick"
  | "setRank"
  | "transfer"
  | "disband"
  | "leave";

/**
 * Bảng quyền (docs/THIET_KE_TONG_MON.md mục 4.3). Ngoài bảng còn hai ràng buộc theo ĐỐI TƯỢNG trong `canSect`: `kick` (Trưởng lão
 * chỉ mời ra Đệ tử) và `setRank` / `transfer` / `kick` không bao giờ nhắm vào Tông chủ. `leave` của Tông chủ là `false`: phải
 * chuyển quyền trước (hoặc giải tán nếu còn một mình).
 */
export const SECT_PERMS: Record<SectAction, Record<SectRank, boolean>> = {
  chat: { chu: true, truong_lao: true, de_tu: true },
  deposit: { chu: true, truong_lao: true, de_tu: true },
  invite: { chu: true, truong_lao: true, de_tu: false },
  motd: { chu: true, truong_lao: true, de_tu: false },
  withdraw: { chu: true, truong_lao: false, de_tu: false },
  kick: { chu: true, truong_lao: true, de_tu: false },
  setRank: { chu: true, truong_lao: false, de_tu: false },
  transfer: { chu: true, truong_lao: false, de_tu: false },
  disband: { chu: true, truong_lao: false, de_tu: false },
  leave: { chu: false, truong_lao: true, de_tu: true },
};

/** Chức vụ của người bị tác động mà người giữ chức `rank` được phép mời ra. */
const KICKABLE: Record<SectRank, readonly SectRank[]> = {
  chu: ["truong_lao", "de_tu"],
  truong_lao: ["de_tu"],
  de_tu: [],
};

/**
 * Người giữ chức `rank` làm được `action` không? `rank = null` (không ở tông môn) thì không làm được gì. `target` là chức vụ
 * của người bị tác động, bắt buộc với `kick` / `setRank` / `transfer` (thiếu thì `false`); `setRank` và `transfer` không nhắm
 * vào Tông chủ. Không kiểm các điều kiện khác (hạn mức Trưởng lão, đầy thành viên...): server kiểm và báo bằng `SectFail`.
 */
export function canSect(action: SectAction, rank: SectRank | null, target?: SectRank): boolean {
  if (rank === null || !SECT_RANKS.includes(rank)) return false;
  if (!SECT_PERMS[action][rank]) return false;
  switch (action) {
    case "kick":
      return target !== undefined && KICKABLE[rank].includes(target);
    case "setRank":
    case "transfer":
      return target !== undefined && SECT_RANKS.includes(target) && target !== "chu";
    default:
      return true;
  }
}

// ---------- Lý do từ chối ----------

/** Mọi lý do server có thể từ chối một thao tác tông môn. */
export const SECT_FAILS = [
  "disabled",
  "error",
  "not_in_sect",
  "already_in_sect",
  "forbidden",
  "leader_must_transfer",
  "name_invalid",
  "tag_invalid",
  "name_taken",
  "tag_taken",
  "no_coin",
  "create_cooldown",
  "sect_full",
  "elders_full",
  "target_not_found",
  "target_self",
  "target_in_sect",
  "target_rejoin_cooldown",
  "rejoin_cooldown",
  "already_invited",
  "target_overloaded",
  "invite_expired",
  "invite_invalid",
  "member_not_found",
  "same_rank",
  "amount_invalid",
  "treasury_full",
  "treasury_short",
  "wallet_full",
  "treasury_not_empty",
] as const;
export type SectFail = (typeof SECT_FAILS)[number];

const FAIL_MESSAGES: Record<SectFail, string> = {
  disabled: "Tông môn tạm thời chưa mở.",
  error: "Có trục trặc khi xử lý, hãy thử lại sau.",
  not_in_sect: "Ngươi chưa thuộc tông môn nào.",
  already_in_sect: "Ngươi đã thuộc một tông môn rồi.",
  forbidden: "Chức vụ của ngươi chưa đủ quyền làm việc này.",
  leader_must_transfer: "Tông chủ phải chuyển quyền cho người khác trước khi rời tông môn.",
  name_invalid: "Tên tông môn dài 2-16 ký tự, chỉ gồm chữ, số và dấu cách.",
  tag_invalid: "Biệt hiệu dài 2-4 ký tự, chỉ gồm chữ và số.",
  name_taken: "Tên tông môn này đã có người dùng.",
  tag_taken: "Biệt hiệu này đã có người dùng.",
  no_coin: "Không đủ Linh thạch.",
  create_cooldown: "Vừa lập tông môn xong, hãy đợi một lát.",
  sect_full: "Tông môn đã đủ người.",
  elders_full: "Tông môn đã đủ Trưởng lão.",
  target_not_found: "Không thấy đạo hữu này đang ở trong thế giới.",
  target_self: "Không thể làm việc này với chính mình.",
  target_in_sect: "Đạo hữu này đã thuộc một tông môn.",
  target_rejoin_cooldown: "Đạo hữu này vừa rời tông môn, hãy đợi một lát.",
  rejoin_cooldown: "Ngươi vừa rời tông môn, hãy đợi một lát rồi hãy gia nhập tông môn khác.",
  already_invited: "Đã mời đạo hữu này, đang chờ trả lời.",
  target_overloaded: "Đạo hữu này đang nhận quá nhiều lời mời.",
  invite_expired: "Lời mời đã hết hạn.",
  invite_invalid: "Lời mời không còn hiệu lực.",
  member_not_found: "Không thấy thành viên này trong tông môn.",
  same_rank: "Người này đã giữ chức vụ đó rồi.",
  amount_invalid: "Số Linh thạch không hợp lệ.",
  treasury_full: "Kho tông môn đã đầy.",
  treasury_short: "Kho tông môn không đủ Linh thạch.",
  wallet_full: "Túi Linh thạch của ngươi không chứa thêm được.",
  treasury_not_empty: "Hãy rút hết Linh thạch trong kho trước khi giải tán tông môn.",
};

/** Câu báo cho người chơi (toast). Không lộ số / id nội bộ. */
export function sectFailMessage(reason: SectFail): string {
  return FAIL_MESSAGES[reason];
}
