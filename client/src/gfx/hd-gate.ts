// Cổng cho gói ảnh 2x `hd:*` (M7.15, #516; THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.3): chỉ cho nạp khi bậc "Rất cao" ĐÃ ỔN ĐỊNH, tức `QualityProfile.hdPacks`
// bật liên tục đủ `HD_STABLE_MS`. Hạ bậc (bộ điều tốc) hoặc bật tiết kiệm pin thì `hdPacks` tắt: cổng đóng NGAY và đếm lại từ đầu khi bật lại, để không nạp /
// giải phóng gói 2x lặp (giật + tốn mạng). Lớp THUẦN (đồng hồ tiêm vào) nên test được; `main.ts` nối `update` vào `onQualityChange`.
import { HD_STABLE_MS } from "./packs";

export interface HdGate {
  /** Báo `QualityProfile.hdPacks` hiện hành (gọi mỗi lần hồ sơ đổi và một lần lúc khởi động). Gọi lại với cùng giá trị KHÔNG đặt lại đồng hồ. */
  update(hdPacks: boolean): void;
  /** Được nạp `hd:*` ngay bây giờ không (`hdPacks` đã bật liên tục >= `stableMs`)? */
  allowed(): boolean;
  /** Còn bao lâu (ms) nữa cổng mở: 0 nếu đã mở, `Infinity` nếu `hdPacks` đang tắt. */
  msUntilAllowed(): number;
}

export function createHdGate(
  now: () => number = Date.now,
  stableMs: number = HD_STABLE_MS,
): HdGate {
  /** Thời điểm `hdPacks` bật liên tục từ đó; `null` = đang tắt. */
  let since: number | null = null;
  return {
    update(hdPacks) {
      if (!hdPacks) since = null;
      else if (since === null) since = now();
    },
    allowed() {
      return since !== null && now() - since >= stableMs;
    },
    msUntilAllowed() {
      return since === null ? Infinity : Math.max(0, stableMs - (now() - since));
    },
  };
}

/**
 * Nối cổng với hồ sơ chất lượng: ghi nhận `hdPacks` hiện tại, rồi mỗi lần hồ sơ đổi thì cập nhật cổng và, khi `hdPacks` TẮT (hạ bậc, tiết kiệm pin),
 * gọi `releaseHd` để giải phóng mọi gói `hd:*` đang nạp (không để texture 2x ở lại sau khi hạ xuống Cao). Trả hàm gỡ nối.
 */
export function bindHdGate(
  gate: HdGate,
  initialHdPacks: boolean,
  subscribe: (cb: (hdPacks: boolean) => void) => () => void,
  releaseHd: () => void,
): () => void {
  gate.update(initialHdPacks);
  return subscribe((hdPacks) => {
    gate.update(hdPacks);
    if (!hdPacks) releaseHd();
  });
}
