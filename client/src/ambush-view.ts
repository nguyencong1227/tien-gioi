/**
 * GẶP CHẶN ĐƯỜNG (QUYET_DINH_M3 mục 52, CD7 #1067, `docs/THIET_KE_CHAN_DUONG.md` mục 3 / 6): biến tin `ambushOffer` / `ambushEnd` của máy chủ (`shared/src/ambush.ts`)
 * thành CHỮ và TRẠNG THÁI NÚT cho hộp thoại. THUẦN (không DOM, không đồng hồ): `ui.ts` đổ kết quả vào DOM và truyền đồng hồ máy khách (`performance.now()`) vào, chỉ để đo
 * KHOẢNG TRÔI (thời gian trong tin là TƯƠNG ĐỐI, máy chủ mới là bên quyết).
 *
 * Nguyên tắc (hợp đồng CD1 + review CD2):
 *  - GIÁ trên nút LÀ giá bị trừ: dựng từ `price` máy chủ đã CHỐT trong tin, client KHÔNG tự tính giá và KHÔNG gửi số nào (`ambushChoose` chỉ có `id` + `choice`).
 *  - Lựa chọn đến sớm hơn `AMBUSH_ARM_MS` sau lúc hộp thoại HIỆN bị khoá (ngón tay đang bấm / giữ cần điều khiển đúng chỗ nút); máy chủ cũng bỏ qua: hai bên cùng khoá.
 *  - Nút Linh thạch mờ khi `coin.enough === false` nhưng VẪN hiện giá; nút tu vi khoá khi `price.exp <= 0` (thanh tu vi trống: KHÔNG hiện "miễn phí").
 *  - Hết đồng hồ cục bộ mà chưa có tin mới thì KHÔNG tự chọn: hiện "đang chờ máy chủ" (máy chủ là bên quyết, kể cả hết giờ = Chiến).
 *  - Nối lại mạng: máy chủ gửi LẠI `ambushOffer` CÙNG `id` = CẬP NHẬT hộp thoại đang mở (không dựng lại, không tính lại `AMBUSH_ARM_MS`); client gửi lại `ambushSeen`
 *    (idempotent: máy chủ chỉ đặt `seen = true`) để tin `ambushSeen` đã mất lúc rớt mạng không làm hộp thoại bị huỷ.
 *  - Gửi lựa chọn xong mà `AMBUSH_RETRY_MS` vẫn chưa có `ambushEnd` (lưu hỏng ở máy chủ: không có tín hiệu nào) thì mở lại nút cho bấm lại: máy chủ chỉ LƯU lại, không trừ hai lần.
 *  - Không tin tin nhắn: sai kiểu / ngoài khoảng thì bỏ (`parseAmbushOffer` / `parseAmbushEnd`); id vật phẩm lạ KHÔNG lộ ra màn hình; mọi chữ vào DOM bằng `textContent`.
 */
import {
  AMBUSH_ARM_MS,
  AMBUSH_CHOICES,
  AMBUSH_FOE_COUNT_MAX,
  AMBUSH_OFFER_ID_RE,
  AMBUSH_OFFER_MS,
  AMBUSH_RESULTS,
  AMBUSH_TIERS,
  ITEM_BY_ID,
  type AmbushChoice,
  type AmbushChooseMsg,
  type AmbushEndMsg,
  type AmbushOfferMsg,
  type AmbushPrice,
  type AmbushResult,
  type AmbushTier,
} from "@tien-gioi/shared";
import { countdownText, fmtInt } from "./world-boss-view";

/** Gửi lựa chọn mà chừng này (ms) chưa có `ambushEnd` thì mở lại nút (lưu hỏng ở máy chủ không báo gì). Lớn hơn một lượt lưu bình thường. */
export const AMBUSH_RETRY_MS = 6_000;

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Số nguyên không âm (làm tròn xuống); không hợp lệ -> `undefined`. */
const wholeOf = (v: unknown): number | undefined =>
  isNum(v) && v >= 0 ? Math.floor(v) : undefined;
/** Chuỗi hiển thị: bỏ ký tự điều khiển, cắt `max`; rỗng sau khi làm sạch -> `undefined`. */
function textOf(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return t === "" ? undefined : t.slice(0, max);
}

/** Tên mức kẻ địch hiển thị. */
export const TIER_LABEL: Readonly<Record<AmbushTier, string>> = {
  normal: "Thường",
  elite: "Tinh anh",
  leader: "Cầm đầu",
};

// ---------- Đọc tin từ mạng ----------

/** Tin `ambushOffer` đã làm sạch; sai dạng thì `null` (bỏ). `ms` kẹp trong [0, `AMBUSH_OFFER_MS`] (một lời đề nghị không dài hơn hạn của nó). */
export function parseAmbushOffer(raw: unknown): AmbushOfferMsg | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== "string" || !AMBUSH_OFFER_ID_RE.test(raw.id)) return null;
  const scene = textOf(raw.scene, 600);
  const foe = raw.foe;
  const price = raw.price;
  if (scene === undefined || !isObj(foe) || !isObj(price) || !isObj(price.coin)) return null;
  const name = textOf(foe.name, 60);
  const tier = typeof foe.tier === "string" && AMBUSH_TIERS.includes(foe.tier as AmbushTier);
  const count = wholeOf(foe.count);
  const exp = wholeOf(price.exp);
  const coin = wholeOf(price.coin.price);
  const ms = raw.ms;
  if (name === undefined || !tier || count === undefined || exp === undefined) return null;
  if (coin === undefined || typeof price.coin.enough !== "boolean" || !isNum(ms)) return null;
  return {
    id: raw.id,
    scene,
    foe: {
      name,
      tier: foe.tier as AmbushTier,
      count: Math.min(Math.max(1, count), AMBUSH_FOE_COUNT_MAX * 3),
    },
    price: { exp, coin: { price: coin, enough: price.coin.enough } },
    ms: Math.min(AMBUSH_OFFER_MS, Math.max(0, ms)),
  };
}

/** Tin `ambushEnd` đã làm sạch; sai dạng thì `null`. `paid` / `rewards` chỉ giữ số nguyên không âm, tối đa 8 món đồ. */
export function parseAmbushEnd(raw: unknown): AmbushEndMsg | null {
  if (!isObj(raw)) return null;
  const result = raw.result;
  if (typeof result !== "string" || !(AMBUSH_RESULTS as readonly string[]).includes(result))
    return null;
  const out: AmbushEndMsg = { result: result as AmbushResult };
  if (isObj(raw.paid)) {
    const exp = wholeOf(raw.paid.exp);
    const coin = wholeOf(raw.paid.coin);
    if (exp !== undefined || coin !== undefined) {
      out.paid = {};
      if (exp !== undefined) out.paid.exp = exp;
      if (coin !== undefined) out.paid.coin = coin;
    }
  }
  if (isObj(raw.rewards)) {
    const exp = wholeOf(raw.rewards.exp) ?? 0;
    const coin = wholeOf(raw.rewards.coin) ?? 0;
    const items: { itemId: string; count: number }[] = [];
    if (Array.isArray(raw.rewards.items)) {
      for (const it of raw.rewards.items.slice(0, 8)) {
        if (!isObj(it) || typeof it.itemId !== "string") continue;
        const count = wholeOf(it.count);
        if (count !== undefined && count > 0) items.push({ itemId: it.itemId, count });
      }
    }
    out.rewards = { exp, coin, items };
  }
  return out;
}

// ---------- Hộp thoại ----------

/** Trạng thái hộp thoại ở client (một lời đề nghị). Không đổi tại chỗ: mọi hàm bên dưới trả bản mới. */
export interface AmbushDialog {
  offer: AmbushOfferMsg;
  /** Đồng hồ máy khách lúc nhận tin GẦN NHẤT (cùng `id`) và `ms` còn lại trong tin đó. */
  recvAt: number;
  msAtRecv: number;
  /** Đồng hồ máy khách lúc hộp thoại HIỆN lần đầu (tính `AMBUSH_ARM_MS`); cập nhật cùng `id` không đổi. */
  shownAt: number;
  /** Đã gửi `ambushSeen` cho lần nhận gần nhất chưa (cập nhật cùng `id` đặt lại `false`: gửi lại, vô hại). */
  seenSent: boolean;
  /** Lựa chọn đã gửi và lúc gửi (đồng hồ máy khách); `null` = chưa gửi. */
  sent: { choice: AmbushChoice; at: number } | null;
}

/**
 * Nhận một `ambushOffer` (đã `parseAmbushOffer`). Khác `id` (hoặc chưa có hộp thoại) = hộp thoại MỚI, tính `AMBUSH_ARM_MS` từ `now`; cùng `id` = CẬP NHẬT (nối lại mạng):
 * giữ `shownAt` và lựa chọn đã gửi, làm mới đồng hồ + giá, đặt `seenSent = false` (gửi lại `ambushSeen`). `fresh` cho `ui.ts` biết có cần đóng bảng khác / thả cần điều khiển.
 */
export function openAmbush(
  prev: AmbushDialog | null,
  offer: AmbushOfferMsg,
  now: number,
): { dialog: AmbushDialog; fresh: boolean } {
  if (prev !== null && prev.offer.id === offer.id) {
    return {
      dialog: { ...prev, offer, recvAt: now, msAtRecv: offer.ms, seenSent: false },
      fresh: false,
    };
  }
  return {
    dialog: { offer, recvAt: now, msAtRecv: offer.ms, shownAt: now, seenSent: false, sent: null },
    fresh: true,
  };
}

/** Thời gian còn (ms) theo đồng hồ cục bộ: `ms` trong tin trừ khoảng trôi từ lúc nhận; không âm. */
export function ambushRemainingMs(d: AmbushDialog, now: number): number {
  return Math.max(0, d.msAtRecv - Math.max(0, now - d.recvAt));
}

/** Cần gửi `ambushSeen` lúc này không: hộp thoại ĐANG hiện, trang đang hiển thị (`visible`), và chưa gửi cho lần nhận này. */
export function ambushNeedsSeen(d: AmbushDialog, visible: boolean): boolean {
  return visible && !d.seenSent;
}

/** Đánh dấu đã gửi `ambushSeen`. */
export function ambushMarkSeen(d: AmbushDialog): AmbushDialog {
  return d.seenSent ? d : { ...d, seenSent: true };
}

/** Một nút của hộp thoại. */
export interface AmbushButton {
  choice: AmbushChoice;
  /** Dòng chính ("Chiến", "Bỏ chạy: trả Linh thạch"). */
  label: string;
  /** Dòng phụ: GIÁ (hoặc gợi ý phím / lý do khoá). */
  sub: string;
  /** Bấm được lúc này (`false` = mờ / `aria-disabled`; bấm vào cũng không gửi gì). */
  enabled: boolean;
  /** `aria-label` đầy đủ câu (giá + trạng thái). */
  aria: string;
}

/** Mọi thứ `ui.ts` cần để vẽ hộp thoại tại thời điểm `now`. */
export interface AmbushDialogView {
  scene: string;
  /** "Sói Hoang · Tinh anh × 2". */
  foe: string;
  /** Đồng hồ "00:07" (hoặc "Đang chờ máy chủ…" khi hết giờ cục bộ mà chưa có tin). */
  countdown: string;
  /** Hết giờ cục bộ, chưa chọn: máy chủ sắp quyết (Chiến), KHÔNG tự chọn ở client. */
  waitingServer: boolean;
  /** Còn khoá `AMBUSH_ARM_MS` (nút mờ chưa nhận). */
  arming: boolean;
  /** Đã gửi lựa chọn, đang chờ máy chủ (nút mờ, hiện "Đang xử lý…"). */
  busy: boolean;
  /** Chữ trạng thái dưới nút ("" nếu không có). */
  note: string;
  /** Ba nút theo thứ tự cố định: Chiến, Linh thạch, tu vi. */
  buttons: [AmbushButton, AmbushButton, AmbushButton];
  /** Toàn câu cho vùng đọc màn hình khi hộp thoại mở. */
  announce: string;
}

const priceText = (n: number, unit: string): string => `${fmtInt(n)} ${unit}`;

/** Câu nêu các cách chọn THẬT SỰ dùng được (không nhắc "0 tu vi" khi thanh trống, không mời trả Linh thạch khi không đủ). */
function fleeOptions(price: AmbushPrice, coinTxt: string, expTxt: string): string {
  const ways: string[] = [];
  if (price.coin.enough) ways.push(coinTxt);
  if (price.exp > 0) ways.push(expTxt);
  return ways.length === 0
    ? "Chiến, hoặc bỏ chạy: không đủ để trả giá."
    : `Chiến, hoặc bỏ chạy trả ${ways.join(" hay ")}.`;
}

/** Đang chờ phản hồi cho lựa chọn đã gửi (chưa quá `AMBUSH_RETRY_MS`)? */
function isBusy(d: AmbushDialog, now: number): boolean {
  return d.sent !== null && now - d.sent.at < AMBUSH_RETRY_MS;
}

/** Hộp thoại còn khoá `AMBUSH_ARM_MS` kể từ lúc HIỆN không. */
function isArming(d: AmbushDialog, now: number): boolean {
  return now - d.shownAt < AMBUSH_ARM_MS;
}

/** Nút nào bấm được lúc này (một chỗ duy nhất: `ambushDialogView` và `chooseAmbush` cùng dùng, không tự suy riêng). */
function enabledOf(d: AmbushDialog, choice: AmbushChoice, now: number): boolean {
  if (isArming(d, now) || isBusy(d, now)) return false;
  const price: AmbushPrice = d.offer.price;
  if (choice === "flee_coin") return price.coin.enough;
  if (choice === "flee_exp") return price.exp > 0;
  return true;
}

/** View của hộp thoại tại `now` (đồng hồ máy khách). */
export function ambushDialogView(d: AmbushDialog, now: number): AmbushDialogView {
  const { offer } = d;
  const remaining = ambushRemainingMs(d, now);
  const arming = isArming(d, now);
  const busy = isBusy(d, now);
  const waitingServer = remaining <= 0 && d.sent === null;
  const foe =
    `${offer.foe.name} · ${TIER_LABEL[offer.foe.tier]}` +
    (offer.foe.count > 1 ? ` × ${offer.foe.count}` : "");
  const coinTxt = priceText(offer.price.coin.price, "Linh thạch");
  const expTxt = priceText(offer.price.exp, "tu vi");
  const en = (c: AmbushChoice) => enabledOf(d, c, now);

  const coinSub = offer.price.coin.enough ? coinTxt : `${coinTxt} (không đủ)`;
  const expSub = offer.price.exp > 0 ? expTxt : "Thanh tu vi trống";
  const buttons: AmbushView3 = [
    {
      choice: "fight",
      label: "Chiến",
      sub: "Enter",
      enabled: en("fight"),
      aria: "Chiến: đấu một mình với kẻ chặn đường. Phím Enter.",
    },
    {
      choice: "flee_coin",
      label: "Bỏ chạy: trả Linh thạch",
      sub: coinSub,
      enabled: en("flee_coin"),
      aria: `Bỏ chạy, trả ${coinTxt}${offer.price.coin.enough ? "" : ". Không đủ Linh thạch"}`,
    },
    {
      choice: "flee_exp",
      label: "Bỏ chạy: trả tu vi",
      sub: expSub,
      enabled: en("flee_exp"),
      aria:
        offer.price.exp > 0
          ? `Bỏ chạy, trả ${expTxt}`
          : "Bỏ chạy bằng tu vi: không dùng được vì thanh tu vi đang trống",
    },
  ];

  let note = "";
  if (busy) note = "Đang xử lý…";
  else if (d.sent !== null) note = "Chưa có phản hồi, hãy thử lại.";
  else if (arming) note = "";
  else if (waitingServer) note = "Đang chờ máy chủ…";

  const secs = Math.ceil(remaining / 1000);
  return {
    scene: offer.scene,
    foe,
    countdown: waitingServer ? "Đang chờ máy chủ…" : countdownText(remaining),
    waitingServer,
    arming,
    busy,
    note,
    buttons,
    announce:
      `Bị chặn đường. ${offer.scene} Kẻ chặn đường: ${foe}. ` +
      `Còn ${secs} giây, hết giờ là Chiến. ${fleeOptions(offer.price, coinTxt, expTxt)}`,
  };
}

type AmbushView3 = AmbushDialogView["buttons"];

/**
 * Người chơi chọn `choice` (bấm nút / Enter): trả hộp thoại mới và tin cần gửi (`null` = KHÔNG gửi gì: còn khoá `AMBUSH_ARM_MS`, đang chờ phản hồi, nút mờ, lựa chọn lạ).
 * Tin chỉ có `id` + `choice`: KHÔNG có số nào (máy chủ trừ đúng giá đã chốt).
 */
export function chooseAmbush(
  d: AmbushDialog,
  choice: unknown,
  now: number,
): { dialog: AmbushDialog; send: AmbushChooseMsg | null } {
  if (typeof choice !== "string" || !(AMBUSH_CHOICES as readonly string[]).includes(choice))
    return { dialog: d, send: null };
  const c = choice as AmbushChoice;
  if (!enabledOf(d, c, now)) return { dialog: d, send: null };
  return {
    dialog: { ...d, sent: { choice: c, at: now } },
    send: { id: d.offer.id, choice: c },
  };
}

// ---------- Kết cục ----------

/** Chữ + giọng điệu của kết cục để hiện thành toast / màn kết quả. `silent` = KHÔNG hiện gì (huỷ lặng lẽ: không mất gì, chỉ đóng hộp thoại). */
export interface AmbushEndView {
  silent: boolean;
  tone: "good" | "bad" | "info";
  title: string;
  /** Các dòng chi tiết (cái giá đã trừ, thưởng). */
  lines: string[];
}

/** "30 Linh thạch", "420 tu vi" hoặc cả hai; không có gì -> `""`. */
function paidText(paid: AmbushEndMsg["paid"]): string {
  if (!paid) return "";
  const parts: string[] = [];
  if (paid.coin !== undefined && paid.coin > 0) parts.push(priceText(paid.coin, "Linh thạch"));
  if (paid.exp !== undefined && paid.exp > 0) parts.push(priceText(paid.exp, "tu vi"));
  return parts.join(" và ");
}

/** Tên đồ thưởng; id lạ (client cũ hơn dữ liệu) -> "vật phẩm mới", KHÔNG lộ id. */
function itemLabel(itemId: string, count: number): string {
  const name = hasOwn(ITEM_BY_ID, itemId) ? ITEM_BY_ID[itemId].name : "vật phẩm mới";
  return count > 1 ? `${name} × ${fmtInt(count)}` : name;
}

/** View của kết cục (đã `parseAmbushEnd`). */
export function ambushEndView(msg: AmbushEndMsg): AmbushEndView {
  const paid = paidText(msg.paid);
  const loss = paid === "" ? [] : [`Mất ${paid}.`];
  switch (msg.result) {
    case "canceled":
      return { silent: true, tone: "info", title: "", lines: [] };
    case "fled":
      return {
        silent: false,
        tone: "info",
        title: "Bỏ chạy thành công",
        lines: paid === "" ? ["Không mất gì."] : loss,
      };
    case "won": {
      const r = msg.rewards;
      const lines: string[] = [];
      if (r) {
        if (r.exp > 0) lines.push(`+${fmtInt(r.exp)} tu vi`);
        if (r.coin > 0) lines.push(`+${fmtInt(r.coin)} Linh thạch`);
        for (const it of r.items) lines.push(itemLabel(it.itemId, it.count));
      }
      return { silent: false, tone: "good", title: "Chiến thắng", lines };
    }
    case "lost":
      return { silent: false, tone: "bad", title: "Bị hạ", lines: loss };
    case "timeout":
      return { silent: false, tone: "bad", title: "Hết giờ", lines: loss };
    case "dropped":
      return { silent: false, tone: "bad", title: "Mất kết nối quá lâu", lines: loss };
  }
}

/** Một dòng gọn cho toast: "Bỏ chạy thành công. Mất 30 Linh thạch."; huỷ lặng lẽ -> `""`. */
export function ambushEndToast(msg: AmbushEndMsg): string {
  const v = ambushEndView(msg);
  if (v.silent) return "";
  return `${[v.title, ...v.lines.map((l) => l.replace(/\.$/, ""))].join(". ")}.`;
}

/** Phím trong hộp thoại: Enter / Y = Chiến. KHÔNG có phím tắt chữ cái cho bỏ chạy (mọi chữ đã là phím chiến đấu; bấm nhầm khi đang đánh sẽ mất tu vi / Linh thạch). */
export function ambushChoiceForKey(code: unknown): AmbushChoice | null {
  return code === "Enter" || code === "NumpadEnter" || code === "KeyY" ? "fight" : null;
}
