// Tổ đội: hợp đồng giữa client và server (M3, Sprint 4). Đề xuất: docs/PHAN_CONG_M3.md.
// Server giữ đội hình và quyết định mọi kết quả (mời, nhận, kick, chia tu vi); client chỉ gửi ý định và hiển thị.
// Đội không nằm trong state chung (người khác không cần biết): server gửi riêng `PartyMsg` cho từng thành viên.
// Thành viên ở xa không nằm trong vùng nhìn (xem server/src/systems/interest.ts) nên vị trí, máu của họ
// đi qua `PartyMsg`, không đi qua state.

/** Số người tối đa trong một đội (gồm đội trưởng). */
export const PARTY_MAX = 4;

/**
 * Chỉ thành viên đứng trong tầm này (px, tính từ chỗ quái chết) mới được chia tu vi.
 * Nhỏ hơn vùng nhìn của server để người "đứng xem" ở mép màn hình không bị tính nhầm.
 */
export const PARTY_SHARE_RANGE = 900;

/** Mỗi thành viên có mặt (ngoài người đầu) cộng thêm phần trăm này vào tổng tu vi của đội. */
export const PARTY_EXP_BONUS = 0.15;

/** Lời mời tự hết hạn sau bấy nhiêu ms. */
export const PARTY_INVITE_TTL_MS = 30_000;

/** Một người chơi chỉ được gửi lời mời mỗi bấy nhiêu ms (chống làm phiền). */
export const PARTY_INVITE_COOLDOWN_MS = 3_000;

/** Server gửi lại `PartyMsg` cho cả đội mỗi bấy nhiêu ms (ngoài lúc đội hình đổi). */
export const PARTY_SNAPSHOT_MS = 1_000;

/**
 * Phần tu vi mỗi thành viên có mặt nhận được, tính trên tu vi `killExp(quái, cảnh giới của chính người đó)`
 * khi quái do đội hạ: chia đều cho `members` người có mặt, nhân thêm thưởng PARTY_EXP_BONUS cho mỗi người thêm.
 * 1 người = 1 (đánh một mình, không đổi); 4 người = 0.3625 mỗi người, cả đội nhận 1.45 lần.
 * Đội đông hạ quái nhanh hơn nên mỗi người vẫn lên nhanh hơn đánh một mình, nhưng không quá nhiều
 * để làm lệch đường cong tu luyện đã cân bằng (docs/CAN_BANG.md).
 */
export function partyExpShare(members: number): number {
  // Giá trị không hữu hạn (NaN, ±Infinity) coi như đánh một mình: tuyệt đối không để NaN chảy vào tu vi
  const n = Number.isFinite(members) ? Math.min(PARTY_MAX, Math.max(1, Math.floor(members))) : 1;
  return (1 + PARTY_EXP_BONUS * (n - 1)) / n;
}

// ---------- Tin nhắn client -> server ----------
// Server kiểm tra kiểu, giá trị hữu hạn, người nhận còn trong phòng, hồi chiêu; tên người chơi qua `cleanName`.

/** Mời một người chơi (đạo hiệu, không phân biệt hoa thường) vào đội; chưa có đội thì tạo đội mới, người mời là đội trưởng. */
export interface PartyInviteMsg {
  name: string;
}
/** Nhận lời mời của `from` (đạo hiệu người mời). Dùng chung cho `partyAccept` và `partyDecline`. */
export interface PartyAnswerMsg {
  from: string;
}
/** Đội trưởng mời một thành viên ra khỏi đội. `partyLeave` không có nội dung. */
export interface PartyKickMsg {
  name: string;
}

// ---------- Tin nhắn server -> client ----------

export interface PartyMember {
  name: string;
  realm: number;
  tier: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
}

/**
 * Đội hình hiện tại, gửi cho từng thành viên mỗi PARTY_SNAPSHOT_MS và khi đội hình đổi.
 * Không có đội (mới rời, bị kick, đội giải tán): `{ leader: "", members: [] }` để client xoá bảng đội.
 * `members` gồm cả đội trưởng và chính người nhận; thứ tự cố định (người vào trước đứng trước).
 */
export interface PartyMsg {
  leader: string;
  members: PartyMember[];
}

/** Có người mời bạn vào đội: client hiện nút Nhận / Từ chối trong `ttlMs`. */
export interface PartyInvitedMsg {
  from: string;
  ttlMs: number;
}

export const NO_PARTY: PartyMsg = { leader: "", members: [] };
