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
} from "@tien-gioi/shared";
import type { WorldState, Player } from "./schema";
import type { SavedPlayer, QuestSave } from "./store";

/** Dữ liệu riêng của server cho mỗi người chơi (không gửi xuống client). */
export interface PlayerCtrl {
  save: SavedPlayer;
  inputs: InputMsg[];
  moveBudget: number; // token bucket chống gửi input quá nhanh
  nextSlash: number;
  nextSword: number;
  nextBreak: number;
  nextChat: number;
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
}

export class World {
  /** Thời điểm tick hiện tại (ms), cập nhật đầu mỗi tick. */
  now = Date.now();
  readonly ctrl = new Map<string, PlayerCtrl>();
  readonly mctrl = new Map<string, MonsterCtrl>();
  readonly lctrl = new Map<string, LootCtrl>();
  monsterSeq = 0;
  lootSeq = 0;

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

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const angleDiff = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
