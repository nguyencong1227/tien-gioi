// Cổng cho gói ảnh 2x `hd:*` (M7.15, #516; THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.3): chỉ cho nạp khi bậc "Rất cao" ĐÃ ỔN ĐỊNH, tức `QualityProfile.hdPacks`
// bật liên tục đủ `HD_STABLE_MS` THỜI GIAN ĐANG HIỆN (tab ẩn thì dừng đếm: bộ điều tốc cũng dừng đo khung khi ẩn, nên tab mở ngầm 60 s chưa chứng tỏ gì về
// độ ổn định). Hạ bậc (bộ điều tốc) hoặc bật tiết kiệm pin thì `hdPacks` tắt: cổng đóng NGAY và đếm lại từ đầu khi bật lại, để không nạp / giải phóng gói
// 2x lặp (giật + tốn mạng). Đã đủ ổn định rồi thì ẩn tab KHÔNG đóng cổng. Đồng hồ mặc định là `performance.now` (đơn điệu: người chơi chỉnh giờ hệ thống
// hay đồng bộ giờ giữa chừng không làm cổng mở sớm). Lớp THUẦN (đồng hồ tiêm vào) nên test được; `main.ts` nối bằng `bindHdGate`.
import { HD_STABLE_MS } from "./packs";

export interface HdGate {
  /** Báo `QualityProfile.hdPacks` hiện hành (gọi mỗi lần hồ sơ đổi và một lần lúc khởi động). Gọi lại với cùng giá trị KHÔNG đặt lại đồng hồ. */
  update(hdPacks: boolean): void;
  /** Báo tab đang hiện (`true`) hay ẩn (`false`). Mặc định hiện. Ẩn thì dừng đếm (giữ phần đã đếm), hiện lại thì đếm tiếp. */
  setVisible(visible: boolean): void;
  /** Được nạp `hd:*` ngay bây giờ không (`hdPacks` đã bật và đang hiện đủ `stableMs`)? */
  allowed(): boolean;
  /** Còn bao lâu (ms) thời gian đang hiện nữa cổng mới mở: 0 nếu đã mở, `Infinity` nếu `hdPacks` đang tắt. */
  msUntilAllowed(): number;
}

export function createHdGate(
  now: () => number = () => performance.now(),
  stableMs: number = HD_STABLE_MS,
): HdGate {
  let on = false;
  let visible = true;
  /** Số ms đã đếm (`hdPacks` bật VÀ tab hiện) trước đoạn đang chạy */
  let acc = 0;
  /** Thời điểm bắt đầu đoạn đếm đang chạy; `null` = đang dừng (tắt `hdPacks` hoặc tab ẩn) */
  let from: number | null = null;
  const stop = (): void => {
    if (from !== null) {
      acc += now() - from;
      from = null;
    }
  };
  const go = (): void => {
    if (from === null && on && visible) from = now();
  };
  const elapsed = (): number => acc + (from === null ? 0 : now() - from);
  return {
    update(hdPacks) {
      if (!hdPacks) {
        on = false;
        from = null;
      } else if (!on) {
        on = true;
        acc = 0;
        go();
      }
    },
    setVisible(v) {
      visible = v;
      if (v) go();
      else stop();
    },
    allowed() {
      return on && elapsed() >= stableMs;
    },
    msUntilAllowed() {
      return on ? Math.max(0, stableMs - elapsed()) : Infinity;
    },
  };
}

/** Nguồn báo tab hiện / ẩn cho `bindHdGate` (trong trình duyệt: `document.hidden` + `visibilitychange`). */
export interface HdVisibilitySource {
  initial: boolean;
  subscribe: (cb: (visible: boolean) => void) => () => void;
}

/**
 * Nối cổng với hồ sơ chất lượng (và, nếu có, với trạng thái hiện / ẩn của tab): ghi nhận giá trị hiện tại, rồi mỗi lần hồ sơ đổi thì cập nhật cổng và, khi
 * `hdPacks` TẮT (hạ bậc, tiết kiệm pin), gọi `releaseHd` để giải phóng mọi gói `hd:*` đang nạp (không để texture 2x ở lại sau khi hạ xuống Cao).
 * Trả hàm gỡ nối.
 */
export function bindHdGate(
  gate: HdGate,
  initialHdPacks: boolean,
  subscribe: (cb: (hdPacks: boolean) => void) => () => void,
  releaseHd: () => void,
  visibility?: HdVisibilitySource,
): () => void {
  if (visibility) gate.setVisible(visibility.initial); // tab đang ẩn lúc khởi động thì chưa đếm
  gate.update(initialHdPacks);
  const offHd = subscribe((hdPacks) => {
    gate.update(hdPacks);
    if (!hdPacks) releaseHd();
  });
  const offVis = visibility?.subscribe((v) => gate.setVisible(v));
  return () => {
    offHd();
    offVis?.();
  };
}
