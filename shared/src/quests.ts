// Nhiệm vụ dữ liệu hóa: hợp đồng giữa client và server (Sprint 2).
// Server cập nhật tiến độ và trao thưởng; client dùng các hàm dưới đây để hiển thị ("!", "?", "Hôi Lang 3/10")
// nên hai bên luôn tính giống nhau.
import { stepOf } from "./realms";
import type { Inventory } from "./items";

/** Các loại bước. Bước làm lần lượt theo thứ tự trong `steps`. */
export type QuestStep =
  /** Hạ `count` con quái loại `monster` (id trong MONSTERS) */
  | { kind: "kill"; monster: string; count: number }
  /** Có đủ `count` vật phẩm trong túi; bị trừ khỏi túi lúc trả nhiệm vụ */
  | { kind: "collect"; itemId: string; count: number }
  /** Tới nói chuyện với NPC */
  | { kind: "talk"; npcId: string }
  /** Đạt tới cảnh giới / bậc (hoặc cao hơn) */
  | { kind: "reachRealm"; realm: number; tier: number };

export interface QuestReward {
  exp?: number;
  items?: { itemId: string; qty: number }[];
}

export interface QuestDef {
  id: string;
  title: string;
  /** NPC giao nhiệm vụ, cũng là người nhận trả */
  giver: string;
  /** Tóm tắt một dòng cho sổ nhiệm vụ */
  desc: string;
  steps: QuestStep[];
  rewards: QuestReward;
  /** Nhiệm vụ tiếp theo trong chuỗi; nhiệm vụ đó chỉ mở khi nhiệm vụ này xong */
  next?: string;
  /** Cảnh giới tối thiểu để nhận */
  minRealm?: { realm: number; tier: number };
  /** Nhiệm vụ lặp: mỗi ngày làm được một lần (ngày tính theo giờ Việt Nam) */
  daily?: boolean;
  /** Lời thoại theo trạng thái */
  talk: {
    offer: string[];
    progress: string[];
    complete: string[];
  };
}

/**
 * Nội dung ban đầu để hai bên có dữ liệu thật mà code. Chuỗi nhiệm vụ chính đầy đủ
 * (Phàm Nhân → Luyện Khí tầng 9) và các nhiệm vụ lặp còn lại thêm ở issue #19.
 */
export const QUESTS: QuestDef[] = [
  {
    id: "nhap_the",
    title: "Nhập thế",
    giver: "truong_tran",
    desc: "Tới chào Hà lão ở tiệm thuốc phía tây trấn.",
    steps: [{ kind: "talk", npcId: "duoc_su" }],
    rewards: { exp: 20, items: [{ itemId: "hoi_huyet_dan", qty: 3 }] },
    next: "tru_tho",
    talk: {
      offer: [
        "Người lạ mặt, ngươi mới tới Lạc Hà Trấn sao?",
        "Muốn bước lên con đường tu tiên thì trước hết phải biết giữ mạng. Đi gặp Hà lão, ông ấy sẽ chỉ cho ngươi.",
      ],
      progress: ["Tiệm thuốc của Hà lão ở phía tây trấn, ngay cạnh giếng đá."],
      complete: ["Hà lão đã gặp ngươi rồi à? Tốt. Cầm lấy mấy viên đan này phòng thân."],
    },
  },
  {
    id: "tru_tho",
    title: "Thỏ phá ruộng",
    giver: "truong_tran",
    desc: "Hạ 5 Linh Thố ngoài trấn và mang về 3 túm lông thỏ.",
    steps: [
      { kind: "kill", monster: "tho", count: 5 },
      { kind: "collect", itemId: "long_tho", count: 3 },
    ],
    rewards: { exp: 60 },
    talk: {
      offer: [
        "Đám Linh Thố ăn sạch rau ngoài ruộng. Chúng không hung dữ, rất hợp để ngươi luyện tay.",
        "Hạ 5 con, mang về ít lông làm bằng chứng.",
      ],
      progress: ["Linh Thố quanh quẩn ngay ngoài cổng trấn. Chém trúng là được, đừng sợ."],
      complete: [
        "Khá lắm. Kiếm pháp tuy vụng nhưng có khí thế. Ngồi xuống đả tọa, tu vi sẽ tiến nhanh hơn.",
      ],
    },
  },
  {
    id: "lang_hai",
    title: "Lang hại",
    giver: "cao_thi",
    desc: "Hạ 10 Hôi Lang.",
    steps: [{ kind: "kill", monster: "lang", count: 10 }],
    rewards: { exp: 150, items: [{ itemId: "hoi_linh_dan", qty: 2 }] },
    minRealm: { realm: 1, tier: 0 },
    daily: true,
    talk: {
      offer: ["Cáo thị: bầy Hôi Lang quấy nhiễu đường núi. Ai hạ được mười con, trấn sẽ hậu tạ."],
      progress: ["Hôi Lang sống ở vùng cỏ cao xa trấn hơn."],
      complete: ["Ngươi xé tờ cáo thị đem tới, phần thưởng đã được để sẵn."],
    },
  },
  {
    id: "nop_nanh",
    title: "Nanh sói làm thuốc",
    giver: "cao_thi",
    desc: "Nộp 5 nanh sói.",
    steps: [{ kind: "collect", itemId: "nanh_soi", count: 5 }],
    rewards: { exp: 120 },
    minRealm: { realm: 1, tier: 0 },
    daily: true,
    talk: {
      offer: ["Cáo thị: tiệm thuốc cần nanh sói, mỗi ngày thu năm chiếc."],
      progress: ["Chưa đủ năm chiếc nanh sói."],
      complete: ["Nanh còn tươi, tốt lắm."],
    },
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q]),
);

/** Nhiệm vụ đứng trước (chuỗi `next`): phải xong nhiệm vụ trước mới nhận được nhiệm vụ sau */
export const QUEST_PREV: Record<string, string> = Object.fromEntries(
  QUESTS.filter((q) => q.next).map((q) => [q.next!, q.id]),
);

/** Số nhiệm vụ tối đa nhận cùng lúc */
export const MAX_ACTIVE_QUESTS = 8;

// ---------- Tiến độ ----------

export interface QuestProgress {
  id: string;
  /** Đang ở bước thứ mấy (0-based). Bằng steps.length nghĩa là đã làm hết các bước */
  step: number;
  /** Tiến độ của bước hiện tại: số quái đã hạ (kill), 1 nếu đã nói chuyện (talk); collect / reachRealm không dùng */
  count: number;
}

/** Ngữ cảnh của người chơi để tính trạng thái nhiệm vụ */
export interface QuestCtx {
  realm: number;
  tier: number;
  inv: Inventory;
}

/** Ngày theo giờ Việt Nam (UTC+7), dạng "2026-11-08": mốc làm mới nhiệm vụ lặp */
export function dayKey(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

export function countItem(inv: Inventory, itemId: string): number {
  let n = 0;
  for (const s of inv) if (s?.itemId === itemId) n += s.qty;
  return n;
}

/** Bước đã đạt chưa. `count` là tiến độ đã lưu của bước đó. */
export function stepSatisfied(step: QuestStep, count: number, ctx: QuestCtx): boolean {
  switch (step.kind) {
    case "kill":
      return count >= step.count;
    case "talk":
      return count >= 1;
    case "collect":
      return countItem(ctx.inv, step.itemId) >= step.count;
    case "reachRealm":
      return stepOf(ctx.realm, ctx.tier) >= stepOf(step.realm, step.tier);
  }
}

/** Tiến độ để hiển thị, vd { have: 3, need: 10 } */
export function stepProgress(
  step: QuestStep,
  count: number,
  ctx: QuestCtx,
): { have: number; need: number } {
  switch (step.kind) {
    case "kill":
      return { have: Math.min(count, step.count), need: step.count };
    case "talk":
      return { have: Math.min(count, 1), need: 1 };
    case "collect":
      return { have: Math.min(countItem(ctx.inv, step.itemId), step.count), need: step.count };
    case "reachRealm":
      return { have: stepSatisfied(step, count, ctx) ? 1 : 0, need: 1 };
  }
}

/**
 * Trả được nhiệm vụ chưa: đã qua hết các bước, và các bước collect vẫn còn đủ đồ trong túi
 * (lỡ vứt bớt đồ sau khi qua bước đó thì chưa trả được).
 */
export function questReady(def: QuestDef, prog: QuestProgress, ctx: QuestCtx): boolean {
  if (prog.step < def.steps.length) return false;
  return def.steps.every((s) => s.kind !== "collect" || stepSatisfied(s, 0, ctx));
}

/** Trạng thái sổ nhiệm vụ gửi cho client (tin nhắn `quests`) */
export interface QuestsMsg {
  active: QuestProgress[];
  /** Nhiệm vụ không lặp đã xong */
  done: string[];
  /** Nhiệm vụ lặp đã xong trong hôm nay */
  dailyDone: string[];
}

/** Nhận được nhiệm vụ này không */
export function canAccept(def: QuestDef, log: QuestsMsg, ctx: QuestCtx): boolean {
  if (log.active.some((a) => a.id === def.id)) return false;
  if (log.active.length >= MAX_ACTIVE_QUESTS) return false;
  if (def.daily ? log.dailyDone.includes(def.id) : log.done.includes(def.id)) return false;
  const prev = QUEST_PREV[def.id];
  if (prev && !log.done.includes(prev)) return false;
  if (def.minRealm && stepOf(ctx.realm, ctx.tier) < stepOf(def.minRealm.realm, def.minRealm.tier))
    return false;
  return true;
}

/** Ký hiệu trên đầu NPC: "?" có nhiệm vụ để trả, "!" có nhiệm vụ mới, "" không có gì */
export function npcMarker(npcId: string, log: QuestsMsg, ctx: QuestCtx): "?" | "!" | "" {
  for (const a of log.active) {
    const def = QUEST_BY_ID[a.id];
    if (def?.giver === npcId && questReady(def, a, ctx)) return "?";
  }
  return QUESTS.some((q) => q.giver === npcId && canAccept(q, log, ctx)) ? "!" : "";
}

// ---------- Tin nhắn client -> server ----------
export interface TalkMsg {
  npcId: string;
}
export interface QuestAcceptMsg {
  questId: string;
}
export interface QuestTurnInMsg {
  questId: string;
}
export interface QuestAbandonMsg {
  questId: string;
}
export interface TradeMsg {
  tradeId: string;
}

// ---------- Tin nhắn server -> client (chỉ gửi cho người đó) ----------
/** Bấm lựa chọn thì client gửi tin nhắn tương ứng (questAccept / questTurnIn / trade) hoặc đóng hộp thoại */
export type DialogAction =
  | { kind: "accept"; questId: string }
  | { kind: "turnIn"; questId: string }
  | { kind: "trade"; tradeId: string }
  | { kind: "close" };

export interface DialogOption {
  label: string;
  action: DialogAction;
  /** Hiện nhưng không bấm được (vd thiếu nguyên liệu để đổi) */
  disabled?: boolean;
}

export interface DialogMsg {
  npcId: string;
  lines: string[];
  options: DialogOption[];
}
