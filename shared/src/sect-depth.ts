// Tông môn có chiều sâu (M8, docs/THIET_KE_TONG_MON.md mục 12, issue M8.1): HỢP ĐỒNG `shared/` giữa client và server.
//
// Ba con số theo LINH HỒN / tông môn: `contrib` (cống hiến, số dư TIÊU được), `merit` (công tích = tổng đã kiếm trong tông này, không giảm)
// và `Sect.points` (điểm tông = tổng cống hiến mọi thành viên từng kiếm, chỉ tăng). Cấp tông KHÔNG lưu: tính từ điểm bằng `sectLevelOf`.
// Mọi nguồn cống hiến đi qua MỘT chỗ (`sectAwardDay` ở đây; server gọi trong `SectStore.update`), có trần theo NGÀY (giờ Việt Nam).
// File này chỉ có hằng số, bảng, kiểu, tin nhắn và hàm thuần: server vẫn kiểm LẠI mọi thứ, client dùng để ẩn nút và báo lý do.
// Mọi con số là ĐỀ XUẤT của Dev A; Dev D chốt bằng mô phỏng (`npm run can-bang -w server`, mục tông môn của `docs/CAN_BANG.md`).
import { ITEM_BY_ID } from "./items";
import { SHOPS, ITEM_VALUE, buyPrice } from "./currency";
import { MONSTER_BY_ID } from "./game";
import { QUEST_BY_ID, dayKey, type QuestDef, type QuestReward, type QuestStep } from "./quests";
import { SECT_ELDERS_MAX, SECT_MAX_MEMBERS, SECT_VAULT_SLOTS, SECT_VAULT_SLOTS_MAX } from "./sect";

// ---------- Từ ngữ (một nơi: giao diện, toast máy chủ và dữ liệu của D dùng chung) ----------

/** Thuật ngữ hiển thị. Gốc ý tưởng: thuật ngữ chung của Vạn Kiếp Tu Tiên (docs/NGUON_NOI_DUNG.md); tên cấp ở `SECT_LEVELS`. */
export const SECT_TERMS = {
  contrib: "Cống hiến",
  merit: "Công tích",
  points: "Điểm tông",
  level: "Cấp tông",
  hall: "Nội vụ",
  /** Cửa hàng đổi ĐỒ bằng cống hiến */
  baoKho: "Bảo khố",
  /** Cửa hàng đổi KINH QUYỂN công pháp bằng cống hiến */
  tangKinh: "Tàng Kinh Các",
} as const;

// ---------- Hằng số ----------

/** Cống hiến một thành viên giữ tối đa (số dư). */
export const SECT_CONTRIB_CAP = 1_000_000;
/** Điểm tông (và công tích) tối đa. */
export const SECT_POINTS_CAP = 1_000_000_000;
/** Mỗi ngày (giờ Việt Nam) một LINH HỒN kiếm tối đa chừng này cống hiến, cộng mọi nguồn. */
export const SECT_EARN_DAY_CAP = 140;
/** Số nhiệm vụ tông môn mỗi ngày (ô i có độ khó i + 1). */
export const SECT_QUEST_SLOTS = 3;
/** Cống hiến của nhiệm vụ theo độ khó 1 / 2 / 3. Tổng = 90. */
export const SECT_QUEST_CH: readonly [number, number, number] = [20, 30, 40];
/** Góp kho: cứ chừng này Linh thạch (đồ tính theo `ITEM_VALUE`) được 1 cống hiến, làm tròn xuống. */
export const SECT_DEPOSIT_VALUE_PER_CH = 100;
/** Cống hiến tối đa kiếm bằng góp kho mỗi ngày. Chặn vòng góp - rút. */
export const SECT_DEPOSIT_DAY_CAP = 30;
/** Bí cảnh hoàn thành khi trong đội có từ 2 thành viên CÙNG tông: cống hiến cho mỗi người, 1 lần / ngày. */
export const SECT_DUNGEON_CH = 20;
/** Neo giá cửa hàng: một cống hiến "đáng" chừng này Linh thạch giá mua NPC (góp kho đổi lỗ nên không phải chỗ đổi tiền). */
export const SECT_CH_VALUE_LT = 5;
/** Một lần mua ở cửa hàng tông tối đa chừng này món. */
export const SECT_SHOP_QTY_MAX = 10;
/** Trần cứng của buff (hệ số): bảng `SECT_LEVELS` không bao giờ vượt, và server kẹp lại. */
export const SECT_BUFF_EXP_MAX = 1.1;
export const SECT_BUFF_DROP_MAX = 1.1;
export const SECT_BUFF_REGEN_MAX = 1.3;
/** Id "người giao" của nhiệm vụ tông môn. KHÔNG phải NPC: client / server phải xử lý riêng (không tìm NPC, không mũi tên chỉ đường). */
export const SECT_QUEST_GIVER = "tong_mon";

// ---------- Cấp tông ----------

/** Hệ số buff cho người ĐANG TRỰC TUYẾN; 1 = không có. */
export interface SectBuff {
  /** Nhân tu vi nhận được */
  exp: number;
  /** Nhân cơ hội rơi đồ (chủ đồ) */
  drop: number;
  /** Nhân tốc độ hồi khí huyết / linh lực ngoài đả tọa */
  regen: number;
}

export interface SectLevelInfo {
  level: number;
  /** Tên cấp (D có thể đổi chữ; giữ đúng 5 cấp) */
  name: string;
  /** Điểm tông tối thiểu để đạt cấp này */
  points: number;
  maxMembers: number;
  maxElders: number;
  vaultSlots: number;
  /** Nhóm hàng cửa hàng mở tới cấp này (`SectShopEntry.minLevel` <= level) */
  shopGroup: number;
  buff: SectBuff;
}

/**
 * Bảng cấp (mục 12.4). Cấp 1 GIỮ đúng giới hạn đang chạy (30 thành viên, 3 Trưởng lão, 40 ô) nên không tông môn nào bị vượt giới hạn.
 * Tăng dần đều; test giữ: điểm tăng nghiêm ngặt, giới hạn không giảm, buff không vượt trần.
 */
export const SECT_LEVELS: readonly SectLevelInfo[] = [
  {
    level: 1,
    name: "Sơ Lập",
    points: 0,
    maxMembers: SECT_MAX_MEMBERS,
    maxElders: SECT_ELDERS_MAX,
    vaultSlots: SECT_VAULT_SLOTS,
    shopGroup: 1,
    buff: { exp: 1, drop: 1, regen: 1 },
  },
  {
    level: 2,
    name: "Tiểu Thành",
    points: 1_000,
    maxMembers: 35,
    maxElders: 4,
    vaultSlots: 50,
    shopGroup: 2,
    buff: { exp: 1.02, drop: 1, regen: 1 },
  },
  {
    level: 3,
    name: "Trung Hưng",
    points: 4_000,
    maxMembers: 40,
    maxElders: 5,
    vaultSlots: 60,
    shopGroup: 3,
    buff: { exp: 1.03, drop: 1.03, regen: 1 },
  },
  {
    level: 4,
    name: "Hưng Vượng",
    points: 12_000,
    maxMembers: 45,
    maxElders: 6,
    vaultSlots: 70,
    shopGroup: 4,
    buff: { exp: 1.04, drop: 1.05, regen: 1.1 },
  },
  {
    level: 5,
    name: "Đỉnh Thịnh",
    points: 30_000,
    maxMembers: 50,
    maxElders: 7,
    vaultSlots: SECT_VAULT_SLOTS_MAX,
    shopGroup: 5,
    buff: { exp: 1.05, drop: 1.05, regen: 1.15 },
  },
];

export const SECT_LEVEL_MAX = SECT_LEVELS.length;

/** Cấp (1..`SECT_LEVEL_MAX`) ứng với `points`. Số không hợp lệ (NaN, âm, không phải số) coi là 0 điểm = cấp 1. */
export function sectLevelOf(points: unknown): number {
  const p = typeof points === "number" && Number.isFinite(points) && points > 0 ? points : 0;
  let level = 1;
  for (const l of SECT_LEVELS) if (p >= l.points) level = l.level;
  return level;
}

/** Thông tin cấp `level`; ngoài khoảng / không phải số nguyên thì kẹp về 1..`SECT_LEVEL_MAX`. */
export function sectLevelInfo(level: unknown): SectLevelInfo {
  const n = typeof level === "number" && Number.isFinite(level) ? Math.floor(level) : 1;
  return SECT_LEVELS[Math.min(SECT_LEVEL_MAX, Math.max(1, n)) - 1]!;
}

/** Buff của cấp `level` (bản sao: người gọi sửa thoải mái). */
export function sectBuffOf(level: unknown): SectBuff {
  return { ...sectLevelInfo(level).buff };
}

/** Điểm còn thiếu để lên cấp kế; `null` khi đã ở cấp cao nhất. */
export function sectPointsToNext(points: unknown): number | null {
  const level = sectLevelOf(points);
  if (level >= SECT_LEVEL_MAX) return null;
  const p = typeof points === "number" && Number.isFinite(points) && points > 0 ? points : 0;
  return SECT_LEVELS[level]!.points - p;
}

// ---------- Ngày (giờ Việt Nam, UTC+7) ----------

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

/** 00:00 giờ Việt Nam KẾ TIẾP sau `ms` (mốc làm mới trong ngày). Không hợp lệ thì 0. */
export function sectResetAt(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return (Math.floor((ms + VN_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - VN_OFFSET_MS;
}

/**
 * Thành viên vào tông lúc `joinedAt` kiếm được cống hiến lúc `now` không? Chỉ khi đã vào từ TRƯỚC hôm nay (mục 12.3): một linh hồn kiếm tối đa MỘT
 * trần mỗi ngày trên mọi tông môn gộp lại (nhảy tông / lập tông mỗi ngày không lấy lại được trần). `warmup = false` chỉ để dev / E2E
 * (máy chủ có cờ `SECT_EARN_WARMUP`, mặc định bật; không bao giờ tắt trên bản chạy thật).
 */
export function sectCanEarn(joinedAt: number, now: number, warmup = true): boolean {
  if (!Number.isFinite(joinedAt) || !Number.isFinite(now)) return false;
  return !warmup || dayKey(joinedAt) < dayKey(now);
}

/** Từ lúc nào (ms) thành viên vào tông lúc `joinedAt` kiếm được cống hiến; 0 nếu `warmup` tắt hoặc `joinedAt` không hợp lệ. */
export function sectEarnFromAt(joinedAt: number, warmup = true): number {
  return warmup && Number.isFinite(joinedAt) ? sectResetAt(joinedAt) : 0;
}

// ---------- Sổ trong ngày của một thành viên + kiếm cống hiến (MỘT nơi tính) ----------

export const SECT_EARN_SOURCES = ["quest", "deposit", "dungeon"] as const;
export type SectEarnSource = (typeof SECT_EARN_SOURCES)[number];

/** Sổ trong NGÀY `day` (`dayKey`) của một thành viên; sang ngày mới thì đặt lại (`sectDayState`). */
export interface SectDayState {
  day: string;
  /** Tổng đã kiếm hôm nay, 0..`SECT_EARN_DAY_CAP` */
  earned: number;
  /** Phần kiếm bằng góp kho, 0..`SECT_DEPOSIT_DAY_CAP` */
  deposit: number;
  /**
   * Id MẪU (`SectQuestTemplate.id`, KHÔNG phải id cụ thể có hậu tố bậc) của nhiệm vụ tông đã TRẢ hôm nay. Theo LINH HỒN: đầu thai giữa ngày không làm lại; và vì
   * khoá theo MẪU nên ĐỔI BẬC giữa ngày (đột phá, đầu thai) cũng không làm lại được cùng ô nhiệm vụ (bản `.t0` và `.t1` của một mẫu là MỘT nhiệm vụ).
   */
  quests: string[];
  /** Đã nhận thưởng bí cảnh hôm nay */
  dungeon: boolean;
  /** Số đã mua hôm nay theo món cửa hàng */
  buys: Record<string, number>;
}

export function emptySectDay(day: string): SectDayState {
  return { day, earned: 0, deposit: 0, quests: [], dungeon: false, buys: {} };
}

function int(v: unknown, lo: number, hi: number): number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= lo ? Math.min(v, hi) : lo;
}

/**
 * Sổ ngày hợp lệ của `raw` tại thời điểm `now`: khác ngày (hoặc hỏng / thiếu) thì sổ MỚI của hôm nay; cùng ngày thì làm sạch (số nguyên trong trần,
 * `quests` chỉ id có thật không trùng, `buys` chỉ món có trong `SECT_SHOP`). Không sửa `raw`. Server dùng khi đọc bản ghi.
 */
export function sectDayState(raw: unknown, now: number): SectDayState {
  const today = dayKey(Number.isFinite(now) ? now : 0);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return emptySectDay(today);
  const r = raw as Record<string, unknown>;
  if (r.day !== today) return emptySectDay(today);
  const quests = Array.isArray(r.quests)
    ? [...new Set(r.quests.filter((q): q is string => isSectQuestTemplate(q)))]
    : [];
  const buys: Record<string, number> = {};
  if (r.buys !== null && typeof r.buys === "object" && !Array.isArray(r.buys)) {
    for (const e of SECT_SHOP) {
      const n = int((r.buys as Record<string, unknown>)[e.itemId], 0, e.limitDay);
      if (n > 0) buys[e.itemId] = n;
    }
  }
  const earned = int(r.earned, 0, SECT_EARN_DAY_CAP);
  return {
    day: today,
    earned,
    deposit: Math.min(int(r.deposit, 0, SECT_DEPOSIT_DAY_CAP), earned),
    quests,
    dungeon: r.dungeon === true,
    buys,
  };
}

/** Còn kiếm được tối đa bao nhiêu cống hiến hôm nay từ `source` (đã tính trần ngày). `quest` do từng nhiệm vụ tự giới hạn (mỗi id một lần). */
export function sectEarnLeft(day: SectDayState, source: SectEarnSource): number {
  const overall = Math.max(0, SECT_EARN_DAY_CAP - day.earned);
  switch (source) {
    case "quest":
      return overall;
    case "deposit":
      return Math.min(overall, Math.max(0, SECT_DEPOSIT_DAY_CAP - day.deposit));
    case "dungeon":
      return day.dungeon ? 0 : Math.min(overall, SECT_DUNGEON_CH);
  }
}

export interface SectAwardResult {
  /** Sổ ngày SAU khi kiếm (bản mới; `day` đầu vào không bị sửa) */
  day: SectDayState;
  /** Số cống hiến thực được cộng (0 nếu hết trần / đã nhận) */
  granted: number;
  /** Lý do khi `granted === 0` và bị từ chối hẳn (`quest_done` cho nhiệm vụ đã trả); `null` nếu được hoặc chỉ hết trần */
  refused: "quest_done" | null;
}

/**
 * MỘT hàm duy nhất tính cống hiến kiếm được (server bọc trong `SectStore.update`, cộng `contrib` + `merit` + `Sect.points` cùng `granted`).
 * `want` là số muốn cộng (nguyên dương; với `quest` luôn bị kẹp về `sectQuestCh(key)`). `key` là id nhiệm vụ CỤ THỂ (bắt buộc với `quest`). Kẹp theo trần ngày
 * và trần nguồn; `dungeon` chỉ một lần mỗi ngày; MỘT MẪU nhiệm vụ chỉ trả một lần mỗi ngày (bất kể bậc: `day.quests` lưu id mẫu). Không kiểm `sectCanEarn` / sống chết: người gọi kiểm trước.
 */
export function sectAwardDay(
  day: SectDayState,
  source: SectEarnSource,
  want: number,
  key?: string,
): SectAwardResult {
  const next: SectDayState = {
    ...day,
    quests: [...day.quests],
    buys: { ...day.buys },
  };
  if (!Number.isSafeInteger(want) || want < 1) return { day: next, granted: 0, refused: null };
  let tplId: string | undefined;
  if (source === "quest") {
    tplId = sectQuestTemplateOf(key);
    if (tplId === undefined) return { day: next, granted: 0, refused: null };
    if (day.quests.includes(tplId)) return { day: next, granted: 0, refused: "quest_done" };
    // MỘT-hàm-duy-nhất tính cống hiến: người gọi KHÔNG được xin quá phần của nhiệm vụ (sectQuestCh theo độ khó), dù `want` lớn hơn
    want = Math.min(want, sectQuestCh(key));
  }
  const granted = Math.min(want, sectEarnLeft(day, source));
  if (granted < 1) return { day: next, granted: 0, refused: null };
  next.earned += granted;
  if (source === "deposit") next.deposit += granted;
  if (source === "dungeon") next.dungeon = true;
  if (source === "quest") next.quests.push(tplId!);
  return { day: next, granted, refused: null };
}

/** Giá trị (Linh thạch) của một lần góp kho để đổi ra cống hiến: tiền = số tiền; đồ = `ITEM_VALUE x qty` (món không có giá = 0). Số xấu = 0. */
export function sectDepositValue(d: { coin: number } | { itemId: string; qty: number }): number {
  if ("coin" in d) return Number.isSafeInteger(d.coin) && d.coin > 0 ? d.coin : 0;
  const v = has(ITEM_VALUE, d.itemId) ? ITEM_VALUE[d.itemId]! : 0;
  return Number.isSafeInteger(d.qty) && d.qty > 0 ? v * d.qty : 0;
}

/** Cống hiến muốn cộng cho một lần góp trị giá `value` Linh thạch (làm tròn xuống; chưa tính trần ngày: dùng `sectAwardDay`). */
export function sectDepositCh(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value / SECT_DEPOSIT_VALUE_PER_CH) : 0;
}

function has(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

// ---------- Nhiệm vụ tông môn hằng ngày ----------

/** Bậc người nhận: 0 Luyện Khí trở xuống, 1 Trúc Cơ, 2 Kim Đan, 3 Nguyên Anh trở lên. */
export type SectQuestTier = 0 | 1 | 2 | 3;
export const SECT_QUEST_TIERS: readonly SectQuestTier[] = [0, 1, 2, 3];

export function sectTierOfRealm(realm: unknown): SectQuestTier {
  const r = typeof realm === "number" && Number.isFinite(realm) ? Math.floor(realm) : 0;
  return r <= 1 ? 0 : r === 2 ? 1 : r === 3 ? 2 : 3;
}

/** Nội dung một nhiệm vụ ở MỘT bậc (bước dùng lại `QuestStep` của bộ máy nhiệm vụ hiện có). */
export interface SectQuestTierDef {
  steps: QuestStep[];
  /** Thưởng ngoài cống hiến (tu vi, đồ): nhỏ */
  rewards: QuestReward;
}

/** Mẫu nhiệm vụ tông: một độ khó, có bản theo bậc (thiếu bậc nào thì người ở bậc đó nhận bản của bậc thấp hơn gần nhất). */
export interface SectQuestTemplate {
  /** Id mẫu (chữ thường, số, gạch dưới), tiền tố `st_` */
  id: string;
  title: string;
  desc: string;
  /** 1 / 2 / 3: quyết định cống hiến (`SECT_QUEST_CH`) và ô trong ngày */
  difficulty: 1 | 2 | 3;
  byTier: Partial<Record<SectQuestTier, SectQuestTierDef>>;
  talk: { offer: string[]; progress: string[]; complete: string[] };
}

/**
 * Mẫu nhiệm vụ tông hằng ngày (M8.7a, #856): 12 mẫu x 4 bậc (Luyện Khí / Trúc Cơ / Kim Đan / Nguyên Anh), chỉ dùng quái / vật phẩm CÓ THẬT.
 * Ý tưởng gốc: các sự kiện tông môn của Vạn Kiếp Tu Tiên (docs/NGUON_NOI_DUNG.md), viết lại cho thời gian thực. Mỗi bậc dùng quái / nguyên liệu
 * KHÔNG quá khó hơn bậc đó (tho / lang vừa bậc 0, hổ bậc 1, loài Kim Đan bậc 2, loài Nguyên Anh bậc 3); test kiểm (`sect-depth.test.ts`).
 * Số lượng bước và thưởng (tu vi / đan) là ĐỀ XUẤT; Dev D/A hiệu chỉnh bằng mô phỏng (`docs/CAN_BANG.md`).
 */
export const SECT_QUESTS: readonly SectQuestTemplate[] = [
  // ---------- Độ khó 1 (20 cống hiến) ----------
  {
    id: "st_tru_ho_son",
    title: "Trừ hổ dữ sơn cốc",
    desc: "Thú dữ chặn đường sơn cốc, Trưởng lão giao đệ tử trừ hại.",
    difficulty: 1,
    byTier: {
      0: { steps: [{ kind: "kill", monster: "lang", count: 12 }], rewards: { exp: 40 } },
      1: { steps: [{ kind: "kill", monster: "ho", count: 6 }], rewards: { exp: 80 } },
      2: { steps: [{ kind: "kill", monster: "suong_ho", count: 5 }], rewards: { exp: 120 } },
      3: { steps: [{ kind: "kill", monster: "han_lang", count: 4 }], rewards: { exp: 160 } },
    },
    talk: {
      offer: ["Sơn cốc có hổ dữ chặn đường, ngươi hãy vào trừ cho gọn."],
      progress: ["Thú dữ vẫn còn đó, chưa đủ số đã hứa."],
      complete: ["Sơn cốc đã yên, tông môn ghi công cho ngươi."],
    },
  },
  {
    id: "st_tuan_son_dao",
    title: "Tuần sơn đạo",
    desc: "Dọn thú dữ trên các lối núi để đoàn người qua lại yên ổn.",
    difficulty: 1,
    byTier: {
      0: { steps: [{ kind: "kill", monster: "tho", count: 15 }], rewards: { exp: 40 } },
      1: { steps: [{ kind: "kill", monster: "lang", count: 10 }], rewards: { exp: 80 } },
      2: { steps: [{ kind: "kill", monster: "thach_quy", count: 4 }], rewards: { exp: 120 } },
      3: { steps: [{ kind: "kill", monster: "phong_nha", count: 4 }], rewards: { exp: 160 } },
    },
    talk: {
      offer: ["Sơn đạo nhiều thú dữ, ngươi hãy tuần tra và trừ sạch."],
      progress: ["Lối núi vẫn chưa yên, chưa đủ số."],
      complete: ["Sơn đạo đã thông, tông môn cảm tạ."],
    },
  },
  {
    id: "st_diet_doc_trung",
    title: "Diệt độc trùng",
    desc: "Đầm lầy đầy độc trùng gây hại, cần người diệt gọn.",
    difficulty: 1,
    byTier: {
      0: { steps: [{ kind: "kill", monster: "lang", count: 10 }], rewards: { exp: 40 } },
      1: { steps: [{ kind: "kill", monster: "ho", count: 6 }], rewards: { exp: 80 } },
      2: { steps: [{ kind: "kill", monster: "doc_thiem", count: 5 }], rewards: { exp: 120 } },
      3: { steps: [{ kind: "kill", monster: "doc_tuoc", count: 4 }], rewards: { exp: 160 } },
    },
    talk: {
      offer: ["Độc trùng tràn đầm, hại người và thú, ngươi hãy diệt gọn."],
      progress: ["Độc trùng vẫn còn, chưa đủ số."],
      complete: ["Đầm lầy đã sạch độc trùng, tông môn ghi công."],
    },
  },
  {
    id: "st_nop_thu_pham",
    title: "Nộp thú phàm",
    desc: "Nộp da thú cho đan phòng của tông môn.",
    difficulty: 1,
    byTier: {
      0: { steps: [{ kind: "collect", itemId: "nanh_soi", count: 8 }], rewards: { exp: 40 } },
      1: { steps: [{ kind: "collect", itemId: "da_ho", count: 6 }], rewards: { exp: 80 } },
      2: { steps: [{ kind: "collect", itemId: "suong_mao", count: 6 }], rewards: { exp: 120 } },
      3: { steps: [{ kind: "collect", itemId: "han_lang_mao", count: 5 }], rewards: { exp: 160 } },
    },
    talk: {
      offer: ["Đan phòng cần nguyên liệu thú phàm, ngươi hãy thu thập nộp vào."],
      progress: ["Chưa đủ thú phàm cho đan phòng."],
      complete: ["Nguyên liệu đủ tươi, đan phòng nhận."],
    },
  },
  // ---------- Độ khó 2 (30 cống hiến) ----------
  {
    id: "st_bao_ve_duoc_vien",
    title: "Bảo vệ dược viên",
    desc: "Thu thập nguyên liệu cho dược viên của tông môn.",
    difficulty: 2,
    byTier: {
      0: { steps: [{ kind: "collect", itemId: "nanh_soi", count: 12 }], rewards: { exp: 60 } },
      1: { steps: [{ kind: "collect", itemId: "da_ho", count: 10 }], rewards: { exp: 120 } },
      2: { steps: [{ kind: "collect", itemId: "quy_giap", count: 6 }], rewards: { exp: 180 } },
      3: { steps: [{ kind: "collect", itemId: "tuong_cot", count: 5 }], rewards: { exp: 240 } },
    },
    talk: {
      offer: ["Dược viên thiếu nguyên liệu, ngươi hãy thu cho đủ."],
      progress: ["Nguyên liệu dược viên vẫn chưa đủ."],
      complete: ["Dược viên đã đầy nguyên liệu, tông môn hậu tạ."],
    },
  },
  {
    id: "st_khai_khoang_mach",
    title: "Khai khoáng mạch",
    desc: "Khai thác khoáng mạch của tông môn nơi rừng sâu.",
    difficulty: 2,
    byTier: {
      0: { steps: [{ kind: "collect", itemId: "long_tho", count: 14 }], rewards: { exp: 60 } },
      1: { steps: [{ kind: "collect", itemId: "nanh_soi", count: 16 }], rewards: { exp: 120 } },
      2: { steps: [{ kind: "collect", itemId: "doc_nang", count: 6 }], rewards: { exp: 180 } },
      3: { steps: [{ kind: "collect", itemId: "phong_nha_vu", count: 6 }], rewards: { exp: 240 } },
    },
    talk: {
      offer: ["Khoáng mạch cần người khai thác, ngươi hãy vào thu khoáng."],
      progress: ["Khoáng thu được chưa đủ."],
      complete: ["Khoáng mạch đã khai xong, tông môn ghi công."],
    },
  },
  {
    id: "st_giac_linh_thu",
    title: "Giác linh thú",
    desc: "Canh gác và trừ thú dữ quanh khu nuôi linh thú.",
    difficulty: 2,
    byTier: {
      0: { steps: [{ kind: "kill", monster: "lang", count: 12 }], rewards: { exp: 60 } },
      1: { steps: [{ kind: "kill", monster: "ho", count: 8 }], rewards: { exp: 120 } },
      2: { steps: [{ kind: "kill", monster: "suong_ho", count: 6 }], rewards: { exp: 180 } },
      3: { steps: [{ kind: "kill", monster: "cot_tuong", count: 4 }], rewards: { exp: 240 } },
    },
    talk: {
      offer: ["Khu linh thú có thú dữ xâm phạm, ngươi hãy vào trừ."],
      progress: ["Thú dữ vẫn còn quấy phá, chưa đủ số."],
      complete: ["Linh thú đã yên, tông môn cảm tạ."],
    },
  },
  {
    id: "st_tru_quy_dau_dan",
    title: "Trừ quỷ đầu đàn",
    desc: "Trừ thủ lĩnh đàn quái đang làm loạn biên giới.",
    difficulty: 2,
    byTier: {
      0: { steps: [{ kind: "kill", monster: "lang", count: 10 }], rewards: { exp: 60 } },
      1: { steps: [{ kind: "kill", monster: "ho", count: 8 }], rewards: { exp: 120 } },
      2: { steps: [{ kind: "kill", monster: "thach_quy", count: 5 }], rewards: { exp: 180 } },
      3: { steps: [{ kind: "kill", monster: "doc_tuoc", count: 5 }], rewards: { exp: 240 } },
    },
    talk: {
      offer: ["Đàn quái có đầu lĩnh hung hãn, ngươi hãy vào trừ gọn."],
      progress: ["Đầu đàn vẫn chưa bị diệt, chưa đủ số."],
      complete: ["Đầu đàn đã trừ, biên giới yên ổn, tông môn ghi công."],
    },
  },
  // ---------- Độ khó 3 (40 cống hiến) ----------
  {
    id: "st_dinh_sat_doc",
    title: "Đính sát độc trùng",
    desc: "Ám sát đàn độc trùng hung dữ nơi đầm sâu.",
    difficulty: 3,
    byTier: {
      0: { steps: [{ kind: "kill", monster: "lang", count: 16 }], rewards: { exp: 100 } },
      1: { steps: [{ kind: "kill", monster: "ho", count: 12 }], rewards: { exp: 200 } },
      2: {
        steps: [{ kind: "kill", monster: "doc_thiem", count: 8 }],
        rewards: { exp: 300, items: [{ itemId: "hoi_huyet_dan", qty: 1 }] },
      },
      3: {
        steps: [{ kind: "kill", monster: "doc_tuoc", count: 6 }],
        rewards: { exp: 400, items: [{ itemId: "hoi_huyet_dan", qty: 2 }] },
      },
    },
    talk: {
      offer: ["Đầm sâu có độc trùng hung dữ, ngươi hãy vào ám sát cho gọn."],
      progress: ["Độc trùng vẫn còn nhiều, chưa đủ số."],
      complete: ["Độc trùng đã diệt sạch, tông môn trọng thưởng."],
    },
  },
  {
    id: "st_nop_linh_duoc",
    title: "Nộp linh dược",
    desc: "Nộp dược liệu quý cho tàng kinh các của tông môn.",
    difficulty: 3,
    byTier: {
      0: { steps: [{ kind: "collect", itemId: "nanh_soi", count: 18 }], rewards: { exp: 100 } },
      1: { steps: [{ kind: "collect", itemId: "da_ho", count: 14 }], rewards: { exp: 200 } },
      2: {
        steps: [{ kind: "collect", itemId: "quy_giap", count: 10 }],
        rewards: { exp: 300, items: [{ itemId: "hoi_huyet_dan", qty: 1 }] },
      },
      3: {
        steps: [{ kind: "collect", itemId: "tuong_cot", count: 6 }],
        rewards: { exp: 400, items: [{ itemId: "hoi_huyet_dan", qty: 2 }] },
      },
    },
    talk: {
      offer: ["Tàng kinh các cần dược liệu quý, ngươi hãy thu nộp."],
      progress: ["Dược liệu quý vẫn chưa đủ."],
      complete: ["Dược liệu đã đủ, tàng kinh các ghi công."],
    },
  },
  {
    id: "st_tuan_thu_rung",
    title: "Tuần thú rừng sâu",
    desc: "Tuần tra rừng sâu trừ thú dữ đe dọa thợ khai thác.",
    difficulty: 3,
    byTier: {
      0: { steps: [{ kind: "kill", monster: "tho", count: 25 }], rewards: { exp: 100 } },
      1: { steps: [{ kind: "kill", monster: "lang", count: 18 }], rewards: { exp: 200 } },
      2: {
        steps: [{ kind: "kill", monster: "thach_quy", count: 8 }],
        rewards: { exp: 300, items: [{ itemId: "hoi_huyet_dan", qty: 1 }] },
      },
      3: {
        steps: [{ kind: "kill", monster: "cot_tuong", count: 6 }],
        rewards: { exp: 400, items: [{ itemId: "hoi_huyet_dan", qty: 2 }] },
      },
    },
    talk: {
      offer: ["Rừng sâu thú dữ rình rập, ngươi hãy tuần tra trừ sạch."],
      progress: ["Thú dữ vẫn còn, chưa đủ số."],
      complete: ["Rừng sâu đã yên, thợ khai thác an toàn, tông môn hậu tạ."],
    },
  },
  {
    id: "st_bao_ve_khoang_mach",
    title: "Bảo vệ khoáng mạch",
    desc: "Bảo vệ mỏ khoáng của tông môn và thu khoáng quý.",
    difficulty: 3,
    byTier: {
      0: { steps: [{ kind: "collect", itemId: "long_tho", count: 20 }], rewards: { exp: 100 } },
      1: { steps: [{ kind: "collect", itemId: "nanh_soi", count: 20 }], rewards: { exp: 200 } },
      2: {
        steps: [{ kind: "collect", itemId: "doc_nang", count: 8 }],
        rewards: { exp: 300, items: [{ itemId: "hoi_huyet_dan", qty: 1 }] },
      },
      3: {
        steps: [{ kind: "collect", itemId: "phong_nha_vu", count: 6 }],
        rewards: { exp: 400, items: [{ itemId: "hoi_huyet_dan", qty: 2 }] },
      },
    },
    talk: {
      offer: ["Khoáng mạch bị quấy phá, ngươi hãy bảo vệ và thu khoáng."],
      progress: ["Chưa thu đủ khoáng, thú dữ vẫn còn."],
      complete: ["Khoáng mạch đã an toàn, tông môn ghi trọng công."],
    },
  },
];

/** Id nhiệm vụ cụ thể (mẫu + bậc), ví dụ `st_tru_lang.t1`. */
export function sectQuestId(templateId: string, tier: SectQuestTier): string {
  return `${templateId}.t${tier}`;
}

function buildSectQuest(
  t: SectQuestTemplate,
  tier: SectQuestTier,
  def: SectQuestTierDef,
): QuestDef {
  const realm = tier === 0 ? 1 : tier + 1; // bậc 0: Luyện Khí (realm 1); bậc 1..3: realm 2..4
  return {
    id: sectQuestId(t.id, tier),
    title: t.title,
    giver: SECT_QUEST_GIVER,
    desc: t.desc,
    steps: def.steps,
    rewards: def.rewards,
    minRealm: { realm, tier: 0 },
    daily: true,
    talk: t.talk,
  };
}

/**
 * Mọi nhiệm vụ tông CỤ THỂ (mỗi mẫu x mỗi bậc có bản), dựng thành `QuestDef` với `giver: SECT_QUEST_GIVER`. KHÔNG nằm trong `QUESTS` / `QUEST_BY_ID`:
 * nên dấu "!" / "?" trên NPC (`npcMarker`) bỏ qua chúng; server gộp tra cứu ở M8.4, client xử lý `giver === SECT_QUEST_GIVER` ở M8.6.
 */
export const SECT_QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  SECT_QUESTS.flatMap((t) =>
    SECT_QUEST_TIERS.flatMap((tier) => {
      const def = t.byTier[tier];
      return def ? ([[sectQuestId(t.id, tier), buildSectQuest(t, tier, def)]] as const) : [];
    }),
  ),
);

/** Nhiệm vụ có phải của tông môn không (người giao là `SECT_QUEST_GIVER`)? */
export function isSectQuest(def: { giver?: unknown }): boolean {
  return def.giver === SECT_QUEST_GIVER;
}

/**
 * Kiểm bảng nhiệm vụ tông (Dev D dùng cho dữ liệu thật; test của `shared/` gọi với `SECT_QUESTS`): id đúng dạng và không trùng, độ khó 1-3, có ít nhất một bậc,
 * bước không rỗng, quái / vật phẩm CÓ THẬT, số lượng nguyên dương, lời thoại không rỗng. Trả danh sách lỗi (rỗng = sạch).
 */
export function sectQuestViolations(
  templates: readonly SectQuestTemplate[] = SECT_QUESTS,
): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const t of templates) {
    if (!/^st_[a-z0-9_]+$/.test(t.id)) bad.push(`${t.id}: id sai dạng`);
    if (seen.has(t.id)) bad.push(`${t.id}: trùng mẫu`);
    seen.add(t.id);
    if (![1, 2, 3].includes(t.difficulty)) bad.push(`${t.id}: độ khó không hợp lệ`);
    if (!t.title.trim() || !t.desc.trim()) bad.push(`${t.id}: thiếu tên hoặc mô tả`);
    for (const k of ["offer", "progress", "complete"] as const) {
      if (!t.talk[k].length || t.talk[k].some((l) => !l.trim()))
        bad.push(`${t.id}: lời thoại ${k} rỗng`);
    }
    const tiers = SECT_QUEST_TIERS.filter((tier) => t.byTier[tier]);
    if (!tiers.length) bad.push(`${t.id}: không có bậc nào`);
    for (const tier of tiers) {
      const d = t.byTier[tier]!;
      const where = `${t.id}.t${tier}`;
      if (!d.steps.length) bad.push(`${where}: không có bước`);
      for (const st of d.steps) {
        if (st.kind === "kill") {
          if (!has(MONSTER_BY_ID, st.monster))
            bad.push(`${where}: quái ${st.monster} không tồn tại`);
          if (!Number.isSafeInteger(st.count) || st.count < 1)
            bad.push(`${where}: số lượng không hợp lệ`);
        } else if (st.kind === "collect") {
          if (!has(ITEM_BY_ID, st.itemId))
            bad.push(`${where}: vật phẩm ${st.itemId} không tồn tại`);
          if (!Number.isSafeInteger(st.count) || st.count < 1)
            bad.push(`${where}: số lượng không hợp lệ`);
        } else {
          bad.push(`${where}: loại bước ${st.kind} chưa dùng cho nhiệm vụ tông`);
        }
      }
      for (const it of d.rewards.items ?? []) {
        if (!has(ITEM_BY_ID, it.itemId))
          bad.push(`${where}: phần thưởng ${it.itemId} không tồn tại`);
        if (!Number.isSafeInteger(it.qty) || it.qty < 1)
          bad.push(`${where}: số lượng thưởng không hợp lệ`);
      }
      if (
        d.rewards.exp !== undefined &&
        (!Number.isSafeInteger(d.rewards.exp) || d.rewards.exp < 0)
      )
        bad.push(`${where}: tu vi thưởng không hợp lệ`);
    }
  }
  return bad;
}

/** Mọi mẫu nhiệm vụ tông theo id mẫu. */
export const SECT_QUEST_TEMPLATE_BY_ID: Record<string, SectQuestTemplate> = Object.fromEntries(
  SECT_QUESTS.map((t) => [t.id, t]),
);

/** `id` có phải id MẪU nhiệm vụ tông có thật không (tra bằng `hasOwnProperty`)? */
export function isSectQuestTemplate(id: unknown): id is string {
  return typeof id === "string" && has(SECT_QUEST_TEMPLATE_BY_ID, id);
}

/**
 * Id MẪU của nhiệm vụ tông CỤ THỂ `questId` (`st_tru_lang.t1` -> `st_tru_lang`); `undefined` nếu không phải nhiệm vụ tông có thật. Khoá "đã trả hôm nay" và ô nhiệm vụ trong ngày
 * (`sectQuestSlots`) đều theo id mẫu, nên đổi bậc giữa ngày không làm lại được cùng ô.
 */
export function sectQuestTemplateOf(questId: unknown): string | undefined {
  if (typeof questId !== "string" || !has(SECT_QUEST_BY_ID, questId)) return undefined;
  // `questId` đã là nhiệm vụ cụ thể CÓ THẬT (kiểm ở trên) nên phần trước hậu tố bậc chắc chắn là id mẫu có thật
  const m = /^(.+)\.t[0-3]$/.exec(questId);
  return m ? m[1] : undefined;
}

/**
 * Định nghĩa nhiệm vụ theo id, từ CẢ HAI bảng: nhiệm vụ thường (`QUEST_BY_ID`) và nhiệm vụ tông (`SECT_QUEST_BY_ID`); `undefined` nếu lạ. Server (`sanitizeQuests`, tiến độ) và
 * client (sổ nhiệm vụ, chỉ đường) dùng chung để không mỗi nơi một kiểu và không quên `hasOwnProperty`.
 */
export function questDefAny(id: unknown): QuestDef | undefined {
  if (typeof id !== "string") return undefined;
  if (has(QUEST_BY_ID, id)) return QUEST_BY_ID[id];
  if (has(SECT_QUEST_BY_ID, id)) return SECT_QUEST_BY_ID[id];
  return undefined;
}

/** Cống hiến của nhiệm vụ cụ thể `questId` (theo độ khó của mẫu); 0 nếu không phải nhiệm vụ tông. */
export function sectQuestCh(questId: unknown): number {
  const t = sectQuestTemplateOf(questId);
  return t ? SECT_QUEST_CH[SECT_QUEST_TEMPLATE_BY_ID[t]!.difficulty - 1]! : 0;
}

/** Băm chuỗi ổn định (FNV-1a 32 bit): cùng đầu vào luôn cùng kết quả ở server và client. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Id MẪU của các nhiệm vụ hôm nay của tông môn `sectId` (ngày `day` = `dayKey`): tối đa `SECT_QUEST_SLOTS` mẫu, ô i có độ khó i + 1,
 * chọn tất định theo `hash(sectId, day, i)` nên mọi thành viên cùng thấy. Độ khó chưa có mẫu thì bỏ ô đó. `templates` chỉ để test bằng bảng tổng hợp.
 */
export function sectQuestSlots(
  sectId: string,
  day: string,
  templates: readonly SectQuestTemplate[] = SECT_QUESTS,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < SECT_QUEST_SLOTS; i++) {
    const pool = templates.filter((t) => t.difficulty === i + 1);
    if (pool.length) out.push(pool[hash32(`${sectId}|${day}|${i}`) % pool.length]!.id);
  }
  return out;
}

/**
 * Id nhiệm vụ cụ thể mà người ở `realm` nhận cho mẫu `templateId`: bản của bậc mình, thiếu thì bản của bậc thấp hơn gần nhất; `undefined`
 * nếu mẫu lạ hoặc không có bản nào vừa sức.
 */
export function sectQuestFor(templateId: string, realm: unknown): string | undefined {
  const tpl = SECT_QUESTS.find((t) => t.id === templateId);
  if (!tpl) return undefined;
  for (let tier = sectTierOfRealm(realm); tier >= 0; tier--) {
    if (tpl.byTier[tier as SectQuestTier]) return sectQuestId(tpl.id, tier as SectQuestTier);
  }
  return undefined;
}

// ---------- Cửa hàng tông môn ----------

export type SectShopHall = "baoKho" | "tangKinh";

export interface SectShopEntry {
  itemId: string;
  /** Giá bằng cống hiến, nguyên dương */
  cost: number;
  /** Cấp tông tối thiểu để thấy mua được (1..`SECT_LEVEL_MAX`) */
  minLevel: number;
  /** Hạn mức mua mỗi ngày mỗi người, nguyên dương */
  limitDay: number;
  hall: SectShopHall;
}

/**
 * KHUNG: vài món mẫu cho test và giao diện; Dev D thay bằng bảng thật (5 nhóm hàng, issue M8.7). Bất biến giá ở `sectShopViolations`.
 */
export const SECT_SHOP: readonly SectShopEntry[] = [
  { itemId: "hoi_huyet_dan", cost: 5, minLevel: 1, limitDay: 10, hall: "baoKho" },
  { itemId: "hoi_linh_dan", cost: 5, minLevel: 1, limitDay: 10, hall: "baoKho" },
  { itemId: "tu_khi_dan", cost: 30, minLevel: 3, limitDay: 2, hall: "baoKho" },
];

export const SECT_SHOP_BY_ITEM: Record<string, SectShopEntry> = Object.fromEntries(
  SECT_SHOP.map((e) => [e.itemId, e]),
);

/** Lý do một món chưa mua được (hiện bằng chữ TRƯỚC khi bấm). Thứ tự ưu tiên: `level`, `known`, `limit`, `no_contrib`. */
export type SectShopLock = "level" | "known" | "limit" | "no_contrib";

export interface SectShopCtx {
  level: number;
  contrib: number;
  /** Đã mua hôm nay món này */
  boughtToday: number;
  /** Là kinh quyển mà người mua ĐÃ HỌC rồi */
  known: boolean;
}

/** Món `e` bị khoá vì lý do gì với người có `ctx`; `null` = mua được ít nhất MỘT. */
export function sectShopLock(e: SectShopEntry, ctx: SectShopCtx): SectShopLock | null {
  if (ctx.level < e.minLevel) return "level";
  if (ctx.known) return "known";
  if (ctx.boughtToday >= e.limitDay) return "limit";
  if (ctx.contrib < e.cost) return "no_contrib";
  return null;
}

/**
 * Kiểm bảng cửa hàng: id có thật, số nguyên dương, cấp trong khoảng, không trùng món, và NEO GIÁ (mục 12.6): món có bán ở NPC thì
 * `cost x SECT_CH_VALUE_LT >= buyPrice(món)`, tức mua bằng cống hiến không rẻ hơn mua bằng Linh thạch. Trả danh sách lỗi (rỗng = sạch).
 */
export function sectShopViolations(entries: readonly SectShopEntry[] = SECT_SHOP): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  const sold = new Set(SHOPS.flatMap((s) => s.itemIds));
  for (const e of entries) {
    if (!has(ITEM_BY_ID, e.itemId)) bad.push(`${e.itemId}: vật phẩm không tồn tại`);
    if (seen.has(e.itemId)) bad.push(`${e.itemId}: trùng món`);
    seen.add(e.itemId);
    if (!Number.isSafeInteger(e.cost) || e.cost < 1) bad.push(`${e.itemId}: giá không hợp lệ`);
    if (!Number.isSafeInteger(e.limitDay) || e.limitDay < 1)
      bad.push(`${e.itemId}: hạn mức ngày không hợp lệ`);
    if (!Number.isSafeInteger(e.minLevel) || e.minLevel < 1 || e.minLevel > SECT_LEVEL_MAX)
      bad.push(`${e.itemId}: cấp mở không hợp lệ`);
    if (sold.has(e.itemId) && e.cost * SECT_CH_VALUE_LT < buyPrice(e.itemId))
      bad.push(`${e.itemId}: rẻ hơn mua ở NPC`);
  }
  return bad;
}

// ---------- Tin nhắn ----------

/** Client -> server: nhận nhiệm vụ tông (`questId` là id CỤ THỂ trong `SECT_QUEST_BY_ID`). */
export interface SectQuestMsg {
  questId: string;
}
/** Client -> server: mua `qty` món `itemId` ở cửa hàng tông. */
export interface SectShopBuyMsg {
  itemId: string;
  qty: number;
}

function rec(raw: unknown): Record<string, unknown> | null {
  return raw === null || typeof raw !== "object" || Array.isArray(raw)
    ? null
    : (raw as Record<string, unknown>);
}

/** Đọc `sectQuestAccept` / `sectQuestTurnIn`: `questId` phải là nhiệm vụ tông CÓ THẬT (tra bằng `hasOwnProperty`), hoặc `null`. */
export function parseSectQuest(raw: unknown): SectQuestMsg | null {
  const r = rec(raw);
  const id = r?.questId;
  return typeof id === "string" && has(SECT_QUEST_BY_ID, id) ? { questId: id } : null;
}

/** Đọc `sectShopBuy`: món CÓ TRONG `SECT_SHOP`, số lượng nguyên 1..`SECT_SHOP_QTY_MAX`, hoặc `null`. */
export function parseSectShopBuy(raw: unknown): SectShopBuyMsg | null {
  const r = rec(raw);
  if (!r) return null;
  const id = r.itemId;
  const qty = r.qty;
  if (typeof id !== "string" || !has(SECT_SHOP_BY_ITEM, id)) return null;
  if (typeof qty !== "number" || !Number.isSafeInteger(qty) || qty < 1 || qty > SECT_SHOP_QTY_MAX)
    return null;
  return { itemId: id, qty };
}

/** `sectHallGet` không mang dữ liệu (chỉ xin ảnh chụp mới): nhận `undefined`, `null` hoặc object (trường thừa bị bỏ). */
export function parseSectHallGet(raw: unknown): boolean {
  return raw === undefined || raw === null || rec(raw) !== null;
}

// ---------- Ảnh chụp "Nội vụ" (server -> client) ----------

export type SectHallQuestState = "offer" | "active" | "done";

/** Một nhiệm vụ tông hôm nay của CHÍNH người nhận (tiến độ bước đi theo `QuestsMsg` có sẵn). */
export interface SectHallQuest {
  /** Id cụ thể (bản theo bậc của người nhận) */
  questId: string;
  title: string;
  desc: string;
  difficulty: 1 | 2 | 3;
  /** Cống hiến thưởng */
  ch: number;
  state: SectHallQuestState;
}

/** Một món cửa hàng kèm trạng thái của người nhận. */
export interface SectShopItemView {
  itemId: string;
  cost: number;
  minLevel: number;
  limitDay: number;
  hall: SectShopHall;
  /** Còn mua được bao nhiêu hôm nay (theo hạn mức) */
  left: number;
  /** Lý do chưa mua được; `null` = mua được */
  locked: SectShopLock | null;
}

/** Cống hiến của CHÍNH người nhận. */
export interface SectHallMe {
  contrib: number;
  merit: number;
  /** Đã kiếm hôm nay, 0..`earnCap` */
  earnedToday: number;
  earnCap: number;
  /** Còn kiếm được bằng góp kho hôm nay */
  depositLeft: number;
  /** Từ lúc nào (ms) kiếm được cống hiến; 0 = được ngay (chưa tới thì client hiện "ngày mai mới kiếm được") */
  earnFromAt: number;
}

/** Ảnh chụp "Nội vụ" của tông môn gửi từng thành viên. Gửi lúc vào phòng, khi ĐỔI, và khi xin bằng `sectHallGet` (KHÔNG tự đẩy lúc nửa đêm). */
export interface SectHallView {
  /** Đồng hồ máy chủ (ms) lúc dựng ảnh: client đếm ngược theo đó, không dựa đồng hồ máy */
  now: number;
  /** 00:00 giờ Việt Nam kế tiếp (ms): mốc đặt lại nhiệm vụ / hạn mức / trần ngày */
  resetAt: number;
  level: number;
  points: number;
  /** Điểm bắt đầu của cấp hiện tại */
  pointsFrom: number;
  /** Điểm cần để lên cấp kế; `null` = cấp cao nhất */
  pointsNext: number | null;
  buff: SectBuff;
  caps: { members: number; elders: number; vaultSlots: number };
  me: SectHallMe;
  quests: SectHallQuest[];
  shop: SectShopItemView[];
}

/** Server -> client. `hall: null` = không (còn) ở tông môn nào. */
export interface SectHallMsg {
  hall: SectHallView | null;
}

/**
 * Ảnh chụp MẪU (không có tông môn thật) cho chế độ `?sectHall=mock` của giao diện và cho test: khớp kiểu thật, tất định theo `level` và `now`.
 * Mỗi cấp có đủ trạng thái đại diện (đủ / thiếu cống hiến, món khoá theo cấp, nhiệm vụ mới / đang làm / xong).
 */
export function sampleSectHall(level: number, now = 1_780_000_000_000): SectHallView {
  const info = sectLevelInfo(level);
  const next = SECT_LEVELS[info.level] ?? null;
  const day = sectDayState(null, now);
  const pointsNow =
    info.points + Math.floor(((next?.points ?? info.points + 1000) - info.points) / 3);
  const slots = sectQuestSlots("mau", day.day);
  const quests: SectHallQuest[] = slots.flatMap((tid, i) => {
    const questId = sectQuestFor(tid, 1);
    const tpl = SECT_QUESTS.find((t) => t.id === tid);
    if (!questId || !tpl) return [];
    return [
      {
        questId,
        title: tpl.title,
        desc: tpl.desc,
        difficulty: tpl.difficulty,
        ch: SECT_QUEST_CH[tpl.difficulty - 1]!,
        state: i === 0 ? ("done" as const) : i === 1 ? ("active" as const) : ("offer" as const),
      },
    ];
  });
  const contrib = 36;
  const shop: SectShopItemView[] = SECT_SHOP.map((e) => {
    const ctx = { level: info.level, contrib, boughtToday: 0, known: false };
    return {
      itemId: e.itemId,
      cost: e.cost,
      minLevel: e.minLevel,
      limitDay: e.limitDay,
      hall: e.hall,
      left: e.limitDay,
      locked: sectShopLock(e, ctx),
    };
  });
  return {
    now,
    resetAt: sectResetAt(now),
    level: info.level,
    points: pointsNow,
    pointsFrom: info.points,
    pointsNext: next ? next.points : null,
    buff: sectBuffOf(info.level),
    caps: { members: info.maxMembers, elders: info.maxElders, vaultSlots: info.vaultSlots },
    me: {
      contrib,
      merit: 120,
      earnedToday: 50,
      earnCap: SECT_EARN_DAY_CAP,
      depositLeft: SECT_DEPOSIT_DAY_CAP,
      earnFromAt: 0,
    },
    quests,
    shop,
  };
}
