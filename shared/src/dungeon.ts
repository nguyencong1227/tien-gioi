// Bí cảnh: hợp đồng giữa client và server (M3 bước 4, docs/THIET_KE_BI_CANH.md; PR 4a chỉ có hợp đồng, chưa có mã server).
//
// Bí cảnh là phòng TẠM của MỘT đội (2-4 người): đội trưởng nói chuyện với Thủ môn ở Lạc Hà Trấn để mở, mỗi thành viên nhận
// lời mời và bước vào trong `DUNGEON_INVITE_MS`; trong phòng dọn quái nhỏ rồi hạ trùm trước hạn; thắng thì nhận thưởng, hết
// giờ / chết hết / rời hết thì phòng huỷ và mọi người về cổng vào.
//
// Luồng tin nhắn:
//  1. Client (đội trưởng) chọn "mở bí cảnh" ở hộp thoại Thủ môn -> `dialogAction { kind: "dungeon", dungeonId }`. Server kiểm
//     (`canOpenDungeon` ở đây là bản chung để client ẩn nút; SERVER kiểm lại mọi thứ), tạo run + phòng, rồi gửi
//     `dungeonInvite` cho từng thành viên đang online (dù đang ở bản đồ nào).
//  2. Mỗi thành viên bấm "Vào" -> `dungeonEnter { runId }`, hoặc "Từ chối" -> `dungeonDecline { runId }` (server báo đội
//     trưởng ngay bằng thông báo hệ thống; mọi người được mời đều từ chối mà chưa ai vào thì run huỷ sớm, đội trưởng nhận
//     `dungeonEnd { reason: "declined" }`). Server kiểm lại, LƯU nhân vật với chỗ xuất hiện = chỗ vào ở Lạc
//     Hà (không bao giờ lưu vị trí trong bí cảnh), đưa ra khỏi phòng cũ và gửi `travelTo { mapId, roomId }`: client vào bằng
//     `joinById(roomId)` (client không tạo được phòng bí cảnh bằng `joinOrCreate`).
//  3. Trong phòng server gửi `dungeonState` (mỗi giây và khi đổi pha) cho HUD; kết thúc gửi `dungeonEnd`, rồi `travelTo`
//     về Lạc Hà (không có `roomId`). Rời sớm: client gửi `dungeonLeave {}`.
// Phòng bí cảnh từ chối người không có tên trong danh sách thành viên của run: `ServerError(JOIN_NOT_IN_RUN)`.
import { DEFAULT_MAP_ID, LINH_HU_MAP_ID } from "./map";
import { dayKey } from "./quests";

// ---------- Hằng số (thời gian tính bằng ms) ----------

/** Thành viên có chừng này để bấm "Vào" sau khi đội trưởng mở; hết hạn mà chưa ai vào thì run huỷ. */
export const DUNGEON_INVITE_MS = 60_000;
/** Sau khi hạ trùm, mở chừng này để nhặt đồ rồi đưa mọi người về cổng vào. */
export const DUNGEON_LOOT_MS = 60_000;
/** Hồi chiêu mở bí cảnh của một đội trưởng (chống bấm liên tục). */
export const DUNGEON_OPEN_COOLDOWN_MS = 5_000;
/** Tổng số run đang mở tối đa trong một tiến trình (giữ ngân sách tick). Đầy thì không mở thêm. */
export const MAX_DUNGEON_RUNS = 10;
/** Mỗi nhân vật nhận thưởng hoàn thành tối đa chừng này lần mỗi ngày (vẫn vào được khi hết lượt, chỉ không có thưởng). */
export const DUNGEON_DAILY_REWARDS = 3;
/** Gửi `dungeonState` tối đa chừng này mỗi lần (ms): 1 lần / giây, không mỗi tick. */
export const DUNGEON_STATE_MS = 1000;

/** Mã lỗi vào phòng: không có tên trong danh sách thành viên của run, hoặc run đã hết hạn / đã kết thúc. */
export const JOIN_NOT_IN_RUN = 422;

// ---------- Định nghĩa bí cảnh ----------

export interface DungeonRewardItem {
  readonly itemId: string;
  readonly qty: number;
  /** Xác suất nhận (0..1], tung riêng cho từng thành viên đủ điều kiện */
  readonly chance: number;
}

export interface DungeonReward {
  /** Linh thạch cố định cho mỗi thành viên đủ điều kiện */
  readonly coin: number;
  readonly items: readonly DungeonRewardItem[];
}

export interface DungeonDef {
  readonly id: string;
  readonly name: string;
  /** Bản đồ bí cảnh (`DUNGEON_MAPS`) */
  readonly mapId: string;
  /** Bản đồ có Thủ môn và là chỗ về khi hết run */
  readonly entryMapId: string;
  /** Cỡ đội mở được: `partyMin <= số thành viên <= partyMax` */
  readonly partyMin: number;
  readonly partyMax: number;
  /** Bậc tu (`stepOf(realm, tier)`) tối thiểu của MỌI thành viên */
  readonly minStep: number;
  /** Đồng hồ chạy từ lúc người đầu tiên vào phòng */
  readonly timeLimitMs: number;
  /** `MonsterKind.id` của trùm (đúng một con, `MapDef.monsterCap` của bản đồ bí cảnh khai báo) */
  readonly boss: string;
  readonly reward: DungeonReward;
}

export const LINH_HU_ID = "linh_hu";

/**
 * Bảng bí cảnh. SỐ LIỆU THƯỞNG VÀ NGƯỠNG LÀ TẠM: A cân bằng ở PR 4c (`docs/CAN_BANG.md`) với mục tiêu một lượt thưởng
 * bằng ~15-20 phút săn quái cùng bậc, để bí cảnh là một lựa chọn chứ không phải đường duy nhất.
 */
export const DUNGEONS: readonly DungeonDef[] = [
  {
    id: LINH_HU_ID,
    name: "Linh Hư Bí Cảnh",
    mapId: LINH_HU_MAP_ID,
    entryMapId: DEFAULT_MAP_ID,
    partyMin: 2,
    partyMax: 4,
    minStep: 9, // `stepOf(1, 8)` = Luyện Khí Tầng 9 (Phàm Nhân chiếm bậc 0): số tạm
    timeLimitMs: 12 * 60_000,
    boss: "yeu_vuong",
    reward: {
      coin: 400,
      items: [
        { itemId: "tu_khi_dan", qty: 2, chance: 1 },
        { itemId: "vay_mang", qty: 3, chance: 0.6 },
        { itemId: "xich_lan_bao", qty: 1, chance: 0.1 },
      ],
    },
  },
];

const DUNGEON_BY_ID: Readonly<Record<string, DungeonDef>> = Object.fromEntries(
  DUNGEONS.map((d) => [d.id, d]),
);

/** Bí cảnh theo id; id lạ / sai kiểu (có thể đến từ client) trả `undefined` (`DUNGEON_BY_ID["constructor"]` không). */
export function dungeonOf(id: unknown): DungeonDef | undefined {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(DUNGEON_BY_ID, id)
    ? DUNGEON_BY_ID[id]
    : undefined;
}

/** Bí cảnh dùng bản đồ `mapId` (để phòng biết mình là bí cảnh nào); không có thì `undefined`. */
export function dungeonOfMap(mapId: unknown): DungeonDef | undefined {
  return typeof mapId === "string" ? DUNGEONS.find((d) => d.mapId === mapId) : undefined;
}

// ---------- Tin nhắn ----------

/** Tên tin nhắn Colyseus của bí cảnh. */
export const DUNGEON_MSG = {
  enter: "dungeonEnter",
  leave: "dungeonLeave",
  decline: "dungeonDecline",
  invite: "dungeonInvite",
  state: "dungeonState",
  end: "dungeonEnd",
} as const;
// (Mở bí cảnh đi qua tin `dialogAction` có sẵn với `{ kind: "dungeon", dungeonId }`: quests.ts `DialogAction`.)

/** Run id: 128 bit ngẫu nhiên, hex thường (32 ký tự). Đoán không được; server kiểm thành viên ở cả `dungeonEnter` và `onAuth`. */
export const RUN_ID_RE = /^[a-f0-9]{32}$/;

/** Client -> server: bước vào run đã được mời. */
export interface DungeonEnterMsg {
  runId: string;
}

/** Client -> server: từ chối lời mời (đóng hộp mời; server báo đội trưởng sớm thay vì để họ đợi hết `DUNGEON_INVITE_MS`). */
export interface DungeonDeclineMsg {
  runId: string;
}

/** Client -> server: rời bí cảnh sớm (về cổng vào). Không có trường nào. */
export type DungeonLeaveMsg = Record<string, never>;

/** Đọc tin `{ runId }` từ mạng: sai kiểu / runId sai dạng thì `null`. Chỉ lấy đúng `runId`, không mang trường lạ. */
function parseRunIdMsg(raw: unknown): { runId: string } | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = (raw as Record<string, unknown>).runId;
  return typeof id === "string" && RUN_ID_RE.test(id) ? { runId: id } : null;
}

/** Đọc `dungeonEnter` từ mạng: sai kiểu / runId sai dạng thì `null` (server bỏ qua, tính vào hạn mức tin nhắn). */
export function parseDungeonEnter(raw: unknown): DungeonEnterMsg | null {
  return parseRunIdMsg(raw);
}

/** Đọc `dungeonDecline` từ mạng (cùng luật với `parseDungeonEnter`). */
export function parseDungeonDecline(raw: unknown): DungeonDeclineMsg | null {
  return parseRunIdMsg(raw);
}

/** Server -> client: lời mời vào run (gửi cho từng thành viên đang online). */
export interface DungeonInviteMsg {
  runId: string;
  dungeonId: string;
  /** Đạo hiệu đội trưởng */
  from: string;
  /** Còn bao nhiêu ms để bấm "Vào" (đồng hồ của server; client đếm ngược theo đó) */
  expiresInMs: number;
  /** Lượt nhận thưởng hoàn thành còn lại HÔM NAY của người nhận (`dungeonRewardsLeft`, 0..`DUNGEON_DAILY_REWARDS`), để hộp mời báo trước */
  rewardsLeft: number;
}

export type DungeonPhase = "gathering" | "running" | "won" | "lost";

export interface DungeonMemberView {
  name: string;
  alive: boolean;
}

/** Server -> client (trong phòng bí cảnh): trạng thái cho HUD, mỗi `DUNGEON_STATE_MS` và khi đổi pha. */
export interface DungeonStateMsg {
  phase: DungeonPhase;
  /** Còn bao nhiêu ms tới hạn của pha hiện tại (hết giờ chạy / hết giờ nhặt đồ) */
  deadlineInMs: number;
  /** Quái nhỏ còn lại (không tính trùm) */
  mobsLeft: number;
  /** Trùm: máu hiện tại / tối đa; `null` khi trùm đã chết */
  boss: { hp: number; maxHp: number } | null;
  members: DungeonMemberView[];
}

/**
 * Lý do run kết thúc. `no_entry` (hết `DUNGEON_INVITE_MS` mà không ai vào) và `declined` (mọi người được mời đều từ chối)
 * là run huỷ TRƯỚC khi có phòng: chỉ gửi cho đội trưởng (đang ở ngoài), client hiện thông báo chứ không mở màn kết quả.
 */
export type DungeonEndReason =
  "boss_dead" | "timeout" | "all_dead" | "all_left" | "no_entry" | "declined";

/** Vì sao một người thắng mà KHÔNG nhận thưởng hoàn thành (để màn kết quả giải thích, không để người chơi thắc mắc). */
export type DungeonNoReward = "daily_limit" | "no_damage";

/**
 * Server -> client: run kết thúc. `reward` chỉ có khi thắng VÀ nhân vật này đủ điều kiện nhận thưởng hôm nay; thắng mà
 * không có `reward` thì `noReward` nói rõ lý do. `rewardsLeft` là lượt thưởng còn lại hôm nay của người nhận SAU run này.
 */
export interface DungeonEndMsg {
  result: "won" | "lost";
  reason: DungeonEndReason;
  reward?: { coin: number; items: { itemId: string; qty: number }[] };
  noReward?: DungeonNoReward;
  rewardsLeft: number;
}

// ---------- Điều kiện mở (hàm thuần, client dùng để ẩn nút, server kiểm lại) ----------

/** Một thành viên của đội, nhìn từ người kiểm tra. */
export interface DungeonMemberCheck {
  /** Đạo hiệu (để báo ai chưa đủ điều kiện) */
  name: string;
  online: boolean;
  alive: boolean;
  /** `stepOf(realm, tier)` */
  step: number;
  /** Đang trong một run khác */
  inRun: boolean;
  /** Đang chờ nối lại sau khi rớt mạng (không nên bị kéo đi) */
  reconnecting: boolean;
}

export type DungeonOpenFail =
  | "unknown_dungeon"
  | "not_leader"
  | "party_small"
  | "party_big"
  | "member_offline"
  | "member_dead"
  | "member_reconnecting"
  | "member_in_run"
  | "member_low"
  | "full"
  | "cooldown";

export type DungeonOpenCheck = { ok: true } | { ok: false; reason: DungeonOpenFail; who?: string };

export interface DungeonOpenInput {
  def: DungeonDef | undefined;
  isLeader: boolean;
  members: readonly DungeonMemberCheck[];
  /** Số run đang mở trong tiến trình */
  runsOpen: number;
  /** Còn bao nhiêu ms hồi chiêu mở của đội trưởng (0 = sẵn sàng) */
  cooldownLeftMs: number;
}

/**
 * Mở được bí cảnh không? Thứ tự kiểm cố định (test giữ) để mọi nơi báo cùng một lý do. Mọi thành viên phải đủ điều kiện;
 * thành viên đầu tiên vi phạm được báo tên trong `who`.
 */
export function canOpenDungeon(i: DungeonOpenInput): DungeonOpenCheck {
  const d = i.def;
  if (!d) return { ok: false, reason: "unknown_dungeon" };
  if (!i.isLeader) return { ok: false, reason: "not_leader" };
  const n = i.members.length;
  if (n < d.partyMin) return { ok: false, reason: "party_small" };
  if (n > d.partyMax) return { ok: false, reason: "party_big" };
  for (const m of i.members) {
    if (!m.online) return { ok: false, reason: "member_offline", who: m.name };
    if (m.reconnecting) return { ok: false, reason: "member_reconnecting", who: m.name };
    if (!m.alive) return { ok: false, reason: "member_dead", who: m.name };
    if (m.inRun) return { ok: false, reason: "member_in_run", who: m.name };
    if (!(m.step >= d.minStep)) return { ok: false, reason: "member_low", who: m.name };
  }
  if (!(i.runsOpen < MAX_DUNGEON_RUNS)) return { ok: false, reason: "full" };
  if (i.cooldownLeftMs > 0) return { ok: false, reason: "cooldown" };
  return { ok: true };
}

/** Câu báo cho người chơi (toast). Không lộ chi tiết nội bộ. */
export function dungeonOpenFailMessage(reason: DungeonOpenFail, who?: string): string {
  const w = who ? ` (${who})` : "";
  switch (reason) {
    case "unknown_dungeon":
      return "Bí cảnh này không tồn tại.";
    case "not_leader":
      return "Chỉ đội trưởng mới mở được bí cảnh.";
    case "party_small":
      return "Đội chưa đủ người để mở bí cảnh.";
    case "party_big":
      return "Đội quá đông để vào bí cảnh này.";
    case "member_offline":
      return `Có thành viên đang ngoại tuyến${w}.`;
    case "member_reconnecting":
      return `Có thành viên đang chờ nối lại${w}.`;
    case "member_dead":
      return `Có thành viên đang trọng thương${w}.`;
    case "member_in_run":
      return `Có thành viên đang ở trong một bí cảnh khác${w}.`;
    case "member_low":
      return `Có thành viên chưa đủ cảnh giới${w}.`;
    case "full":
      return "Bí cảnh đang đông người, hãy thử lại sau.";
    case "cooldown":
      return "Đợi một lát rồi hãy mở lại.";
  }
}

// ---------- Thưởng ----------

/** Một thành viên có được tính thưởng khi trùm chết không: còn sống, đang trong phòng, và đã gây sát thương cho trùm. */
export function rewardEligible(i: { alive: boolean; present: boolean; damage: number }): boolean {
  return i.alive && i.present && Number.isFinite(i.damage) && i.damage > 0;
}

/** Bộ đếm thưởng theo ngày của một nhân vật (trường `dungeonDaily` trong file lưu, qua hàm làm sạch ở server). */
export interface DungeonDaily {
  /** `dayKey` (giờ Việt Nam) của ngày đang đếm */
  day: string;
  /** Số lần đã nhận thưởng hoàn thành trong ngày đó */
  rewards: number;
}

/** Còn bao nhiêu lượt nhận thưởng hôm nay (`now` ms). Bộ đếm của ngày khác coi như chưa dùng; không có thì đủ lượt. */
export function dungeonRewardsLeft(daily: DungeonDaily | undefined, now: number): number {
  const used = daily && daily.day === dayKey(now) ? Math.max(0, Math.floor(daily.rewards)) : 0;
  return Math.max(0, DUNGEON_DAILY_REWARDS - (Number.isFinite(used) ? used : 0));
}
