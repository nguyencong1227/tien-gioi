// Thách đấu (PK, M3 bước 5, docs/THIET_KE_PK.md; PR 5a chỉ có hợp đồng, chưa có mã server / client).
//
// Hai người CÙNG PHÒNG, ngoài khu an toàn, chỉ đánh nhau khi CẢ HAI đồng ý; chết vì thách đấu KHÔNG mất kiếp (người thua gục
// `DUEL_KO_MS` rồi đứng dậy tại chỗ, không mất gì). Server quyết định mọi thứ; client chỉ gửi ý định và hiển thị.
//
// Luồng tin nhắn:
//  1. A (bấm vào B -> "Thách đấu") -> `duelChallenge { name }`. Server kiểm (`canChallenge` ở đây là bản chung để client ẩn
//     nút; SERVER kiểm lại mọi thứ) rồi gửi `duelInvited { from, ttlMs }` cho B.
//  2. B bấm Nhận -> `duelAccept { from }`, hoặc Từ chối -> `duelDecline { from }` (hết `DUEL_INVITE_TTL_MS` cũng là từ chối). Server
//     kiểm LẠI lúc nhận (người mời còn trong tầm, ngoài trấn, chưa trong trận khác); lời mời dùng một lần.
//  3. Hai bên nhận `duelState` (đếm ngược `DUEL_COUNTDOWN_MS` rồi đánh; mỗi `DUEL_STATE_MS` và khi đổi pha). Trong trận chỉ đối thủ
//     trúng đòn; quái không làm hại hai người; không uống đan hồi huyết / đả tọa.
//  4. Kết thúc: `duelEnd { result, reason }` cho cả hai (hết khí huyết, `duelYield`, bỏ chạy, hết giờ, rớt mạng).
// Khí huyết đối thủ đã có trong state người chơi (công khai); cờ `Player.duel` (boolean, state chung) cho người ngoài vẽ dấu.
import { cleanName } from "./account";

// ---------- Hằng số (thời gian tính bằng ms, khoảng cách bằng px) ----------

/** Người thách và người bị thách phải đứng trong tầm này của nhau (server cho thêm sai số nhỏ như `PORTAL_SLACK`). */
export const DUEL_RANGE = 400;
/** Lời mời tự hết hạn sau chừng này (coi như từ chối). */
export const DUEL_INVITE_TTL_MS = 20_000;
/** Sau khi nhận, chờ chừng này (không ai gây được sát thương) rồi mới đánh. */
export const DUEL_COUNTDOWN_MS = 3_000;
/** Trận kéo dài tối đa chừng này kể từ lúc bắt đầu đánh; hết thì HOÀ, giữ nguyên khí huyết. */
export const DUEL_MAX_MS = 180_000;
/** Người thua gục chừng này rồi tự đứng dậy tại chỗ (không về trấn). */
export const DUEL_KO_MS = 3_000;
/** Khí huyết (tỉ lệ `maxHp`) của người thua khi đứng dậy. */
export const DUEL_KO_HP_PCT = 0.3;
/** Rời quá chừng này khỏi điểm bắt đầu (tâm hai người lúc nhận) là bỏ chạy: thua. */
export const DUEL_LEASH_PX = 700;
/** Hồi chiêu thách đấu của MỖI người thách; cũng là hồi chiêu theo CẶP sau khi bị từ chối / hết hạn. */
export const DUEL_COOLDOWN_MS = 10_000;
/** Số lời mời thách đấu đang chờ tối đa gửi tới MỘT người (chống rải lời mời làm phiền). */
export const DUEL_INVITES_MAX = 3;
/** Gửi `duelState` mỗi chừng này (không mỗi tick). */
export const DUEL_STATE_MS = 1_000;
/**
 * Hệ số sát thương người lên người so với đánh quái (nhân vào `atk` như `hitMonster`): làm trận kéo dài ~30 giây thay vì 4-5 đòn
 * là hết. Đã cân bằng ở 5c bằng mô phỏng MÃ SERVER THẬT (hai người cùng bậc đánh thường liên tục, không đan, không đả tọa,
 * hạt giống cố định): 30-36 giây ở mọi bậc từ Phàm Nhân tới Trúc Cơ (mục tiêu 25-45); xem `docs/CAN_BANG.md` mục "PK".
 */
export const PK_DAMAGE_MULT = 0.125;

// ---------- Tin nhắn ----------

/** Tên tin nhắn Colyseus của thách đấu. */
export const DUEL_MSG = {
  challenge: "duelChallenge",
  accept: "duelAccept",
  decline: "duelDecline",
  yield: "duelYield",
  invited: "duelInvited",
  state: "duelState",
  end: "duelEnd",
} as const;

/** Client -> server: thách đấu người có đạo hiệu `name` (cùng phòng). */
export interface DuelChallengeMsg {
  name: string;
}

/** Client -> server: nhận (`duelAccept`) hoặc từ chối (`duelDecline`) lời thách đấu của `from` (đạo hiệu người thách). */
export interface DuelAnswerMsg {
  from: string;
}

/** Client -> server: đầu hàng (thua ngay, không gục, giữ khí huyết). Không có trường nào. */
export type DuelYieldMsg = Record<string, never>;

/** Đọc `{ <field>: đạo hiệu }` từ mạng: sai kiểu / đạo hiệu sai luật (`cleanName`) thì `null`; chỉ lấy đúng trường đó. */
function parseNameField<K extends string>(raw: unknown, field: K): Record<K, string> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const name = cleanName((raw as Record<string, unknown>)[field]);
  return name === null ? null : ({ [field]: name } as Record<K, string>);
}

/** Đọc `duelChallenge` từ mạng (không tin client): đạo hiệu chuẩn hoá hoặc `null`; không mang trường lạ. */
export function parseDuelChallenge(raw: unknown): DuelChallengeMsg | null {
  return parseNameField(raw, "name");
}

/** Đọc `duelAccept` / `duelDecline` từ mạng (không tin client): đạo hiệu chuẩn hoá hoặc `null`; không mang trường lạ. */
export function parseDuelAnswer(raw: unknown): DuelAnswerMsg | null {
  return parseNameField(raw, "from");
}

/** Server -> client: có người thách đấu ngươi (chỉ người được mời nhận). */
export interface DuelInvitedMsg {
  /** Đạo hiệu người thách */
  from: string;
  /** Còn bao nhiêu ms để trả lời (đồng hồ của server; client đếm ngược theo đó) */
  ttlMs: number;
}

export type DuelPhase = "countdown" | "fight";

/** Server -> client (hai người trong trận): trạng thái cho HUD, mỗi `DUEL_STATE_MS` và khi đổi pha. */
export interface DuelStateMsg {
  phase: DuelPhase;
  /** Đạo hiệu đối thủ */
  opponent: string;
  /** Còn bao nhiêu ms tới lúc được đánh (0 khi đã `fight`) */
  startsInMs: number;
  /** Còn bao nhiêu ms tới khi trận hết giờ (hoà) */
  endsInMs: number;
}

/**
 * Lý do kết thúc: `ko` (một bên hết khí huyết), `yield` (đầu hàng), `fled` (rời quá `DUEL_LEASH_PX` hoặc vào khu an toàn),
 * `timeout` (hết `DUEL_MAX_MS`: hoà), `disconnect` (một bên rớt mạng / rời phòng / qua cổng: huỷ trận, hoà; rớt mạng không tính thua).
 */
export type DuelEndReason = "ko" | "yield" | "fled" | "timeout" | "disconnect";

/** Server -> client: trận kết thúc (gửi cho cả hai). `draw` chỉ đi với `timeout` / `disconnect`; ngược lại luôn có thắng / thua. */
export interface DuelEndMsg {
  result: "won" | "lost" | "draw";
  reason: DuelEndReason;
}

// ---------- Điều kiện thách (hàm thuần, client dùng để ẩn nút, server kiểm lại) ----------

/** Một bên của lời thách, nhìn từ người kiểm tra. Client điền được phần công khai; phần còn lại server mới biết (client để `false`). */
export interface DuelParty {
  /** Đạo hiệu */
  name: string;
  alive: boolean;
  /** Đang trong khu an toàn (trấn, quanh cổng): `GameMap.inSafe` */
  inSafe: boolean;
  /** Đang trong một trận khác (`Player.duel` công khai) */
  inDuel: boolean;
  /** Bận: hồn lìa xác (chờ nối lại), đang đi qua cổng, hoặc vừa bị đánh (`TRAVEL_COMBAT_LOCK_MS`) */
  busy: boolean;
}

export interface DuelChallengeInput {
  self: DuelParty;
  /** Người bị thách trong CÙNG phòng; `null` nếu không có ai tên đó ở đây */
  target: DuelParty | null;
  /** Khoảng cách hai người (px) */
  distance: number;
  /** Phòng đang ở là bí cảnh (không thách đấu trong bí cảnh) */
  inDungeon: boolean;
  /** Còn bao nhiêu ms hồi chiêu thách đấu của người thách (0 = sẵn sàng) */
  cooldownLeftMs: number;
  /** Còn bao nhiêu ms hồi chiêu theo CẶP (sau khi bị từ chối / hết hạn) */
  pairCooldownLeftMs: number;
  /** Người thách đã có một lời mời còn hạn tới người này */
  alreadyInvited: boolean;
  /** Số lời mời còn hạn người này đang giữ (của mọi người thách) */
  targetPendingInvites: number;
}

export type DuelChallengeFail =
  | "self"
  | "not_found"
  | "in_dungeon"
  | "not_alive"
  | "in_duel"
  | "safe_zone"
  | "busy"
  | "target_not_alive"
  | "target_in_duel"
  | "target_safe_zone"
  | "target_busy"
  | "too_far"
  | "cooldown"
  | "pair_cooldown"
  | "already_invited"
  | "target_overloaded";

export type DuelChallengeCheck = { ok: true } | { ok: false; reason: DuelChallengeFail };

/**
 * Thách đấu được không? Thứ tự kiểm cố định (test giữ) để mọi nơi báo cùng một lý do: chính mình / không tìm thấy -> phòng
 * (bí cảnh) -> người thách (sống, trong trận, khu an toàn, bận) -> người bị thách (cùng bộ) -> tầm -> hồi chiêu -> lời mời.
 * Số không hữu hạn (khoảng cách NaN...) coi như quá xa: không bao giờ cho qua nhờ so sánh với NaN.
 */
export function canChallenge(i: DuelChallengeInput): DuelChallengeCheck {
  const t = i.target;
  if (t && t.name.toLowerCase() === i.self.name.toLowerCase()) return { ok: false, reason: "self" };
  if (!t) return { ok: false, reason: "not_found" };
  if (i.inDungeon) return { ok: false, reason: "in_dungeon" };
  if (!i.self.alive) return { ok: false, reason: "not_alive" };
  if (i.self.inDuel) return { ok: false, reason: "in_duel" };
  if (i.self.inSafe) return { ok: false, reason: "safe_zone" };
  if (i.self.busy) return { ok: false, reason: "busy" };
  if (!t.alive) return { ok: false, reason: "target_not_alive" };
  if (t.inDuel) return { ok: false, reason: "target_in_duel" };
  if (t.inSafe) return { ok: false, reason: "target_safe_zone" };
  if (t.busy) return { ok: false, reason: "target_busy" };
  if (!(i.distance <= DUEL_RANGE)) return { ok: false, reason: "too_far" };
  if (!(i.cooldownLeftMs <= 0)) return { ok: false, reason: "cooldown" };
  if (!(i.pairCooldownLeftMs <= 0)) return { ok: false, reason: "pair_cooldown" };
  if (i.alreadyInvited) return { ok: false, reason: "already_invited" };
  if (!(i.targetPendingInvites < DUEL_INVITES_MAX))
    return { ok: false, reason: "target_overloaded" };
  return { ok: true };
}

/** Câu báo cho người chơi (toast). Không lộ số / id nội bộ. */
export function duelChallengeFailMessage(reason: DuelChallengeFail): string {
  switch (reason) {
    case "self":
      return "Không thể tự thách đấu chính mình.";
    case "not_found":
      return "Không thấy đạo hữu này ở quanh đây.";
    case "in_dungeon":
      return "Trong bí cảnh không thể thách đấu.";
    case "not_alive":
      return "Đang trọng thương, chưa thể thách đấu.";
    case "in_duel":
      return "Đang trong một trận thách đấu.";
    case "safe_zone":
      return "Khu an toàn không được thách đấu, hãy ra ngoài.";
    case "busy":
      return "Đang bận (giao chiến hoặc đi qua cổng), chưa thể thách đấu.";
    case "target_not_alive":
      return "Đối phương đang trọng thương.";
    case "target_in_duel":
      return "Đối phương đang trong một trận thách đấu khác.";
    case "target_safe_zone":
      return "Đối phương đang ở khu an toàn.";
    case "target_busy":
      return "Đối phương đang bận, thử lại sau.";
    case "too_far":
      return "Đối phương ở quá xa.";
    case "cooldown":
      return "Đợi một lát rồi hãy thách đấu tiếp.";
    case "pair_cooldown":
      return "Vừa thách đấu người này, hãy đợi một lát.";
    case "already_invited":
      return "Đã thách đấu người này, đang chờ trả lời.";
    case "target_overloaded":
      return "Đối phương đang nhận quá nhiều lời thách đấu.";
  }
}
