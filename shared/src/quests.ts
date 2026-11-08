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

/** Nhiệm vụ đầu tiên của chuỗi chính (người chơi mới nhận ở Trưởng trấn) */
export const MAIN_QUEST_START = "nhap_the";

/**
 * Chuỗi nhiệm vụ chính: Phàm Nhân → Luyện Khí tầng 9, mỗi nhiệm vụ dạy thêm một thứ
 * (đánh quái, nhặt đồ, đột phá, đả tọa, đổi đồ, đan dược). Sau đó là nhiệm vụ lặp ở Bảng cáo thị.
 * Thế giới: Lạc Hà Trấn dưới chân Vân Mộng Sơn; yêu thú càng xa trấn càng mạnh.
 */
export const QUESTS: QuestDef[] = [
  // ---------- Chuỗi chính ----------
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
      progress: ["Tiệm thuốc của Hà lão ở phía tây trấn."],
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
    rewards: { exp: 30, items: [{ itemId: "hoi_huyet_dan", qty: 2 }] },
    next: "buoc_vao_tien_do",
    talk: {
      offer: [
        "Đám Linh Thố ăn sạch rau ngoài ruộng. Chúng không hung dữ, rất hợp để ngươi luyện tay.",
        "Hạ năm con, nhặt ít lông mang về làm bằng chứng. Đồ rơi trên đất, đứng gần mà nhặt.",
      ],
      progress: ["Linh Thố quanh quẩn ngay ngoài cổng trấn. Chém trúng là được, đừng sợ."],
      complete: [
        "Khá lắm. Kiếm pháp tuy vụng nhưng có khí thế.",
        "Ta thấy linh khí trong người ngươi đã đầy, sắp chạm tới ngưỡng rồi.",
      ],
    },
  },
  {
    id: "buoc_vao_tien_do",
    title: "Bước vào tiên đồ",
    giver: "truong_tran",
    desc: "Đột phá từ Phàm Nhân lên Luyện Khí.",
    steps: [{ kind: "reachRealm", realm: 1, tier: 0 }],
    rewards: { exp: 30, items: [{ itemId: "hoi_linh_dan", qty: 2 }] },
    next: "tinh_toa",
    talk: {
      offer: [
        "Phàm nhân tu luyện đến lúc linh khí tràn đầy thì phải phá vỡ xiềng xích của thân xác.",
        "Khi thanh tu vi đầy, hãy Đột phá. Có thể thất bại, chân khí nghịch loạn sẽ tổn hao tu vi, nhưng đừng nản.",
      ],
      progress: ["Thanh tu vi chưa đầy thì chưa đột phá được. Ra ngoài luyện thêm đi."],
      complete: [
        "Ta cảm nhận được linh lực đang lưu chuyển trong kinh mạch ngươi. Chúc mừng, Luyện Khí tầng một!",
        "Hà lão có chuyện muốn nói với người mới bước vào tiên đồ. Ghé qua đó một chuyến.",
      ],
    },
  },
  {
    id: "tinh_toa",
    title: "Tĩnh tọa dưỡng khí",
    giver: "duoc_su",
    desc: "Đạt Luyện Khí tầng 3. Đả tọa để hồi phục và tăng tu vi.",
    steps: [{ kind: "reachRealm", realm: 1, tier: 2 }],
    rewards: { exp: 60, items: [{ itemId: "tu_khi_dan", qty: 1 }] },
    next: "nanh_soi_ren_kiem",
    talk: {
      offer: [
        "Đánh giết chỉ là một nửa con đường. Nửa còn lại là ngồi yên.",
        "Khi mỏi mệt, hãy Đả tọa: khí huyết, linh lực hồi rất nhanh, tu vi cũng tự tăng. Nhưng động thân là khí tán, phải ngồi lại từ đầu.",
        "Khi nào tới Luyện Khí tầng ba thì quay lại gặp lão.",
      ],
      progress: ["Chưa tới tầng ba à? Ngồi xuống, thở chậm lại."],
      complete: [
        "Hơi thở đã đều hơn nhiều. Viên Tụ Khí Đan này giúp ngươi tích tu vi nhanh hơn một chút.",
        "Thiết Ngưu ở lò rèn phía đông đang cần người giúp, ngươi qua xem.",
      ],
    },
  },
  {
    id: "nanh_soi_ren_kiem",
    title: "Nanh sói cho lò rèn",
    giver: "tho_ren",
    desc: "Hạ 8 Hôi Lang ở vùng cỏ cao và mang về 5 nanh sói.",
    steps: [
      { kind: "kill", monster: "lang", count: 8 },
      { kind: "collect", itemId: "nanh_soi", count: 5 },
    ],
    rewards: { exp: 150, items: [{ itemId: "hoi_linh_dan", qty: 2 }] },
    next: "thuoc_cho_tran",
    talk: {
      offer: [
        "Ngươi là tu sĩ mà Hà lão nhắc tới hả? Ta là Thiết Ngưu.",
        "Chuôi kiếm tốt phải bọc bằng nanh sói mài nhẵn. Hôi Lang ở vùng cỏ cao ngoài kia, chúng đi theo bầy, cẩn thận.",
      ],
      progress: ["Hôi Lang thấy người là lao tới. Lùi lại, dùng Kiếm khí đánh từ xa."],
      complete: [
        "Nanh tốt! Khi lò rèn đủ lửa, ta sẽ rèn cho ngươi một thanh kiếm ra hồn.",
        "Hà lão vừa nhắn qua, hình như tiệm thuốc thiếu nguyên liệu.",
      ],
    },
  },
  {
    id: "thuoc_cho_tran",
    title: "Thuốc cho người trong trấn",
    giver: "duoc_su",
    desc: "Mang tới cho Hà lão 8 túm lông thỏ và 4 nanh sói.",
    steps: [
      { kind: "collect", itemId: "long_tho", count: 8 },
      { kind: "collect", itemId: "nanh_soi", count: 4 },
    ],
    rewards: {
      exp: 200,
      items: [
        { itemId: "hoi_huyet_dan", qty: 4 },
        { itemId: "hoi_linh_dan", qty: 2 },
      ],
    },
    next: "hac_ho",
    talk: {
      offer: [
        "Mấy hôm nay thợ săn trong trấn bị sói cắn liên tục, thuốc trong tiệm sắp cạn.",
        "Mang cho lão ít lông thỏ và nanh sói. Sau này dư nguyên liệu, cứ đem tới đổi lấy đan.",
      ],
      progress: [
        "Lông thỏ để làm bông băng, nanh sói tán bột cầm máu. Thiếu thứ nào cũng không được.",
      ],
      complete: [
        "Đủ cả rồi. Mấy viên này lão luyện sẵn, ngươi cầm đi.",
        "Trưởng trấn đang lo chuyện lớn hơn, nghe nói Hắc Hổ đã xuống núi.",
      ],
    },
  },
  {
    id: "hac_ho",
    title: "Hắc Hổ xuống núi",
    giver: "truong_tran",
    desc: "Đạt Luyện Khí tầng 6, rồi hạ 2 Hắc Hổ và mang về 1 tấm da hổ.",
    steps: [
      { kind: "reachRealm", realm: 1, tier: 5 },
      { kind: "kill", monster: "ho", count: 2 },
      { kind: "collect", itemId: "da_ho", count: 1 },
    ],
    rewards: { exp: 300, items: [{ itemId: "tu_khi_dan", qty: 1 }] },
    next: "dinh_luyen_khi",
    talk: {
      offer: [
        "Hắc Hổ vốn sống sâu trong rừng phía xa. Nay chúng xuống tới bìa rừng, cắn chết ba con trâu của trấn.",
        "Chưa tới Luyện Khí tầng sáu thì đừng đi, một cú vồ của nó đủ khiến ngươi trọng thương. Mang đủ đan dược theo người.",
      ],
      progress: [
        "Hắc Hổ ở xa trấn hơn Hôi Lang nhiều. Đánh vài đòn rồi lùi, đừng đứng yên chịu đòn.",
      ],
      complete: [
        "Da Hắc Hổ! Từ nay thợ săn trong trấn có thể ngủ yên rồi.",
        "Ngươi tiến bộ nhanh hơn ta tưởng. Lạc Hà Trấn đã không còn đủ chỗ cho ngươi.",
      ],
    },
  },
  {
    id: "dinh_luyen_khi",
    title: "Đỉnh Luyện Khí",
    giver: "truong_tran",
    desc: "Đạt Luyện Khí tầng 9.",
    steps: [{ kind: "reachRealm", realm: 1, tier: 8 }],
    rewards: {
      exp: 300,
      items: [
        { itemId: "tu_khi_dan", qty: 2 },
        { itemId: "hoi_huyet_dan", qty: 5 },
      ],
    },
    talk: {
      offer: [
        "Luyện Khí có chín tầng. Đứng ở tầng chín mới có tư cách nhìn lên Trúc Cơ.",
        "Đi đi, đánh, ngồi, rồi lại đánh. Khi nào tới tầng chín thì quay về đây.",
      ],
      progress: ["Chưa tới tầng chín. Bảng cáo thị ngày nào cũng có việc, làm thêm cho quen tay."],
      complete: [
        "Luyện Khí tầng chín… Năm xưa ta cũng dừng chân ở đây suốt mười năm.",
        "Muốn Trúc Cơ phải có cơ duyên. Người ta đồn trong hang sâu nhất của Vân Mộng Sơn có Xích Mãng canh giữ linh mạch. Khi nào đủ sức, ngươi hãy tự mình đi xem.",
      ],
    },
  },

  // ---------- Nhiệm vụ lặp ở Bảng cáo thị ----------
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
      progress: ["Hôi Lang sống ở vùng cỏ cao, xa trấn hơn đám thỏ."],
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
  {
    id: "ho_hoan",
    title: "Hổ hoạn",
    giver: "cao_thi",
    desc: "Hạ 3 Hắc Hổ.",
    steps: [{ kind: "kill", monster: "ho", count: 3 }],
    rewards: { exp: 400, items: [{ itemId: "tu_khi_dan", qty: 1 }] },
    minRealm: { realm: 1, tier: 5 },
    daily: true,
    talk: {
      offer: [
        "Cáo thị: Hắc Hổ lảng vảng ở bìa rừng. Cần tu sĩ từ Luyện Khí tầng sáu trở lên, hạ ba con.",
      ],
      progress: ["Hắc Hổ đánh rất đau. Mang theo Hồi Huyết Đan."],
      complete: ["Ba con Hắc Hổ trong một ngày. Người trong trấn sẽ còn nhắc tên ngươi."],
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
