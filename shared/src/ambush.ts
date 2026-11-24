// GẶP CHẶN ĐƯỜNG khi di chuyển (QUYET_DINH_M3 mục 52, docs/THIET_KE_CHAN_DUONG.md, issue CD1 #1061): hợp đồng giữa client và server.
// Chỉ có HẰNG SỐ, KIỂU TIN, hàm THUẦN (giá, xác suất, đọc tin từ mạng) và dữ liệu MẪU cho giao diện; mã server (kích hoạt, đấu trường) là CD2 / CD3, dữ liệu
// văn mẫu + kẻ chặn đường ở `ambush-data.ts` (E / G nhập), số cân bằng chốt ở CD6 (D).
//
// Luồng (server quyết định mọi kết quả; client chỉ hiển thị và gửi ý định):
//  1. Đi ở vùng hoang đủ xa + xúc xắc trúng + đủ điều kiện (server, `ambushBlocked`) -> `ambushOffer` (CHỈ cho người bị chặn): văn mẫu, kẻ chặn đường, GIÁ bỏ chạy trước
//     trận, đếm ngược `AMBUSH_OFFER_MS`. Trong lúc chờ nhân vật đứng yên, quái bỏ mục tiêu.
//  2. Client gửi `ambushChoose { id, choice }`; hết giờ = `fight`. `flee_*`: trừ giá -> lưu -> `ambushEnd { result: "fled" }`. `fight`: server dựng đấu trường solo
//     (`ARENA_MAPS`) rồi gửi `travelTo { mapId, roomId }` như bí cảnh.
//  3. Trong đấu trường: `ambushState` mỗi giây (thời gian còn, GIÁ bỏ chạy giữa trận; máu kẻ địch KHÔNG ở đây: đã có trong `state.monsters`); nút Bỏ chạy = `ambushFlee { choice }`.
//  4. Kết thúc: `ambushEnd { result, paid?, rewards? }`; rồi server đưa về ĐÚNG chỗ cũ trên bản đồ gốc.
// Giá hiện trên nút LÀ GIÁ BỊ TRỪ: máy chủ CHỐT giá lúc gửi `ambushOffer` / `ambushState` (gắn với `id` đề nghị), `ambushChoose` / `ambushFlee` trừ ĐÚNG số đã chốt, chỉ kiểm lại ví còn đủ
// (client không gửi số nào; không tính lại theo trạng thái lúc nhận vì tu vi có thể đổi trong lúc chờ).
// Nối lại mạng giữa chừng: máy chủ ĐÓNG BĂNG đồng hồ (hộp thoại / trận) tối đa `AMBUSH_DROP_GRACE_S`; sau khi nối lại máy chủ gửi LẠI `ambushOffer` (CÙNG `id`, `ms` còn lại THẬT) hoặc
// `ambushState` (trong đấu trường). Client coi cùng `id` là CẬP NHẬT hộp thoại đang mở (không dựng lại; có thể gửi lại `ambushSeen` cho cùng `id`: máy chủ chỉ đặt cờ "đã thấy", gửi nhiều lần vô hại); hết đồng hồ cục bộ mà chưa có tin mới thì KHÔNG tự chọn
// (máy chủ mới là bên quyết): hiện "đang chờ máy chủ".

import { NET_RECONNECT_GRACE_S } from "./net-guard";

// ---------- Hằng số (thời gian ms, khoảng cách px) ----------

/** Phiên bản giao thức tối thiểu của client để được kích hoạt chặn đường (client cũ không có hộp thoại: đứng chờ rồi vào trận không nút bỏ chạy). 6 = bản đầu tiên có giao diện hộp thoại (CD7; client v5 đang chạy thật không có); CD10 chốt lại khi bật `AMBUSH`. */
export const AMBUSH_MIN_PROTOCOL = 6;
/** Hộp thoại mở bấy lâu không chọn = `fight`. */
export const AMBUSH_OFFER_MS = 10_000;
/** Một trận tối đa chừng này; hết giờ là THUA (mất giá giữa trận, không thưởng). */
export const AMBUSH_TIME_MS = 120_000;
/** Sau khi thắng / thua: xem kết quả (và nhặt đồ rơi) chừng này rồi đưa về chỗ cũ. */
export const AMBUSH_EXIT_MS = 4_000;
/**
 * Bị hạ khi KHÔNG bật luân hồi (bản thử / bench): nằm chừng này rồi đứng dậy (như `DUNGEON_FALL_EXIT_MS`). Từ QUYET_DINH_M3 mục 53 (17/11): khi luân hồi BẬT (bản chạy thật) bị hạ trong đấu trường
 * = CHẾT THẬT (Hoàng Tuyền, mất kiếp), không còn nằm rồi đứng dậy.
 */
export const AMBUSH_FALL_MS = 3_000;
/**
 * BỎ CHẠY GIỮA TRẬN luôn bấm được (mục 53, kể cả khi đang bị khống chế) nhưng cần VẬN chừng này (ms) rồi mới thoát và trừ giá: không lách được đòn đang ra bằng cách bấm đúng lúc. Trong lúc vận
 * người chơi KHÔNG bất khả xâm phạm: bị hạ giữa chừng thì chết thật và KHÔNG trừ giá. Bấm lần hai khi đang vận bị bỏ qua.
 */
export const AMBUSH_FLEE_CHANNEL_MS = 1_000;
/**
 * Trần CẤP (`MonsterKind.level`) của loài kẻ chặn đường theo cảnh giới tối thiểu của bầy (mục 53: đối thủ không mạnh vượt cảnh giới người chơi). Phàm Nhân 1 (Sói Hoang), Luyện Khí 7 (Hắc Hổ), Trúc Cơ 12 (Xích Mãng),
 * Kim Đan 15 (Độc Thiềm), Nguyên Anh 18 (Độc Tước, Hắc Giao). `ambushViolations` bắt bầy có loài cấp cao hơn trần của cảnh giới của `minStep`; cảnh giới chưa liệt kê (Hóa Thần trở lên) thì
 * không có bầy hợp lệ (đòi khai báo trần trước khi thêm nội dung).
 */
export const AMBUSH_FOE_LEVEL_CAP: Readonly<Record<number, number>> = {
  0: 1,
  1: 7,
  2: 12,
  3: 15,
  4: 18,
};
/** Bảo hộ sau khi về chỗ cũ (quái quanh đó không nhắm, không đánh được). */
export const AMBUSH_RETURN_GRACE_MS = 5_000;
/**
 * Rớt mạng (lúc hộp thoại hoặc trong đấu trường): giữ nguyên trạng chờ nối lại CHỪNG NÀY (giây) = đúng bảo vệ mất kết nối chung (mục 33, `NET_RECONNECT_GRACE_S`; yêu cầu gốc
 * của người dùng "tôn trọng bảo vệ mất kết nối"). Trong lúc chờ: đồng hồ hộp thoại / trận ĐÓNG BĂNG, kẻ địch bỏ mục tiêu, người chơi bất khả xâm phạm. Quá hạn mới trả giá.
 */
export const AMBUSH_DROP_GRACE_S = NET_RECONNECT_GRACE_S;
/** Hộp thoại phải được client XÁC NHẬN ĐÃ THẤY (`ambushSeen`) trong chừng này, không thì HUỶ lặng lẽ (không phạt, vẫn vào hồi): người đang vắng mặt không bị kéo vào trận. */
export const AMBUSH_SEEN_MS = 4_000;
/** Lựa chọn đến sớm hơn chừng này sau lúc dựng hộp thoại bị BỎ QUA (ngón tay đang bấm / giữ cần điều khiển đúng chỗ nút: không phạt, không đổi trạng thái). */
export const AMBUSH_ARM_MS = 700;
/** Trong đấu trường: không có đầu vào nào (di chuyển / chiêu / đánh) trong chừng này từ đầu trận mà bị hạ / hết giờ -> tính như ĐẦU HÀNG: giá hộp thoại, không phải giá giữa trận. */
export const AMBUSH_IDLE_MS = 15_000;
/** Cứ đi được chừng này (px, quãng THẬT ở vùng hoang) thì tung xúc xắc MỘT lần. */
export const AMBUSH_STRIDE_PX = 1200;
/** Xác suất mỗi lần tung: rìa trấn (`danger` 0) tới sâu trong hoang (`danger` 1). TẠM: CD6 (D) chốt bằng đo tốc độ thật (mục tiêu ~10 phút đi bộ / lần). */
export const AMBUSH_ROLL_P_MIN = 0.02;
export const AMBUSH_ROLL_P_MAX = 0.05;
/** Hồi tối thiểu giữa hai lần chặn đường (tính từ lúc lần trước kết thúc). */
export const AMBUSH_COOLDOWN_MS = 8 * 60_000;
/** Vừa vào game / đăng nhập lại: chưa bị chặn trong chừng này (chống "đăng nhập để reset hồi"). */
export const AMBUSH_LOGIN_COOLDOWN_MS = 3 * 60_000;
/** Số lần chặn đường tối đa mỗi ngày mỗi nhân vật (hết thì không chặn nữa: chống cày bằng đi lại). */
export const AMBUSH_DAY_CAP = 12;
/** Khí huyết dưới ngưỡng này (%) thì KHÔNG chặn (cho cơ hội hồi). */
export const AMBUSH_MIN_HP_PCT = 30;
/** Đánh / bị đánh trong chừng này thì coi là đang giao chiến: không chặn. */
export const AMBUSH_CALM_MS = 8_000;
/** Vừa đầu thai: chưa bị chặn trong chừng này. */
export const AMBUSH_AFTER_REBIRTH_MS = 60_000;
/** Số đấu trường solo tối đa cùng lúc trong một tiến trình (đầy thì lần tung đó bỏ). */
export const MAX_AMBUSH_ROOMS = 20;
/** Số kẻ địch tối đa trong một bầy. */
export const AMBUSH_FOE_COUNT_MAX = 3;

// ---------- Mức kẻ địch ----------

/** `normal` = quái thường (1-2 con); `elite` = tinh anh (nhân `ELITE_*`); `leader` = kẻ cầm đầu (khung trùm nhỏ, mục 42, kèm 0-2 lính). */
export const AMBUSH_TIERS = ["normal", "elite", "leader"] as const;
export type AmbushTier = (typeof AMBUSH_TIERS)[number];

/** Trọng số chọn mức (cộng lại = 100). TẠM: CD6 chốt. */
export const AMBUSH_TIER_WEIGHTS: Readonly<Record<AmbushTier, number>> = {
  normal: 70,
  elite: 25,
  leader: 5,
};

/** Mức hợp lệ? (sai kiểu / lạ là `false`; tra thuộc tính RIÊNG qua mảng, không qua `in`.) */
export function isAmbushTier(v: unknown): v is AmbushTier {
  return typeof v === "string" && (AMBUSH_TIERS as readonly string[]).includes(v);
}

// ---------- Xác suất ----------

/** Xác suất trúng mỗi lần tung ở độ nguy hiểm `danger` (0..1, `GameMap.dangerAt`): nội suy `MIN`..`MAX`; không phải số hữu hạn -> `MIN`. Thuần. */
export function ambushRollP(danger: unknown): number {
  const d =
    typeof danger === "number" && Number.isFinite(danger) ? Math.min(1, Math.max(0, danger)) : 0;
  return AMBUSH_ROLL_P_MIN + (AMBUSH_ROLL_P_MAX - AMBUSH_ROLL_P_MIN) * d;
}

// ---------- Giá bỏ chạy ----------

/** Thời điểm tính giá: `offer` (hộp thoại, trước trận) hoặc `mid` (giữa trận / thua / hết giờ / rớt mạng). */
export type AmbushPriceStage = "offer" | "mid";

/**
 * Tu vi / PHÚT của người săn quái tốt nhất ở từng bậc (thang `stepOf`, 0 = Phàm Nhân ... 18 = Nguyên Anh tầng cuối): thước đo chung cho giá bỏ chạy và thưởng thắng, để "N phút" nghĩa là
 * N phút săn quái ở CHÍNH bậc đó (thời gian săn đầy một thanh tu vi khác nhau tới ~160 lần giữa Luyện Khí và Nguyên Anh nên giá theo % thanh không dùng được: 5% thanh = 0,3 phút săn ở
 * Luyện Khí tầng 3 nhưng 48 phút ở Nguyên Anh tầng cuối). SINH từ mô phỏng (`bestOption` của `server/src/balance/simulate.ts`): `chan-duong.test.ts` buộc bảng này khớp bản sinh, đổi số liệu quái / đồ
 * làm lệch thì test đỏ và in ra bảng đúng để dán lại.
 */
export const AMBUSH_HUNT_EXP_PER_MIN: readonly number[] = [
  30, 48, 51, 54, 57, 59, 89, 107, 113, 120, 134, 139, 124, 507, 523, 536, 552, 475, 396,
];

/** Tu vi / phút săn ở bậc `step` (kẹp vào bảng: bậc ngoài bảng lấy bậc gần nhất; không phải số hữu hạn -> bậc 0). Thuần. */
export function ambushHuntExpPerMin(step: unknown): number {
  const s = Math.min(wholeNonNeg(step), AMBUSH_HUNT_EXP_PER_MIN.length - 1);
  return AMBUSH_HUNT_EXP_PER_MIN[s];
}

/**
 * Linh thạch / phút của người săn quái tốt nhất ở từng bậc (thang `stepOf`, 0 = Phàm Nhân ... 18 = Nguyên Anh tầng cuối): thước đo chung cho giá bỏ chạy và thưởng thắng
 * Linh thạch, để "N phút" nghĩa là N phút săn quái ở CHÍNH bậc đó (giống `AMBUSH_HUNT_EXP_PER_MIN` cho tu vi). SINH từ cùng mô phỏng (`monsterEconomy.totalCoinPerHour / 60`
 * của người săn quái tốt nhất mỗi bậc trong `server/src/balance/simulate.ts`: best coin hunter = best exp hunter ở mọi bậc, nên tỉ lệ coin/tu vi gần như không đổi theo bậc);
 * `chan-duong.test.ts` buộc bảng này khớp bản sinh, đổi số liệu quái / đồ làm lệch thì test đỏ và in ra bảng đúng để dán lại. CD6b chốt (comment #1066 7078639156).
 */
export const AMBUSH_HUNT_COIN_PER_MIN: readonly number[] = [
  18, 23, 25, 27, 28, 30, 50, 63, 68, 73, 84, 87, 91, 264, 274, 281, 290, 294, 297,
];

/** Linh thạch / phút săn ở bậc `step` (kẹp vào bảng: bậc ngoài bảng lấy bậc gần nhất; không phải số hữu hạn -> bậc 0). Thuần. */
export function ambushHuntCoinPerMin(step: unknown): number {
  const s = Math.min(wholeNonNeg(step), AMBUSH_HUNT_COIN_PER_MIN.length - 1);
  return AMBUSH_HUNT_COIN_PER_MIN[s];
}

/**
 * Giá TU VI khi bỏ chạy, tính bằng PHÚT SĂN (`ambushHuntExpPerMin`) của bậc hiện tại, theo thời điểm. Luôn NHỎ HƠN thưởng thắng của mức thấp nhất (`AMBUSH_REWARD_MIN.normal` = 4 phút): thắng luôn
 * lợi hơn bỏ chạy và người chơi đang yếu không bị dồn vào "Chiến" vì bỏ chạy đắt hơn cả thưởng (thua = chết thật, mục 53). CD6b chốt.
 */
export const AMBUSH_EXP_PRICE_MIN: Readonly<Record<AmbushPriceStage, number>> = {
  offer: 2,
  mid: 3,
};

/**
 * Thưởng TU VI khi thắng, tính bằng PHÚT SĂN của bậc người chơi, theo mức kẻ địch (không phụ thuộc số con trong bầy: bầy đã được chọn để trận dài 30-70 giây và tỉ lệ thắng đạt mục tiêu,
 * nên công sức / rủi ro giữa các bầy cùng mức xấp xỉ nhau). Trộn theo `AMBUSH_TIER_WEIGHTS` ~ 4,8 phút / lần chặn: so với khoảng ~15 phút giữa hai lần chặn (`ambushIntervalMin`) là tăng
 * ~30% tu vi / phút (mục tiêu 20-40%, KHÔNG hơn bí cảnh). CD6b chốt bằng đo (docs/THIET_KE_CHAN_DUONG.md mục 9).
 */
export const AMBUSH_REWARD_MIN: Readonly<Record<AmbushTier, number>> = {
  normal: 4,
  elite: 6,
  leader: 10,
};

/** Thưởng tu vi của một trận thắng ở bậc `step`, mức `tier` (số nguyên >= 0). Mức lạ -> 0. Thuần. */
export function ambushRewardExp(step: unknown, tier: unknown): number {
  if (!isAmbushTier(tier)) return 0;
  return Math.round(AMBUSH_REWARD_MIN[tier] * ambushHuntExpPerMin(step));
}

/**
 * Thưởng LINH THẠCH khi thắng, tính bằng PHÚT SĂN của bậc người chơi, theo mức kẻ địch (cùng khuôn phút săn như `AMBUSH_REWARD_MIN` cho tu vi, KHÔNG nhân `ARENA_REWARD_MULT`,
 * KHÔNG `rollCoin`: đỡ gọi `Math.random` trong luồng tick). Trộn theo `AMBUSH_TIER_WEIGHTS` ~ 4,8 phút săn / lần chặn: thu nhập Linh thạch thêm từ chặn đường nằm trong 20-40% so
 * săn quái cùng bậc (khung kiểm ở `chan-duong.ts`, ⚠️ ngoài khung). Thắng luôn lợi hơn bỏ chạy (4/6/10 > 2/3 phút). CD6b chốt (comment #1066 7078639156).
 */
export function ambushRewardCoin(step: unknown, tier: unknown): number {
  if (!isAmbushTier(tier)) return 0;
  return Math.round(AMBUSH_REWARD_MIN[tier] * ambushHuntCoinPerMin(step));
}
/** Sàn của giá Linh thạch: bỏ chạy bằng Linh thạch không bao giờ rẻ hơn mức này (không thành "phí không đáng kể"). Nhỏ hơn mọi giá thật ở bậc hợp lệ nên chưa chạm tới. */
export const AMBUSH_FLEE_MIN_COIN = 5;

const wholeNonNeg = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/**
 * Giá TU VI khi bỏ chạy ở bậc `step`: `AMBUSH_EXP_PRICE_MIN[stage]` phút săn (`ambushHuntExpPerMin`), nhưng KHÔNG quá `expInBar` (tu vi đang có trong thanh: không bao giờ rớt cảnh giới,
 * không âm). Làm tròn xuống. Đầu vào sai (không hữu hạn / âm) coi là 0. Thuần.
 */
export function ambushExpPrice(step: unknown, expInBar: unknown, stage: AmbushPriceStage): number {
  const raw = Math.floor(AMBUSH_EXP_PRICE_MIN[stage] * ambushHuntExpPerMin(step));
  return Math.min(raw, wholeNonNeg(expInBar));
}

/**
 * Giá LINH THẠCH khi bỏ chạy ở bậc `step`: `AMBUSH_EXP_PRICE_MIN[stage]` phút săn (`ambushHuntCoinPerMin`) — offer 2 phút, mid 3 phút (cùng khuôn phút săn như giá tu vi, KHÔNG
 * còn hệ số x2 giữa trận). Không dưới `AMBUSH_FLEE_MIN_COIN`. Giữ chữ ký `(step, stage)` để server chốt giá gắn với lời đề nghị. Thuần.
 */
export function ambushCoinPrice(step: unknown, stage: AmbushPriceStage): number {
  const raw = Math.round(AMBUSH_EXP_PRICE_MIN[stage] * ambushHuntCoinPerMin(step));
  return Math.max(AMBUSH_FLEE_MIN_COIN, raw);
}

/** Giá Linh thạch kèm cờ đủ hay không: nút Linh thạch vẫn HIỆN giá khi không đủ (mờ, để người chơi biết cần bao nhiêu). */
export interface AmbushCoinPrice {
  price: number;
  enough: boolean;
}

/**
 * Giá hai cách trả. Giá trong `ambushOffer` / `ambushState` là giá máy chủ CHỐT lúc gửi (gắn với `id` đề nghị): `ambushChoose` / `ambushFlee` trừ ĐÚNG số này, không
 * tính lại theo trạng thái lúc nhận (giá hiện trên nút = giá bị trừ). Chỉ cần kiểm lại ví còn đủ.
 */
export interface AmbushPrice {
  exp: number;
  coin: AmbushCoinPrice;
}

/** Đầu vào để tính giá (server đọc từ nhân vật thật; không bao giờ lấy từ client). */
export interface AmbushPriceInput {
  /** Tu vi đang có trong thanh của cảnh giới hiện tại (giá tu vi không bao giờ vượt số này). */
  expInBar: number;
  /** Bậc trên thang cảnh giới (`stepOf`). */
  step: number;
  /** Số Linh thạch đang có (trong ví). */
  wallet: number;
}

/**
 * Cả hai giá ở thời điểm `stage`; `coin.enough` là `false` khi ví không đủ. Thuần.
 * `exp` BẰNG 0 khi thanh tu vi trống (vừa đột phá): luật máy chủ (CD2) là CHỈ cho nút "Bỏ chạy: trả tu vi" khi `exp > 0`; thanh trống thì chỉ còn nút Linh thạch (giá có sàn
 * `AMBUSH_FLEE_MIN_COIN`), để không thể giữ tu vi ở 0 rồi bỏ chạy mãi miễn phí. Client thấy `exp === 0` thì khoá nút tu vi (không hiện "miễn phí").
 */
export function ambushPrice(input: AmbushPriceInput, stage: AmbushPriceStage): AmbushPrice {
  const price = ambushCoinPrice(input.step, stage);
  return {
    exp: ambushExpPrice(input.step, input.expInBar, stage),
    coin: { price, enough: wholeNonNeg(input.wallet) >= price },
  };
}

// ---------- Tin nhắn ----------

/** Tên tin nhắn Colyseus của chặn đường. `offer` / `state` / `end` là server -> client (CHỈ người liên quan); `choose` / `seen` / `flee` là client -> server. */
export const AMBUSH_MSG = {
  offer: "ambushOffer",
  choose: "ambushChoose",
  state: "ambushState",
  seen: "ambushSeen",
  flee: "ambushFlee",
  end: "ambushEnd",
} as const;

/** id lời đề nghị: 64 bit ngẫu nhiên, hex thường (16 ký tự). Mỗi lời đề nghị dùng MỘT lần; server so với lời đang chờ. */
export const AMBUSH_OFFER_ID_RE = /^[a-f0-9]{16}$/;

/** Lựa chọn ở hộp thoại: đánh, hoặc bỏ chạy trả Linh thạch / tu vi. */
export const AMBUSH_CHOICES = ["fight", "flee_coin", "flee_exp"] as const;
export type AmbushChoice = (typeof AMBUSH_CHOICES)[number];
/** Cách trả khi bỏ chạy giữa trận (không có `fight`). */
export type AmbushFleeChoice = Exclude<AmbushChoice, "fight">;

/** Kẻ chặn đường hiện ở hộp thoại: tên hiển thị, mức, số lượng (client không biết `MonsterKind` nào để khỏi lộ bảng). */
export interface AmbushFoeInfo {
  name: string;
  tier: AmbushTier;
  count: number;
}

/**
 * Server -> client (chỉ người bị chặn): hộp thoại tình huống. `scene` là văn mẫu ĐÃ điền (không còn `{biến}`); `ms` = thời gian còn THẬT lúc gửi (gửi lại cùng `id` sau khi nối lại
 * mạng thì là bản cập nhật, xem chú thích đầu tệp); `price` là giá đã CHỐT.
 */
export interface AmbushOfferMsg {
  id: string;
  scene: string;
  foe: AmbushFoeInfo;
  price: AmbushPrice;
  ms: number;
}

/** Client -> server: chọn ở hộp thoại. */
export interface AmbushChooseMsg {
  id: string;
  choice: AmbushChoice;
}

/** Client -> server: bỏ chạy giữa trận (trong đấu trường). */
export interface AmbushFleeMsg {
  choice: AmbushFleeChoice;
}

/**
 * Server -> client (trong đấu trường, mỗi giây và khi đổi): thời gian còn (TƯƠNG ĐỐI) và giá bỏ chạy giữa trận (đã chốt). Máu kẻ địch KHÔNG nằm ở đây: đấu trường là một phòng thường,
 * `state.monsters` đã đồng bộ máu từng con (thanh máu dùng cái sẵn có).
 */
export interface AmbushStateMsg {
  msLeft: number;
  price: AmbushPrice;
  /**
   * Đang VẬN bỏ chạy giữa trận (mục 53): thời gian còn lại (ms, > 0) tới lúc thoát; VẮNG = không đang vận. Gửi lúc bắt đầu vận và mỗi giây; client hiện thanh "đang thoát..." và KHÔNG đổi chỗ
   * nút. Bị hạ giữa chừng thì vận huỷ (chết thật, không trừ giá).
   */
  fleeMs?: number;
}

/** Client -> server: "hộp thoại `id` đã THẤY" (gửi khi hộp thoại thật sự hiện và trang đang hiển thị). Không nhận trong `AMBUSH_SEEN_MS` thì huỷ (kết cục `canceled`). */
export interface AmbushSeenMsg {
  id: string;
}

/**
 * Kết cục: `won` (hạ hết), `fled` (bỏ chạy, ở hộp thoại hoặc giữa trận), `lost` (bị hạ), `timeout` (hết giờ), `dropped` (rớt mạng quá hạn chờ / thoát),
 * `canceled` (huỷ lặng lẽ vì không xác nhận đã thấy: KHÔNG mất gì).
 */
export const AMBUSH_RESULTS = ["won", "fled", "lost", "timeout", "dropped", "canceled"] as const;
export type AmbushResult = (typeof AMBUSH_RESULTS)[number];

/** Server -> client: kết thúc. `paid` = cái giá ĐÃ trừ (có khi bỏ chạy / thua / hết giờ); `rewards` = thưởng (chỉ khi `won`). */
export interface AmbushEndMsg {
  result: AmbushResult;
  /** `true` khi `lost` là CHẾT THẬT (mục 53: Hoàng Tuyền, mất kiếp): màn hình Hoàng Tuyền hiện ngay sau khi đổi phòng. Vắng = không chết (mọi kết cục khác). */
  died?: boolean;
  paid?: { exp?: number; coin?: number };
  rewards?: { exp: number; coin: number; items: { itemId: string; count: number }[] };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function isChoice(v: unknown): v is AmbushChoice {
  return typeof v === "string" && (AMBUSH_CHOICES as readonly string[]).includes(v);
}

/** Đọc `ambushChoose` từ mạng: `id` đúng dạng, `choice` hợp lệ; sai thì `null`. Chỉ lấy đúng hai trường (không mang trường lạ). */
export function parseAmbushChoose(raw: unknown): AmbushChooseMsg | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== "string" || !AMBUSH_OFFER_ID_RE.test(raw.id)) return null;
  if (!isChoice(raw.choice)) return null;
  return { id: raw.id, choice: raw.choice };
}

/** Đọc `ambushSeen` từ mạng: `id` đúng dạng; sai thì `null`. Chỉ lấy `id`. */
export function parseAmbushSeen(raw: unknown): AmbushSeenMsg | null {
  if (!isObj(raw) || typeof raw.id !== "string" || !AMBUSH_OFFER_ID_RE.test(raw.id)) return null;
  return { id: raw.id };
}

/** Đọc `ambushFlee` từ mạng: `choice` phải là `flee_coin` / `flee_exp` (KHÔNG nhận `fight`); sai thì `null`. */
export function parseAmbushFlee(raw: unknown): AmbushFleeMsg | null {
  if (!isObj(raw) || !isChoice(raw.choice) || raw.choice === "fight") return null;
  return { choice: raw.choice };
}

// ---------- Dữ liệu MẪU cho giao diện (không dùng ở server) ----------

/** Lời đề nghị MẪU (tất định): giao diện dựng hộp thoại khi chưa có tin thật. `affordable: false` cho ca ví không đủ (nút Linh thạch mờ). */
export function sampleAmbushOffer(tier: AmbushTier = "normal", affordable = true): AmbushOfferMsg {
  const name =
    tier === "leader" ? "Đạo Tặc Đầu Lĩnh" : tier === "elite" ? "Sói Hoang Tinh Anh" : "Sói Hoang";
  return {
    id: "0123456789abcdef",
    scene:
      "Đường đi bỗng vắng hẳn. Từ bụi cỏ ven lối, một bóng đen lao ra chắn trước mặt, mắt đỏ ngầu.",
    foe: { name, tier, count: tier === "normal" ? 2 : 1 },
    price: { exp: 420, coin: { price: ambushCoinPrice(3, "offer"), enough: affordable } },
    ms: AMBUSH_OFFER_MS,
  };
}

/** Trạng thái đấu trường MẪU (tất định). */
export function sampleAmbushState(): AmbushStateMsg {
  return {
    msLeft: 83_000,
    price: { exp: 840, coin: { price: ambushCoinPrice(3, "mid"), enough: true } },
  };
}

/** Kết cục MẪU theo `result` (tất định). */
export function sampleAmbushEnd(result: AmbushResult = "won"): AmbushEndMsg {
  switch (result) {
    case "won":
      return {
        result,
        rewards: { exp: 360, coin: 48, items: [{ itemId: "nanh_soi", count: 2 }] },
      };
    case "fled":
      return { result, paid: { coin: ambushCoinPrice(3, "offer") } };
    case "canceled":
      return { result }; // huỷ lặng lẽ: không mất gì
    default:
      return { result, paid: { exp: 840 } };
  }
}
