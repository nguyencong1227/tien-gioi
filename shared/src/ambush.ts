// GẶP CHẶN ĐƯỜNG khi di chuyển (QUYET_DINH_M3 mục 52, docs/THIET_KE_CHAN_DUONG.md, issue CD1 #1061): hợp đồng giữa client và server.
// Chỉ có HẰNG SỐ, KIỂU TIN, hàm THUẦN (giá, xác suất, đọc tin từ mạng) và dữ liệu MẪU cho giao diện; mã server (kích hoạt, đấu trường) là CD2 / CD3, dữ liệu
// văn mẫu + kẻ chặn đường ở `ambush-data.ts` (E / G nhập), số cân bằng chốt ở CD6 (D).
//
// Luồng (server quyết định mọi kết quả; client chỉ hiển thị và gửi ý định):
//  1. Đi ở vùng hoang đủ xa + xúc xắc trúng + đủ điều kiện (server, `ambushBlocked`) -> `ambushOffer` (CHỈ cho người bị chặn): văn mẫu, kẻ chặn đường, GIÁ bỏ chạy trước
//     trận, đếm ngược `AMBUSH_OFFER_MS`. Trong lúc chờ nhân vật đứng yên, quái bỏ mục tiêu.
//  2. Client gửi `ambushChoose { id, choice }`; hết giờ = `fight`. `flee_*`: trừ giá -> lưu -> `ambushEnd { result: "fled" }`. `fight`: server dựng đấu trường solo
//     (`ARENA_MAPS`) rồi gửi `travelTo { mapId, roomId }` như bí cảnh.
//  3. Trong đấu trường: `ambushState` mỗi giây (máu kẻ địch, thời gian còn, GIÁ bỏ chạy giữa trận); nút Bỏ chạy = `ambushFlee { choice }`.
//  4. Kết thúc: `ambushEnd { result, paid?, rewards? }`; rồi server đưa về ĐÚNG chỗ cũ trên bản đồ gốc.
// Giá hiện trên nút LÀ SỐ DO SERVER GỬI; server TÍNH LẠI khi nhận lựa chọn (không bao giờ tin số client).

// ---------- Hằng số (thời gian ms, khoảng cách px) ----------

/** Phiên bản giao thức tối thiểu của client để được kích hoạt chặn đường (client cũ không có hộp thoại: đứng chờ rồi vào trận không nút bỏ chạy). */
export const AMBUSH_MIN_PROTOCOL = 5;
/** Hộp thoại mở bấy lâu không chọn = `fight`. */
export const AMBUSH_OFFER_MS = 10_000;
/** Một trận tối đa chừng này; hết giờ là THUA (mất giá giữa trận, không thưởng). */
export const AMBUSH_TIME_MS = 120_000;
/** Sau khi thắng / thua: xem kết quả (và nhặt đồ rơi) chừng này rồi đưa về chỗ cũ. */
export const AMBUSH_EXIT_MS = 4_000;
/** Bị hạ: nằm chừng này rồi đứng dậy (như `DUNGEON_FALL_EXIT_MS`). */
export const AMBUSH_FALL_MS = 3_000;
/** Bảo hộ sau khi về chỗ cũ (quái quanh đó không nhắm, không đánh được). */
export const AMBUSH_RETURN_GRACE_MS = 5_000;
/** Rớt mạng trong đấu trường: đóng băng chừng này chờ nối lại (giây), quá hạn thì trả giá giữa trận và rời. */
export const AMBUSH_DROP_GRACE_S = 10;
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

/** % thanh tu vi của CẢNH GIỚI hiện tại phải trả khi bỏ chạy, theo thời điểm. TẠM: CD6 chốt. */
export const AMBUSH_EXP_PRICE_PCT: Readonly<Record<AmbushPriceStage, number>> = {
  offer: 5,
  mid: 10,
};
/** Giá Linh thạch: `AMBUSH_COIN_BASE` x `AMBUSH_COIN_GROWTH`^(bậc) x hệ số thời điểm. TẠM: CD6 chốt (mục tiêu ~6-8 / 12-16 con quái cùng bậc). */
export const AMBUSH_COIN_BASE = 30;
export const AMBUSH_COIN_GROWTH = 1.18;
export const AMBUSH_COIN_MULT: Readonly<Record<AmbushPriceStage, number>> = { offer: 1, mid: 2 };
/** Giá Linh thạch tối thiểu: chặn cách "để tu vi sát đáy rồi bỏ chạy bằng tu vi mãi" (khi giá tu vi bị kẹp về 0 mà không có sàn này). */
export const AMBUSH_FLEE_MIN_COIN = 5;

const wholeNonNeg = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/**
 * Giá TU VI khi bỏ chạy: `AMBUSH_EXP_PRICE_PCT[stage]`% của `barSize` (độ lớn thanh tu vi của cảnh giới hiện tại), nhưng KHÔNG quá `expInBar` (tu vi đang có
 * trong thanh: không bao giờ rớt cảnh giới, không âm). Làm tròn xuống. Đầu vào sai (không hữu hạn / âm) coi là 0. Thuần.
 */
export function ambushExpPrice(
  barSize: unknown,
  expInBar: unknown,
  stage: AmbushPriceStage,
): number {
  const raw = Math.floor((wholeNonNeg(barSize) * AMBUSH_EXP_PRICE_PCT[stage]) / 100);
  return Math.min(raw, wholeNonNeg(expInBar));
}

/** Giá LINH THẠCH khi bỏ chạy ở bậc `step` (thang bậc của `realms.ts`, kẹp >= 0): `BASE x GROWTH^step x hệ số`, không dưới `AMBUSH_FLEE_MIN_COIN`. Thuần. */
export function ambushCoinPrice(step: unknown, stage: AmbushPriceStage): number {
  const s = wholeNonNeg(step);
  const raw = Math.round(
    AMBUSH_COIN_BASE * Math.pow(AMBUSH_COIN_GROWTH, s) * AMBUSH_COIN_MULT[stage],
  );
  return Math.max(AMBUSH_FLEE_MIN_COIN, raw);
}

/** Giá hai cách trả. `coin: null` = KHÔNG đủ Linh thạch (nút Linh thạch mờ, chỉ còn tu vi). */
export interface AmbushPrice {
  exp: number;
  coin: number | null;
}

/** Đầu vào để tính giá (server đọc từ nhân vật thật; không bao giờ lấy từ client). */
export interface AmbushPriceInput {
  /** Độ lớn thanh tu vi của cảnh giới hiện tại. */
  barSize: number;
  /** Tu vi đang có trong thanh đó. */
  expInBar: number;
  /** Bậc trên thang cảnh giới (`stepOf`). */
  step: number;
  /** Số Linh thạch đang có (trong ví). */
  wallet: number;
}

/** Cả hai giá ở thời điểm `stage`; `coin` là `null` khi ví không đủ. Thuần. */
export function ambushPrice(input: AmbushPriceInput, stage: AmbushPriceStage): AmbushPrice {
  const coin = ambushCoinPrice(input.step, stage);
  return {
    exp: ambushExpPrice(input.barSize, input.expInBar, stage),
    coin: wholeNonNeg(input.wallet) >= coin ? coin : null,
  };
}

// ---------- Tin nhắn ----------

/** Tên tin nhắn Colyseus của chặn đường. `offer` / `state` / `end` là server -> client (CHỈ người liên quan); `choose` / `flee` là client -> server. */
export const AMBUSH_MSG = {
  offer: "ambushOffer",
  choose: "ambushChoose",
  state: "ambushState",
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

/** Server -> client (chỉ người bị chặn): hộp thoại tình huống. `scene` là văn mẫu ĐÃ điền (không còn `{biến}`); `ms` = thời gian còn. */
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

/** Server -> client (trong đấu trường, mỗi giây và khi đổi): máu kẻ địch còn lại (%, cả bầy), thời gian còn, giá bỏ chạy giữa trận. */
export interface AmbushStateMsg {
  foeHpPct: number;
  msLeft: number;
  price: AmbushPrice;
}

/** Kết cục: `won` (hạ hết), `fled` (bỏ chạy, ở hộp thoại hoặc giữa trận), `lost` (bị hạ), `timeout` (hết giờ), `dropped` (rớt mạng quá hạn / thoát). */
export const AMBUSH_RESULTS = ["won", "fled", "lost", "timeout", "dropped"] as const;
export type AmbushResult = (typeof AMBUSH_RESULTS)[number];

/** Server -> client: kết thúc. `paid` = cái giá ĐÃ trừ (có khi bỏ chạy / thua / hết giờ); `rewards` = thưởng (chỉ khi `won`). */
export interface AmbushEndMsg {
  result: AmbushResult;
  paid?: { exp?: number; coin?: number };
  rewards?: { exp: number; coin: number; items?: { itemId: string; count: number }[] };
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
    price: { exp: 420, coin: affordable ? ambushCoinPrice(3, "offer") : null },
    ms: AMBUSH_OFFER_MS,
  };
}

/** Trạng thái đấu trường MẪU (tất định). */
export function sampleAmbushState(): AmbushStateMsg {
  return { foeHpPct: 64, msLeft: 83_000, price: { exp: 840, coin: ambushCoinPrice(3, "mid") } };
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
    default:
      return { result, paid: { exp: 840 } };
  }
}
