// Trạng thái thế giới dùng chung cho các system. Không phụ thuộc Colyseus Room,
// nên các system có thể test riêng bằng một World giả.
import type {
  InputMsg,
  FxMsg,
  DmgMsg,
  ToastMsg,
  MonsterKind,
  Inventory,
  InvMsg,
  QuestsMsg,
  DialogMsg,
  ChatOut,
  PartyMsg,
  PartyInvitedMsg,
} from "@tien-gioi/shared";
import type { WorldState, Player } from "./schema";
import type { SavedPlayer, QuestSave } from "./store";
import { Interest } from "./systems/interest";
import { Parties } from "./systems/party";

/** Dữ liệu riêng của server cho mỗi người chơi (không gửi xuống client). */
export interface PlayerCtrl {
  save: SavedPlayer;
  inputs: InputMsg[];
  moveBudget: number; // token bucket chống gửi input quá nhanh
  nextSlash: number;
  nextSword: number;
  nextBreak: number;
  nextChat: number;
  /** Lệch pha ghi px, py giữa các người chơi (0..POS_SYNC_EVERY_TICKS-1) để không cùng ghi một tick */
  posPhase: number;
  lastHitAt: number;
  deadAt: number;
  /** Túi đồ: chỉ chủ túi nhận được qua tin nhắn `inv`, không nằm trong state chung */
  inv: Inventory;
  /** Thời điểm hết hồi chiêu theo itemId */
  itemCd: Map<string, number>;
  /** Sổ nhiệm vụ: chỉ gửi cho chủ qua tin nhắn `quests` */
  quests: QuestSave;
  /**
   * Phần hồi khí huyết / linh lực chưa đủ 1 đơn vị (xem takeWhole), và tu vi đả tọa
   * đang để dành, ghi vào state mỗi EXP_FLUSH_MS (expAt = lần ghi kế tiếp).
   */
  frac: { hp: number; mp: number; exp: number; expAt: number };
}

/** Dữ liệu riêng của server cho mỗi món đồ rơi. */
export interface LootCtrl {
  /** Lúc hết quyền nhặt trước của owner */
  ownerUntil: number;
  expiresAt: number;
}

/** Dữ liệu riêng của server cho mỗi con quái. */
export interface MonsterCtrl {
  def: MonsterKind;
  homeX: number;
  homeY: number;
  target: string | null;
  nextAttack: number;
  wanderX: number;
  wanderY: number;
  nextWander: number;
  damageBy: Map<string, number>;
  /** Phần lẻ của hồi khí huyết chưa đủ 1 đơn vị */
  hpFrac: number;
}

/** Cách các system gửi tin ra ngoài. WorldRoom nối vào broadcast / client.send. */
export interface WorldEvents {
  fx(msg: FxMsg): void;
  dmg(msg: DmgMsg): void;
  /** Thông báo hệ thống cho toàn server (kênh chat). */
  sys(text: string): void;
  chat(from: string, text: string): void;
  toast(sessionId: string, msg: ToastMsg): void;
  /** Gửi túi đồ cho đúng chủ túi. */
  inv(sessionId: string, msg: InvMsg): void;
  /** Gửi sổ nhiệm vụ cho đúng người. */
  quests(sessionId: string, msg: QuestsMsg): void;
  /** Mở hộp thoại NPC cho đúng người. */
  dialog(sessionId: string, msg: DialogMsg): void;
  /** Đội hình hiện tại, gửi riêng cho từng thành viên (không broadcast, không vào state chung). */
  party(sessionId: string, msg: PartyMsg): void;
  /** Có người mời vào đội, gửi riêng cho người được mời. */
  partyInvited(sessionId: string, msg: PartyInvitedMsg): void;
  /** Chat gửi cho một người (chat đội). */
  chatTo(sessionId: string, msg: ChatOut): void;
}

export class World {
  /** Thời điểm tick hiện tại (ms), cập nhật đầu mỗi tick. */
  now = Date.now();
  readonly ctrl = new Map<string, PlayerCtrl>();
  readonly mctrl = new Map<string, MonsterCtrl>();
  readonly lctrl = new Map<string, LootCtrl>();
  /** Vùng nhìn của từng client: ai nhận state của thực thể nào (#62) */
  readonly interest = new Interest();
  /** Đội hình: ai ở đội nào, lời mời đang chờ (#74) */
  readonly parties = new Parties();
  monsterSeq = 0;
  lootSeq = 0;
  /** Số tick đã chạy (dùng chia nhịp ghi px, py) */
  tick = 0;

  constructor(
    readonly state: WorldState,
    readonly events: WorldEvents,
  ) {}

  /** Người chơi còn sống và đang trong phòng; null nếu không. */
  ready(sessionId: string): { p: Player; c: PlayerCtrl } | null {
    const p = this.state.players.get(sessionId);
    const c = this.ctrl.get(sessionId);
    if (!p || !c || p.dead) return null;
    return { p, c };
  }
}

/**
 * Cộng dồn `amount` vào acc[key], trả về phần nguyên để ghi vào state, giữ lại phần lẻ.
 * Hồi máu / tu vi mỗi tick chỉ là số lẻ nhỏ: ghi thẳng vào state thì trường đó đổi 20 lần/giây
 * và mỗi lần gửi một số thực 8 byte cho mọi client. Ghi phần nguyên thì chỉ đổi khi đủ 1 đơn vị.
 */
export function takeWhole<K extends string>(
  acc: Record<K, number>,
  key: K,
  amount: number,
): number {
  const v = acc[key] + amount;
  const n = Math.floor(v);
  acc[key] = v - n;
  return n;
}

/**
 * Bước lượng tử hóa góc nhìn ghi vào state (π/16 = 11,25°, 32 hướng). Chọn bước chia hết π/4 để các ranh giới
 * hướng của client (±45°, ±135° trong dirFromAngle, ±90° khi lật sprite) trùng mép ô: hướng hiển thị không đổi.
 */
export const ANGLE_STEP = Math.PI / 16;

/**
 * Góc nhìn để ghi vào state (`angle` của người / quái): làm tròn về giữa ô ANGLE_STEP.
 * Góc này chỉ để client vẽ hướng; server tính trúng đòn bằng góc chính xác (tin nhắn / vị trí), không đọc lại.
 * Vì sao: nhắm liên tục (bot, cần joystick) đổi góc gần như mỗi tick, mỗi lần gửi 5 byte cho mọi client đang thấy.
 * Cắt về 32 hướng thì chỉ đổi khi sang ô khác, schema bỏ qua việc gán lại giá trị y hệt.
 */
export const quantAngle = (a: number) => (Math.floor(a / ANGLE_STEP) + 0.5) * ANGLE_STEP;

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const angleDiff = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
