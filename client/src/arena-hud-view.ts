/**
 * HUD ĐẤU TRƯỜNG của gặp chặn đường (QUYET_DINH_M3 mục 52, CD7 bước 3 #1067, `docs/THIET_KE_CHAN_DUONG.md` mục 3 / 6.1): biến tin `ambushState` của máy chủ
 * (`{ msLeft, price }` mỗi giây) thành đồng hồ + nút Bỏ chạy có XÁC NHẬN. THUẦN (không DOM, không đồng hồ): `ui.ts` truyền `performance.now()` vào, chỉ để đo
 * KHOẢNG TRÔI (`msLeft` là TƯƠNG ĐỐI, máy chủ mới là bên quyết hết giờ).
 *
 * Nguyên tắc (cùng `ambush-view.ts`):
 *  - GIÁ trên nút LÀ giá bị trừ: máy chủ CHỐT và làm mới giá giữa trận ở mỗi `ambushState`; client chỉ hiện giá của tin MỚI NHẤT, KHÔNG tự tính, KHÔNG gửi số
 *    (`ambushFlee` chỉ có `choice`). Nút Linh thạch mờ khi `enough = false` nhưng vẫn hiện giá; nút tu vi khoá khi `exp <= 0` (không hiện "miễn phí").
 *  - Bỏ chạy giữa trận MẤT NHIỀU HƠN lúc hộp thoại (giá x2) nên PHẢI qua bước xác nhận: bấm "Bỏ chạy" mở hai nút giá, chỉ nút giá mới gửi. Không có phím tắt chữ cái
 *    (mọi chữ đã là phím chiến đấu; bấm nhầm khi đang đánh sẽ mất tu vi / Linh thạch).
 *  - Giá đổi MỖI GIÂY: nút giá đang hiện có thể đổi số ngay dưới ngón tay; vì vậy giá hiện trên nút là giá của tin cuối và nút KHOÁ ngắn (`AMBUSH_FLEE_ARM_MS`)
 *    sau mỗi lần ĐỔI giá để không bấm trúng số khác với số vừa thấy. Máy chủ vẫn trừ giá đã chốt tại lúc nhận lệnh (hai bên có thể lệch tối đa một nhịp giây).
 *  - Gửi xong mà `AMBUSH_RETRY_MS` vẫn chưa có `ambushEnd` (lưu hỏng ở máy chủ) thì mở lại nút (máy chủ chỉ LƯU lại, không trừ hai lần).
 *  - Không tin tin nhắn: sai kiểu / ngoài khoảng thì bỏ; `msLeft` kẹp trong [0, `AMBUSH_TIME_MS`].
 */
import {
  AMBUSH_TIME_MS,
  type AmbushFleeChoice,
  type AmbushFleeMsg,
  type AmbushPrice,
  type AmbushStateMsg,
} from "@tien-gioi/shared";
import { AMBUSH_RETRY_MS, parseAmbushPrice } from "./ambush-view";
import { countdownText, fmtInt } from "./world-boss-view";

/** Giá vừa ĐỔI thì khoá nút giá chừng này (ms) để ngón tay không trúng một con số khác với số vừa nhìn. */
export const AMBUSH_FLEE_ARM_MS = 400;
/** Còn dưới chừng này (ms) thì đồng hồ báo gấp (đổi màu / `urgent`). */
export const ARENA_URGENT_MS = 15_000;

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Tin `ambushState` đã làm sạch; sai dạng thì `null`. `msLeft` kẹp trong [0, `AMBUSH_TIME_MS`], làm tròn xuống. */
export function parseAmbushState(raw: unknown): AmbushStateMsg | null {
  if (!isObj(raw)) return null;
  const ms = raw.msLeft;
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const price = parseAmbushPrice(raw.price);
  if (price === null) return null;
  return { msLeft: Math.min(AMBUSH_TIME_MS, Math.max(0, Math.floor(ms))), price };
}

/** Trạng thái HUD đấu trường ở client (không đổi tại chỗ: mọi hàm trả bản mới). */
export interface ArenaHud {
  /** Tin `ambushState` GẦN NHẤT, và đồng hồ máy khách lúc nhận. */
  msAtRecv: number;
  recvAt: number;
  price: AmbushPrice;
  /** Đồng hồ máy khách lúc giá ĐỔI lần cuối (cho khoá `AMBUSH_FLEE_ARM_MS`). */
  priceChangedAt: number;
  /** Đang mở bước xác nhận bỏ chạy. */
  confirming: boolean;
  /** Lựa chọn đã gửi và lúc gửi; `null` = chưa gửi. */
  sent: { choice: AmbushFleeChoice; at: number } | null;
}

const samePrice = (a: AmbushPrice, b: AmbushPrice): boolean =>
  a.exp === b.exp && a.coin.price === b.coin.price && a.coin.enough === b.coin.enough;

/**
 * Nhận một `ambushState` (đã `parseAmbushState`). Lần đầu: HUD mới. Các lần sau: làm mới đồng hồ + giá; GIÁ ĐỔI thì ghi lại lúc đổi (khoá ngắn nút giá),
 * giữ nguyên bước xác nhận đang mở và lựa chọn đã gửi.
 */
export function updateArenaHud(prev: ArenaHud | null, st: AmbushStateMsg, now: number): ArenaHud {
  if (prev === null) {
    return {
      msAtRecv: st.msLeft,
      recvAt: now,
      price: st.price,
      priceChangedAt: now,
      confirming: false,
      sent: null,
    };
  }
  return {
    ...prev,
    msAtRecv: st.msLeft,
    recvAt: now,
    price: st.price,
    priceChangedAt: samePrice(prev.price, st.price) ? prev.priceChangedAt : now,
  };
}

/** Thời gian còn (ms) theo đồng hồ cục bộ: tin cuối trừ khoảng trôi, không âm, đồng hồ lùi không làm tăng. */
export function arenaRemainingMs(h: ArenaHud, now: number): number {
  return Math.max(0, h.msAtRecv - Math.max(0, now - h.recvAt));
}

/** Mở / đóng bước xác nhận bỏ chạy (không làm gì khi đang chờ phản hồi của lựa chọn đã gửi). */
export function setFleeConfirm(h: ArenaHud, open: boolean, now: number): ArenaHud {
  if (isBusy(h, now) || h.confirming === open) return h;
  return { ...h, confirming: open };
}

function isBusy(h: ArenaHud, now: number): boolean {
  return h.sent !== null && now - h.sent.at < AMBUSH_RETRY_MS;
}

/** Nút giá nào bấm được lúc này (một chỗ duy nhất: `arenaHudView` và `fleeArena` cùng dùng). */
function enabledOf(h: ArenaHud, choice: AmbushFleeChoice, now: number): boolean {
  if (!h.confirming || isBusy(h, now)) return false;
  if (now - h.priceChangedAt < AMBUSH_FLEE_ARM_MS) return false;
  return choice === "flee_coin" ? h.price.coin.enough : h.price.exp > 0;
}

/** Một nút giá trong bước xác nhận. */
export interface ArenaFleeButton {
  choice: AmbushFleeChoice;
  label: string;
  /** GIÁ (hoặc lý do khoá). */
  sub: string;
  enabled: boolean;
  aria: string;
}

export interface ArenaHudView {
  /** "01:23". */
  countdown: string;
  /** Còn dưới `ARENA_URGENT_MS`. */
  urgent: boolean;
  /** Hết đồng hồ cục bộ mà chưa có kết cục: máy chủ sắp quyết (thua do hết giờ), KHÔNG tự làm gì ở client. */
  waitingServer: boolean;
  /** Nút "Bỏ chạy" (mở xác nhận) bấm được: chưa gửi gì và chưa đang xác nhận. */
  canOpenFlee: boolean;
  /** Đang mở bước xác nhận. */
  confirming: boolean;
  /** Đã gửi lựa chọn, đang chờ máy chủ. */
  busy: boolean;
  note: string;
  /** Hai nút giá của bước xác nhận (Linh thạch, tu vi); chỉ có ý nghĩa khi `confirming`. */
  buttons: [ArenaFleeButton, ArenaFleeButton];
  /** Câu nhắc trên bước xác nhận ("Bỏ chạy giữa trận mất nhiều hơn lúc mới gặp"). */
  confirmText: string;
  announce: string;
}

const priceText = (n: number, unit: string): string => `${fmtInt(n)} ${unit}`;

/** Câu nêu các cách bỏ chạy THẬT SỰ dùng được (không nhắc "0 tu vi" khi thanh trống, không mời trả Linh thạch khi không đủ). */
function fleeWays(price: AmbushPrice, coinTxt: string, expTxt: string): string {
  const ways: string[] = [];
  if (price.coin.enough) ways.push(coinTxt);
  if (price.exp > 0) ways.push(expTxt);
  return ways.length === 0
    ? "Bỏ chạy giữa trận: không đủ để trả giá."
    : `Bỏ chạy giữa trận: ${ways.join(" hoặc ")}.`;
}

/** View HUD tại `now` (đồng hồ máy khách). */
export function arenaHudView(h: ArenaHud, now: number): ArenaHudView {
  const remaining = arenaRemainingMs(h, now);
  const busy = isBusy(h, now);
  const waitingServer = remaining <= 0 && h.sent === null;
  const coinTxt = priceText(h.price.coin.price, "Linh thạch");
  const expTxt = priceText(h.price.exp, "tu vi");
  const coinSub = h.price.coin.enough ? coinTxt : `${coinTxt} (không đủ)`;
  const expSub = h.price.exp > 0 ? expTxt : "Thanh tu vi trống";
  let note = "";
  if (busy) note = "Đang xử lý…";
  else if (h.sent !== null) note = "Chưa có phản hồi, hãy thử lại.";
  else if (waitingServer) note = "Đang chờ máy chủ…";
  return {
    countdown: countdownText(remaining),
    urgent: remaining > 0 && remaining < ARENA_URGENT_MS,
    waitingServer,
    canOpenFlee: !busy && h.sent === null && !h.confirming,
    confirming: h.confirming,
    busy,
    note,
    buttons: [
      {
        choice: "flee_coin",
        label: "Trả Linh thạch",
        sub: coinSub,
        enabled: enabledOf(h, "flee_coin", now),
        aria: `Bỏ chạy, trả ${coinTxt}${h.price.coin.enough ? "" : ". Không đủ Linh thạch"}`,
      },
      {
        choice: "flee_exp",
        label: "Trả tu vi",
        sub: expSub,
        enabled: enabledOf(h, "flee_exp", now),
        aria:
          h.price.exp > 0
            ? `Bỏ chạy, trả ${expTxt}`
            : "Bỏ chạy bằng tu vi: không dùng được vì thanh tu vi đang trống",
      },
    ],
    confirmText: "Bỏ chạy giữa trận mất nhiều hơn lúc mới gặp. Chọn cách trả:",
    announce: `Đấu trường. Còn ${Math.ceil(remaining / 1000)} giây. ${fleeWays(h.price, coinTxt, expTxt)}`,
  };
}

/**
 * Người chơi chọn cách trả ở bước xác nhận: trả HUD mới và tin cần gửi (`null` = KHÔNG gửi: chưa mở xác nhận, giá vừa đổi (khoá ngắn), đang chờ phản hồi, nút mờ,
 * lựa chọn lạ hoặc `fight`). Tin chỉ có `choice`: KHÔNG có số nào.
 */
export function fleeArena(
  h: ArenaHud,
  choice: unknown,
  now: number,
): { hud: ArenaHud; send: AmbushFleeMsg | null } {
  if (choice !== "flee_coin" && choice !== "flee_exp") return { hud: h, send: null };
  if (!enabledOf(h, choice, now)) return { hud: h, send: null };
  return { hud: { ...h, sent: { choice, at: now } }, send: { choice } };
}
