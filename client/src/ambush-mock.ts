/**
 * MÁY CHỦ GIẢ của gặp chặn đường (`?ambush=mock`, CD7 #1067; chỉ DEV / `?debug`, như `?skills=mock`): chạy TRỌN luồng giao diện không cần máy chủ thật, để người dùng
 * xem bằng mắt và để script Chrome đi qua ĐÚNG đường nhận tin của `WorldScene` (`reg(AMBUSH_MSG.*)`) và đường gửi (`sendAmbush`), không gọi tắt `__ui`.
 *
 * Luồng (theo `docs/THIET_KE_CHAN_DUONG.md`, CÙNG hằng số với máy chủ thật): hộp thoại `ambushOffer` (giá CHỐT) -> không `ambushSeen` trong `AMBUSH_SEEN_MS` thì
 * `ambushEnd canceled`; lựa chọn đến sớm hơn `AMBUSH_ARM_MS` bị bỏ qua; `fight` -> "đổi phòng" (`onTravel`) rồi `ambushState` mỗi giây (giá giữa trận), tự thắng sau
 * `AMBUSH_MOCK_FIGHT_MS` nếu không bỏ chạy; `flee_coin` / `flee_exp` / `ambushFlee` -> `ambushEnd fled` kèm giá đã chốt; hết `AMBUSH_OFFER_MS` không chọn = `fight`.
 * Sau mỗi kết cục có lời đề nghị MỚI sau `AMBUSH_MOCK_REOFFER_MS` để xem lại. KHÔNG có quái, không trừ tiền thật: chỉ đủ để thấy giao diện và kiểm đường dây.
 */
import {
  AMBUSH_ARM_MS,
  AMBUSH_MSG,
  AMBUSH_OFFER_MS,
  AMBUSH_SEEN_MS,
  AMBUSH_TIME_MS,
  parseAmbushChoose,
  parseAmbushFlee,
  parseAmbushSeen,
  sampleAmbushOffer,
  type AmbushEndMsg,
  type AmbushFleeChoice,
  type AmbushOfferMsg,
  type AmbushPrice,
} from "@tien-gioi/shared";

/** Tự thắng sau chừng này (ms) kể từ lúc vào đấu trường nếu người chơi không bỏ chạy (đủ xem HUD, bảng xác nhận, thẻ kết quả). */
export const AMBUSH_MOCK_FIGHT_MS = 25_000;
/** Lời đề nghị mới sau kết cục chừng này (ms). */
export const AMBUSH_MOCK_REOFFER_MS = 6_000;
/** Giá hộp thoại / giữa trận của máy chủ giả (giữa trận gấp đôi như thiết kế). */
export const MOCK_OFFER_PRICE: AmbushPrice = { exp: 420, coin: { price: 60, enough: true } };
export const MOCK_MID_PRICE: AmbushPrice = { exp: 840, coin: { price: 120, enough: true } };

/** `?ambush=mock`: chỉ bật ở môi trường DEV hoặc URL có `?debug` (như `?skills=mock`, `?duel=mock`). */
export function isMockAmbushEnabled(
  search: string = typeof location !== "undefined" ? location.search : "",
  isDev: boolean = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV),
): boolean {
  const params = new URLSearchParams(search);
  if (params.get("ambush") !== "mock") return false;
  return isDev || params.has("debug");
}

/** Phòng giả tối thiểu: `send` (client -> máy chủ) và `emit` (máy chủ -> client) như `createMockDungeonRoom`. */
export interface MockAmbushRoom {
  send: (type: string, data?: unknown) => void;
  emit: (type: string, data?: unknown) => void;
}

export interface MockAmbushOptions {
  /** Gọi khi "đổi phòng" sang đấu trường (máy chủ thật gửi `travelTo`; client thật đóng hộp thoại ở đó). */
  onTravel?: () => void;
  /** Đồng hồ và hẹn giờ tiêm vào để test tất định (mặc định `performance.now` / `setTimeout` thật). */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export interface MockAmbush {
  /** Dựng lời đề nghị đầu tiên. */
  begin(): void;
  /** Dừng mọi hẹn giờ. */
  stop(): void;
}

/** Id đề nghị hợp lệ (16 ký tự hex) từ số thứ tự. */
const offerId = (n: number): string => n.toString(16).padStart(16, "0");

export function installMockAmbush(room: MockAmbushRoom, opts: MockAmbushOptions = {}): MockAmbush {
  const now = opts.now ?? (() => performance.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const origSend = room.send;
  let n = 0;
  let offer: { msg: AmbushOfferMsg; builtAt: number; seen: boolean } | null = null;
  let arena: { endsAt: number } | null = null;
  /** Đã nhận một lựa chọn bỏ chạy và đang "lưu": lựa chọn tiếp theo bị bỏ qua. */
  let settling = false;
  const timers = new Set<unknown>();
  const later = (fn: () => void, ms: number): unknown => {
    const h = setTimer(() => {
      timers.delete(h);
      fn();
    }, ms);
    timers.add(h);
    return h;
  };
  const clearAll = (): void => {
    for (const h of timers) clearTimer(h);
    timers.clear();
  };

  const end = (msg: AmbushEndMsg): void => {
    clearAll();
    offer = null;
    arena = null;
    settling = false;
    room.emit(AMBUSH_MSG.end, msg);
    later(newOffer, AMBUSH_MOCK_REOFFER_MS);
  };

  const fled = (choice: AmbushFleeChoice, price: AmbushPrice): void => {
    end({
      result: "fled",
      paid: choice === "flee_coin" ? { coin: price.coin.price } : { exp: price.exp },
    });
  };

  function startArena(): void {
    clearAll();
    offer = null;
    arena = { endsAt: now() + AMBUSH_TIME_MS };
    opts.onTravel?.(); // máy chủ thật: `travelTo { mapId: arena_<bản đồ>, roomId }`; ở đó client đóng hộp thoại
    const startedAt = now();
    const tick = (): void => {
      if (arena === null) return;
      const left = Math.max(0, arena.endsAt - now());
      room.emit(AMBUSH_MSG.state, { msLeft: left, price: MOCK_MID_PRICE });
      if (now() - startedAt >= AMBUSH_MOCK_FIGHT_MS) {
        end({ result: "won", rewards: { exp: 360, coin: 48, items: [] } });
        return;
      }
      if (left <= 0) {
        end({ result: "timeout", paid: { exp: MOCK_OFFER_PRICE.exp * 2 } });
        return;
      }
      later(tick, 1000);
    };
    tick();
  }

  function newOffer(): void {
    clearAll();
    arena = null;
    n++;
    const base = sampleAmbushOffer(n % 3 === 0 ? "leader" : n % 2 === 0 ? "elite" : "normal");
    const msg: AmbushOfferMsg = {
      ...base,
      id: offerId(n),
      price: MOCK_OFFER_PRICE,
      ms: AMBUSH_OFFER_MS,
    };
    offer = { msg, builtAt: now(), seen: false };
    room.emit(AMBUSH_MSG.offer, msg);
    // không `ambushSeen` kịp = huỷ lặng lẽ (không phạt); đủ giờ = Chiến
    later(() => {
      if (offer !== null && !offer.seen) end({ result: "canceled" });
    }, AMBUSH_SEEN_MS);
    later(() => {
      if (offer !== null) startArena();
    }, AMBUSH_OFFER_MS);
  }

  room.send = (type: string, data?: unknown): void => {
    origSend(type, data);
    if (type === AMBUSH_MSG.seen) {
      const m = parseAmbushSeen(data);
      if (m !== null && offer !== null && offer.msg.id === m.id) offer.seen = true;
      return;
    }
    if (type === AMBUSH_MSG.choose) {
      const m = parseAmbushChoose(data);
      if (m === null || offer === null || offer.msg.id !== m.id) return;
      if (now() - offer.builtAt < AMBUSH_ARM_MS) return; // sớm hơn 700 ms: bỏ qua như máy chủ thật
      offer.seen = true;
      const choice = m.choice;
      if (choice === "fight") startArena();
      else if (!settling) {
        settling = true; // trừ MỘT lần (như máy chủ thật: lựa chọn thứ hai khi đang xử lý bị bỏ qua)
        const price = offer.msg.price;
        later(() => fled(choice, price), 300);
      }
      return;
    }
    if (type === AMBUSH_MSG.flee) {
      const m = parseAmbushFlee(data);
      if (m === null || arena === null || settling) return;
      settling = true;
      later(() => fled(m.choice, MOCK_MID_PRICE), 300);
    }
  };

  return { begin: newOffer, stop: clearAll };
}
